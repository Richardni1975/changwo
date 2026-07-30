/**
 * ImageViewer — 全屏图片查看器
 * 点击聊天中的图片弹出，不离开当前页面
 */
import { useEffect } from 'react';

interface ImageViewerProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageViewer({ src, alt, onClose }: ImageViewerProps) {
  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xl transition-colors"
      >✕</button>

      {/* 图片 */}
      <img
        src={src}
        alt={alt || '查看图片'}
        className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />

      {/* 保存按钮 */}
      <a
        href={src}
        download
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
      >💾 保存到手机</a>
    </div>
  );
}
