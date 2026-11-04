/**
 * test-bot-e2e.js — 隐蔽助教端到端测试（无需浏览器）
 *
 * 用法：
 *   1) 先启动 relay：  node relay.js
 *   2) 另开终端运行：  node test-bot-e2e.js
 *
 * 注意：需要环境变量 SILICONFLOW_API_KEY，机器人才能真的发言；
 *       未配置时脚本照跑，只是机器人会静默（所有 assembled 都不会出现 🤖）。
 */

const { io } = require('socket.io-client');
const { decodeAssembled } = require('./plaintext');

const URL = 'http://127.0.0.1:8080';
const ROOM = String(Math.floor(1000 + Math.random() * 9000));
const HOST_KEY = 'test-host-key-' + Date.now();

const hasKey = !!process.env.SILICONFLOW_API_KEY;
if (!hasKey) console.log('⚠️  未检测到 SILICONFLOW_API_KEY，机器人将静默（看不到真实发言，仅验证开关/校验逻辑）\n');

function log(tag, msg) { console.log(`[${tag}]`, msg); }

function connect(name, extraJoin = {}) {
  return new Promise((resolve) => {
    const s = io(URL, { transports: ['websocket'] });
    s.on('connect', () => {
      log(name, `已连接，加入房间 ${ROOM}`);
      s.emit('join', { room: ROOM, ...extraJoin });
    });
    s.on('join', (p) => resolve({ s, p }));
    s.on('assembled', (p) => {
      let text = '<无法解析>';
      try { text = decodeAssembled(p.text); } catch {}
      log(name, `收到 assembled${p.fromBot ? ' 🤖[机器人]' : ''}: "${text}"`);
    });
    s.on('topic', (p) => log(name, `收到议题: "${p.text}"`));
    s.on('bot_config', (p) => log(name, '收到 bot_config: ' + JSON.stringify(p)));
    s.on('error', (p) => log(name, '❌ 服务端错误: ' + JSON.stringify(p)));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 1) 老师带 hostKey 加入
  const teacher = await connect('老师', { hostKey: HOST_KEY });
  log('老师', `join → isHost=${teacher.p.isHost}，botConfig=${JSON.stringify(teacher.p.botConfig)}`);

  // 2) 学生加入（无 hostKey）
  const student = await connect('学生');
  log('学生', `join → isHost=${student.p.isHost}（应无 botConfig 字段）`);

  // 3) 老师开启机器人 + 知识库
  log('老师', '发送 bot_control：开机器人 + 开知识库 + 选「创业课」');
  teacher.s.emit('bot_control', { botEnabled: true, kbEnabled: true, kbId: '创业课' });
  await sleep(500);

  // 4) 老师发起议题 → 约 1.5s 后机器人暖场
  log('老师', '发起议题…');
  teacher.s.emit('topic', { text: '创业初期怎么找到第一个客户？' });
  await sleep(6000);

  // 5) 学生发言 → 触发机器人「建设性评论」（首次发言优先评论，会检索知识库）
  log('学生', '发言：我觉得可以先从身边的朋友问起，他们最了解我。');
  student.s.emit('message', { messageId: 'm1', kind: 'text', content: '我觉得可以先从身边的朋友问起，他们最了解我。' });
  await sleep(6000);

  // 6) 越权校验：学生尝试关机器人（应被服务端拒绝，收到 NOT_HOST）
  log('学生', '尝试越权发送 bot_control（应被拒绝）…');
  student.s.emit('bot_control', { botEnabled: false });
  await sleep(800);

  console.log('\n✅ 测试结束');
  teacher.s.disconnect();
  student.s.disconnect();
  process.exit(0);
})().catch((e) => { console.error('测试失败:', e); process.exit(1); });
