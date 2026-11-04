/**
 * bot.js — 「隐蔽助教」机器人触发引擎
 *
 * 职责：房间级开关、hostKey 老师识别、冷却防刷屏、三职责调度、消息注入回调。
 *
 * 非侵入原则：本模块完全独立于 relay 主链路，所有异常均被吞掉，
 * 机器人的任何失败都只会导致「本次不发言」，绝不拖垮聊天主流程。
 */

const brain = require('./bot-brain');

// ── 冷却参数（调参重点，非写码重点）────────────────
const WARMUP_DELAY_MS = 1500;          // 议题后多久暖场
const WARMUP_COOLDOWN_MS = 30000;      // 两次暖场最短间隔
const ENCOURAGE_COOLDOWN_MS = 30000;   // 鼓励最短间隔
const COMMENT_COOLDOWN_MS = 90000;     // 建设性评论最短间隔
const TOPIC_WINDOW_MS = 60000;         // 议题有效窗口（超出后不再触发）
const RECENT_MAX = 12;                 // 评论时最多携带的近期发言条数
const MAX_PER_MINUTE = 4;              // 每分钟最多发言数（总闸防刷屏）
const MIN_TEXT_LEN = 4;                // 少于该字数的发言不触发（去噪）
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
        topic: null,
        topicTs: 0,
        lastWarmupTs: 0,
        lastEncourageTs: 0,
        lastCommentTs: 0,
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

  function emit(room, text) {
    const s = state(room);
    s.minuteWindow.push(Date.now());
    s.recent.push({ text, ts: Date.now(), fromBot: true });
    if (s.recent.length > RECENT_MAX) s.recent = s.recent.slice(-RECENT_MAX);
    try { inject(room, text); } catch {}
  }

  function pushRecent(room, text) {
    const s = state(room);
    s.recent.push({ text, ts: Date.now(), fromBot: false });
    if (s.recent.length > RECENT_MAX) s.recent = s.recent.slice(-RECENT_MAX);
  }

  /** 老师发起议题 → 机器人暖场 */
  function onTopic(room, text) {
    const s = state(room);
    if (!s.botEnabled || !text) return;
    s.topic = text;
    s.topicTs = Date.now();
    s.recent = [];
    const now = Date.now();
    if (now - s.lastWarmupTs < WARMUP_COOLDOWN_MS) return;
    s.lastWarmupTs = now;
    setTimeout(() => {
      const st = state(room);
      if (!st.botEnabled || st.inFlight || rateLimited(room)) return;
      st.inFlight = true;
      brain.warmup(text)
        .then((reply) => { st.inFlight = false; if (reply) emit(room, reply); })
        .catch(() => { st.inFlight = false; });
    }, WARMUP_DELAY_MS);
  }

  /** 用户发言 → 鼓励 / 建设性评论（冷却 + 去噪 + 单次单职责） */
  function onUserMessage(room, text) {
    const s = state(room);
    if (!s.botEnabled || !text) { pushRecent(room, text); return; }
    const now = Date.now();
    pushRecent(room, text);

    // 优先：被问「你是不是机器人」→ 俏皮回应（独立冷却，不经大模型，即时）
    if (isRobotAsk(text) && !rateLimited(room) && now - s.lastRobotAskTs >= ROBOT_ASK_COOLDOWN_MS) {
      s.lastRobotAskTs = now;
      emit(room, ROBOT_ASK_REPLY);
      return;
    }

    if (s.inFlight || rateLimited(room)) return;

    const substantive = text.replace(/\s+/g, '').length >= MIN_TEXT_LEN;
    const topicFresh = s.topic && (now - s.topicTs < TOPIC_WINDOW_MS);
    if (!substantive || !topicFresh) return;

    // 优先触发更稀有的「建设性评论」，冷却间隙内才触发「鼓励」
    if (now - s.lastCommentTs >= COMMENT_COOLDOWN_MS) {
      s.lastCommentTs = now;
      s.inFlight = true;
      let kbChunks = [];
      if (s.kbEnabled && s.kbId) {
        try { kbChunks = retrieve(s.kbId, text, 3) || []; } catch {}
      }
      const recentTexts = s.recent.filter((r) => !r.fromBot).slice(-6).map((r) => r.text);
      brain.comment(s.topic, recentTexts, kbChunks)
        .then((reply) => { s.inFlight = false; if (reply) emit(room, reply); })
        .catch(() => { s.inFlight = false; });
    } else if (now - s.lastEncourageTs >= ENCOURAGE_COOLDOWN_MS) {
      s.lastEncourageTs = now;
      s.inFlight = true;
      brain.encourage(s.topic, text)
        .then((reply) => { s.inFlight = false; if (reply) emit(room, reply); })
        .catch(() => { s.inFlight = false; });
    }
  }

  return { config, setConfig, claimHost, isHost, onTopic, onUserMessage };
}

module.exports = { createBot };
