/**
 * changwo-relay — Socket.IO 中转 + HTTP 文件服务
 *
 * 核心职责：
 * 1. 50人容量池控制（非抢占式）
 * 2. 加密碎片中转 + 直传消息
 * 3. Socket.IO 自动心跳 / 重连 / 降级 HTTP 轮询
 * 4. HTTP 文件上传 / 下载
 * 5. 7天文字记录存储 & TXT 导出
 *
 * 安全红线：本服务不记录任何用户身份映射
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const { createCapacityGuard } = require('./capacity-guard');
const { createShardBucket } = require('./shard-bucket');
const { createRecordKeeper } = require('./record-keeper');
const { saveFile, getFile } = require('./file-store');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { decodeAssembled, encodeShards } = require('./plaintext');
const { createKbStore } = require('./kb-retriever');
const { createBot } = require('./bot');

const PORT = process.env.PORT || 8080;
const PROD = process.env.NODE_ENV === 'production';
const STATIC_DIR = path.join(__dirname, '..', 'web', 'dist');
const MAX_ROOM_CAPACITY = 50;

const capacityGuard = createCapacityGuard({ maxCapacity: MAX_ROOM_CAPACITY });
const shardBucket = createShardBucket({ destroyAfterAssembleMs: 100 });
const recordKeeper = createRecordKeeper({ retentionHours: 168 });

// 每 60 秒清理超时未集齐的碎片桶
setInterval(() => shardBucket.cleanStale(30_000), 60_000);

// ─── 隐蔽助教机器人（独立模块，非侵入）────────────
const kbStore = createKbStore(path.join(__dirname, 'knowledge'));
const bot = createBot({
  retrieve: kbStore.retrieve,
  listCourses: kbStore.listCourses,
  inject: injectBotMessage,
});

// 机器人发言走同一条 assembled 通道：同样 XOR 分片成 4 片广播，
// 客户端完全无感（看起来就是普通 momo），仅多一个 fromBot 标记供老师识别。
function injectBotMessage(room, text) {
  const messageId = uuidv4();
  const shards = encodeShards(text, 4);
  const assembledData = { messageId, text: shards.join('|'), hint: 'text', fromBot: true, serverTs: Date.now() };
  broadcastRoom(room, 'assembled', assembledData);
  recordKeeper.store(room, { type: 'assembled', room, payload: assembledData, serverTs: assembledData.serverTs });
}

// ─── HTTP 服务器 ──────────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // 静态文件服务（前端网页）
  if (req.method === 'GET' && !req.url.startsWith('/upload') && !req.url.startsWith('/files/')) {
    const urlPath = req.url.split('?')[0]; // 去掉 query 参数
    let filePath = (urlPath === '/' || urlPath === '')
      ? path.join(STATIC_DIR, 'index.html')
      : path.join(STATIC_DIR, urlPath);
    // SPA fallback：目录或不存在的路径返回 index.html
    try {
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(STATIC_DIR, 'index.html');
    } catch { filePath = path.join(STATIC_DIR, 'index.html'); }
    const ext = path.extname(filePath);
    const mimeMap = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon' };
    try {
      const content = fs.readFileSync(filePath);
      // Vite 打包的 JS/CSS 文件名自带 content hash，永远不会变，可缓存一年
      const cacheCtrl = ext === '.html'
        ? 'no-cache, no-store, must-revalidate'
        : (PROD ? 'public, max-age=31536000, immutable' : 'no-cache');
      res.writeHead(200, {
        'Content-Type': mimeMap[ext] || 'application/octet-stream',
        'Cache-Control': cacheCtrl,
        'CDN-Cache-Control': cacheCtrl,  // Cloudflare 专用
      });
      res.end(content);
    } catch { res.writeHead(404); res.end('Not found'); }
    return;
  }

  // POST /upload
  if (req.method === 'POST' && req.url.startsWith('/upload')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const originalName = url.searchParams.get('name') || 'file.bin';
    const mimeType = url.searchParams.get('mime') || 'application/octet-stream';
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const result = saveFile(buffer, originalName, mimeType);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // GET /files/:name
  if (req.method === 'GET' && req.url.startsWith('/files/')) {
    const filename = decodeURIComponent(req.url.slice(7));
    const file = getFile(filename);
    if (!file) { res.writeHead(404); res.end('Not found'); return; }
    const isThumb = filename.includes('_thumb');
    // 上传文件一旦存储就不会变，加 immutable 让 Cloudflare 长期缓存
    const cacheCtrl = isThumb
      ? 'public, max-age=604800, immutable'         // 缩略图 7 天
      : 'public, max-age=86400, immutable';         // 原图 1 天（不变）
    res.writeHead(200, {
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`,
      'Cache-Control': cacheCtrl,
      'CDN-Cache-Control': cacheCtrl,               // Cloudflare 专用
      'ETag': `"${filename}"`,
    });
    require('fs').createReadStream(file.filepath).pipe(res);
    return;
  }

  res.writeHead(404); res.end();
});

// ─── WebSocket 双通道（Socket.IO + 原生 /ws）────────────────

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 15000,    // 15s 心跳（Socket.IO 客户端自动）
  pingTimeout: 30000,     // 30s 超时判定僵尸
  connectTimeout: 10000,
  transports: ['websocket', 'polling'],  // WebSocket 优先，HTTP 轮询降级
});

const wss = new WebSocketServer({ noServer: true });

// /ws 路径 → 原生 WebSocket（微信小程序用）；/socket.io → 交给 Socket.IO；其余拒绝
server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else if (!pathname.startsWith('/socket.io')) {
    socket.destroy();
  }
});

// sessionToken → conn（重连复用槽位）
const sessions = new Map();
// 统一房间连接注册表：Socket.IO 与原生 WS 都登记于此，广播时一视同仁
const roomConns = new Map();   // room -> Set<conn>
let connSeq = 0;

// conn = { id, io?, ws?, room, sessionToken }
function sendTo(conn, type, data) {
  if (conn.io) conn.io.emit(type, data);
  else if (conn.ws && conn.ws.readyState === WebSocket.OPEN) conn.ws.send(JSON.stringify({ type, ...data }));
}

function broadcastRoom(room, type, data) {
  const set = roomConns.get(room);
  if (!set) return;
  for (const c of set) sendTo(c, type, data);
}

function registerConn(conn) {
  if (!roomConns.has(conn.room)) roomConns.set(conn.room, new Set());
  roomConns.get(conn.room).add(conn);
}

function unregisterConn(conn) {
  const set = roomConns.get(conn.room);
  if (set) { set.delete(conn); if (set.size === 0) roomConns.delete(conn.room); }
}

// ─── 共享业务逻辑（传输无关）────────────────

function handleJoin(conn, msg) {
  const room = msg.room;
  if (!room) { sendTo(conn, 'error', { code: 'MISSING_ROOM' }); return; }

  conn.hostKey = msg.hostKey || null;
  const isHost = bot.claimHost(room, msg.hostKey);

  // 重连：同一 sessionToken + 同一房间 → 复用既有槽位
  if (msg.sessionToken && sessions.has(msg.sessionToken)) {
    const old = sessions.get(msg.sessionToken);
    if (old.room === room) {
      unregisterConn(old);
      old.room = null; old.sessionToken = null; // 旧连接稍后 disconnect 时不再二次减员
      conn.room = room;
      conn.sessionToken = msg.sessionToken;
      sessions.set(msg.sessionToken, conn);
      registerConn(conn);
      sendTo(conn, 'join', { sessionToken: msg.sessionToken, room, serverTs: Date.now(), isHost, ...(isHost ? { botConfig: bot.config(room) } : {}) });
      const missed = recordKeeper.getMessagesSince(room, msg.lastMsgServerTs || 0);
      missed.forEach((m) => sendTo(conn, m.type, { ...m.payload, serverTs: m.serverTs }));
      return;
    }
  }

  // 容量检查（非抢占式：满员直接拒绝，绝不踢人）
  if (!capacityGuard.canJoin(room)) {
    sendTo(conn, 'room_full', { code: 'ROOM_CAPACITY_EXCEEDED', message: '房间已满（50人上限）' });
    return;
  }

  const token = capacityGuard.join(room);
  conn.room = room;
  conn.sessionToken = token;
  sessions.set(token, conn);
  registerConn(conn);
  sendTo(conn, 'join', { sessionToken: token, room, serverTs: Date.now(), isHost, ...(isHost ? { botConfig: bot.config(room) } : {}) });

  broadcastRoom(room, 'presence', { onlineCount: capacityGuard.getOnlineCount(room) });

  const history = recordKeeper.getRecentMessages(room, 20);
  history.forEach((m) => sendTo(conn, m.type, { ...m.payload, serverTs: m.serverTs }));
}

function leaveRoom(conn) {
  const room = conn.room;
  const token = conn.sessionToken;
  if (room && token) {
    capacityGuard.leave(room, token);
    sessions.delete(token);
    unregisterConn(conn);
    broadcastRoom(room, 'presence', { onlineCount: capacityGuard.getOnlineCount(room) });
  }
  conn.room = null;
  conn.sessionToken = null;
}

function handleShard(conn, msg) {
  if (!conn.room) { sendTo(conn, 'error', { code: 'NOT_IN_ROOM' }); return; }
  const { messageId, fragmentIndex, totalFragments, data, hint } = msg;
  if (!messageId || fragmentIndex == null || !data) { sendTo(conn, 'error', { code: 'INVALID_SHARD' }); return; }
  const h = hint || 'text';
  const drift = Math.floor(Math.random() * 300) + 50;
  setTimeout(() => {
    broadcastRoom(conn.room, 'shard', { messageId, fragmentIndex, totalFragments, data, hint: h });
    shardBucket.addFragment(conn.room, messageId, fragmentIndex, totalFragments, data);
    const assembled = shardBucket.tryAssemble(conn.room, messageId);
    if (assembled) {
      const assembledData = { messageId, text: assembled, hint: h, serverTs: Date.now() };
      broadcastRoom(conn.room, 'assembled', assembledData);
      recordKeeper.store(conn.room, { type: 'assembled', room: conn.room, payload: assembledData, serverTs: assembledData.serverTs });
      if (h === 'text') {
        const plaintext = decodeAssembled(assembled);
        if (plaintext) bot.onUserMessage(conn.room, plaintext);
      }
    }
  }, drift);
}

function handleMessage(conn, msg) {
  if (!conn.room) { sendTo(conn, 'error', { code: 'NOT_IN_ROOM' }); return; }
  const p = msg.payload || msg; // 兼容旧格式：payload 存在则取其内容
  const messageId = p.messageId;
  const kind = p.kind || 'text';
  const content = p.content;
  if (!messageId || !content) { sendTo(conn, 'error', { code: 'INVALID_MESSAGE' }); return; }
  const msgData = {
    messageId, kind, content,
    senderTag: p.senderTag || '',
    displayName: p.displayName || '',
    fileUrl: p.fileUrl,
    thumbUrl: p.thumbUrl || '',
    fileName: p.fileName,
    fileSize: p.fileSize,
    mimeType: p.mimeType,
    serverTs: Date.now(),
  };
  broadcastRoom(conn.room, 'message', msgData);
  if (kind === 'text') {
    recordKeeper.store(conn.room, { type: 'message', room: conn.room, payload: msgData, serverTs: msgData.serverTs });
    bot.onUserMessage(conn.room, content);
  }
}

function handleReaction(conn, msg) {
  if (!conn.room) return;
  const { targetMessageId, reaction, senderTag } = msg;
  broadcastRoom(conn.room, 'reaction', { targetMessageId, reaction, senderTag: senderTag || '' });
}

function handleExport(conn) {
  if (!conn.room) return;
  const content = recordKeeper.exportAsTxt(conn.room);
  sendTo(conn, 'export', { content, filename: `changwo-${conn.room}-${Date.now()}.txt` });
}

function handlePing(conn) { sendTo(conn, 'pong', {}); }

// ─── 隐蔽助教：老师专属控制 ─────────────────────

function handleBotControl(conn, msg) {
  if (!conn.room) return;
  if (!bot.isHost(conn.room, conn.hostKey)) { sendTo(conn, 'error', { code: 'NOT_HOST' }); return; }
  const config = bot.setConfig(conn.room, { botEnabled: msg.botEnabled, kbEnabled: msg.kbEnabled, kbId: msg.kbId });
  sendTo(conn, 'bot_config', config);
}

function handleTopic(conn, msg) {
  if (!conn.room) return;
  if (!bot.isHost(conn.room, conn.hostKey)) { sendTo(conn, 'error', { code: 'NOT_HOST' }); return; }
  const text = String(msg.text || (msg.payload && msg.payload.text) || '').trim();
  if (!text) return;
  broadcastRoom(conn.room, 'topic', { text, serverTs: Date.now() });
  bot.onTopic(conn.room, text);
}

// ─── Socket.IO 通道 ────────────────────────────────

io.on('connection', (socket) => {
  const conn = { id: `io-${++connSeq}`, io: socket, ws: null, room: null, sessionToken: null };
  console.log(`[connect] io ${socket.id}`);
  socket.on('join', (msg) => handleJoin(conn, msg || {}));
  socket.on('shard', (msg) => handleShard(conn, msg || {}));
  socket.on('message', (msg) => handleMessage(conn, msg || {}));
  socket.on('reaction', (msg) => handleReaction(conn, msg || {}));
  socket.on('export', () => handleExport(conn));
  socket.on('ping', () => handlePing(conn));
  socket.on('bot_control', (msg) => handleBotControl(conn, msg || {}));
  socket.on('topic', (msg) => handleTopic(conn, msg || {}));
  socket.on('leave', () => leaveRoom(conn));
  socket.on('disconnect', () => { leaveRoom(conn); console.log(`[disconnect] io ${socket.id}`); });
});

// ─── 原生 WebSocket 通道（微信小程序）───────────────

wss.on('connection', (ws) => {
  const conn = { id: `ws-${++connSeq}`, io: null, ws, room: null, sessionToken: null };
  console.log(`[connect] ws ${conn.id}`);
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'join': handleJoin(conn, msg); break;
      case 'shard': handleShard(conn, msg); break;
      case 'message': handleMessage(conn, msg); break;
      case 'reaction': handleReaction(conn, msg); break;
      case 'export': handleExport(conn); break;
      case 'ping': handlePing(conn); break;
      case 'bot_control': handleBotControl(conn, msg); break;
      case 'topic': handleTopic(conn, msg); break;
      case 'leave': leaveRoom(conn); break;
    }
  });
  ws.on('close', () => { leaveRoom(conn); console.log(`[disconnect] ws ${conn.id}`); });
  ws.on('error', () => {});
});

// ─── 启动 ────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[changwo-relay] Socket.IO + HTTP 服务启动于 http://127.0.0.1:${PORT}`);
  console.log(`[changwo-relay] 文件上传: POST http://127.0.0.1:${PORT}/upload`);
});

process.on('SIGINT', () => { io.close(); server.close(); process.exit(0); });
process.on('SIGTERM', () => { io.close(); server.close(); process.exit(0); });
