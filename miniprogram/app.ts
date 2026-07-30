/**
 * 畅吾欲言 微信小程序 — App 入口
 *
 * 安全红线：
 * - 不调用 wx.login() 获取 OpenID
 * - 不存储任何用户身份信息
 * - 所有密码学操作在客户端本地完成
 */

App<IAppOption>({
  globalData: {
    roomId: null as string | null,
    sessionToken: null as string | null,
  },

  onLaunch() {
    console.log('[changwo] 小程序启动');

    // 检查是否有未完成的会话（断线重连）
    const sessionToken = wx.getStorageSync('changwo_sessionToken');
    const roomId = wx.getStorageSync('changwo_roomId');
    if (sessionToken && roomId) {
      this.globalData.sessionToken = sessionToken;
      this.globalData.roomId = roomId;
    }
  },

  onHide() {
    // 小程序切后台 — 不主动断开 WebSocket
    // 重连逻辑由 ws-client 处理
    console.log('[changwo] 小程序进入后台');
  },

  onError(error) {
    console.error('[changwo] 全局错误:', error);
  },
});
