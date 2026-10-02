import { Injectable } from '@nestjs/common'
import { VERIFICATION_CHECK_META, type RequirementItem, type SandboxFile, type VerificationCheckType } from '@specforge/shared'
import type { GeneratedFile } from '../llm/llm.types'
import type { SandboxCheckResult, SandboxProvider } from './sandbox.types'

interface StoredFile {
  content: string
  updatedAt: string
}

/**
 * Mock 沙箱：内存文件系统 + 确定性检查结果。
 * 为了让「失败不阻塞 → 自动修复 → 复测通过」这条链路真实可见，
 * 约 1/4 的条目会在第 1 轮 lint 检查失败，修复后第 2 轮通过。
 */
@Injectable()
export class MockSandboxProvider implements SandboxProvider {
  readonly name = 'mock' as const

  private readonly store = new Map<string, Map<string, StoredFile>>()

  async create(projectId: string): Promise<void> {
    if (!this.store.has(projectId)) {
      this.store.set(projectId, new Map())
    }
  }

  async write(projectId: string, files: GeneratedFile[]): Promise<void> {
    await this.create(projectId)
    const bucket = this.store.get(projectId)!
    const now = new Date().toISOString()
    for (const file of files) {
      bucket.set(file.path, { content: file.content, updatedAt: now })
    }
  }

  async list(projectId: string): Promise<SandboxFile[]> {
    const bucket = this.store.get(projectId)
    if (!bucket) return []
    return [...bucket.entries()]
      .map(([path, file]) => ({ path, size: Buffer.byteLength(file.content, 'utf8'), updatedAt: file.updatedAt }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  async read(projectId: string, path: string): Promise<string | null> {
    return this.store.get(projectId)?.get(path)?.content ?? null
  }

  previewUrl(projectId: string): string | null {
    return this.store.has(projectId) ? `http://localhost:4173/preview/${projectId}` : null
  }

  async destroy(projectId: string): Promise<void> {
    this.store.delete(projectId)
  }

  async runChecks(
    projectId: string,
    item: RequirementItem,
    round: number,
    files: GeneratedFile[],
  ): Promise<SandboxCheckResult[]> {
    const checkTypes = (Object.keys(VERIFICATION_CHECK_META) as VerificationCheckType[]).sort(
      (a, b) => VERIFICATION_CHECK_META[a].order - VERIFICATION_CHECK_META[b].order,
    )
    const failingCheck = this.pickFailingCheck(item, round, files)
    const results: SandboxCheckResult[] = []

    for (const checkType of checkTypes) {
      const failed = failingCheck === checkType
      results.push({
        checkType,
        passed: !failed,
        durationMs: 40 + ((this.hash(`${item.code}${checkType}${round}`) % 260)),
        errorLog: failed
          ? `${VERIFICATION_CHECK_META[checkType].label}失败：\n${this.buildErrorLog(item, checkType)}`
          : null,
      })
      // 第一个失败即中断后续检查，与真实流水线一致
      if (failed && VERIFICATION_CHECK_META[checkType].blocking) break
    }

    void projectId
    return results
  }

  private pickFailingCheck(
    item: RequirementItem,
    round: number,
    files: GeneratedFile[],
  ): VerificationCheckType | null {
    if (round > 1) return null
    if (files.length === 0) return 'build'
    const seed = this.hash(item.code) % 4
    if (seed === 0) return 'lint'
    if (seed === 1) return 'typecheck'
    return null
  }

  private buildErrorLog(item: RequirementItem, checkType: VerificationCheckType): string {
    if (checkType === 'lint') {
      return `apps/server/src/modules/generated/${item.code.toLowerCase()}.controller.ts\n  ${12 + (this.hash(item.code) % 20)}:3  error  'UnusedVar' is defined but never used  no-unused-vars`
    }
    if (checkType === 'typecheck') {
      return `src/modules/generated/${item.code.toLowerCase()}.service.ts(${8 + (this.hash(item.code) % 12)},5): error TS2322: Type 'string | undefined' is not assignable to type 'string'.`
    }
    return `${VERIFICATION_CHECK_META[checkType].label}失败：${item.code} 输出不符合预期。`
  }

  private hash(text: string): number {
    let value = 0
    for (let i = 0; i < text.length; i += 1) {
      value = (value * 31 + text.charCodeAt(i)) | 0
    }
    return Math.abs(value)
  }
}
