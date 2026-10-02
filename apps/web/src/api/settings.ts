import type { ModelSettings, UpdateModelSettingsDto } from '@specforge/shared'
import { request } from './client'

export interface TestModelPayload {
  model: string
  prompt?: string
}

export interface TestModelResult {
  ok: boolean
  message: string
}

/** 读取模型配置 */
export function getModelSettings(): Promise<ModelSettings> {
  return request.get<ModelSettings>('/settings/models')
}

/** 保存模型配置 */
export function updateModelSettings(payload: UpdateModelSettingsDto): Promise<ModelSettings> {
  return request.put<ModelSettings>('/settings/models', payload)
}

/** 连通性测试 */
export function testModel(payload: TestModelPayload): Promise<TestModelResult> {
  return request.post<TestModelResult>('/settings/models/test', payload)
}
