import type { AgentTrace, TracesPayload } from '@specforge/shared'
import { request } from './client'

/** 项目维度的 Agent 轨迹与汇总 */
export function listTraces(projectId: string): Promise<TracesPayload> {
  return request.get<TracesPayload>(`/projects/${projectId}/traces`)
}

/** 单条目轨迹 */
export function listItemTraces(itemId: string): Promise<AgentTrace[]> {
  return request.get<AgentTrace[]>(`/items/${itemId}/traces`)
}
