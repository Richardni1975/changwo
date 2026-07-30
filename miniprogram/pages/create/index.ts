/**
 * 畅吾欲言 — 创建房间页
 *
 * 安全红线：不调用 wx.login()，不收集 OpenID
 */

interface Feature {
  icon: string;
  label: string;
}

Page({
  data: {
    creating: false,
    features: [
      { icon: '🔒', label: '零身份映射' },
      { icon: '✂️', label: '客户端碎片化' },
      { icon: '👥', label: '50人同频' },
      { icon: '⏰', label: '7天自动清理' },
    ] as Feature[],
  },

  onCreateRoom() {
    this.setData({ creating: true });

    // 模拟短暂创建过程
    setTimeout(() => {
      // 生成 UUID v4 房间号（简化版）
      const roomId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

      wx.navigateTo({
        url: `/pages/room/index?roomId=${roomId}`,
      });

      this.setData({ creating: false });
    }, 400);
  },
});
