/**
 * protocol.ts — WebSocket 消息协议类型定义
 *
 * 双端共享（小程序 & Web）。服务端 relay.js 也遵循此契约。
 *
 * 四种通信模式：
 *   momo 文字: shard(×4) → assembled（XOR 加密碎片）
 *   momo 图片: shard(×4) → assembled（图片 base64 XOR 加密碎片）
 *   plain 文字: message(kind:'text')（直传）
 *   plain 图片: message(kind:'image')（直传 base64）
 */

export enum MessageType {
  // 连接与心跳
  JOIN = 'join',
  LEAVE = 'leave',
  PING = 'ping',
  PONG = 'pong',
  PRESENCE = 'presence',

  // momo 匿名模式：加密碎片
  SHARD = 'shard',
  ASSEMBLED = 'assembled',

  // plain 非匿名模式：直传消息
  MESSAGE = 'message',

  // 互动
  REACTION = 'reaction',

  // 系统
  ERROR = 'error',
  ROOM_FULL = 'room_full',
  RECONNECT = 'reconnect',
  EXPORT = 'export',

  // AI 扩展
  AI_SUMMARY = 'ai_summary',
  AI_POLL = 'ai_poll',
}

export interface WireMessage {
  type: string;
  room: string;
  sessionToken?: string;
  payload?: Record<string, unknown>;
  serverTs?: number;
  lastMsgServerTs?: number;
}

/** momo 碎片载荷 */
export interface ShardPayload {
  messageId: string;
  fragmentIndex: number;
  totalFragments: number;
  data: string;
  /** 内容类型提示：'text' | 'image' */
  hint?: string;
}

/** momo 合体载荷 */
export interface AssembledPayload {
  messageId: string;
  text: string;       // 合体后的 base64 或明文
  hint?: string;       // 'text' | 'image'
}

/** plain 直传载荷 */
export interface MessagePayload {
  messageId: string;
  kind: 'text' | 'image' | 'file';
  content: string;        // 文本内容 或 文件描述
  fileUrl?: string;        // 上传后的文件访问 URL
  fileName?: string;       // 原始文件名
  fileSize?: number;       // 文件大小（字节）
  mimeType?: string;       // 文件 MIME 类型
}

export interface PresencePayload {
  onlineCount: number;
}

export interface ErrorPayload {
  code: string;
  message?: string;
}

export interface ExportPayload {
  content: string;
  filename: string;
}
