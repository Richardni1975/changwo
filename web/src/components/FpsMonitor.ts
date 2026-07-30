/**
 * FpsMonitor — 帧率监控 & 自适应降级
 *
 * 实时检测渲染帧率，若连续 3 秒低于 25 FPS：
 *  - 自动禁用碎纸粒子飞散 & backdrop-filter 模糊
 *  - 合体动画简化为静态微光渐变
 *
 * 用法：在页面组件中 mount 此组件即可自动生效
 */
const LOW_FPS_THRESHOLD = 25;
const LOW_FPS_DURATION_MS = 3_000;

let frames = 0;
let lastTime = performance.now();
let lowFpsStart: number | null = null;
let isLowFpsMode = false;

function tick() {
  frames++;
  const now = performance.now();
  const elapsed = now - lastTime;

  // 每秒计算一次 FPS
  if (elapsed >= 1_000) {
    const fps = Math.round((frames * 1_000) / elapsed);

    if (fps < LOW_FPS_THRESHOLD) {
      if (lowFpsStart === null) {
        lowFpsStart = now;
      } else if (now - lowFpsStart >= LOW_FPS_DURATION_MS && !isLowFpsMode) {
        // 连续低于阈值 3 秒 → 启用低帧率模式
        isLowFpsMode = true;
        document.documentElement.classList.add('low-fps-mode');
        console.warn('[FpsMonitor] 帧率持续低于 25 FPS，已启用动效降级');
      }
    } else {
      lowFpsStart = null;
      if (isLowFpsMode) {
        // 帧率恢复 → 退出低帧率模式
        isLowFpsMode = false;
        document.documentElement.classList.remove('low-fps-mode');
        console.log('[FpsMonitor] 帧率已恢复，动效降级已解除');
      }
    }

    frames = 0;
    lastTime = now;
  }

  requestAnimationFrame(tick);
}

// 启动监控（全局单例）
let started = false;
function ensureStarted() {
  if (!started) {
    started = true;
    requestAnimationFrame(tick);
  }
}

/**
 * React 组件形式：在页面中 mount <FpsMonitor /> 即可启动监控
 * 实际帧率检测在模块级全局运行，组件本身不渲染任何 DOM
 */
export function FpsMonitor() {
  ensureStarted();
  return null;
}
