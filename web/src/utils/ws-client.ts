/**
 * ws-client.ts — Socket.IO 客户端封装
 *
 * - WebSocket 优先，HTTP 长轮询降级（微信浏览器兼容）
 * - 自动重连（内置）
 * - 心跳保活（内置）
 */

import { io, Socket } from 'socket.io-client';

export interface WsClientOptions {
  url: string;
  room: string;
  sessionToken?: string;
  lastMsgServerTs?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onEvent: (type: string, payload: Record<string, unknown>) => void;
}

export class WsClient {
  private socket: Socket | null = null;
  private opts: WsClientOptions;
  private destroyed = false;
  private pendingQueue: Array<{ type: string; data: Record<string, unknown> }> = [];

  constructor(opts: WsClientOptions) {
    this.opts = opts;
  }

  connect() {
    if (this.destroyed) return;

    this.socket = io(this.opts.url, {
      transports: ['websocket', 'polling'], // WS 优先，HTTP 降级
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log('[ws-client] Socket.IO 已连接, id:', this.socket!.id);
      this.opts.onConnect?.();

      // 发送 join
      this.socket!.emit('join', {
        room: this.opts.room,
        sessionToken: this.opts.sessionToken || undefined,
        lastMsgServerTs: this.opts.lastMsgServerTs,
      });

      // 清空待发队列
      if (this.pendingQueue.length > 0) {
        console.log(`[ws-client] 清空待发队列 (${this.pendingQueue.length} 条)`);
        for (const item of this.pendingQueue) {
          this.socket!.emit(item.type, item.data);
        }
        this.pendingQueue = [];
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[ws-client] 断开:', reason);
      this.opts.onDisconnect?.();
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[ws-client] 连接错误:', err.message);
    });

    // 所有消息事件统一处理
    const eventTypes = ['join', 'shard', 'assembled', 'message', 'reaction',
      'presence', 'export', 'room_full', 'error', 'pong'];
    for (const type of eventTypes) {
      this.socket.on(type, (payload: Record<string, unknown>) => {
        console.log('[ws-client] ←', type, typeof payload === 'object' ? JSON.stringify(payload).slice(0, 80) : '');
        this.opts.onEvent(type, payload || {});
      });
    }
  }

  send(type: string, data: Record<string, unknown> = {}) {
    if (this.socket?.connected) {
      this.socket.emit(type, data);
    } else {
      console.log('[ws-client] 未连接，消息入队:', type);
      this.pendingQueue.push({ type, data });
    }
  }

  destroy() {
    this.destroyed = true;
    this.pendingQueue = [];
    if (this.socket) {
      this.socket.off();
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
