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
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xl transition-colors">✕</button>

      <img src={src} alt={alt || '图片'}
        className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()} />

      <button onClick={handleSave} disabled={status === 'saving'}
        onClickCapture={(e) => e.stopPropagation()}
        className={`absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-xl text-white text-sm transition-all
          ${status === 'done' ? 'bg-green-500/80' : status === 'error' ? 'bg-red-500/80' : 'bg-white/10 hover:bg-white/20'}`}>
        {status === 'saving' ? '⏳ 保存中...' : status === 'done' ? '✅ 已保存到下载目录' : status === 'error' ? '❌ 保存失败，请重试' : '💾 保存到手机'}
      </button>
    </div>
  );
}
