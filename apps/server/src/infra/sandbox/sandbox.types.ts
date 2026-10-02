import type { RequirementItem, SandboxFile, VerificationCheckType } from '@specforge/shared'
import type { GeneratedFile } from '../llm/llm.types'

export interface SandboxCheckResult {
  checkType: VerificationCheckType
  passed: boolean
  durationMs: number
  errorLog: string | null
}

/**
 * 沙箱抽象（PRD 8.2）：默认 MockSandboxProvider（内存文件系统 + 模拟检查），
 * 后续可替换为 E2B / Docker 实现，业务层无需改动。
 */
export interface SandboxProvider {
  readonly name: 'mock' | 'e2b' | 'docker'
  create(projectId: string): Promise<void>
  write(projectId: string, files: GeneratedFile[]): Promise<void>
  list(projectId: string): Promise<SandboxFile[]>
  read(projectId: string, path: string): Promise<string | null>
  runChecks(
    projectId: string,
    item: RequirementItem,
    round: number,
    files: GeneratedFile[],
  ): Promise<SandboxCheckResult[]>
  previewUrl(projectId: string): string | null
  destroy(projectId: string): Promise<void>
}

export const SANDBOX_PROVIDER = Symbol('SANDBOX_PROVIDER')
