import type { DashboardData, Project, ProjectStats } from '@specforge/shared'
import { request } from './client'

export interface CreateProjectPayload {
  name: string
  description?: string
}

export interface UpdateProjectPayload {
  name?: string
  description?: string
  stackConfig?: {
    uiLibrary?: 'Element Plus' | 'Naive UI' | 'Ant Design Vue'
    requestLayer?: 'Axios + TanStack Query' | 'Axios 封装'
    authStrategy?: 'JWT + Passport' | 'JWT + 自定义 Guard'
  }
}

/** 仪表盘聚合数据 */
export function getDashboard(): Promise<DashboardData> {
  return request.get<DashboardData>('/dashboard')
}

/** 项目列表 */
export function listProjects(): Promise<Project[]> {
  return request.get<Project[]>('/projects')
}

/** 新建项目 */
export function createProject(payload: CreateProjectPayload): Promise<Project> {
  return request.post<Project>('/projects', payload)
}

/** 项目详情 */
export function getProject(projectId: string): Promise<Project> {
  return request.get<Project>(`/projects/${projectId}`)
}

/** 更新项目 */
export function updateProject(projectId: string, payload: UpdateProjectPayload): Promise<Project> {
  return request.patch<Project>(`/projects/${projectId}`, payload)
}

/** 删除项目 */
export function deleteProject(projectId: string): Promise<void> {
  return request.delete<void>(`/projects/${projectId}`)
}

/** 项目统计 */
export function getProjectStats(projectId: string): Promise<ProjectStats> {
  return request.get<ProjectStats>(`/projects/${projectId}/stats`)
}
