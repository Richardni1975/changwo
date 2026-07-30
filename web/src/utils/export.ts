/**
 * export.ts — TXT 一键导出工具
 *
 * 将房间内的解密明文导出为 .txt 文件并触发下载。
 * 所有数据来源于本地 IndexedDB / 内存，不涉及服务端请求。
 */

interface ExportEntry {
  text: string;
  serverTs: number;
}

/**
 * 将消息列表导出为 TXT 并触发浏览器下载
 */
export function exportAsTxt(entries: ExportEntry[], roomId: string): void {
  const header = [
    `畅吾欲言 匿名房间 — ${roomId}`,
    `导出时间: ${new Date().toISOString()}`,
    `共 ${entries.length} 条记录`,
    '─'.repeat(40),
    '',
  ].join('\n');

  const body = entries
    .sort((a, b) => a.serverTs - b.serverTs)
    .map((e) => `[${new Date(e.serverTs).toLocaleString('zh-CN')}] ${e.text}`)
    .join('\n');

  const content = header + body;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `changwo-${roomId}-${Date.now()}.txt`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // 清理
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * 从本地存储加载历史消息
 */
export function loadLocalHistory(roomId: string): ExportEntry[] {
  try {
    const key = `changwo-room-${roomId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as ExportEntry[];
  } catch {
    return [];
  }
}

/**
 * 将消息持久化到本地存储
 */
export function saveLocalHistory(roomId: string, entries: ExportEntry[]): void {
  try {
    const key = `changwo-room-${roomId}`;
    // 仅保留最近 500 条（localStorage 有 5MB 限制）
    const trimmed = entries.slice(-500);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('[export] 本地存储写入失败:', err);
  }
}
