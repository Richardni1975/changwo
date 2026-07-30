import { useState, useCallback } from 'react';

interface UsePresenceOptions {
  maxCapacity?: number;
}

/**
 * 在线人数状态管理
 */
export function usePresence({ maxCapacity = 50 }: UsePresenceOptions = {}) {
  const [onlineCount, setOnlineCount] = useState(0);
  const [isFull, setIsFull] = useState(false);

  const updatePresence = useCallback((count: number) => {
    setOnlineCount(count);
    setIsFull(count >= maxCapacity);
  }, [maxCapacity]);

  return {
    onlineCount,
    isFull,
    maxCapacity,
    updatePresence,
  };
}
