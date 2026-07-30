/**
 * 畅吾欲言 — 历史记录页
 *
 * 展示本地存储的 7 天内解密记录，支持 TXT 一键导出
 */

interface HistoryMessage {
  text: string;
  serverTs: number;
  timeStr: string;
}

Page<{ messages: HistoryMessage[] }, {}>({
  data: {
    messages: [] as HistoryMessage[],
  },

  onShow() {
    this._loadHistory();
  },

  _loadHistory() {
    try {
      // 从本地存储加载（格式：{ roomId → [{text, serverTs}] }）
      const raw = wx.getStorageSync('changwo_history');
      if (!raw) {
        this.setData({ messages: [] });
        return;
      }

      const allRooms: Record<string, Array<{ text: string; serverTs: number }>> = JSON.parse(raw);

      // 合并所有房间消息，按时间倒序
      const allMessages: HistoryMessage[] = [];
      for (const [, msgs] of Object.entries(allRooms)) {
        for (const m of msgs) {
          allMessages.push({
            text: m.text,
            serverTs: m.serverTs,
            timeStr: new Date(m.serverTs).toLocaleString('zh-CN'),
          });
        }
      }

      allMessages.sort((a, b) => b.serverTs - a.serverTs);

      // 仅显示 7 天内的记录
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recent = allMessages.filter((m) => m.serverTs > cutoff);

      this.setData({ messages: recent });
    } catch {
      this.setData({ messages: [] });
    }
  },

  onExport() {
    const { messages } = this.data;
    if (messages.length === 0) return;

    const header = [
      '畅吾欲言 — 历史记录导出',
      `导出时间: ${new Date().toISOString()}`,
      `共 ${messages.length} 条记录`,
      '─'.repeat(40),
      '',
    ].join('\n');

    const body = messages
      .map((m) => `[${m.timeStr}] ${m.text}`)
      .join('\n');

    const content = header + body;

    wx.setClipboardData({
      data: content,
      success: () => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '复制失败', icon: 'error' });
      },
    });
  },
});
