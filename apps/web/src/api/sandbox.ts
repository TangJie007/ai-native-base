import type { SandboxFile, SandboxState } from '@specforge/shared'
import { request } from './client'

export interface SandboxFileContent {
  path: string
  content: string
}

/** 沙箱状态 */
export function getSandbox(projectId: string): Promise<SandboxState> {
  return request.get<SandboxState>(`/projects/${projectId}/sandbox`)
}

/** 创建沙箱 */
export function createSandbox(projectId: string): Promise<SandboxState> {
  return request.post<SandboxState>(`/projects/${projectId}/sandbox/create`)
}

/** 沙箱文件列表 */
export function listSandboxFiles(projectId: string): Promise<SandboxFile[]> {
  return request.get<SandboxFile[]>(`/projects/${projectId}/sandbox/files`)
}

/** 读取沙箱文件内容 */
export function getSandboxFile(projectId: string, path: string): Promise<SandboxFileContent> {
  return request.get<SandboxFileContent>(`/projects/${projectId}/sandbox/file`, { params: { path } })
}
