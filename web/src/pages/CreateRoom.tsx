import { useState, useEffect } from 'react';

interface CreateRoomProps {
  onCreated: (roomId: string) => void;
}

function genRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function CreateRoom({ onCreated }: CreateRoomProps) {
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');
    if (joinId && joinId.length >= 4) onCreated(joinId);
  }, [onCreated]);

  const handleCreate = () => {
    setCreating(true);
    setTimeout(() => { onCreated(genRoomCode()); setCreating(false); }, 300);
  };

  const handleJoin = () => {
    const code = joinCode.trim();
    if (!code || code.length < 4) { setJoinError('请输入 4 位房间号'); return; }
    setJoinError('');
    setJoining(true);
    setTimeout(() => { onCreated(code); setJoining(false); }, 300);
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-8">
      {/* Logo */}
      <div className="text-center mb-6">
        <div className="text-5xl mb-2">🦋</div>
        <h1 className="text-2xl font-bold text-text-primary">油炸冰棍</h1>
        <p className="text-text-secondary text-xs mt-1">熟人也可以匿名沟通，真话也可以不伤面子</p>
      </div>

      {/* 入口提示 */}
      {isLocal ? (
        <div className="w-full max-w-sm mb-6 p-3 rounded-xl bg-surface-card border border-white/10 text-center space-y-1">
          <p className="text-[10px] text-text-muted">
            电脑端入口：<span className="text-brand-primary font-mono select-all">http://{hostname}:3000</span>
          </p>
          <p className="text-[10px] text-text-muted">
            手机端入口：<span className="text-amber-300 font-mono">http://192.168.xx.xx:3000</span>
          </p>
        </div>
      ) : (
        <div className="w-full max-w-sm mb-6 p-3 rounded-xl bg-surface-card border border-white/10 text-center">
          <p className="text-[11px] text-text-muted">登录地址</p>
          <p className="text-sm font-mono text-brand-primary select-all">https://changwo.m0m0n1.top</p>
        </div>
      )}

      {/* 创建房间 */}
      <button
        onClick={handleCreate}
        disabled={creating}
        className="w-full max-w-sm py-3 rounded-xl bg-brand-primary hover:bg-brand-primary-hover
                   text-white font-semibold text-base transition-all duration-200
                   disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
      >
        {creating ? '生成中...' : '创建新房间'}
      </button>

      {/* 分割 */}
      <div className="flex items-center gap-2 w-full max-w-sm my-5">
        <div className="flex-1 h-px bg-white/8" />
        <span className="text-[11px] text-text-muted">或输入房间号加入</span>
        <div className="flex-1 h-px bg-white/8" />
      </div>

      {/* 加入房间 */}
      <div className="w-full max-w-sm flex gap-2">
        <input
          type="text" inputMode="numeric" maxLength={4}
          value={joinCode}
          onChange={(e) => { setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4)); setJoinError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          placeholder="输入房间号"
          className="w-44 px-3 py-3 rounded-xl text-center text-xl tracking-widest font-mono text-text-primary
                     placeholder:text-text-muted
                     bg-[#0a0a1a] border border-white/10
                     shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]
                     focus:outline-none focus:border-brand-primary/50 transition-colors"
        />
        <button
          onClick={handleJoin}
          disabled={joining || joinCode.length < 4}
          className="flex-1 py-3 rounded-xl bg-surface-card border border-white/10
                     hover:border-brand-primary/30 text-sm text-text-secondary hover:text-text-primary
                     font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
        >
          {joining ? '...' : '加入'}
        </button>
      </div>
      {joinError && <p className="text-xs text-status-error mt-1.5">{joinError}</p>}

      <p className="mt-6 text-[11px] text-text-muted">V1.0 &nbsp; 开发者：倪宁</p>
    </div>
  );
}
