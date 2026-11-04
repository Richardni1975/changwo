/**
 * bot.js — 「隐蔽助教」机器人触发引擎
 *
 * 职责：房间级开关、hostKey 老师识别、节奏与克制调度、三职责调度、消息注入回调。
 *
 * 非侵入原则：本模块完全独立于 relay 主链路，所有异常均被吞掉，
 * 机器人的任何失败都只会导致「本次不发言」，绝不拖垮聊天主流程。
 *
 * 节奏模型（2026-11 调教）：
 * - 每次发言前等待 6~10s 随机「打字」延迟，避免瞬间生成被识破；
 * - 发言频率随学生活跃度自适应：学生聊得越密，机器人越克制（间隔越长）；
 * - 不再因「议题窗口」到期而永久沉默，只要有学生发言就可持续点评。
 */

const brain = require('./bot-brain');

// ── 节奏参数（调参重点，非写码重点）────────────────
const RESPONSE_DELAY_MIN_MS = 6000;    // 最低「打字」延迟
const RESPONSE_DELAY_JITTER_MS = 4000; // 额外随机 0~4s（总延迟 6~10s）
const ROBOT_ASK_REPLY_DELAY_MS = 1500; // 机器人身份询问的短句回复延迟（短句可稍快）
const ACTIVITY_WINDOW_MS = 60000;      // 学生活跃度统计窗口
const GAP_QUIET_MS = 15000;            // 学生少时：机器人至少间隔多久再发言
const GAP_ACTIVE_MS = 90000;           // 学生多时：机器人最长间隔多久再发言
const GAP_ACTIVE_AT = 6;               // 窗口内 >= 6 条学生发言视为「活跃」
const MAX_PER_MINUTE = 4;              // 每分钟最多发言数（总闸防刷屏）
const MIN_TEXT_LEN = 4;                // 少于该字数的发言不触发（去噪）
const RECENT_MAX = 12;                 // 评论时最多携带的近期发言条数
const ROBOT_ASK_COOLDOWN_MS = 30000;   // 「你是不是机器人」类问题的回复冷却
const ROBOT_ASK_REPLY = '你说是就是喽！';

/**
 * @param {object} deps
 * @param {(room: string, text: string) => void} deps.inject  - 注入机器人发言（由 relay 实现）
 * @param {(courseId: string, query: string, k: number) => Array} deps.retrieve - 知识库检索
 * @param {() => string[]} deps.listCourses - 列出所有课程（知识库）
 */
function createBot({ inject, retrieve, listCourses }) {
  const rooms = new Map(); // room -> state

  function state(room) {
    if (!rooms.has(room)) {
      rooms.set(room, {
        botEnabled: false,
        kbEnabled: false,
        kbId: null,
        hostKey: null,
        recent: [],
        activity: [],
        topic: null,
        lastBotTs: 0,
        lastRobotAskTs: 0,
        minuteWindow: [],
        inFlight: false,
      });
    }
    return rooms.get(room);
  }

  function config(room) {
    const s = state(room);
    return { botEnabled: s.botEnabled, kbEnabled: s.kbEnabled, kbId: s.kbId, courses: listCourses() };
  }

  function setConfig(room, patch) {
    const s = state(room);
    if (typeof patch.botEnabled === 'boolean') s.botEnabled = patch.botEnabled;
    if (typeof patch.kbEnabled === 'boolean') s.kbEnabled = patch.kbEnabled;
    if (patch.kbId !== undefined) s.kbId = patch.kbId || null;
    return config(room);
  }

  /** 首个携带 hostKey 的连接认领房间老师身份 */
  function claimHost(room, hostKey) {
    const s = state(room);
    if (!s.hostKey && hostKey) s.hostKey = hostKey;
    return !!hostKey && s.hostKey === hostKey;
  }

  function isHost(room, hostKey) {
    const s = state(room);
    return !!s.hostKey && s.hostKey === hostKey;
  }

  /** 判断是否在问「你是不是机器人」 */
  function isRobotAsk(text) {
    return /机器人|人工智能|你是不是人|你是人吗|是机器|不是真人|\bai\b/i.test(text);
  }

  function rateLimited(room) {
    const s = state(room);
    const now = Date.now();
    s.minuteWindow = s.minuteWindow.filter((t) => now - t < 60000);
    return s.minuteWindow.length >= MAX_PER_MINUTE;
  }

  /** 窗口内的学生发言条数（衡量对话热度） */
  function studentActivity(room) {
    const s = state(room);
    const now = Date.now();
    return s.activity.filter((t) => now - t < ACTIVITY_WINDOW_MS).length;
  }

  /** 动态发言间隔：学生越活跃，间隔越长（越克制） */
  function minGap(room) {
    const t = Math.min(studentActivity(room) / GAP_ACTIVE_AT, 1); // 0..1
    return GAP_QUIET_MS + t * (GAP_ACTIVE_MS - GAP_QUIET_MS);
  }

  /** 6~10s 随机「打字」延迟 */
  function humanDelay() {
    return RESPONSE_DELAY_MIN_MS + Math.random() * RESPONSE_DELAY_JITTER_MS;
  }

  function emit(room, text) {
    const s = state(room);
    s.lastBotTs = Date.now();
    s.minuteWindow.push(Date.now());
    s.recent.push({ text, ts: Date.now(), fromBot: true });
    if (s.recent.length > RECENT_MAX) s.recent = s.recent.slice(-RECENT_MAX);
    try { inject(room, text); } catch {}
  }

  function pushRecent(room, text) {
    const s = state(room);
    const now = Date.now();
    s.recent.push({ text, ts: now, fromBot: false });
    if (s.recent.length > RECENT_MAX) s.recent = s.recent.slice(-RECENT_MAX);
    s.activity.push(now);
    s.activity = s.activity.filter((t) => now - t < ACTIVITY_WINDOW_MS);
  }

  /** 老师发起议题 → 机器人暖场 */
  function onTopic(room, text) {
    const s = state(room);
    if (!s.botEnabled || !text) return;
    s.topic = text;
    s.recent = [];
    s.activity = [];
    if (s.inFlight || rateLimited(room)) return;
    if (Date.now() - s.lastBotTs < minGap(room)) return;
    s.inFlight = true;
    setTimeout(() => {
      const st = state(room);
      if (!st.botEnabled || rateLimited(room) || Date.now() - st.lastBotTs < minGap(room)) {
        st.inFlight = false;
        return;
      }
      brain.warmup(text)
        .then((reply) => { st.inFlight = false; if (reply) emit(room, reply); })
        .catch(() => { st.inFlight = false; });
    }, humanDelay());
  }

  /** 用户发言 → 点评（动态克制 + 打字延迟 + 可持续发声） */
  function onUserMessage(room, text) {
    const s = state(room);
    if (!s.botEnabled || !text) { pushRecent(room, text); return; }
    const now = Date.now();
    pushRecent(room, text);

    // 优先：被问「你是不是机器人」→ 俏皮短回复（独立冷却，短句可稍快）
    if (isRobotAsk(text) && !rateLimited(room) && now - s.lastRobotAskTs >= ROBOT_ASK_COOLDOWN_MS) {
      s.lastRobotAskTs = now;
      setTimeout(() => {
        const st = state(room);
        if (!st.botEnabled || rateLimited(room)) return;
        emit(room, ROBOT_ASK_REPLY);
      }, ROBOT_ASK_REPLY_DELAY_MS);
      return;
    }

    if (s.inFlight) return;

    const substantive = text.replace(/\s+/g, '').length >= MIN_TEXT_LEN;
    if (!substantive) return;
    if (!s.topic) return; // 无议题时机器人不介入（仅记录发言）

    // 动态克制：学生对话越密，机器人越少插嘴
    if (now - s.lastBotTs < minGap(room)) return;

    s.inFlight = true;
    setTimeout(() => {
      const st = state(room);
      if (!st.botEnabled || rateLimited(room) || Date.now() - st.lastBotTs < minGap(room)) {
        st.inFlight = false;
        return;
      }
      let kbChunks = [];
      if (st.kbEnabled && st.kbId) {
        try { kbChunks = retrieve(st.kbId, text, 3) || []; } catch {}
      }
      const recentTexts = st.recent.filter((r) => !r.fromBot).slice(-6).map((r) => r.text);
      brain.comment(st.topic, recentTexts, kbChunks)
        .then((reply) => { st.inFlight = false; if (reply) emit(room, reply); })
        .catch(() => { st.inFlight = false; });
    }, humanDelay());
  }

  return { config, setConfig, claimHost, isHost, onTopic, onUserMessage };
}

module.exports = { createBot };
