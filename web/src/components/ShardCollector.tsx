/**
 * ShardCollector — 碎片收集态指示器
 *
 * 当接收端尚未集齐 4 枚碎片时，显示 4 个脉动光点，
 * 表示"正在接收碎片中..."
 */
interface ShardCollectorProps {
  messageId: string;
}

export function ShardCollector({ messageId: _messageId }: ShardCollectorProps) {
  return (
    <div className="flex items-center gap-2 py-1" title="正在收集碎片...">
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="inline-block w-2 h-2 rounded-full"
            style={{
              backgroundColor: `var(--color-shard-${i + 1}, #6366F1)`,
              animation: `shard-blink 0.6s ease-in-out ${i * 0.15}s infinite alternate`,
            }}
          />
        ))}
      </div>
      <span className="text-xs text-text-muted animate-pulse">收集中...</span>
    </div>
  );
}
