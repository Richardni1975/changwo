/**
 * FilePanel — 文件操作弹窗（不离开聊天页面）
 * 微信不支持多标签页，此处仅提供"下载"和"复制链接"
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
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
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
          <button onClick={handleDownload} disabled={downloading}
            className="w-full py-3 rounded-xl bg-brand-primary/10 border border-brand-primary/20
                       text-sm text-brand-primary hover:bg-brand-primary/20 transition-colors
                       disabled:opacity-50">
            {downloading ? '下载中...' : '💾 下载到本地'}
          </button>

          <div className="flex items-center gap-2">
            <input type="text" value={url} readOnly
              className="flex-1 px-3 py-2 rounded-lg bg-surface-card border border-white/10 text-xs text-text-muted font-mono truncate" />
            <button onClick={handleCopy}
              className="shrink-0 px-3 py-2 rounded-lg bg-surface-card border border-white/10 text-xs text-text-secondary hover:text-text-primary transition-colors">
              {copied ? '✓ 已复制' : '复制链接'}
            </button>
          </div>

          <p className="text-[10px] text-text-muted text-center">
            下载后可在手机文件管理中找到；或复制链接在系统浏览器中打开查看
          </p>
        </div>
      </div>
    </div>
  );
}
