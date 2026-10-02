import type { Assumption, AssumptionStatus, AssumptionsGate } from '@specforge/shared'
import { request } from './client'

export interface UpdateAssumptionPayload {
  status?: AssumptionStatus
  userAnswer?: string | null
}

/** 假设清单 */
export function listAssumptions(projectId: string): Promise<Assumption[]> {
  return request.get<Assumption[]>(`/projects/${projectId}/assumptions`)
}

/** 假设确认卡点状态 */
export function getAssumptionsGate(projectId: string): Promise<AssumptionsGate> {
  return request.get<AssumptionsGate>(`/projects/${projectId}/assumptions/gate`)
}

/** 更新单条假设 */
export function updateAssumption(
  assumptionId: string,
  payload: UpdateAssumptionPayload,
): Promise<Assumption> {
  return request.patch<Assumption>(`/assumptions/${assumptionId}`, payload)
}

/** 全部确认（沿用默认值），返回更新后的清单 */
export function confirmAllAssumptions(projectId: string): Promise<Assumption[]> {
  return request.post<Assumption[]>(`/projects/${projectId}/assumptions/confirm-all`)
}
