import { z } from 'zod'

/**
 * 请求/响应 DTO 的 Zod 校验定义（PRD 4.3「共享类型」产物）。
 * 后端通过 ZodValidationPipe 直接复用；前端可用于表单预校验。
 */

/* ---------------- auth ---------------- */

export const registerSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少 6 位').max(64),
  name: z.string().min(1, '请填写昵称').max(32).optional(),
})
export type RegisterDto = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(1, '请输入密码'),
})
export type LoginDto = z.infer<typeof loginSchema>

/* ---------------- project ---------------- */

export const createProjectSchema = z.object({
  name: z.string().min(1, '请填写项目名').max(64),
  description: z.string().max(500).optional().default(''),
})
export type CreateProjectDto = z.infer<typeof createProjectSchema>

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().max(500).optional(),
  status: z
    .enum([
      'draft',
      'parsing',
      'awaiting_assumptions',
      'awaiting_contract',
      'awaiting_dependencies',
      'generating',
      'verifying',
      'awaiting_regression',
      'delivered',
      'paused',
      'failed',
    ])
    .optional(),
  stackConfig: z
    .object({
      uiLibrary: z.enum(['Element Plus', 'Naive UI', 'Ant Design Vue']).optional(),
      requestLayer: z.enum(['Axios + TanStack Query', 'Axios 封装']).optional(),
      authStrategy: z.enum(['JWT + Passport', 'JWT + 自定义 Guard']).optional(),
    })
    .optional(),
})
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>

/* ---------------- requirement ---------------- */

export const importRequirementDocSchema = z.object({
  fileName: z.string().min(1).max(200).default('PRD.md'),
  content: z.string().min(1, '文档内容不能为空'),
})
export type ImportRequirementDocDto = z.infer<typeof importRequirementDocSchema>

export const createItemSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional().default(''),
  acceptance: z.array(z.string()).optional().default([]),
  layer: z.enum(['frontend', 'backend', 'data', 'fullstack']).default('fullstack'),
  priority: z.enum(['P0', 'P1', 'P2']).default('P0'),
  dependsOn: z.array(z.string()).optional().default([]),
})
export type CreateItemDto = z.infer<typeof createItemSchema>

export const updateItemSchema = createItemSchema.partial()
export type UpdateItemDto = z.infer<typeof updateItemSchema>

/* ---------------- assumption ---------------- */

export const updateAssumptionSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'default']).optional(),
  userAnswer: z.string().max(2000).nullable().optional(),
})
export type UpdateAssumptionDto = z.infer<typeof updateAssumptionSchema>

/* ---------------- dependency ---------------- */

export const saveDependenciesSchema = z.object({
  edges: z.array(
    z.object({
      itemId: z.string().min(1),
      dependsOnId: z.string().min(1),
      depType: z.enum(['data', 'api', 'page', 'none']).default('api'),
    }),
  ),
})
export type SaveDependenciesDto = z.infer<typeof saveDependenciesSchema>

/* ---------------- pipeline ---------------- */

export const startPipelineSchema = z.object({
  // 不设默认值：缺省时由服务端按配置（pipelineConcurrency / pipelineMaxFixRounds）回落（B-15）
  concurrency: z.number().int().min(1).max(10).optional(),
  maxFixRounds: z.number().int().min(0).max(10).optional(),
})
export type StartPipelineDto = z.infer<typeof startPipelineSchema>

export const resolveItemSchema = z.object({
  /** 人工介入后的处理方式 */
  action: z.enum(['retry', 'skip', 'mark_passed']),
  note: z.string().max(2000).optional().default(''),
})
export type ResolveItemDto = z.infer<typeof resolveItemSchema>

export const checkRegressionSchema = z.object({
  itemId: z.string().min(1),
  text: z.string().min(1).max(500),
  checked: z.boolean(),
})
export type CheckRegressionDto = z.infer<typeof checkRegressionSchema>

/* ---------------- settings ---------------- */

export const updateModelSettingsSchema = z.object({
  provider: z.string().min(1).max(64).optional(),
  baseUrl: z.string().max(300).optional(),
  apiKey: z.string().max(300).nullable().optional(),
  fallbackModel: z.string().max(120).optional(),
  tiers: z
    .array(
      z.object({
        tier: z.enum(['high', 'value', 'medium']),
        model: z.string().min(1).max(120),
      }),
    )
    .optional(),
})
export type UpdateModelSettingsDto = z.infer<typeof updateModelSettingsSchema>

export const testModelSchema = z.object({
  model: z.string().min(1).max(120),
  prompt: z.string().max(2000).optional().default('ping'),
})
export type TestModelDto = z.infer<typeof testModelSchema>
