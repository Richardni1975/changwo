/**
 * ws-client.ts — 微信小程序 WebSocket 客户端
 *
 * 职责：
 * - WSS 连接管理（含断线重连）
 * - 心跳保活（15s ping）
 * - sessionToken 持久化（重连复用）
 */

const HEARTBEAT_INTERVAL = 15_000;
const RECONNECT_DELAY_BASE = 1_000;
const RECONNECT_DELAY_MAX = 30_000;

export interface WireMessage {
  type: string;
  room: string;
  sessionToken?: string;
  payload?: Record<string, unknown>;
  serverTs?: number;
  lastMsgServerTs?: number;
}

export type MessageHandler = (msg: WireMessage) => void;

export interface WsClientOptions {
  url: string;
  room: string;
  sessionToken?: string;
  lastMsgServerTs?: number;
  onMessage: MessageHandler;
  onPresence?: (count: number) => void;
  onRoomFull?: () => void;
}

export class WsClient {
  private ws: WechatMiniprogram.SocketTask | null = null;
  private opts: WsClientOptions;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private sessionToken: string | null = null;
  private destroyed = false;

  constructor(opts: WsClientOptions) {
    this.opts = opts;
    this.sessionToken = opts.sessionToken || null;
  }

  connect() {
    if (this.destroyed) return;

    this.ws = wx.connectSocket({
      url: this.opts.url,
      success: () => {
        console.log('[ws] 连接中...');
      },
      fail: (err) => {
        console.error('[ws] 连接失败:', err);
        this.scheduleReconnect();
      },
    });

    this.ws.onOpen(() => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();

      // 发送加入请求
      this.send({
        type: 'join',
        room: this.opts.room,
        sessionToken: this.sessionToken || undefined,
        lastMsgServerTs: this.opts.lastMsgServerTs,
      });
    });

    this.ws.onMessage((res) => {
      try {
        const msg: WireMessage = JSON.parse(res.data as string);
        this.handleMessage(msg);
      } catch {
        console.error('[ws] 消息解析失败');
      }
    });

    this.ws.onClose(() => {
      this.stopHeartbeat();
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    });

    this.ws.onError((err) => {
      console.error('[ws] 错误:', err.errMsg);
    });
  }

  send(msg: Partial<WireMessage>) {
    this.ws?.send({
      data: JSON.stringify(msg),
      fail: (err) => console.error('[ws] 发送失败:', err.errMsg),
    });
  }

  destroy() {
    this.destroyed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close({});
    this.ws = null;
  }

  // ─── 私有方法 ────────────────────────────

  private handleMessage(msg: WireMessage) {
    switch (msg.type) {
      case 'join':
        this.sessionToken = msg.sessionToken || null;
        // 持久化 sessionToken 以供重连
        if (this.sessionToken) {
          wx.setStorageSync('changwo_sessionToken', this.sessionToken);
          wx.setStorageSync('changwo_roomId', this.opts.room);
        }
        break;

      case 'room_full':
        this.opts.onRoomFull?.();
        break;

      case 'presence':
        this.opts.onPresence?.(msg.payload?.onlineCount as number ?? 0);
        break;

      case 'pong':
        // 心跳响应
        break;

      default:
        this.opts.onMessage(msg);
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    const delay = Math.min(
      RECONNECT_DELAY_BASE * Math.pow(2, this.reconnectAttempts),
      RECONNECT_DELAY_MAX
    );
    this.reconnectAttempts++;

    console.log(`[ws] ${delay}ms 后尝试重连 (第 ${this.reconnectAttempts} 次)`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
