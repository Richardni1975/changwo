/**
 * FilePanel — 文件操作弹窗（不离开聊天页面）
 * 手机端微信浏览器不支持多标签页，用此面板替代 window.open()
 */
import { useState } from 'react';

interface FilePanelProps {
  url: string;
  name: string;
  onClose: () => void;
}

export function FilePanel({ url, name, onClose }: FilePanelProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // fallback: 复制链接
      handleCopy();
    }
    setDownloading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-alt border border-white/10 rounded-2xl p-6 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">📄 {name}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary text-lg">✕</button>
        </div>

        <div className="space-y-3">
          <button onClick={() => window.open(url, '_blank')}
            className="w-full py-2.5 rounded-xl bg-brand-primary/10 border border-brand-primary/20
                       text-sm text-brand-primary hover:bg-brand-primary/20 transition-colors">
            🔍 在新页面查看
          </button>

          <button onClick={handleDownload} disabled={downloading}
            className="w-full py-2.5 rounded-xl bg-surface-card border border-white/10
                       text-sm text-text-secondary hover:text-text-primary transition-colors
                       disabled:opacity-50">
            {downloading ? '下载中...' : '💾 下载到本地'}
          </button>

          <div className="flex items-center gap-2">
            <input type="text" value={url} readOnly
              className="flex-1 px-3 py-2 rounded-lg bg-surface-card border border-white/10 text-xs text-text-muted font-mono truncate" />
            <button onClick={handleCopy}
              className="shrink-0 px-3 py-2 rounded-lg bg-surface-card border border-white/10 text-xs text-text-secondary hover:text-text-primary transition-colors">
              {copied ? '✓' : '复制'}
            </button>
          </div>

          <p className="text-[10px] text-text-muted text-center">
            微信内点击"在新页面查看"将用系统浏览器打开，聊天不会中断
          </p>
        </div>
      </div>
    </div>
  );
}
