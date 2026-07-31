/**
 * QrModal — 显示房间 QR 码，手机扫码直接加入
 */
import { useEffect, useRef, useMemo } from 'react';

interface QrModalProps {
  roomId: string;
  onClose: () => void;
}

export function QrModal({ roomId, onClose }: QrModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const baseUrl = isLocal ? `http://${hostname}:3000` : 'https://changwo.m0m0n1.top';
  const fullUrl = `${baseUrl}?join=${encodeURIComponent(roomId)}`;

  useEffect(() => {
    if (!canvasRef.current) return;
    import('qrcode').then((QRCode) => {
      QRCode.toCanvas(canvasRef.current, fullUrl, {
        width: 200, margin: 1,
        color: { dark: '#F8FAFC', light: '#0F0F23' },
      });
    }).catch(() => {});
  }, [fullUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-alt border border-white/10 rounded-2xl p-6 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">扫码加入房间</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary text-lg">✕</button>
        </div>

        {isLocal && (
          <div className="mb-4 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
            <p className="text-[10px] text-amber-300">⚠️ 本地测试模式</p>
          </div>
        )}

        <div className="flex justify-center mb-3">
          <canvas ref={canvasRef} className="rounded-lg bg-white p-2" />
        </div>

        <div className="text-center space-y-1 border-t border-white/5 pt-3">
          <p className="text-[10px] text-text-muted">网页地址</p>
          <p className="text-xs font-mono text-brand-primary break-all select-all">{baseUrl}</p>
          <p className="text-[10px] text-text-muted mt-2">房间号</p>
          <p className="text-xl font-bold font-mono text-amber-400 tracking-widest">{roomId}</p>
        </div>
      </div>
    </div>
  );
}
