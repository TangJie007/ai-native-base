import type { Contract } from '@specforge/shared'
import { request } from './client'

/** 最新契约；未生成时后端返回 404 CONTRACT_NOT_FOUND，调用方用 silent 处理空状态 */
export function getLatestContract(projectId: string): Promise<Contract> {
  return request.get<Contract>(`/projects/${projectId}/contracts/latest`, { silent: true })
}

/** 生成契约 */
export function generateContract(projectId: string): Promise<Contract> {
  return request.post<Contract>(`/projects/${projectId}/contracts/generate`)
}

/** 锁定契约 */
export function lockContract(projectId: string, contractId: string): Promise<Contract> {
  return request.post<Contract>(`/projects/${projectId}/contracts/${contractId}/lock`)
}
