/**
 * ShredAnimation — 文本碎纸化动画组件
 *
 * 发送消息前播放「文本 → 离散粒子 → 乱码光块 → 飞向群友」动效。
 * 动画时长 600ms，使用 CSS @keyframes shred-particle-fly。
 *
 * 低帧率模式下自动跳过粒子动效（由 FpsMonitor 控制 .low-fps-mode）。
 */
import { useEffect, useState, type ReactNode } from 'react';

interface ShredAnimationProps {
  /** 要粉碎的文本内容 */
  text: string;
  /** 动画完成回调 */
  onComplete?: () => void;
  /** 子元素（触发动画的按钮等） */
  children?: ReactNode;
}

interface Particle {
  id: number;
  char: string;
  driftX: number;
  driftY: number;
  driftRotate: number;
  delay: number;
  color: string;
}

const SHARD_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B'];
const PARTICLE_COUNT_PER_CHAR = 3;

export function ShredAnimation({ text, onComplete, children }: ShredAnimationProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [animating, setAnimating] = useState(false);

  const trigger = () => {
    if (animating) return;
    setAnimating(true);

    // 为每个字符生成 3 个粒子
    const newParticles: Particle[] = [];
    const chars = text.split('');

    chars.forEach((char, charIndex) => {
      for (let p = 0; p < PARTICLE_COUNT_PER_CHAR; p++) {
        newParticles.push({
          id: charIndex * PARTICLE_COUNT_PER_CHAR + p,
          char,
          driftX: (Math.random() - 0.5) * 120,
          driftY: -(Math.random() * 80 + 20),
          driftRotate: (Math.random() - 0.5) * 360,
          delay: Math.random() * 200,
          color: SHARD_COLORS[Math.floor(Math.random() * SHARD_COLORS.length)],
        });
      }
    });

    setParticles(newParticles);

    // 600ms 后清除粒子并触发回调
    setTimeout(() => {
      setParticles([]);
      setAnimating(false);
      onComplete?.();
    }, 600);
  };

  return (
    <span className="inline-flex items-center relative">
      {/* 触发器 */}
      <span onClick={trigger} className="cursor-pointer">
        {children}
      </span>

      {/* 粒子层 */}
      {particles.length > 0 && (
        <span className="absolute inset-0 pointer-events-none overflow-visible" aria-hidden>
          {particles.map((p) => (
            <span
              key={p.id}
              className="shred-particle"
              style={{
                left: '50%',
                top: '50%',
                color: p.color,
                animationDelay: `${p.delay}ms`,
                '--drift-x': `${p.driftX}px`,
                '--drift-y': `${p.driftY}px`,
                '--drift-rotate': `${p.driftRotate}deg`,
              } as React.CSSProperties}
            >
              {p.char}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * 简化版 — 纯文字碎纸化（无触发按钮包裹）
 * 适合在消息发送时直接调用
 */
export function useShredAnimation() {
  const [shreddingText, setShreddingText] = useState<string | null>(null);

  const shred = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      setShreddingText(text);
      setTimeout(() => {
        setShreddingText(null);
        resolve();
      }, 600);
    });
  };

  return { shreddingText, shred };
}
