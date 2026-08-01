/**
 * ImageViewer — 全屏图片查看器，不离开聊天页面
 */
import { useEffect, useState } from 'react';

interface ImageViewerProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageViewer({ src, alt, onClose }: ImageViewerProps) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [copied, setCopied] = useState(false);
  const isWechat = /MicroMessenger/i.test(navigator.userAgent);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = async () => {
    setStatus('saving');
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = src.split('/').pop()?.split('?')[0] || 'image.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      setStatus('done');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(src).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xl transition-colors">✕</button>

      <img src={src} alt={alt || '图片'}
        className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()} />

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-center">
        {/* 手机：长按保存提示 */}
        <p className="sm:hidden text-white/80 text-xs px-4 py-2 rounded-xl bg-white/10">
          👆 长按图片 → 保存到手机
        </p>
        {/* 电脑：下载按钮 */}
        <button onClick={handleSave} disabled={status === 'saving'}
          className={`hidden sm:block px-5 py-2.5 rounded-xl text-white text-sm transition-all
            ${status === 'done' ? 'bg-green-500/80' : status === 'error' ? 'bg-red-500/80' : 'bg-white/10 hover:bg-white/20'}`}>
          {status === 'saving' ? '⏳ 保存中...' : status === 'done' ? '✅ 已保存' : status === 'error' ? '❌ 失败，点此重试' : '💾 保存到本地'}
        </button>

        {/* 备份：复制链接 */}
        <button onClick={handleCopy}
          className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs transition-all">
          {copied ? '✓ 链接已复制' : '📋 复制链接'}
        </button>
      </div>
    </div>
  );
}
