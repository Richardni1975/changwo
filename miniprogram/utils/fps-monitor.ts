/**
 * fps-monitor.ts — 微信小程序帧率监控 & 自适应降级
 *
 * 实时检测渲染帧率，若连续 3 秒低于 25 FPS，自动禁
 * 用碎纸粒子动效和高斯模糊，确保低端设备流畅运行。
 *
 * 与 Web 端 FpsMonitor 保持一致的阈值和逻辑。
 */

const LOW_FPS_THRESHOLD = 25;
const LOW_FPS_DURATION_MS = 3_000;

let frames = 0;
let lastTime = Date.now();
let lowFpsStart: number | null = null;
let isLowFpsMode = false;

/**
 * 帧率 tick — 通过 setInterval 模拟（小程序无 requestAnimationFrame）
 * 微信小程序中可用 canvas.requestAnimationFrame，但需创建 canvas 节点。
 * 此处使用 1s 间隔的定时器做近似估算，生产环境建议用 canvas RAF。
 */
function tick() {
  frames++;
  const now = Date.now();
  const elapsed = now - lastTime;

  if (elapsed >= 1_000) {
    const fps = Math.round((frames * 1_000) / elapsed);

    if (fps < LOW_FPS_THRESHOLD) {
      if (lowFpsStart === null) {
        lowFpsStart = now;
      } else if (now - lowFpsStart >= LOW_FPS_DURATION_MS && !isLowFpsMode) {
        isLowFpsMode = true;
        console.warn('[fps-monitor] 帧率持续低于 25 FPS，启用动效降级');
      }
    } else {
      lowFpsStart = null;
      if (isLowFpsMode) {
        isLowFpsMode = false;
        console.log('[fps-monitor] 帧率恢复，动效降级解除');
      }
    }

    frames = 0;
    lastTime = now;
  }
}

let started = false;

/**
 * 启动帧率监控（全局单例，在 app.ts onLaunch 中调用）
 */
export function startFpsMonitor() {
  if (started) return;
  started = true;
  setInterval(tick, 200); // 每 200ms 采样一次
}

/**
 * 当前是否处于低帧率模式
 */
export function isInLowFpsMode(): boolean {
  return isLowFpsMode;
}
