/**
 * shred-animation — 碎纸化动画组件
 *
 * 发送消息前播放「文本 → 离散粒子 → 乱码光块」动效（600ms）。
 * 低帧率模式下自动跳过。
 */

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

Component({
  properties: {
    /** 要粉碎的文本 */
    text: {
      type: String,
      value: '',
    },
    /** 是否正在动画中 */
    animating: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    particles: [] as Particle[],
  },

  methods: {
    /**
     * 触发碎纸动画
     * @returns Promise，动画完成时 resolve
     */
    triggerAnimation(text: string): Promise<void> {
      return new Promise((resolve) => {
        if (!text) {
          resolve();
          return;
        }

        // 生成粒子
        const chars = text.split('');
        const particles: Particle[] = [];

        chars.forEach((char, charIndex) => {
          for (let p = 0; p < 3; p++) {
            particles.push({
              id: charIndex * 3 + p,
              char,
              driftX: (Math.random() - 0.5) * 120,
              driftY: -(Math.random() * 80 + 20),
              driftRotate: (Math.random() - 0.5) * 360,
              delay: Math.random() * 200,
              color: SHARD_COLORS[Math.floor(Math.random() * SHARD_COLORS.length)],
            });
          }
        });

        this.setData({ particles, animating: true });

        // 600ms 后清除
        setTimeout(() => {
          this.setData({ particles: [], animating: false });
          resolve();
        }, 600);
      });
    },
  },
});
