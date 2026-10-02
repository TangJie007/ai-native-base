import type {
  FixRecord,
  PipelineStatus,
  RequirementItem,
  VerificationRun,
} from '@specforge/shared'
import { request } from './client'

export interface StartPipelinePayload {
  concurrency?: number
  maxFixRounds?: number
}

export type ResolveAction = 'retry' | 'skip' | 'mark_passed'

export interface ResolveItemPayload {
  action: ResolveAction
  note?: string
}

/** 流水线状态 */
export function getPipeline(projectId: string): Promise<PipelineStatus> {
  return request.get<PipelineStatus>(`/projects/${projectId}/pipeline`)
}

/** 开始生成 */
export function startPipeline(
  projectId: string,
  payload: StartPipelinePayload = {},
): Promise<PipelineStatus> {
  return request.post<PipelineStatus>(`/projects/${projectId}/pipeline/start`, payload)
}

/** 中断流水线 */
export function interruptPipeline(projectId: string): Promise<PipelineStatus> {
  return request.post<PipelineStatus>(`/projects/${projectId}/pipeline/interrupt`)
}

/** 人工处理条目 */
export function resolveItem(itemId: string, payload: ResolveItemPayload): Promise<RequirementItem> {
  return request.post<RequirementItem>(`/items/${itemId}/resolve`, payload)
}

/** 条目的验证记录 */
export function getVerifications(itemId: string): Promise<VerificationRun[]> {
  return request.get<VerificationRun[]>(`/items/${itemId}/verifications`)
}

/** 条目的修复记录 */
export function getFixes(itemId: string): Promise<FixRecord[]> {
  return request.get<FixRecord[]>(`/items/${itemId}/fixes`)
}
