/**
 * record-keeper.js — 7 天文字记录存储与一键导出
 *
 * 职责：
 * 1. 滚动存储房间文字消息（仅保留 7 天，图片/文件不存储）
 * 2. 过期自动清理
 * 3. 支持 TXT 一键导出（仅文字）
 * 4. 支持按时间戳增量查询（断线重连补包）
 *
 * 安全红线：
 * - 仅存储 "时间 + 文字"，不保留任何身份映射
 * - 无 userId / OpenID 字段
 * - 图片/文档不上传至此模块，独立存储在 file-store
 * - 7 天到期物理删除，不可恢复
 */

function createRecordKeeper({ retentionHours = 168 } = {}) {
  const retentionMs = retentionHours * 60 * 60 * 1000;

  // room → [{ text, serverTs, messageId }]
  const records = new Map();

  // 每小时执行一次过期清理
  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - retentionMs;
    let totalCleaned = 0;
    for (const [room, msgs] of records) {
      const before = msgs.length;
      // 保留 cutoff 之后的消息
      const filtered = msgs.filter((m) => m.serverTs > cutoff);
      records.set(room, filtered);
      totalCleaned += before - filtered.length;
    }
    // 清理空房间
    for (const [room, msgs] of records) {
      if (msgs.length === 0) records.delete(room);
    }
    if (totalCleaned > 0) {
      console.log(`[record] 过期清理: ${totalCleaned} 条记录`);
    }
  }, 60 * 60 * 1000);

  // 不让 cleanupTimer 阻止进程退出
  if (cleanupTimer.unref) cleanupTimer.unref();

  return {
    /**
     * 存储一条解密记录
     * @param {string} room
     * @param {object} msg  - { messageId, text, serverTs }
     */
    store(room, msg) {
      // 只存文字消息，跳过图片/文件
      const pp = msg.payload || {};
      if (pp.kind === 'image' || pp.kind === 'file') return;

      if (!records.has(room)) {
        records.set(room, []);
      }
      const roomRecords = records.get(room);
      roomRecords.push({
        type: msg.type || 'assembled',
        messageId: (msg.payload && msg.payload.messageId) || msg.messageId,
        text: (msg.payload && (msg.payload.text || msg.payload.content)) || msg.text || '',
        kind: (msg.payload && msg.payload.kind) || 'text',
        hint: (msg.payload && msg.payload.hint) || 'text',
        serverTs: msg.serverTs || Date.now(),
      });

      // 内存保护：单房间最多保留 10000 条（超过则截断最早的一半）
      if (roomRecords.length > 10_000) {
        const trimmed = roomRecords.slice(-5_000);
        records.set(room, trimmed);
        console.log(`[record] room=${room} 触发截断: ${roomRecords.length} → ${trimmed.length}`);
      }
    },

    /**
     * 获取房间最近 N 条记录
     */
    getRecentMessages(room, count = 20) {
      const roomRecords = records.get(room);
      if (!roomRecords) return [];
      return roomRecords.slice(-count).map((r) => ({
        type: r.type || 'assembled',
        room,
        payload: {
          messageId: r.messageId,
          text: r.text,
          kind: r.kind,
          hint: r.hint,
        },
        serverTs: r.serverTs,
      }));
    },

    /**
     * 增量查询：获取 serverTs 之后的所有消息（断线重连补包）
     */
    getMessagesSince(room, sinceTs) {
      const roomRecords = records.get(room);
      if (!roomRecords) return [];
      return roomRecords
        .filter((r) => r.serverTs > sinceTs)
        .map((r) => ({
          type: r.type || 'assembled',
          room,
          payload: {
            messageId: r.messageId,
            text: r.text,
            kind: r.kind,
            hint: r.hint,
          },
          serverTs: r.serverTs,
        }));
    },

    /**
     * 导出为 TXT 格式
     */
    exportAsTxt(room) {
      const roomRecords = records.get(room);
      if (!roomRecords || roomRecords.length === 0) {
        return '暂无聊天记录。';
      }
      const header = `畅吾欲言 匿名房间 — ${room}\n导出时间: ${new Date().toISOString()}\n共 ${roomRecords.length} 条记录\n${'─'.repeat(40)}\n\n`;
      const body = roomRecords
        .map((r) => {
          const prefix = r.kind === 'image' ? '[图片] ' : r.kind === 'file' ? '[文件] ' : '';
          return `[${new Date(r.serverTs).toLocaleString('zh-CN')}] ${prefix}${r.text}`;
        })
        .join('\n');
      return header + body;
    },

    /**
     * 获取房间记录总数
     */
    getCount(room) {
      const roomRecords = records.get(room);
      return roomRecords ? roomRecords.length : 0;
    },

    /**
     * 销毁（测试用）
     */
    destroy() {
      clearInterval(cleanupTimer);
      records.clear();
    },
  };
}

module.exports = { createRecordKeeper };
