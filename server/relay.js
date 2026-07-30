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

const PORT = process.env.PORT || 8080;
const PROD = process.env.NODE_ENV === 'production';
const STATIC_DIR = path.join(__dirname, '..', 'web', 'dist');
const MAX_ROOM_CAPACITY = 50;

const capacityGuard = createCapacityGuard({ maxCapacity: MAX_ROOM_CAPACITY });
const shardBucket = createShardBucket({ destroyAfterAssembleMs: 100 });
const recordKeeper = createRecordKeeper({ retentionHours: 168 });

// 每 60 秒清理超时未集齐的碎片桶
setInterval(() => shardBucket.cleanStale(30_000), 60_000);

// ─── HTTP 服务器 ──────────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // 静态文件服务（前端网页）
  if (req.method === 'GET' && !req.url.startsWith('/upload') && !req.url.startsWith('/files/')) {
    let filePath = path.join(STATIC_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    // SPA fallback：所有非 API 路径返回 index.html
    if (!fs.existsSync(filePath)) filePath = path.join(STATIC_DIR, 'index.html');
    const ext = path.extname(filePath);
    const mimeMap = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon' };
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream', 'Cache-Control': PROD ? 'public, max-age=86400' : 'no-cache' });
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
    res.writeHead(200, {
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`,
      'Cache-Control': isThumb
        ? 'public, max-age=604800, immutable'   // 缩略图 7 天缓存，永不变化
        : 'public, max-age=86400',               // 原图 1 天缓存
      'ETag': `"${filename}"`,
    });
    require('fs').createReadStream(file.filepath).pipe(res);
    return;
  }

  res.writeHead(404); res.end();
});

// ─── Socket.IO ────────────────────────────────────

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 15000,    // 15s 心跳（客户端自动）
  pingTimeout: 30000,     // 30s 超时判定僵尸
  connectTimeout: 10000,
  transports: ['websocket', 'polling'],  // WebSocket 优先，HTTP 轮询降级
});

// sessionToken → { socket, room, joinedAt }
const sessions = new Map();

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  let currentRoom = null;
  let sessionToken = null;

  // ─── 加入房间 ──────────────────────
  socket.on('join', (msg) => {
    const room = msg.room;
    if (!room) {
      socket.emit('error', { code: 'MISSING_ROOM' }); return;
    }

    // 重连检查
    if (msg.sessionToken && sessions.has(msg.sessionToken)) {
      const existing = sessions.get(msg.sessionToken);
      if (existing.room === room) {
        sessionToken = msg.sessionToken;
        currentRoom = room;
        existing.socket = socket;
        socket.join(room);
        socket.emit('join', { sessionToken, room, serverTs: Date.now() });
        const missed = recordKeeper.getMessagesSince(room, msg.lastMsgServerTs || 0);
        missed.forEach((m) => socket.emit(m.type, m));
        return;
      }
    }

    // 容量检查
    if (!capacityGuard.canJoin(room)) {
      socket.emit('room_full', { code: 'ROOM_CAPACITY_EXCEEDED', message: '房间已满（50人上限）' });
      return;
    }

    sessionToken = capacityGuard.join(room);
    currentRoom = room;
    sessions.set(sessionToken, { socket, room, joinedAt: Date.now() });
    socket.join(room);
    socket.emit('join', { sessionToken, room, serverTs: Date.now() });

    // 广播在线人数
    io.to(room).emit('presence', { onlineCount: capacityGuard.getOnlineCount(room) });

    // 推送历史
    const history = recordKeeper.getRecentMessages(room, 20);
    history.forEach((m) => socket.emit(m.type, m));
  });

  // ─── 离开 ──────────────────────────
  socket.on('leave', () => {
    if (currentRoom && sessionToken) {
      capacityGuard.leave(currentRoom, sessionToken);
      sessions.delete(sessionToken);
      socket.leave(currentRoom);
      io.to(currentRoom).emit('presence', { onlineCount: capacityGuard.getOnlineCount(currentRoom) });
    }
    currentRoom = null; sessionToken = null;
  });

  // ─── 加密碎片 (momo) ───────────────
  socket.on('shard', (msg) => {
    if (!currentRoom) { socket.emit('error', { code: 'NOT_IN_ROOM' }); return; }
    const { messageId, fragmentIndex, totalFragments, data, hint } = msg;
    if (!messageId || fragmentIndex == null || !data) {
      socket.emit('error', { code: 'INVALID_SHARD' }); return;
    }
    const drift = Math.floor(Math.random() * 300) + 50;
    setTimeout(() => {
      socket.to(currentRoom).emit('shard', { messageId, fragmentIndex, totalFragments, data, hint: hint || 'text' });
      socket.emit('shard', { messageId, fragmentIndex, totalFragments, data, hint: hint || 'text' });

      shardBucket.addFragment(currentRoom, messageId, fragmentIndex, totalFragments, data);
      const assembled = shardBucket.tryAssemble(currentRoom, messageId);
      if (assembled) {
        const assembledData = { messageId, text: assembled, hint: hint || 'text', serverTs: Date.now() };
        io.to(currentRoom).emit('assembled', assembledData);
        recordKeeper.store(currentRoom, { type: 'assembled', room: currentRoom, payload: assembledData, serverTs: assembledData.serverTs });
      }
    }, drift);
  });

  // ─── 直传消息 (plain) ──────────────
  socket.on('message', (msg) => {
    if (!currentRoom) { socket.emit('error', { code: 'NOT_IN_ROOM' }); return; }
    // 兼容旧格式：如果 payload 存在，从 payload 提取；否则直接从 msg 提取
    const p = msg.payload || msg;
    const messageId = p.messageId;
    const kind = p.kind || 'text';
    const content = p.content;
    const senderTag = p.senderTag || '';
    const fileUrl = p.fileUrl;
    const thumbUrl = p.thumbUrl || '';
    const fileName = p.fileName;
    const fileSize = p.fileSize;
    const mimeType = p.mimeType;
    if (!messageId || !content) { socket.emit('error', { code: 'INVALID_MESSAGE' }); return; }
    const msgData = { messageId, kind, content, senderTag, fileUrl, thumbUrl, fileName, fileSize, mimeType, serverTs: Date.now() };
    io.to(currentRoom).emit('message', msgData);
    if (kind === 'text') recordKeeper.store(currentRoom, { type: 'message', room: currentRoom, payload: msgData, serverTs: msgData.serverTs });
  });

  // ─── 表态 ──────────────────────────
  socket.on('reaction', (msg) => {
    if (!currentRoom) return;
    const { targetMessageId, reaction, senderTag } = msg;
    io.to(currentRoom).emit('reaction', { targetMessageId, reaction, senderTag: senderTag || '' });
  });

  // ─── 导出 ──────────────────────────
  socket.on('export', () => {
    if (!currentRoom) return;
    const txtContent = recordKeeper.exportAsTxt(currentRoom);
    socket.emit('export', { payload: { content: txtContent, filename: `changwo-${currentRoom}-${Date.now()}.txt` } });
  });

  // ─── 断开 ──────────────────────────
  socket.on('disconnect', () => {
    if (sessionToken) {
      const s = sessions.get(sessionToken);
      if (s) s.alive = false;
    }
    console.log(`[disconnect] ${socket.id}`);
  });
});

// ─── 启动 ────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[changwo-relay] Socket.IO + HTTP 服务启动于 http://127.0.0.1:${PORT}`);
  console.log(`[changwo-relay] 文件上传: POST http://127.0.0.1:${PORT}/upload`);
});

process.on('SIGINT', () => { io.close(); server.close(); process.exit(0); });
process.on('SIGTERM', () => { io.close(); server.close(); process.exit(0); });
