import type { DependencyGraph, DependencyType } from '@specforge/shared'
import { request } from './client'

export interface DependencyEdgeInput {
  itemId: string
  dependsOnId: string
  depType: DependencyType
}

/** 依赖图 */
export function getDependencies(projectId: string): Promise<DependencyGraph> {
  return request.get<DependencyGraph>(`/projects/${projectId}/dependencies`)
}

/** 生成依赖图（DAG + 执行批次） */
export function generateDependencies(projectId: string): Promise<DependencyGraph> {
  return request.post<DependencyGraph>(`/projects/${projectId}/dependencies/generate`)
}

/** 保存依赖边 */
export function saveDependencies(
  projectId: string,
  edges: DependencyEdgeInput[],
): Promise<DependencyGraph> {
  return request.put<DependencyGraph>(`/projects/${projectId}/dependencies`, { edges })
}

/** 确认依赖图 */
export function confirmDependencies(projectId: string): Promise<DependencyGraph> {
  return request.post<DependencyGraph>(`/projects/${projectId}/dependencies/confirm`)
}
