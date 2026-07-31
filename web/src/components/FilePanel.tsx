/**
 * FilePanel — 文件操作弹窗（不离开聊天页面）
 * 微信不支持程序化下载，引导用户复制链接用系统浏览器打开
 */
import { useState } from 'react';

interface FilePanelProps {
  url: string;
  name: string;
  onClose: () => void;
}

export function FilePanel({ url, name, onClose }: FilePanelProps) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  const isWechat = /MicroMessenger/i.test(navigator.userAgent);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.origin + url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleDownload = async () => {
    setStatus('saving');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      setStatus('done');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      // 下载失败 → 自动复制链接
      handleCopyLink();
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-alt border border-white/10 rounded-2xl p-6 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">📄 {name}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary text-lg">✕</button>
        </div>

        <div className="space-y-3">
          {isWechat && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-[11px] text-amber-300 leading-relaxed">
                ⚠️ 微信内无法直接下载文件。请点击下方"复制链接"，然后粘贴到手机系统浏览器（如 Chrome、Safari）中打开即可下载。
              </p>
            </div>
          )}

          {!isWechat && (
            <button onClick={handleDownload} disabled={status === 'saving'}
              className={`w-full py-3 rounded-xl text-sm transition-all
                ${status === 'done' ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : status === 'error' ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                : 'bg-brand-primary/10 border border-brand-primary/20 text-brand-primary hover:bg-brand-primary/20'}`}>
              {status === 'saving' ? '⏳ 下载中...'
                : status === 'done' ? '✅ 下载完成（查看手机 Download 文件夹）'
                : status === 'error' ? '❌ 下载失败，已自动复制链接'
                : '💾 下载到本地'}
            </button>
          )}

          <div className="flex items-center gap-2">
            <input type="text" value={window.location.origin + url} readOnly
              className="flex-1 px-3 py-2 rounded-lg bg-surface-card border border-white/10 text-xs text-text-muted font-mono truncate" />
            <button onClick={handleCopyLink}
              className="shrink-0 px-3 py-2 rounded-lg bg-surface-card border border-white/10 text-xs text-text-secondary hover:text-text-primary transition-colors">
              {copied ? '✓' : '复制'}
            </button>
          </div>

          <p className="text-[10px] text-text-muted text-center">
            {isWechat
              ? '复制链接 → 打开系统浏览器 → 粘贴 → 下载'
              : '下载后可在手机"文件管理 → Download"中查看'}
          </p>
        </div>
      </div>
    </div>
  );
}
