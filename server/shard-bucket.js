/**
 * shard-bucket.js — 加密碎片桶管理器
 *
 * 职责：
 * 1. 接收并暂存 4 枚 XOR 碎片
 * 2. 检测 4 片集齐 → 触发 assembled
 * 3. assembled 后 100ms 内销毁碎片桶（内存零残留）
 *
 * 安全红线：碎片桶仅存储加密乱码，不解码明文。
 * XOR 合体在客户端完成；此处仅做「集齐判断 + 中转」。
 */

function createShardBucket({ destroyAfterAssembleMs = 100 } = {}) {
  // room → { messageId → { fragments: Map<index, data>, total: number, timer: Timer } }
  const buckets = new Map();

  return {
    /**
     * 向碎片桶添加一枚碎片
     */
    addFragment(room, messageId, fragmentIndex, totalFragments, data) {
      if (!buckets.has(room)) {
        buckets.set(room, new Map());
      }
      const roomBuckets = buckets.get(room);

      if (!roomBuckets.has(messageId)) {
        roomBuckets.set(messageId, {
          fragments: new Map(),
          total: totalFragments,
          createdAt: Date.now(),
        });
      }

      const bucket = roomBuckets.get(messageId);
      bucket.fragments.set(fragmentIndex, data);
    },

    /**
     * 尝试集齐碎片。若集齐则返回拼接后的碎片数据（中转用），
     * 并在 100ms 内销毁碎片桶。
     *
     * 注意：此处返回的是碎片拼接，非明文！XOR 解谜在客户端完成。
     * 服务端仅做碎片收集 + 广播中转。
     */
    tryAssemble(room, messageId) {
      const roomBuckets = buckets.get(room);
      if (!roomBuckets) return null;

      const bucket = roomBuckets.get(messageId);
      if (!bucket) return null;

      if (bucket.fragments.size < bucket.total) return null;

      // 4 片集齐 → 拼接碎片数据（仍为加密乱码）
      const ordered = [];
      for (let i = 0; i < bucket.total; i++) {
        ordered.push(bucket.fragments.get(i) || '');
      }
      const assembledData = ordered.join('|'); // 碎片分隔符

      // 100ms 内销毁碎片桶
      setTimeout(() => {
        roomBuckets.delete(messageId);
        if (roomBuckets.size === 0) {
          buckets.delete(room);
        }
      }, destroyAfterAssembleMs);

      console.log(`[shard] messageId=${messageId} 碎片集齐 (${bucket.total}/4)，桶将在 ${destroyAfterAssembleMs}ms 后销毁`);

      return assembledData;
    },

    /**
     * 清理超时未集齐的碎片桶（30秒过期）
     */
    cleanStale(maxAgeMs = 30_000) {
      const now = Date.now();
      for (const [room, roomBuckets] of buckets) {
        for (const [messageId, bucket] of roomBuckets) {
          if (now - bucket.createdAt > maxAgeMs) {
            roomBuckets.delete(messageId);
            console.log(`[shard] 清理过期碎片桶 messageId=${messageId}`);
          }
        }
        if (roomBuckets.size === 0) {
          buckets.delete(room);
        }
      }
    },
  };
}

module.exports = { createShardBucket };
