import { useState, useCallback, useRef, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useCrypto } from '../hooks/useCrypto';
import { usePresence } from '../hooks/usePresence';
import { ShardCollector } from '../components/ShardCollector';
import { FpsMonitor } from '../components/FpsMonitor';
import { VoiceInput } from '../components/VoiceInput';
import { ImageViewer } from '../components/ImageViewer';
import { QrModal } from '../components/QrModal';
import type { WireMessage, ShardPayload } from '../utils/protocol';
import { assembleShards, shredText } from '../utils/crypto';

// ─── 类型 ──────────────────────────────────────

interface RoomProps { roomId: string; onBack: () => void; }

interface DisplayMessage {
  id: string;
  text: string;
  serverTs: number;
  status: 'collecting' | 'ready';
  kind: 'text' | 'image' | 'file';
  displayName: string;
  thumbsUp: number;     // 赞数
  thumbsDown: number;   // 踩数
}

type ChatMode = 'momo' | 'plain';

/** 下载 URL 文件到本地（不打开，跨域安全） */
function downloadFile(url: string, filename: string) {
  fetch(url)
    .then((r) => r.blob())
    .then((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => { window.open(url, '_blank'); });
}

/** 在系统级新窗口打开链接（手机/电脑均可靠，不覆盖当前页面） */

// 自动适配：用当前页面地址的主机名，不再写死 127.0.0.1
// 开发环境：分端口（Vite :3000 + Relay :8080）；生产环境：同源（Relay 同时服务静态文件）
const DEV = import.meta.env.DEV;
const WS_URL = DEV ? `ws://${window.location.hostname}:8080` : (window.location.protocol === 'https:' ? `wss://${window.location.host}` : `ws://${window.location.host}`);
const UPLOAD_URL = DEV ? `http://${window.location.hostname}:8080/upload` : '/upload';
/** 根据当前页面地址构造文件完整 URL（生产环境同源，开发环境跨端口） */
function fileUrl(p: string) { return DEV ? `http://${window.location.hostname}:8080${p}` : p; }
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const THUMB_THRESHOLD = 10;

/** 从消息 JSON 提取缩略图/原图 URL，根据在线人数自动选择 */
const MAX_MESSAGES = 500;   // 内存硬上限，超了截断最早一半
const MAX_IDS = 1000;        // 去重 Set 上限，超了清理最早一半

function pickImageUrl(text: string, online: number) {
  try {
    const ref = JSON.parse(text);
    const full = ref.fileUrl || text;
    const thumb = ref.thumbUrl || full;
    return { src: online > THUMB_THRESHOLD ? thumb : full, full };
  } catch { return { src: text, full: text }; }
}
function pickFileUrl(text: string): { url: string; name: string } {
  try {
    const ref = JSON.parse(text);
    const url = ref.fileUrl || text;
    const name = ref.fileName || decodeURIComponent(url.split('/').pop()?.split('?')[0] || '文件');
    return { url, name };
  } catch {
    return { url: text, name: decodeURIComponent(text.split('/').pop()?.split('?')[0] || '文件') };
  }
}

/** 截断数组：只保留最后 N 条 */
function trimArray<T>(arr: T[], max: number): T[] {
  return arr.length > max ? arr.slice(-Math.floor(max / 2)) : arr;
}

/** 清理 Set：超过上限删掉最早加入的一半 */
function trimSet(set: Set<string>, max: number) {
  if (set.size > max) {
    const entries = Array.from(set);
    const toRemove = entries.slice(0, Math.floor(entries.length / 2));
    toRemove.forEach((k) => set.delete(k));
  }
}

// ─── 组件 ──────────────────────────────────────

export function Room({ roomId, onBack }: RoomProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [roomFull, setRoomFull] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mode, setMode] = useState<ChatMode>('momo');
  const [uploading, setUploading] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);

  const msgListRef = useRef<HTMLDivElement>(null);
  // 本设备已表态的消息：messageId → 'up' | 'down'（每消息只能点一次）
  const reactedRef = useRef<Map<string, 'up' | 'down'>>(new Map());
  // 自己发出的消息 ID 集合（用于判断是否显示下载按钮）
  const myMsgIdsRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── 身份基础结构 ───────────────────────────

  // 我的永久随机身份标签（仅在 plain 模式下使用）
  const mySenderTag = useRef(crypto.randomUUID().slice(0, 8));
  // 见过别人的 senderTag → 分配的发言人编号
  const senderLabelMap = useRef<Map<string, string>>(new Map());
  let nextSpeakerIndex = useRef(0);

  // 获取或分配 senderTag 对应的标签
  const getSenderLabel = (senderTag: string): string => {
    if (!senderTag) return '未知';
    if (senderTag === mySenderTag.current) return '我';
    const map = senderLabelMap.current;
    if (map.has(senderTag)) return map.get(senderTag)!;
    const labels = ['发言人 A', '发言人 B', '发言人 C', '发言人 D', '发言人 E'];
    const label = labels[nextSpeakerIndex.current % labels.length];
    nextSpeakerIndex.current++;
    map.set(senderTag, label);
    return label;
  };

  // ─── 消息处理（分模式处理身份）──────────────

  const handleMessage = useCallback((msg: WireMessage) => {
    const assembledIds = assembledIdsRef.current;

    switch (msg.type) {
      // ── momo 碎片（匿名模式，永远 momo）──
      case 'shard': {
        const { messageId, fragmentIndex, totalFragments, data } = msg.payload as unknown as ShardPayload;
        const plaintext = receiveShardRef.current(messageId, fragmentIndex, totalFragments, data);
        if (plaintext !== null && !assembledIds.has(messageId)) {
          assembledIds.add(messageId);
          const hint = (msg.payload as any)?.hint as string || 'text';
          let kind: DisplayMessage['kind'] = hint === 'image' ? 'image' : hint === 'file' ? 'file' : 'text';
          let displayText = plaintext;
          if (kind === 'image' || kind === 'file') {
            try { const ref = JSON.parse(displayText); displayText = ref.fileUrl || displayText; } catch {}
          }
          setMessages((prev) =>
            prev.map((m) => m.id === messageId ? { ...m, text: displayText, status: 'ready' as const, kind } : m));
        } else if (plaintext === null && !assembledIds.has(messageId)) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === messageId)) return prev;
            return [...prev, { id: messageId, text: '', serverTs: msg.serverTs || Date.now(),
              status: 'collecting', kind: 'text' as const, displayName: 'momo', thumbsUp: 0, thumbsDown: 0 }];
          });
        }
        break;
      }

      // ── momo 合体（匿名模式，永远 momo）──
      case 'assembled': {
        const { messageId, text } = msg.payload as { messageId: string; text: string };
        if (assembledIds.has(messageId)) break;
        assembledIds.add(messageId);
        const hint = (msg.payload as any)?.hint as string || 'text';
        let kind: DisplayMessage['kind'] = hint === 'image' ? 'image' : hint === 'file' ? 'file' : 'text';
        let displayText = text;
        try {
          const frags = text.split('|');
          if (frags.length >= 4) displayText = assembleShards(frags);
        } catch {}
        if (kind === 'image' || kind === 'file') {
          try { const ref = JSON.parse(displayText); displayText = ref.fileUrl || displayText; } catch {}
        }
        setMessages((prev) => [...prev.filter((m) => m.id !== messageId), {
          id: messageId, text: displayText, serverTs: msg.serverTs || Date.now(),
          status: 'ready', kind, displayName: 'momo', thumbsUp: 0, thumbsDown: 0,
        }]);
        break;
      }

      // ── plain 直传消息（非匿名，身份清晰）──
      case 'message': {
        const { messageId, kind, content, senderTag, fileUrl, thumbUrl } = msg.payload as any;
        if (assembledIds.has(messageId)) break;
        assembledIds.add(messageId);
        const displayKind: DisplayMessage['kind'] = kind === 'image' ? 'image' : kind === 'file' ? 'file' : 'text';
        // 图片/文件存完整 JSON（含 thumbUrl + fileName），纯文本直接存 content
        const displayText = (kind === 'image' || kind === 'file')
          ? JSON.stringify({ fileUrl: fileUrl || content, thumbUrl: thumbUrl || fileUrl || content, fileName: (msg.payload as any)?.fileName || content })
          : content;
        const displayName = getSenderLabel(senderTag || '');
        setMessages((prev) => [...prev.filter((m) => m.id !== messageId), {
          id: messageId, text: displayText, serverTs: msg.serverTs || Date.now(),
          status: 'ready', kind: displayKind, displayName, thumbsUp: 0, thumbsDown: 0,
        }]);
        break;
      }

      // ── 表态（赞/踩）──────────────
      case 'reaction': {
        const { targetMessageId, reaction } = msg.payload as { targetMessageId: string; reaction: string };
        const senderTag = (msg.payload as any)?.senderTag as string || '';
        // 如果是自己发的，本地已经加了，跳过
        if (senderTag === mySenderTag.current) break;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== targetMessageId) return m;
            return {
              ...m,
              thumbsUp: reaction === 'up' ? m.thumbsUp + 1 : m.thumbsUp,
              thumbsDown: reaction === 'down' ? m.thumbsDown + 1 : m.thumbsDown,
            };
          })
        );
        break;
      }

      // ── 导出 ──
      case 'export': {
        const { content, filename } = msg.payload as any;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url); setExporting(false);
        break;
      }
    }
  }, []);

  // ─── Ref 代理（打破 useWebSocket ↔ useCrypto 循环）──

  const assembledIdsRef = useRef<Set<string>>(new Set());
  const sendRef = useRef<(type: string, data: Record<string, unknown>) => void>(() => {});
  const receiveShardRef = useRef<(msgId: string, idx: number, total: number, data: string) => string | null>(() => null);

  // ─── Presence ───────────────────────────────

  const { onlineCount, isFull, updatePresence } = usePresence();

  // ─── WebSocket ──────────────────────────────

  const { connected, send } = useWebSocket({
    url: WS_URL, room: roomId, onMessage: handleMessage,
    onPresence: updatePresence, onRoomFull: () => setRoomFull(true),
  });
  sendRef.current = send;

  // ─── Crypto（仅 momo 模式使用）──────────────

  const { sendText: momoSendText, receiveShard } = useCrypto({
    onShredComplete: (shards, messageId) => {
      myMsgIdsRef.current.add(messageId);
      setMessages((prev) => [...prev, { id: messageId, text: '', serverTs: Date.now(),
        status: 'collecting', kind: 'text' as const, displayName: 'momo', thumbsUp: 0, thumbsDown: 0 }]);
      shards.forEach((data, index) => {
        setTimeout(() => { sendRef.current('shard', {
          messageId, fragmentIndex: index, totalFragments: shards.length, data, hint: 'text' }); },
          Math.random() * 250 + 50);
      });
    },
  });
  receiveShardRef.current = receiveShard;

  // ─── 发送 ──────────────────────────────────

  const handleSend = () => {
    const text = inputText.trim(); if (!text) return;
    if (mode === 'momo') {
      momoSendText(text);
    } else {
      const messageId = crypto.randomUUID();
      myMsgIdsRef.current.add(messageId);
      assembledIdsRef.current.add(messageId);
      send('message', { messageId, kind: 'text', content: text, senderTag: mySenderTag.current });
      setMessages((prev) => [...prev, { id: messageId, text, serverTs: Date.now(),
        status: 'ready', kind: 'text' as const, displayName: '我', thumbsUp: 0, thumbsDown: 0 }]);
    }
    setInputText('');
  };

  const handleExport = () => {
    setExporting(true);
    // 客户端本地导出——服务端只有加密碎片，没见过明文，导出无意义
    const textOnly = messages.filter((m) => m.kind === 'text' && m.status === 'ready');
    const header = `畅吾欲言 — ${roomId}\n导出时间: ${new Date().toISOString()}\n共 ${textOnly.length} 条消息\n${'─'.repeat(40)}\n\n`;
    const body = textOnly.map((m) =>
      `[${new Date(m.serverTs).toLocaleTimeString('zh-CN')}] ${m.displayName}: ${m.text}`
    ).join('\n');
    const content = header + body;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `changwo-${roomId.slice(0, 8)}-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  const sendReaction = (targetMessageId: string, reaction: 'up' | 'down') => {
    // 每个设备对每条消息只能表态一次（赞和踩互斥）
    if (reactedRef.current.has(targetMessageId)) return;
    reactedRef.current.set(targetMessageId, reaction);
    // 本地立即更新
    setMessages((prev) => prev.map((m) =>
      m.id === targetMessageId
        ? { ...m, thumbsUp: reaction === 'up' ? m.thumbsUp + 1 : m.thumbsUp, thumbsDown: reaction === 'down' ? m.thumbsDown + 1 : m.thumbsDown }
        : m));
    // momo 模式下不携带 senderTag（匿名），plain 模式下携带（可追溯）
    const tag = mode === 'plain' ? mySenderTag.current : '';
    send('reaction', { targetMessageId, reaction, senderTag: tag });
  };

  // ─── 文件上传 ──────────────────────────────

  const handleFileUpload = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) { alert(`文件过大，上限 10MB`); return; }
    setUploading(true);
    try {
      const uploadUrl = `${UPLOAD_URL}?name=${encodeURIComponent(file.name)}&mime=${encodeURIComponent(file.type || 'application/octet-stream')}`;
      const res = await fetch(uploadUrl, { method: 'POST', body: file });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || '上传失败'); }
      const info = await res.json();
      const fileRefUrl = info.url;
      const thumbRefUrl = info.thumbUrl || info.url; // 缩略图路径
      const kind = info.isImage ? 'image' : 'file';
      const messageId = crypto.randomUUID();
      myMsgIdsRef.current.add(messageId);

      if (mode === 'momo') {
        const refText = JSON.stringify({ kind, fileUrl: fileRefUrl, thumbUrl: thumbRefUrl, fileName: info.originalName, fileSize: info.size, mimeType: info.mimeType });
        const shards = shredText(refText, 4);
        setMessages((prev) => [...prev, { id: messageId, text: '', serverTs: Date.now(),
          status: 'collecting', kind: kind as DisplayMessage['kind'], displayName: 'momo', thumbsUp: 0, thumbsDown: 0 }]);
        shards.forEach((d, i) => setTimeout(() => { sendRef.current('shard', { messageId, fragmentIndex: i, totalFragments: 4, data: d, hint: kind }); }, Math.random() * 250 + 50));
      } else {
        assembledIdsRef.current.add(messageId);
        const imgJson = JSON.stringify({ fileUrl: fileRefUrl, thumbUrl: thumbRefUrl, fileName: info.originalName });
        send('message', { messageId, kind, content: info.originalName,
          senderTag: mySenderTag.current, fileUrl: fileRefUrl, thumbUrl: thumbRefUrl, fileName: info.originalName, fileSize: info.size, mimeType: info.mimeType });
        setMessages((prev) => [...prev, { id: messageId, text: imgJson, serverTs: Date.now(),
          status: 'ready', kind: kind as DisplayMessage['kind'], displayName: '我', thumbsUp: 0, thumbsDown: 0 }]);
      }
    } catch (err: any) { alert('上传失败: ' + (err.message || '未知错误')); }
    setUploading(false);
  }, [mode, roomId]);

  // ─── 内存治理（6 小时长会话保障）────────────────
  // 消息数组硬上限 500 条，超过截断到 250 条
  useEffect(() => {
    if (messages.length > MAX_MESSAGES) {
      setMessages((prev) => trimArray(prev, MAX_MESSAGES));
    }
  }, [messages.length]);

  // 每 5 分钟清理去重 Set（防止无限膨胀）
  useEffect(() => {
    const timer = setInterval(() => {
      trimSet(assembledIdsRef.current, MAX_IDS);
      trimSet(myMsgIdsRef.current, MAX_IDS);
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // ─── 自动滚底 ────────────────────────────

  useEffect(() => { const el = msgListRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages]);

  // ─── 满员 ────────────────────────────────

  if (roomFull) {
    return (<div className="min-h-dvh flex flex-col items-center justify-center px-6">
      <div className="text-5xl mb-4">🚫</div>
      <h2 className="text-xl font-bold mb-2">房间已满</h2>
      <p className="text-text-secondary text-sm mb-6">50人上限</p>
      <button onClick={onBack} className="px-6 py-3 rounded-xl bg-brand-primary text-white">返回</button>
    </div>);
  }

  // ─── 颜色/标签映射 ──────────────────────

  const labelColor = (label: string) => {
    if (label === 'momo') return { dot: 'bg-purple-500', text: 'text-purple-300', bg: 'bg-purple-500/5 border-l-purple-500/50' };
    if (label === '我') return { dot: 'bg-brand-primary', text: 'text-indigo-300', bg: 'bg-brand-primary/5 border-l-brand-primary/50' };
    const colors = [
      { dot: 'bg-amber-500', text: 'text-amber-300', bg: 'bg-amber-500/5 border-l-amber-500/50' },
      { dot: 'bg-emerald-500', text: 'text-emerald-300', bg: 'bg-emerald-500/5 border-l-emerald-500/50' },
      { dot: 'bg-rose-500', text: 'text-rose-300', bg: 'bg-rose-500/5 border-l-rose-500/50' },
      { dot: 'bg-cyan-500', text: 'text-cyan-300', bg: 'bg-cyan-500/5 border-l-cyan-500/50' },
      { dot: 'bg-orange-500', text: 'text-orange-300', bg: 'bg-orange-500/5 border-l-orange-500/50' },
    ];
    const idx = label.charCodeAt(label.length - 1) - 65; // A→0, B→1, ...
    return colors[Math.abs(idx) % colors.length];
  };

  // ─── 渲染 ────────────────────────────────

  return (
    <div className="h-dvh flex flex-col">
      <FpsMonitor />
      <input ref={fileInputRef} type="file" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }} />

      {/* 顶部栏 */}
      <header className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/5 backdrop-blur-sm">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary text-sm">← 退出</button>
        <div className="text-center">
          <p className="text-[10px] text-text-muted">房间号</p>
          <p className="text-lg font-bold font-mono text-amber-400 tracking-widest">{roomId}</p>
          <p className="text-[10px] text-text-muted">{connected ? `🟢 ${onlineCount}/50` : '🔴 ...'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMode(m => m === 'momo' ? 'plain' : 'momo')}
            className={`text-xs px-2 py-1 rounded-lg border transition-all ${
              mode === 'momo' ? 'border-purple-500/40 text-purple-300 bg-purple-500/10' : 'border-green-500/40 text-green-300 bg-green-500/10'
            }`}
            title={mode === 'momo' ? '当前：匿名模式（XOR加密分片，身份不可追踪）' : '当前：直传模式（不加密，身份清晰）'}
          >{mode === 'momo' ? '🛡 匿名' : '📝 直传'}</button>
          <button onClick={() => setShowQr(true)} className="text-xs px-2 py-1 rounded text-text-muted hover:text-text-secondary" title="二维码">📱</button>
          <button onClick={() => setShowLeaderboard(!showLeaderboard)}
            className={`text-xs px-2 py-1 rounded transition-colors ${showLeaderboard ? 'bg-amber-500/20 text-amber-300' : 'text-text-muted hover:text-text-secondary'}`}>🏆</button>
          <button onClick={handleExport} disabled={exporting} className="text-xs text-brand-primary hover:text-brand-primary-hover">{exporting ? '...' : '导出'}</button>
        </div>
      </header>

      {/* 高赞排行榜 */}
      {showLeaderboard && (
        <div className="shrink-0 px-4 py-3 border-b border-white/5 bg-surface-alt">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-amber-300">🏆 24小时高赞 Top 5</span>
            <button onClick={() => setShowLeaderboard(false)} className="text-xs text-text-muted hover:text-text-secondary">✕</button>
          </div>
          {(() => {
            const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
            const top = messages
              .filter((m) => m.serverTs > dayAgo && m.thumbsUp > 0 && m.kind === 'text')
              .sort((a, b) => b.thumbsUp - a.thumbsUp)
              .slice(0, 5);
            if (top.length === 0) return <p className="text-xs text-text-muted">暂无高赞消息</p>;
            return top.map((m, i) => (
              <div key={m.id} className="flex items-center gap-2 py-0.5 text-xs">
                <span className="text-amber-400 font-mono w-4">{['🥇','🥈','🥉','④','⑤'][i]}</span>
                <span className="text-text-primary truncate flex-1">{m.text.slice(0, 60)}</span>
                <span className="text-amber-400 shrink-0">👍{m.thumbsUp}</span>
              </div>
            ));
          })()}
        </div>
      )}

      {/* 消息列表 */}
      <div ref={msgListRef} className="flex-1 overflow-y-auto px-4 py-2" style={{ minHeight: '200px' }}>
        {messages.length === 0 && <div className="flex items-center justify-center h-full"><p className="text-sm text-text-muted">暂无消息 ✨</p></div>}
        {messages.map((msg) => {
          const c = labelColor(msg.displayName);
          return (
            <div key={msg.id} className="py-1">
              {msg.status === 'collecting' ? (
                <ShardCollector messageId={msg.id} />
              ) : (
                <div className={`pl-3 pr-3 md:pr-16 border-l-2 rounded-r-lg ${c.bg} animate-fade-in relative group`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                    <span className="text-[10px] text-text-muted">{msg.displayName}</span>
                    <span className="text-[10px] text-text-muted ml-auto">{new Date(msg.serverTs).toLocaleTimeString('zh-CN')}</span>
                  </div>
                  {msg.kind === 'image' ? (
                    (() => {
                      const img = pickImageUrl(msg.text, onlineCount);
                      const isMine = myMsgIdsRef.current.has(msg.id);
                      return (
                    <div className="pb-1 space-y-1">
                      {isMine ? (
                        /* 自己发的：纯展示，不可点击 */
                        <img src={fileUrl(img.src)} alt="图片"
                          className="max-w-[240px] max-h-[240px] rounded-lg object-cover border border-white/10" />
                      ) : (
                        /* 别人发的：可点击查看/保存 */
                        <>
                          <img src={fileUrl(img.src)} alt="图片"
                            onClick={() => setViewImage(fileUrl(img.full))}
                            className="max-w-[240px] max-h-[240px] rounded-lg object-cover border border-white/10 hover:border-white/30 transition-colors cursor-pointer" />
                          {onlineCount > THUMB_THRESHOLD && <p className="text-[9px] text-text-muted">📶 缩略图 ({onlineCount}人在线) · 点看原图</p>}
                          <div className="flex gap-2">
                            <button onClick={() => setViewImage(fileUrl(img.full))} className="text-[10px] text-text-muted hover:text-text-secondary">🔍 查看</button>
                            <button onClick={() => downloadFile(fileUrl(img.full), decodeURIComponent(msg.text.split('/').pop()?.split('?')[0] || 'download'))} className="text-[10px] text-text-muted hover:text-text-secondary">💾 保存</button>
                          </div>
                        </>
                      )}
                    </div>); })()
                  ) : msg.kind === 'file' ? (
                    (() => {
                      const isMine = myMsgIdsRef.current.has(msg.id);
                      const fileInfo = pickFileUrl(msg.text);
                      const fullUrl = fileUrl(fileInfo.url);
                      const fname = fileInfo.name;
                      return (
                    <div className="pb-1 space-y-1">
                      {isMine ? (
                        <span className="inline-flex items-center gap-2 text-sm text-text-muted">
                          <span className="text-xl">📄</span><span>{fname}</span>
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-2 text-sm text-text-secondary">
                            <span className="text-xl">📄</span><span>{fname}</span>
                          </span>
                          <div className="flex gap-2">
                            <button onClick={() => { if (confirm('此操作将在新页面打开文件，是否继续？')) window.open(fullUrl, '_blank'); }}
                              className="text-[10px] text-text-muted hover:text-text-secondary">🔍 查看</button>
                            <button onClick={() => { if (confirm('此操作将下载文件，是否继续？')) downloadFile(fullUrl, fname); }}
                              className="text-[10px] text-text-muted hover:text-text-secondary">💾 下载</button>
                          </div>
                        </>
                      )}
                    </div>); })()
                  ) : (
                    <p className={`text-sm leading-relaxed break-words pb-1 ${c.text}`}>{msg.text}</p>
                  )}
                  {/* 评价按钮 */}
                  {(() => {
                    const reacted = reactedRef.current.get(msg.id);
                    const locked = !!reacted;
                    return (
                      <div className="flex items-center gap-1.5 pt-1 border-t border-white/5 md:absolute md:right-2 md:top-2 md:border-t-0 md:pt-0 md:flex-col md:gap-0.5">
                        <button onClick={() => sendReaction(msg.id, 'up')} disabled={locked}
                          className={`text-xs px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5
                            ${reacted === 'up' ? 'bg-amber-500/20 text-amber-300' : locked ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'}`}
                          title={locked ? '已表态' : '赞'}>👍<span className="text-[10px] ml-0.5">{msg.thumbsUp || ''}</span></button>
                        <button onClick={() => sendReaction(msg.id, 'down')} disabled={locked}
                          className={`text-xs px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5
                            ${reacted === 'down' ? 'bg-red-500/20 text-red-300' : locked ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'}`}
                          title={locked ? '已表态' : '踩'}>👎<span className="text-[10px] ml-0.5">{msg.thumbsDown || ''}</span></button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 输入栏 */}
      <div className="shrink-0 px-2 sm:px-4 py-2 sm:py-3 border-t border-white/5 backdrop-blur-sm safe-bottom">
        <div className="flex gap-1.5 sm:gap-2 items-end">
          {/* 语音按钮（仅 PC） */}
          <div className="hidden sm:block"><VoiceInput onResult={(t) => setInputText((prev) => prev + t)} /></div>
          {/* 图片按钮 */}
          <button onClick={() => { const el = fileInputRef.current; if (el) { el.accept = 'image/*'; el.click(); } }}
            disabled={uploading} title="图片"
            className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-surface-card border border-white/10 hover:border-white/20 flex items-center justify-center text-base sm:text-lg transition-all disabled:opacity-30 active:scale-95">📷</button>
          {/* 文件按钮 */}
          <button onClick={() => { const el = fileInputRef.current; if (el) { el.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'; el.click(); } }}
            disabled={uploading} title="文件"
            className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-surface-card border border-white/10 hover:border-white/20 flex items-center justify-center text-base sm:text-lg transition-all disabled:opacity-30 active:scale-95">📎</button>
          <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={mode === 'momo' ? '匿名模式' : '直传模式'}
            className="flex-1 min-w-0 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-surface-card border border-white/10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-primary/50 transition-colors" />
          <button onClick={handleSend} disabled={!inputText.trim()}
            className="shrink-0 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-medium text-xs sm:text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95">发送</button>
        </div>
        {isFull && <p className="text-[10px] text-status-warning mt-1.5 text-center">⚠️ 房间已满员 (50/50)</p>}
      </div>
      {viewImage && <ImageViewer src={viewImage} onClose={() => setViewImage(null)} />}
      {showQr && <QrModal roomId={roomId} onClose={() => setShowQr(false)} />}
    </div>
  );
}
