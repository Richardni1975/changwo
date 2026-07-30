/**
 * polyfills.ts — 兼容旧浏览器的补丁
 * 主要解决：crypto.randomUUID() 在旧 iOS/Android 浏览器不可用
 */

// crypto.randomUUID() polyfill
if (!(crypto as any).randomUUID) {
  (crypto as any).randomUUID = function () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c: string) {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  };
}

export {};
