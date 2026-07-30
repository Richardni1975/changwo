import { useEffect, useRef, useCallback, useState } from 'react';
import { WsClient } from '../utils/ws-client';
import type { WireMessage } from '../utils/protocol';

interface UseWebSocketOptions {
  url: string;
  room: string;
  onMessage: (msg: WireMessage) => void;
  onPresence?: (count: number) => void;
  onRoomFull?: () => void;
}

export function useWebSocket({ url, room, onMessage, onPresence, onRoomFull }: UseWebSocketOptions) {
  const clientRef = useRef<WsClient | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onPresenceRef = useRef(onPresence);
  onPresenceRef.current = onPresence;
  const onRoomFullRef = useRef(onRoomFull);
  onRoomFullRef.current = onRoomFull;

  useEffect(() => {
    const client = new WsClient({
      url,
      room,
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
      onEvent: (type, payload) => {
        const msg: WireMessage = { type, room, payload: payload as Record<string, unknown>, serverTs: (payload as any)?.serverTs };
        switch (type) {
          case 'join': setConnected(true); break;
          case 'presence': onPresenceRef.current?.(payload?.onlineCount as number ?? 0); break;
          case 'room_full': onRoomFullRef.current?.(); break;
        }
        onMessageRef.current(msg);
      },
    });
    client.connect();
    clientRef.current = client;
    return () => { client.destroy(); clientRef.current = null; setConnected(false); };
  }, [url, room]);

  const send = useCallback((type: string, data: Record<string, unknown> = {}) => {
    clientRef.current?.send(type, data);
  }, []);

  return { connected, send };
}
