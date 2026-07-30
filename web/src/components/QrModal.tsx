/**
 * QrModal — 显示房间 QR 码，手机扫码直接加入
 * 自动检测局域网 IP，如果不是 localhost 就用当前地址
 */
import { useEffect, useRef, useState } from 'react';

interface QrModalProps {
  roomId: string;
  onClose: () => void;
}

// 常用的局域网网段
const COMMON_LAN = ['192.168.1.', '192.168.0.', '192.168.31.', '10.0.0.', '192.168.71.'];

export function QrModal({ roomId, onClose }: QrModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      // 尝试猜测局域网 IP（用当前 hostname 的端口）
      const port = window.location.port || '3000';
      const guess = COMMON_LAN.find((prefix) => host.startsWith(prefix) === false)
        ? COMMON_LAN[0].replace(/\.$/, '') + '.x' // 占位
        : '';
      setBaseUrl(window.location.origin); // 先填当前值
      setShowCustom(true);
    } else {
      setBaseUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !baseUrl) return;
    const url = `${baseUrl}?join=${encodeURIComponent(roomId)}&_t=${Date.now()}`;
    import('qrcode').then((QRCode) => {
      QRCode.toCanvas(canvasRef.current, url, {
        width: 200, margin: 1,
        color: { dark: '#F8FAFC', light: '#0F0F23' },
      });
    }).catch(() => {});
  }, [roomId, baseUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-alt border border-white/10 rounded-2xl p-6 mx-4 max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">扫码加入房间</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary text-lg">✕</button>
        </div>

        {showCustom && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-[11px] text-amber-300 mb-2">⚠️ 你从 localhost 打开的，手机无法访问。请填入电脑的局域网 IP：</p>
            <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://192.168.71.119:3000"
              className="w-full px-3 py-2 rounded-lg bg-surface-card border border-white/10 text-sm text-text-primary font-mono mb-2" />
            <p className="text-[10px] text-text-muted">在 Windows 命令提示符中运行 <code className="text-text-secondary">ipconfig</code> 查看 IPv4 地址。确保手机连同一个 WiFi。</p>
          </div>
        )}

        <div className="flex justify-center">
          <canvas ref={canvasRef} className="rounded-lg bg-white p-2" />
        </div>

        <p className="text-[11px] text-text-muted text-center mt-3">手机扫码自动进入房间，无需手动输入</p>
      </div>
    </div>
  );
}
