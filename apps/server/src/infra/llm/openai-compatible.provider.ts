import { Logger } from '@nestjs/common'
import { ErrorCode, type Contract, type ParsedSpec, type RequirementItem, type StackConfig } from '@specforge/shared'
import { AppException } from '../../common/app-exception'
import type {
  FixAttempt,
  GeneratedContract,
  GeneratedDependency,
  GeneratedFile,
  GeneratedFix,
  GeneratedItem,
  GeneratedAssumption,
  LlmProvider,
  LlmUsage,
  ParsedRequirementResult,
} from './llm.types'

interface ChatChoice {
  message?: { content?: string }
}

interface ChatResponse {
  choices?: ChatChoice[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/**
 * OpenAI 兼容适配器：任何兼容 /chat/completions 的服务（OpenAI、DeepSeek、通义、Moonshot、vLLM…）都可接入。
 * 通过 LLM_PROVIDER=openai + LLM_BASE_URL + LLM_API_KEY 启用。
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = 'openai'
  private readonly logger = new Logger(OpenAiCompatibleProvider.name)

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 60000,
  ) {}

  isAvailable(): boolean {
    return Boolean(this.baseUrl && this.apiKey)
  }

  async parseRequirement(input: {
    model: string
    content: string
    fileName: string
    projectName: string
    stackConfig: StackConfig
  }): Promise<{ result: ParsedRequirementResult; usage: LlmUsage }> {
    const result = await this.chatJson<ParsedRequirementResult>(
      input.model,
      '你是需求解析 Agent。把 Markdown 需求文档解析为结构化条目、实体、状态机与待确认假设。严格输出 JSON，字段：spec{entities,stateMachines,rules,contradictions,summary{...}}、items[{code,title,description,acceptance[],dependsOn[],layer,priority}]、assumptions[{code,category,question,aiDefault,impact}]。layer ∈ frontend|backend|data|fullstack，priority ∈ P0|P1|P2，category ∈ business_rule|data_field|interaction|permission|exception。',
      `项目名：${input.projectName}\n目标栈：${JSON.stringify(input.stackConfig)}\n文件名：${input.fileName}\n\n需求文档：\n${input.content}`,
    )
    return result
  }

  async generateContract(input: {
    model: string
    spec: ParsedSpec
    items: RequirementItem[]
    stackConfig: StackConfig
  }): Promise<{ result: GeneratedContract; usage: LlmUsage }> {
    return this.chatJson<GeneratedContract>(
      input.model,
      '你是契约生成 Agent。基于结构化需求产出统一契约，严格输出 JSON，字段：openapiYaml、tsTypes、zodSchemas、prismaSchema、errorCodes、constants、stats{endpointCount,typeFieldCount,tableCount,enumCount,tscPassed}。所有文本字段内容是代码字符串。',
      `目标栈：${JSON.stringify(input.stackConfig)}\nSpec：${JSON.stringify(input.spec)}\n条目：${JSON.stringify(
        input.items.map((i) => ({ code: i.code, title: i.title, layer: i.layer })),
      )}`,
    )
  }

  async analyzeDependencies(input: {
    model: string
    items: RequirementItem[]
    contract: Contract | null
  }): Promise<{ result: GeneratedDependency[]; usage: LlmUsage }> {
    const { result, usage } = await this.chatJson<{ edges: GeneratedDependency[] }>(
      input.model,
      '你是依赖分析 Agent。为需求条目建立有向无环依赖图，严格输出 JSON：{"edges":[{itemCode,dependsOnCode,depType}]}，depType ∈ data|api|page|none。不得产生环。',
      `条目：${JSON.stringify(input.items.map((i) => ({ code: i.code, title: i.title, layer: i.layer, dependsOn: i.dependsOn })))}`,
    )
    return { result: result.edges ?? [], usage }
  }

  async generateItemCode(input: {
    model: string
    item: RequirementItem
    contract: Contract | null
    stackConfig: StackConfig
  }): Promise<{ result: GeneratedFile[]; usage: LlmUsage }> {
    const { result, usage } = await this.chatJson<{ files: GeneratedFile[] }>(
      input.model,
      '你是代码生成 Agent。按条目验收标准与契约生成代码文件，严格输出 JSON：{"files":[{path,content}]}。文件路径遵循 pnpm monorepo 约定（apps/web、apps/server、packages/shared）。',
      `目标栈：${JSON.stringify(input.stackConfig)}\n契约摘要：${JSON.stringify(
        input.contract?.stats ?? null,
      )}\n条目：${JSON.stringify({ code: input.item.code, title: input.item.title, description: input.item.description, acceptance: input.item.acceptance, layer: input.item.layer })}`,
    )
    return { result: result.files ?? [], usage }
  }

  async fixError(input: {
    model: string
    item: RequirementItem
    error: { message: string; checkType: string; round: number; output: string }
    files: GeneratedFile[]
    round: number
    history: FixAttempt[]
  }): Promise<{ result: GeneratedFix; usage: LlmUsage }> {
    const historyText =
      input.history.length > 0
        ? input.history
            .map((attempt) => `第 ${attempt.round} 轮（${attempt.checkType}）：${attempt.message}\n${attempt.patch}`)
            .join('\n---\n')
        : '无'
    const { result, usage } = await this.chatJson<GeneratedFix>(
      input.model,
      '你是修复 Agent。依据报错信息修复代码，严格输出 JSON：{patch,files:[{path,content}]}。patch 为 unified diff 文本，files 为修复后的完整文件。务必参考历史修复记录，避免重复无效改动。',
      `报错检查项：${input.error.checkType}\n报错信息：${input.error.message}\n错误输出：${input.error.output}\n历史修复记录：${historyText}\n当前文件：${JSON.stringify(
        input.files,
      )}`,
    )
    return {
      result: { patch: result.patch ?? '', files: result.files ?? input.files },
      usage,
    }
  }

  /* ------------------------- 底层调用 ------------------------- */

  private async chatJson<T>(model: string, system: string, user: string): Promise<{ result: T; usage: LlmUsage }> {
    if (!this.isAvailable()) {
      throw new AppException(ErrorCode.MODEL_NOT_CONFIGURED, 400)
    }
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`
    let response: ChatResponse
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`)
      }
      response = (await res.json()) as ChatResponse
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? `模型调用超时（${this.timeoutMs}ms）`
          : error instanceof Error
            ? error.message
            : String(error)
      this.logger.error(`模型调用失败：${message}`)
      throw new AppException(ErrorCode.LLM_ERROR, 502, message)
    } finally {
      clearTimeout(timer)
    }

    const content = response.choices?.[0]?.message?.content ?? '{}'
    let parsed: T
    try {
      parsed = JSON.parse(this.extractJson(content)) as T
    } catch {
      throw new AppException(ErrorCode.LLM_ERROR, 502, '模型返回内容不是合法 JSON')
    }

    return {
      result: parsed,
      usage: {
        model,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    }
  }

  private extractJson(content: string): string {
    const trimmed = content.trim()
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenced) return fenced[1].trim()
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
    return trimmed
  }
}
