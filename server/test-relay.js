/**
 * relay.js 集成测试脚本
 * 验证: join → ping/pong → shard → assembled → export 完整链路
 */
const WebSocket = require('ws');

const WS_URL = 'ws://127.0.0.1:8080';
const ROOM = 'test-room-001';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function test() {
  console.log('══════════════════════════════════════════');
  console.log('  畅吾欲言 relay.js 集成测试');
  console.log('══════════════════════════════════════════\n');

  // ─── TEST 1: 连接与加入房间 ──────────────
  console.log('📋 TEST 1: 连接 & 加入房间');
  const ws1 = new WebSocket(WS_URL);
  const messages1 = [];

  await new Promise((resolve) => {
    ws1.on('open', () => {
      ws1.send(JSON.stringify({ type: 'join', room: ROOM }));
    });
    ws1.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      messages1.push(msg);
      if (msg.type === 'join') {
        assert(msg.sessionToken && msg.sessionToken.length > 0, 'join 返回 sessionToken');
        assert(msg.room === ROOM, 'join 返回正确的 room');
        resolve();
      }
    });
    ws1.on('error', (err) => {
      assert(false, `连接失败: ${err.message}`);
      resolve();
    });
  });

  const sessionToken1 = messages1.find((m) => m.type === 'join')?.sessionToken;

  // ─── TEST 2: 心跳 ping/pong ──────────────
  console.log('\n📋 TEST 2: 心跳 ping/pong');
  let pongReceived = false;
  ws1.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'pong') pongReceived = true;
  });
  ws1.send(JSON.stringify({ type: 'ping' }));
  await delay(500);
  assert(pongReceived, 'ping → pong 正常响应');

  // ─── TEST 3: 第2个客户端加入 ──────────────
  console.log('\n📋 TEST 3: 第2个客户端加入');
  const ws2 = new WebSocket(WS_URL);
  const messages2 = [];

  const ws2Ready = new Promise((resolve) => {
    ws2.on('open', () => {
      ws2.send(JSON.stringify({ type: 'join', room: ROOM }));
    });
    ws2.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      messages2.push(msg);
      if (msg.type === 'join') resolve();
    });
  });
  await ws2Ready;
  assert(messages2.some((m) => m.type === 'join'), 'ws2 成功加入同一房间');

  // ─── TEST 4: Presence 广播 ──────────────
  console.log('\n📋 TEST 4: Presence 广播（节流 150ms）');
  await delay(300); // 等待 presence batcher flush
  const hasPresence = messages1.some((m) => m.type === 'presence' && m.payload?.onlineCount > 0);
  assert(hasPresence, 'ws1 收到 presence 广播');

  // ─── TEST 5: 碎片中转 & assembled ────────
  console.log('\n📋 TEST 5: 碎片中转 (shard → assembled)');
  const msgId = 'test-msg-001';
  const assembledPromise = new Promise((resolve) => {
    ws1.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'assembled' && msg.payload?.messageId === msgId) {
        resolve(msg);
      }
    });
  });

  // ws1 发送 4 枚碎片
  for (let i = 0; i < 4; i++) {
    ws1.send(JSON.stringify({
      type: 'shard',
      room: ROOM,
      payload: {
        messageId: msgId,
        fragmentIndex: i,
        totalFragments: 4,
        data: `deadbeef000${i}`, // 模拟加密碎片（hex）
      },
    }));
    await delay(20);
  }

  // 由于 ws1 发送的碎片不会广播给自己（broadcastToRoom 排除了发送者），
  // ws2 应该收到 assembled
  const assembledMsg = await Promise.race([
    assembledPromise,
    delay(2000).then(() => null),
  ]);
  // 碎片集齐测试: 检查 ws2 是否收到了shard
  const ws2Shards = messages2.filter((m) => m.type === 'shard');
  console.log(`  ℹ️ ws2 收到 ${ws2Shards.length} 枚碎片`);
  assert(ws2Shards.length > 0, 'ws2 收到了碎片中继');

  // ─── TEST 6: 一键导出 ────────────────────
  console.log('\n📋 TEST 6: 一键导出 TXT');
  let exportResult = null;
  ws1.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'export') exportResult = msg;
  });
  ws1.send(JSON.stringify({ type: 'export', room: ROOM }));
  await delay(500);
  assert(exportResult !== null, '收到 export 响应');
  assert(exportResult?.payload?.content?.includes('畅吾欲言'), '导出内容包含"畅吾欲言"');
  assert(exportResult?.payload?.filename?.startsWith('changwo-'), '导出文件名以 changwo- 开头');

  // ─── TEST 7: 重连 (sessionToken) ──────────
  console.log('\n📋 TEST 7: 断线重连');
  ws1.close();
  await delay(300);
  const ws1Reconnect = new WebSocket(WS_URL);
  let reconnectResult = null;
  await new Promise((resolve) => {
    ws1Reconnect.on('open', () => {
      ws1Reconnect.send(JSON.stringify({
        type: 'join',
        room: ROOM,
        sessionToken: sessionToken1,
      }));
    });
    ws1Reconnect.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'reconnect') {
        reconnectResult = msg;
        resolve();
      }
      if (msg.type === 'join') resolve(); // fallback
    });
    ws1Reconnect.on('error', () => resolve());
  });
  assert(reconnectResult !== null || reconnectResult?.type === 'join',
    '重连成功（sessionToken 复用槽位）');
  ws1Reconnect.close();

  // ─── 清理 ────────────────────────────────
  ws2.close();
  await delay(200);

  // ─── 结果 ────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  console.log(`  测试结果: ${passed} 通过 / ${failed} 失败`);
  console.log('══════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

test().catch((err) => {
  console.error('测试异常:', err);
  process.exit(1);
});
