import { useCallback, useRef, useEffect } from 'react';
import { shredText, assembleShards } from '../utils/crypto';

interface UseCryptoOptions {
  totalShards?: number;
  onShredComplete?: (shards: string[], messageId: string) => void;
}

/**
 * XOR 分片/合体 Hook
 * 所有密码学操作在客户端本地完成
 */
export function useCrypto({ totalShards = 4, onShredComplete }: UseCryptoOptions = {}) {
  // 待合体的碎片暂存区：messageId → { fragments: Map, total }
  const pendingAssembly = useRef<Map<string, {
    fragments: Map<number, string>;
    total: number;
    createdAt: number;
  }>>(new Map());

  /**
   * 发送文本：先分片，再逐一发出
   */
  const sendText = useCallback((text: string): { messageId: string; shards: string[] } => {
    const messageId = crypto.randomUUID();
    const shards = shredText(text, totalShards);
    onShredComplete?.(shards, messageId);
    return { messageId, shards };
  }, [totalShards, onShredComplete]);

  /**
   * 接收碎片并尝试合体
   * @returns 合体后的明文，若尚未集齐则返回 null
   */
  const receiveShard = useCallback((
    messageId: string,
    fragmentIndex: number,
    totalFragments: number,
    data: string
  ): string | null => {
    const pending = pendingAssembly.current;

    if (!pending.has(messageId)) {
      pending.set(messageId, {
        fragments: new Map(),
        total: totalFragments,
        createdAt: Date.now(),
      });
    }

    const bucket = pending.get(messageId)!;
    bucket.fragments.set(fragmentIndex, data);

    if (bucket.fragments.size < bucket.total) {
      return null; // 尚未集齐
    }

    // 集齐 → 合体
    const ordered: string[] = [];
    for (let i = 0; i < bucket.total; i++) {
      ordered.push(bucket.fragments.get(i) || '');
    }

    // 立即清理碎片桶
    pending.delete(messageId);

    try {
      return assembleShards(ordered);
    } catch (err) {
      console.error('[crypto] 合体失败:', err);
      return null;
    }
  }, []);

  /**
   * 清理超过 30 秒未集齐的碎片桶
   */
  const cleanStaleBuckets = useCallback(() => {
    const now = Date.now();
    const pending = pendingAssembly.current;
    for (const [id, bucket] of pending) {
      if (now - bucket.createdAt > 30_000) {
        pending.delete(id);
      }
    }
  }, []);

  // 每 30 秒清理一次过期桶
  useEffect(() => {
    const timer = setInterval(cleanStaleBuckets, 30_000);
    return () => clearInterval(timer);
  }, [cleanStaleBuckets]);

  return { sendText, receiveShard };
}
