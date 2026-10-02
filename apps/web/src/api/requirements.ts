import type {
  Assumption,
  ParsedSpec,
  RequirementDoc,
  RequirementItem,
} from '@specforge/shared'
import { request } from './client'

export interface RequirementsPayload {
  doc: RequirementDoc | null
  spec: ParsedSpec | null
  items: RequirementItem[]
}

export interface ImportRequirementsPayload {
  fileName: string
  content: string
}

export interface ImportRequirementsResult extends RequirementsPayload {
  assumptions: Assumption[]
}

export interface CreateItemPayload {
  title: string
  description?: string
  acceptance?: string[]
  layer?: 'frontend' | 'backend' | 'data' | 'fullstack'
  priority?: 'P0' | 'P1' | 'P2'
  dependsOn?: string[]
}

export type UpdateItemPayload = Partial<CreateItemPayload>

/** 获取需求文档、解析规格与条目列表 */
export function getRequirements(projectId: string): Promise<RequirementsPayload> {
  return request.get<RequirementsPayload>(`/projects/${projectId}/requirements`)
}

/** 导入需求文档并触发解析 */
export function importRequirementDoc(
  projectId: string,
  payload: ImportRequirementsPayload,
): Promise<ImportRequirementsResult> {
  return request.post<ImportRequirementsResult>(
    `/projects/${projectId}/requirements/import`,
    payload,
  )
}

/** 需求条目列表 */
export function listItems(projectId: string): Promise<RequirementItem[]> {
  return request.get<RequirementItem[]>(`/projects/${projectId}/items`)
}

/** 新建需求条目 */
export function createItem(
  projectId: string,
  payload: CreateItemPayload,
): Promise<RequirementItem> {
  return request.post<RequirementItem>(`/projects/${projectId}/items`, payload)
}

/** 更新需求条目 */
export function updateItem(itemId: string, payload: UpdateItemPayload): Promise<RequirementItem> {
  return request.patch<RequirementItem>(`/items/${itemId}`, payload)
}

/** 删除需求条目 */
export function deleteItem(itemId: string): Promise<void> {
  return request.delete<void>(`/items/${itemId}`)
}
