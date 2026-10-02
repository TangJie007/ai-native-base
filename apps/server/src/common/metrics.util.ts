/** token 用量 → 成本估算（用于仪表盘与轨迹汇总展示，非真实账单） */
const INPUT_PRICE = 0.000002
const OUTPUT_PRICE = 0.000004

export function estimateCost(inputTokens: number, outputTokens: number): number {
  return inputTokens * INPUT_PRICE + outputTokens * OUTPUT_PRICE
}

export function formatCost(amount: number): string {
  return `¥${amount.toFixed(2)}`
}

/** 毫秒 → 人类可读耗时，如 "1h 12m" / "3m 20s" / "8s" */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0s'
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/** 通过率：已通过 / 已完成（passed + failed + needs_human） */
export function passRate(passed: number, finished: number): string {
  if (finished <= 0) return '—'
  return `${Math.round((passed / finished) * 100)}%`
}
