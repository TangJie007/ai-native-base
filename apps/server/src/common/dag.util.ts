import type { ExecutionBatch, ItemLayer } from '@specforge/shared'

export interface DagNode {
  id: string
  code: string
  title: string
  layer: ItemLayer
}

export interface DagEdge {
  itemId: string
  dependsOnId: string
}

export interface DagResult {
  batches: ExecutionBatch[]
  /** 被强制打破的环上节点数，见 PRD 3.3 PLAN-06 */
  cycleRemoved: number
}

/**
 * 拓扑分层：第 N 批的每个节点，其依赖都在更早的批次中。
 * 同批节点可并行执行；出现环时把环上节点并入当前批次并计数（不阻塞整体）。
 */
export function buildBatches(nodes: DagNode[], edges: DagEdge[]): DagResult {
  const ids = new Set(nodes.map((n) => n.id))
  const depsOf = new Map<string, Set<string>>()
  for (const node of nodes) depsOf.set(node.id, new Set())
  for (const edge of edges) {
    if (!ids.has(edge.itemId) || !ids.has(edge.dependsOnId)) continue
    if (edge.itemId === edge.dependsOnId) continue
    depsOf.get(edge.itemId)!.add(edge.dependsOnId)
  }

  const batches: ExecutionBatch[] = []
  const done = new Set<string>()
  let remaining = nodes.map((n) => n.id)
  let cycleRemoved = 0
  let batchNo = 1

  while (remaining.length > 0) {
    const ready = remaining.filter((id) => {
      const deps = depsOf.get(id)!
      return [...deps].every((dep) => done.has(dep) || !ids.has(dep))
    })

    // 存在环：所有剩余节点都有未满足依赖，强制放行一批并计数
    const layer = ready.length > 0 ? ready : remaining
    if (ready.length === 0) cycleRemoved += layer.length

    const layerSet = new Set(layer)
    const batchNodes = nodes
      .filter((n) => layerSet.has(n.id))
      .map((n) => ({ id: n.id, code: n.code, title: n.title, layer: n.layer }))

    batches.push({ batch: batchNo, parallel: batchNodes.length, nodes: batchNodes })
    layer.forEach((id) => done.add(id))
    remaining = remaining.filter((id) => !layerSet.has(id))
    batchNo += 1
  }

  return { batches, cycleRemoved }
}
