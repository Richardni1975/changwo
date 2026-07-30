/**
 * 畅吾欲言 — 房间页
 *
 * 核心页面：碎片收发、合体解密、实时消息流
 * 安全红线：不收集 / 不上传任何用户身份信息
 */

import { shredText, assembleShards } from '../../utils/crypto';
import { WsClient } from '../../utils/ws-client';

interface DisplayMessage {
  id: string;
  text: string;
  serverTs: number;
  timeStr: string;
  status: 'collecting' | 'ready';
}

interface PageData {
  roomId: string;
  roomIdShort: string;
  connected: boolean;
  onlineCount: number;
  roomFull: boolean;
  exporting: boolean;
  inputText: string;
  messages: DisplayMessage[];
  lastMessageId: string;
}

Page<PageData, {}>({
  data: {
    roomId: '',
    roomIdShort: '',
    connected: false,
    onlineCount: 0,
    roomFull: false,
    exporting: false,
    inputText: '',
    messages: [],
    lastMessageId: '',
  },

  // WebSocket 客户端实例
  _wsClient: null as WsClient | null,
  // 已合体的消息 ID 集合
  _assembledIds: new Set<string>(),

  onLoad(options: { roomId?: string }) {
    const roomId = options.roomId || 'unknown';
    this.setData({
      roomId,
      roomIdShort: roomId.slice(0, 8),
    });

    // 建立 WebSocket 连接
    this._connectWs(roomId);
  },

  onUnload() {
    // 离开房间
    this._wsClient?.destroy();
    this._wsClient = null;
  },

  // ─── WebSocket ─────────────────────────────

  _connectWs(roomId: string) {
    const wsUrl = 'wss://api-mosaic.m0m0n1.top/ws';

    this._wsClient = new WsClient({
      url: wsUrl,
      room: roomId,
      onMessage: (msg) => {
        switch (msg.type) {
          case 'shard': {
            const { messageId, fragmentIndex, totalFragments, data } = msg.payload;
            // 客户端本地合体（不经过服务端）
            const plaintext = assembleShards(
              Array.from({ length: totalFragments }, (_, i) =>
                i === fragmentIndex ? data : ''
              )
            );

            // 简化处理：直接显示（生产环境需碎片桶收集后再合体）
            if (plaintext && !this._assembledIds.has(messageId)) {
              this._assembledIds.add(messageId);
              this._addMessage(messageId, plaintext, msg.serverTs || Date.now(), 'ready');
            }
            break;
          }

          case 'assembled': {
            const { messageId, text } = msg.payload;
            if (!this._assembledIds.has(messageId)) {
              this._assembledIds.add(messageId);
              this._addMessage(messageId, text, msg.serverTs || Date.now(), 'ready');
            }
            break;
          }

          case 'presence':
            this.setData({ onlineCount: msg.payload?.onlineCount || 0 });
            break;

          case 'room_full':
            this.setData({ roomFull: true });
            break;

          case 'export': {
            const { content, filename } = msg.payload;
            // 复制到剪贴板（小程序无文件下载 API）
            wx.setClipboardData({
              data: content,
              success: () => {
                wx.showToast({ title: '已复制到剪贴板', icon: 'success' });
              },
            });
            this.setData({ exporting: false });
            break;
          }
        }
      },
      onPresence: (count) => this.setData({ onlineCount: count }),
      onRoomFull: () => this.setData({ roomFull: true }),
    });

    this._wsClient.connect();
    this.setData({ connected: true });
  },

  _addMessage(id: string, text: string, serverTs: number, status: 'collecting' | 'ready') {
    const timeStr = new Date(serverTs).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const messages = [...this.data.messages, { id, text, serverTs, timeStr, status }];
    // 内存保护：最多保留 500 条
    const trimmed = messages.length > 500 ? messages.slice(-500) : messages;

    this.setData({
      messages: trimmed,
      lastMessageId: `msg-${id}`,
    });
  },

  // ─── 用户操作 ──────────────────────────────

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ inputText: e.detail.value });
  },

  onSend() {
    const text = this.data.inputText.trim();
    if (!text) return;

    const messageId = this._generateId();
    const shards = shredText(text, 4);

    // 本地显示收集态
    this._addMessage(messageId, '', Date.now(), 'collecting');
    this.setData({ inputText: '' });

    // 逐一发送碎片（含随机延迟以混淆时序）
    shards.forEach((data, index) => {
      const drift = Math.floor(Math.random() * 300) + 50;
      setTimeout(() => {
        this._wsClient?.send({
          type: 'shard',
          room: this.data.roomId,
          payload: { messageId, fragmentIndex: index, totalFragments: 4, data },
        });
      }, drift);
    });
  },

  onExport() {
    this.setData({ exporting: true });
    this._wsClient?.send({
      type: 'export',
      room: this.data.roomId,
    });
  },

  onBack() {
    wx.navigateBack();
  },

  // ─── 工具 ──────────────────────────────────

  _generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },
});
