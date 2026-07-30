/**
 * shard-collector — 碎片收集态指示器
 *
 * 当接收端尚未集齐 4 枚碎片时显示 4 个脉动光点。
 * 纯展示组件，无业务逻辑。
 */
Component({
  properties: {
    /** 碎片收集进度（0-4） */
    collected: {
      type: Number,
      value: 0,
    },
    /** 总碎片数（默认 4） */
    total: {
      type: Number,
      value: 4,
    },
  },
});
