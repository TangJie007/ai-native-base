import { Injectable } from '@nestjs/common'
import {
  ERROR_MESSAGES,
  ErrorCode,
  type AssumptionCategory,
  type ContractStats,
  type ItemLayer,
  type ItemPriority,
  type ParsedEntity,
  type ParsedSpec,
  type ParsedStateMachine,
  type RequirementItem,
} from '@specforge/shared'
import type {
  FixAttempt,
  GeneratedAssumption,
  GeneratedContract,
  GeneratedDependency,
  GeneratedFile,
  GeneratedFix,
  GeneratedItem,
  LlmProvider,
  LlmUsage,
  ParsedRequirementResult,
} from './llm.types'

interface RawSection {
  title: string
  body: string[]
}

/**
 * 默认模型适配器：用确定性算法模拟 LLM 输出，零外部依赖。
 * 目的不是「聪明」，而是让 S1→S5 全链路在没有 API Key 时也能真实跑通、产出结构合法的数据。
 */
@Injectable()
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock'

  isAvailable(): boolean {
    return true
  }

  /* ------------------------- S1 需求解析 ------------------------- */

  async parseRequirement(input: {
    model: string
    content: string
    fileName: string
    projectName: string
    stackConfig: unknown
  }): Promise<{ result: ParsedRequirementResult; usage: LlmUsage }> {
    const sections = this.extractSections(input.content)
    const items = sections.map<GeneratedItem>((section, index) => {
      const text = [section.title, ...section.body].join('\n')
      return {
        code: `REQ-${String(index + 1).padStart(3, '0')}`,
        title: section.title,
        description: this.describe(section),
        acceptance: this.extractAcceptance(section),
        dependsOn: this.extractDepends(text),
        layer: this.inferLayer(text),
        priority: this.inferPriority(section.title),
      }
    })

    const entities = this.buildEntities(items, sections)
    const stateMachines = this.extractStateMachines(input.content)
    const assumptions = this.buildAssumptions(input.content, items, entities)
    const contradictions = this.findContradictions(items)

    const spec: ParsedSpec = {
      entities,
      stateMachines,
      rules: this.extractRules(input.content),
      contradictions,
      summary: {
        itemCount: items.length,
        entityCount: entities.length,
        stateMachineCount: stateMachines.length,
        assumptionCount: assumptions.length,
      },
    }

    return {
      result: { spec, items, assumptions },
      usage: this.estimateUsage(input.model, input.content, JSON.stringify(spec)),
    }
  }

  /* ------------------------- S2 契约生成 ------------------------- */

  async generateContract(input: {
    model: string
    spec: ParsedSpec
    items: RequirementItem[]
    stackConfig: { database: string }
  }): Promise<{ result: GeneratedContract; usage: LlmUsage }> {
    const { spec, items } = input
    const openapiYaml = this.buildOpenApi(items)
    const tsTypes = this.buildTsTypes(spec)
    const zodSchemas = this.buildZodSchemas(spec)
    const prismaSchema = this.buildPrismaSchema(spec)
    const errorCodes = this.buildErrorCodes()
    const constants = this.buildConstants()

    const enumCount = spec.entities.reduce((sum, e) => sum + e.enums.length, 0)
    const typeFieldCount = spec.entities.reduce((sum, e) => sum + e.fields.length, 0)
    const stats: ContractStats = {
      endpointCount: items.length * 2,
      typeFieldCount,
      tableCount: spec.entities.length,
      enumCount,
      tscPassed: true,
    }

    return {
      result: { openapiYaml, tsTypes, zodSchemas, prismaSchema, errorCodes, constants, stats },
      usage: this.estimateUsage(input.model, JSON.stringify(items), tsTypes + prismaSchema),
    }
  }

  /* ------------------------- S3 依赖分析 ------------------------- */

  async analyzeDependencies(input: {
    model: string
    items: RequirementItem[]
    contract: unknown
  }): Promise<{ result: GeneratedDependency[]; usage: LlmUsage }> {
    const items = input.items
    const edges: GeneratedDependency[] = []
    const seen = new Set<string>()
    const push = (itemCode: string, dependsOnCode: string, depType: GeneratedDependency['depType']) => {
      if (itemCode === dependsOnCode) return
      const key = `${itemCode}->${dependsOnCode}`
      if (seen.has(key)) return
      seen.add(key)
      edges.push({ itemCode, dependsOnCode, depType })
    }

    // 1. 显式依赖
    for (const item of items) {
      for (const code of item.dependsOn) push(item.code, code, 'api')
    }

    // 2. 隐式依赖：前端条目 -> 相似主题的后端条目（page）
    const backends = items.filter((i) => i.layer === 'backend' || i.layer === 'data' || i.layer === 'fullstack')
    for (const item of items) {
      if (item.layer !== 'frontend') continue
      const target = this.findMostSimilar(item.title, backends)
      if (target) push(item.code, target.code, 'page')
    }

    // 3. 隐式依赖：后端条目 -> 数据条目（data）
    const dataItems = items.filter((i) => i.layer === 'data')
    for (const item of items) {
      if (item.layer !== 'backend' && item.layer !== 'fullstack') continue
      const target = this.findMostSimilar(item.title, dataItems)
      if (target) push(item.code, target.code, 'data')
    }

    // 4. 兜底：保证图连通、批次可分层 —— 前一条同层条目作为前置
    if (edges.length === 0 && items.length > 1) {
      for (let i = 1; i < items.length; i += 1) {
        push(items[i].code, items[i - 1].code, 'api')
      }
    }

    return {
      result: edges,
      usage: this.estimateUsage(input.model, items.map((i) => i.title).join('\n'), JSON.stringify(edges)),
    }
  }

  /* ------------------------- S4 代码生成 ------------------------- */

  async generateItemCode(input: {
    model: string
    item: RequirementItem
    contract: unknown
    stackConfig: { uiLibrary: string }
  }): Promise<{ result: GeneratedFile[]; usage: LlmUsage }> {
    const { item } = input
    const slug = this.kebab(item.title)
    const pascal = this.pascal(item.title)
    const files: GeneratedFile[] = []
    const header = `// ${item.code} ${item.title}\n// 由 SpecForge ${this.name} 适配器生成，验收标准：\n${item.acceptance.map((a) => `// - ${a}`).join('\n')}`

    if (item.layer === 'backend' || item.layer === 'fullstack') {
      files.push({
        path: `apps/server/src/modules/generated/${slug}.controller.ts`,
        content: `${header}\nimport { Controller, Get } from '@nestjs/common'\n\n@Controller('${slug}')\nexport class ${pascal}Controller {\n  @Get()\n  list() {\n    return { module: '${slug}', item: '${item.code}' }\n  }\n}\n`,
      })
      files.push({
        path: `apps/server/src/modules/generated/${slug}.service.ts`,
        content: `${header}\nimport { Injectable } from '@nestjs/common'\n\n@Injectable()\nexport class ${pascal}Service {\n  describe() {\n    return '${item.title}'\n  }\n}\n`,
      })
    }
    if (item.layer === 'frontend' || item.layer === 'fullstack') {
      files.push({
        path: `apps/web/src/views/generated/${pascal}.vue`,
        content: `${header}\n<template>\n  <section class="p-6">\n    <h2 class="text-txt-primary text-lg font-semibold">${item.title}</h2>\n    <p class="text-txt-body mt-2">${item.description.slice(0, 120) || '待实现'}</p>\n  </section>\n</template>\n\n<script setup lang="ts">\n// ${item.code} 页面骨架\n</script>\n`,
      })
    }
    if (item.layer === 'data') {
      files.push({
        path: `apps/server/prisma/models/${slug}.prisma`,
        content: `${header}\nmodel ${pascal} {\n  id        String   @id @default(cuid())\n  name      String\n  createdAt DateTime @default(now())\n}\n`,
      })
    }
    if (files.length === 0) {
      files.push({
        path: `docs/items/${slug}.md`,
        content: `${header}\n\n${item.description}\n`,
      })
    }

    return {
      result: files,
      usage: this.estimateUsage(input.model, item.description, files.map((f) => f.content).join('\n')),
    }
  }

  /* ------------------------- S5 错误修复 ------------------------- */

  async fixError(input: {
    model: string
    item: RequirementItem
    error: { message: string; checkType: string; round: number; output: string }
    files: GeneratedFile[]
    round: number
    history: FixAttempt[]
  }): Promise<{ result: GeneratedFix; usage: LlmUsage }> {
    // Mock 修复：在文件头部补一条修复说明，模拟「已定位并修正」。
    const tried = input.history.length > 0 ? `（已尝试 ${input.history.length} 轮）` : ''
    const note = `// [fix round ${input.round}] 已根据「${input.error.message}」修正 ${input.item.code}${tried}\n`
    const files = input.files.map((file) => ({ ...file, content: note + file.content }))
    const patch = `--- a/${input.item.code}\n+++ b/${input.item.code}\n+ ${note.trim()}\n`

    return {
      result: { patch, files },
      usage: this.estimateUsage(input.model, input.error.output, patch),
    }
  }

  /* ------------------------- 内部工具 ------------------------- */

  private estimateUsage(model: string, input: string, output: string): LlmUsage {
    return {
      model,
      inputTokens: Math.max(1, Math.ceil(input.length / 4)),
      outputTokens: Math.max(1, Math.ceil(output.length / 4)),
    }
  }

  /** 按第一个可见标题切分章节；无标题时按空行分段 */
  private extractSections(content: string): RawSection[] {
    const lines = content.split(/\r?\n/)
    const headingRe = /^(#{1,6})\s+(.+?)\s*$/
    const headings: { level: number; text: string; line: number }[] = []
    lines.forEach((line, index) => {
      const match = line.match(headingRe)
      if (match) headings.push({ level: match[1].length, text: match[2].trim(), line: index })
    })

    if (headings.length === 0) {
      return content
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block, index) => {
          const blockLines = block.split(/\r?\n/)
          return { title: this.stripMarkup(blockLines[0]) || `需求 ${index + 1}`, body: blockLines.slice(1) }
        })
    }

    // 选择标题数量最多的层级（并列时取更高级别）
    const counts = new Map<number, number>()
    headings.forEach((h) => counts.set(h.level, (counts.get(h.level) ?? 0) + 1))
    let chosenLevel = headings[0].level
    let best = 0
    for (const [level, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
      if (count > best) {
        best = count
        chosenLevel = level
      }
    }

    const chosen = headings.filter((h) => h.level === chosenLevel)
    const sections: RawSection[] = chosen.map((heading, index) => {
      const next = chosen[index + 1]
      const end = next ? next.line : lines.length
      return { title: heading.text, body: lines.slice(heading.line + 1, end) }
    })

    // 过滤掉概述类章节（仅当还有其它章节时）
    const noise = /^(概述|背景|简介|前言|目录|说明|overview|introduction|background)/i
    const filtered = sections.filter((s) => !noise.test(s.title))
    if (filtered.length >= 3) return filtered
    // 章节太少时，降级到更细的层级（h3 等）
    if (chosen.length <= 2) {
      const deeper = this.lowerLevelSections(lines, headings, chosenLevel)
      if (deeper.length > chosen.length) return deeper.length >= 3 ? deeper : filtered
    }
    return filtered
  }

  private lowerLevelSections(
    lines: string[],
    headings: { level: number; text: string; line: number }[],
    currentLevel: number,
  ): RawSection[] {
    const candidates = [currentLevel + 1, currentLevel + 2].filter((l) => l <= 6)
    for (const level of candidates) {
      const chosen = headings.filter((h) => h.level === level)
      if (chosen.length >= 3) {
        return chosen.map((heading, index) => {
          const next = chosen[index + 1]
          const end = next ? next.line : lines.length
          return { title: heading.text, body: lines.slice(heading.line + 1, end) }
        })
      }
    }
    return []
  }

  private stripMarkup(text: string): string {
    return text
      .replace(/^[#>\-*\s]+/, '')
      .replace(/`/g, '')
      .trim()
  }

  private describe(section: RawSection): string {
    const paragraph = section.body
      .filter((line) => line.trim() && !/^\s*([-*+]|\d+\.)\s+/.test(line))
      .map((line) => this.stripMarkup(line))
      .filter(Boolean)
    return paragraph.slice(0, 4).join('\n') || section.title
  }

  private extractAcceptance(section: RawSection): string[] {
    return section.body
      .filter((line) => /^\s*([-*+]|\d+\.)\s+/.test(line))
      .map((line) => this.stripMarkup(line))
      .filter((line) => line.length > 0)
      .slice(0, 6)
  }

  private extractDepends(text: string): string[] {
    const codes = text.match(/REQ-\d{3}/g) ?? []
    return [...new Set(codes)]
  }

  private inferLayer(text: string): ItemLayer {
    const frontend = /(页面|界面|前端|视图|交互|表单|组件|样式|路由|vue|ui)/i
    const backend = /(接口|api|服务|后端|控制器|controller|service|鉴权|权限)/i
    const data = /(数据表|数据库|字段|模型|存储|表结构|schema|migration|orm)/i
    const f = frontend.test(text)
    const b = backend.test(text)
    const d = data.test(text)
    if (f && (b || d)) return 'fullstack'
    if (d) return 'data'
    if (f) return 'frontend'
    if (b) return 'backend'
    return 'fullstack'
  }

  private inferPriority(title: string): ItemPriority {
    if (/(核心|必须|关键|基础|登录|认证|支付)/.test(title)) return 'P0'
    if (/(可选|增强|后续|优化|nice)/i.test(title)) return 'P2'
    return 'P1'
  }

  private findMostSimilar(title: string, candidates: RequirementItem[]): RequirementItem | null {
    const tokens = this.tokens(title)
    let bestItem: RequirementItem | null = null
    let bestScore = 0
    for (const candidate of candidates) {
      const candidateTokens = this.tokens(candidate.title)
      const score = tokens.filter((t) => candidateTokens.includes(t)).length
      if (score > bestScore) {
        bestScore = score
        bestItem = candidate
      }
    }
    return bestScore > 0 ? bestItem : null
  }

  private tokens(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fa5]+/)
      .filter((token) => token.length >= 2)
  }

  private buildEntities(items: GeneratedItem[], sections: RawSection[]): ParsedEntity[] {
    const entityCandidates = items.filter((i) => i.layer === 'data' || i.layer === 'backend' || i.layer === 'fullstack')
    const source = entityCandidates.length > 0 ? entityCandidates : items
    return source.slice(0, 12).map((item) => {
      const section = sections.find((s) => s.title === item.title)
      const fields = (section?.body ?? [])
        .map((line) => line.trim())
        .filter((line) => /^[-*+]?\s*[A-Za-z_\u4e00-\u9fa5]+\s*[:：]\s*\S+/.test(line))
        .map((line) => {
          const [rawName, ...rest] = line.replace(/^[-*+]\s*/, '').split(/[:：]/)
          const name = rawName.trim()
          const type = rest.join(':').trim()
          return { name, type, required: /必填|required|非空/.test(type), note: '' }
        })
        .filter((f) => f.name.length > 0 && f.name.length < 40)
        .slice(0, 16)
      return {
        name: this.pascal(item.title),
        fields: fields.length > 0 ? fields : [
          { name: 'id', type: 'string', required: true },
          { name: 'name', type: 'string', required: true },
          { name: 'createdAt', type: 'datetime', required: true },
        ],
        enums: [],
      }
    })
  }

  private extractStateMachines(content: string): ParsedStateMachine[] {
    const machines: ParsedStateMachine[] = []
    const lines = content.split(/\r?\n/)
    for (const line of lines) {
      if (!/(状态|流转|state)/i.test(line)) continue
      const parts = line.split(/[→>-]+\s*/).map((p) => this.stripMarkup(p).trim()).filter(Boolean)
      if (parts.length < 2) continue
      machines.push({
        name: this.pascal(parts[0].slice(0, 12)) || 'StateMachine',
        states: [...new Set(parts)],
        transitions: parts.slice(1).map((to, i) => ({ from: parts[i], to, trigger: '自动' })),
      })
    }
    return machines.slice(0, 6)
  }

  private extractRules(content: string): string[] {
    return content
      .split(/\r?\n/)
      .filter((line) => /^\s*[-*+]\s+/.test(line) && /(必须|禁止|不允许|不得|应当|最多|至少)/.test(line))
      .map((line) => this.stripMarkup(line))
      .slice(0, 20)
  }

  private findContradictions(items: GeneratedItem[]): string[] {
    const seen = new Map<string, number>()
    items.forEach((item) => seen.set(item.title, (seen.get(item.title) ?? 0) + 1))
    return [...seen.entries()]
      .filter(([, count]) => count > 1)
      .map(([title]) => `条目「${title}」出现多次定义，存在歧义`)
  }

  private buildAssumptions(
    content: string,
    items: GeneratedItem[],
    entities: ParsedEntity[],
  ): GeneratedAssumption[] {
    const assumptions: GeneratedAssumption[] = []
    const add = (category: AssumptionCategory, question: string, aiDefault: string, impact: string) => {
      assumptions.push({ code: `A-${String(assumptions.length + 1).padStart(2, '0')}`, category, question, aiDefault, impact })
    }

    if (!/(权限|角色|鉴权|role|permission)/i.test(content)) {
      add('permission', '文档未说明权限模型：普通用户与管理员如何划分？', '采用「登录用户可操作自己的数据，管理员可查看全部」的基础模型', '影响接口鉴权与数据可见范围')
    }
    if (!/(分页|page|pageSize)/i.test(content)) {
      add('interaction', '列表是否需要分页？每页多少条？', '默认分页，每页 20 条，支持页码切换', '影响列表接口契约与前端交互')
    }
    if (/(删除|remove|delete)/i.test(content) && !/(软删|回收站|逻辑删除)/i.test(content)) {
      add('exception', '删除数据采用物理删除还是软删除？', '采用软删除（deletedAt 标记），保留可恢复能力', '影响数据表字段与删除接口语义')
    }
    if (items.length > 0 && !/(校验|validation|规则)/i.test(content)) {
      add('business_rule', '各字段的业务校验规则未明确，如何约束？', '按常规约束：必填项非空、字符串长度上限 255、时间字段格式 ISO8601', '影响契约校验规则与错误提示')
    }
    const fieldCount = entities.reduce((sum, e) => sum + e.fields.length, 0)
    if (fieldCount === entities.length * 3 && entities.length > 0) {
      add('data_field', '多数实体未给出具体字段，是否使用占位字段？', '使用 id / name / createdAt 占位，待补充后重新生成契约', '影响数据表结构准确性')
    }
    if (!/(并发|锁定|乐观锁|version)/i.test(content)) {
      add('exception', '同一记录被并发修改时如何处理？', '使用乐观锁（version 字段），冲突时提示用户刷新重试', '影响更新接口的并发安全')
    }
    return assumptions.slice(0, 8)
  }

  private buildOpenApi(items: RequirementItem[]): string {
    const paths = items
      .map((item) => {
        const slug = this.kebab(item.title)
        return `  /api/${slug}:\n    get:\n      summary: ${item.title}（列表）\n      operationId: list_${this.snake(item.title)}\n      responses:\n        '200':\n          description: OK\n    post:\n      summary: ${item.title}（创建）\n      operationId: create_${this.snake(item.title)}\n      responses:\n        '201':\n          description: Created`
      })
      .join('\n')
    return `openapi: 3.0.3\ninfo:\n  title: SpecForge Generated API\n  version: 1.0.0\npaths:\n${paths || '  {}'}\n`
  }

  private buildTsTypes(spec: ParsedSpec): string {
    return spec.entities
      .map((entity) => {
        const fields = entity.fields
          .map((f) => `  ${f.name}${f.required ? '' : '?'}: ${this.mapTsType(f.type)}`)
          .join('\n')
        return `export interface ${entity.name} {\n${fields}\n}`
      })
      .join('\n\n')
  }

  private buildZodSchemas(spec: ParsedSpec): string {
    return spec.entities
      .map((entity) => {
        const fields = entity.fields
          .map((f) => `  ${f.name}: ${this.mapZodType(f.type)}${f.required ? '' : '.optional()'},`)
          .join('\n')
        return `export const ${this.camel(entity.name)}Schema = z.object({\n${fields}\n})`
      })
      .join('\n\n')
  }

  private buildPrismaSchema(spec: ParsedSpec): string {
    return spec.entities
      .map((entity) => {
        const fields = entity.fields
          .map((f) => `  ${f.name} ${this.mapPrismaType(f.type)}${f.required ? '' : '?'}`)
          .join('\n')
        return `model ${entity.name} {\n${fields}\n}`
      })
      .join('\n\n')
  }

  private buildErrorCodes(): string {
    const codes = Object.values(ErrorCode)
      .map((code) => `  ${code}: '${code}',`)
      .join('\n')
    return `// 契约锁定的错误码表\nexport const ErrorCode = {\n${codes}\n} as const\nexport const ERROR_MESSAGES = ${JSON.stringify(
      ERROR_MESSAGES,
      null,
      2,
    )}\n`
  }

  private buildConstants(): string {
    return `export const DEFAULT_PAGE_SIZE = 20\nexport const DEFAULT_CONCURRENCY = 3\nexport const DEFAULT_MAX_FIX_ROUNDS = 3\n`
  }

  private mapTsType(type: string): string {
    const t = type.toLowerCase()
    if (/(int|number|integer|decimal|float|double|amount|价格|数量)/.test(t)) return 'number'
    if (/(bool|boolean)/.test(t)) return 'boolean'
    if (/(date|time|datetime)/.test(t)) return 'string'
    if (/(\[\]|array|list)/.test(t)) return 'string[]'
    return 'string'
  }

  private mapZodType(type: string): string {
    const t = type.toLowerCase()
    if (/(int|number|integer|decimal|float|double|amount|价格|数量)/.test(t)) return 'z.number()'
    if (/(bool|boolean)/.test(t)) return 'z.boolean()'
    if (/(\[\]|array|list)/.test(t)) return 'z.array(z.string())'
    return 'z.string()'
  }

  private mapPrismaType(type: string): string {
    const t = type.toLowerCase()
    if (/(int|integer|数量)/.test(t)) return 'Int'
    if (/(number|decimal|float|double|amount|价格)/.test(t)) return 'Float'
    if (/(bool|boolean)/.test(t)) return 'Boolean'
    if (/(datetime|时间)/.test(t)) return 'DateTime'
    if (/(\[\]|array|list)/.test(t)) return 'Json'
    return 'String'
  }

  private pascal(text: string): string {
    const cleaned = text.replace(/[^A-Za-z0-9\u4e00-\u9fa5]+/g, ' ').trim()
    const ascii = cleaned
      .split(/\s+/)
      .filter((w) => /[A-Za-z0-9]/.test(w))
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('')
    if (ascii) return ascii
    // 纯中文：用稳定哈希兜底，保证同名输入得到同名输出
    return `Entity${this.hash(cleaned)}`
  }

  private camel(text: string): string {
    const pascal = this.pascal(text)
    return pascal.charAt(0).toLowerCase() + pascal.slice(1)
  }

  private kebab(text: string): string {
    return this.pascal(text)
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
  }

  private snake(text: string): string {
    return this.pascal(text)
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase()
  }

  private hash(text: string): number {
    let hash = 0
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0
    }
    return Math.abs(hash) % 1000
  }
}
