import type { StatusMeta } from '@specforge/shared'

/** 未收录键的兜底展示元数据，避免返回 undefined 导致模板取值/渲染报错 */
const UNKNOWN_META: StatusMeta = { label: '未知', type: 'info' }

/**
 * el-table 作用域插槽里的 row 是 any，直接用 `META[row.status]` 会触发 TS7053
 * （noImplicitAny 下不允许用 any 索引）。用该函数把键收窄回元数据表的键类型。
 *
 * 键不在表中时返回 fallback（未提供则返回「未知」兜底），保证返回类型安全且不崩溃。
 */
export function metaOf<K extends string, V>(map: Record<K, V>, key: unknown, fallback?: V): V {
  const hit = (map as Record<string, V>)[String(key)]
  if (hit !== undefined) return hit
  if (fallback !== undefined) return fallback
  return UNKNOWN_META as unknown as V
}
