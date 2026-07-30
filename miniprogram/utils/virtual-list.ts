/**
 * virtual-list.ts — 微信小程序虚拟列表辅助工具
 *
 * 由于小程序不支持 React/Vue 风格的虚拟列表组件，
 * 此处提供数据层面的辅助函数：控制渲染数据量，避免 setData 过大导致卡顿。
 *
 * 6 小时长会话策略：
 * - 内存中保留全量消息（JS 数组，~10K 条仍可承受）
 * - setData 仅传递最近 50 条可见消息（减少渲染线程负担）
 * - scroll-view 使用 scroll-into-view 自动滚到底部
 */

export interface VirtualListConfig {
  /** 视口内最多渲染条数 */
  visibleCount: number;
  /** 本地存储 key（持久化历史消息） */
  storageKey: string;
}

/**
 * 创建虚拟列表数据管理器
 */
export function createVirtualListHelper(config: VirtualListConfig) {
  const { visibleCount, storageKey } = config;

  // 全量消息缓存（内存）
  let allMessages: Array<{ id: string; [key: string]: unknown }> = [];

  return {
    /**
     * 添加新消息并返回应渲染的可见切片
     */
    addMessage(msg: { id: string; [key: string]: unknown }) {
      allMessages.push(msg);

      // 内存保护：超过 10K 条则截断
      if (allMessages.length > 10_000) {
        allMessages = allMessages.slice(-5_000);
      }

      return this.getVisibleSlice();
    },

    /**
     * 获取应渲染的最近 N 条消息
     */
    getVisibleSlice() {
      return allMessages.slice(-visibleCount);
    },

    /**
     * 获取全量消息（用于导出）
     */
    getAll() {
      return [...allMessages];
    },

    /**
     * 从本地存储恢复
     */
    loadFromStorage() {
      try {
        const raw = wx.getStorageSync(storageKey);
        if (raw) {
          allMessages = JSON.parse(raw);
        }
      } catch {
        allMessages = [];
      }
      return this.getVisibleSlice();
    },

    /**
     * 持久化到本地存储（仅保存最近 500 条）
     */
    saveToStorage() {
      try {
        const toSave = allMessages.slice(-500);
        wx.setStorageSync(storageKey, JSON.stringify(toSave));
      } catch {
        // 静默失败 — 存储满时不阻塞核心功能
        console.warn('[virtual-list] 本地存储写入失败');
      }
    },

    /**
     * 获取总数
     */
    getCount() {
      return allMessages.length;
    },
  };
}
