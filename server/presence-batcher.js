/**
 * presence-batcher.js — Presence 广播节流合并器
 *
 * 50 人并发场景下，进出房间的 presence 广播可产生 50×50=2500 次/秒扩散。
 * 本模块对 presence 事件进行 100–200ms 防抖合并，避免广播风暴。
 *
 * 需由 relay.js 提供 broadcastToRoom() 回调。
 */

function createPresenceBatcher({ debounceMs = 150 } = {}) {
  // room → { timer: NodeJS.Timeout, pendingCount: number }
  const pending = new Map();

  /** @type {function(string, object): void} */
  let broadcastFn = null;

  return {
    /**
     * 注册广播回调（由 relay.js 注入）
     */
    setBroadcastFn(fn) {
      broadcastFn = fn;
    },

    /**
     * 触发 Presence 广播（经防抖合并）
     */
    broadcastPresence(room, onlineCount) {
      if (!broadcastFn) {
        // 如果广播回调未注册，直接跳过（静默降级）
        return;
      }

      const entry = pending.get(room);

      if (entry) {
        // 已有待发广播：合并更新在线人数，重置计时器
        entry.pendingCount = onlineCount;
        clearTimeout(entry.timer);
      } else {
        pending.set(room, { pendingCount: onlineCount, timer: null });
      }

      // 设置/重置防抖计时器
      const newEntry = pending.get(room);
      newEntry.timer = setTimeout(() => {
        pending.delete(room);
        broadcastFn(room, {
          type: 'presence',
          room,
          payload: { onlineCount: newEntry.pendingCount },
          serverTs: Date.now(),
        });
      }, debounceMs);
    },

    /**
     * 立即发送（不等待防抖，用于紧急情况）
     */
    flushNow(room, onlineCount) {
      const entry = pending.get(room);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(room);
      }
      if (broadcastFn) {
        broadcastFn(room, {
          type: 'presence',
          room,
          payload: { onlineCount },
          serverTs: Date.now(),
        });
      }
    },
  };
}

module.exports = { createPresenceBatcher };
