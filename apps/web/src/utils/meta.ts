/**
 * el-table 作用域插槽里的 row 是 any，直接用 `META[row.status]` 会触发 TS7053
 * （noImplicitAny 下不允许用 any 索引）。用该函数把键收窄回元数据表的键类型。
 */
export function metaOf<K extends string, V>(map: Record<K, V>, key: unknown): V {
  return map[key as K]
}
