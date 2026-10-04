# Design: <change-name>

> 本文件说明「怎么做」。行为需求见 `proposal.md` 与 `delta/`。

## 概述

<一段话说明技术方案的核心思路>

## 技术选型

### 选型 A：<选项名>

- **优点**：...
- **缺点**：...
- **决策**：选用 / 否决

### 选型 B：<选项名>

- **优点**：...
- **缺点**：...
- **决策**：选用 / 否决

## ADR（架构决策记录）

### ADR-1: <决策标题>

**背景**：<为什么需要这个决策>

**决策**：<选择了什么>

**理由**：<为什么选这个>

**权衡**：<被否决的选项及理由>

**后续**：<如果决策错了怎么办>

## 接口设计

### 对外接口

```typescript
// 伪码，具体实现语言以项目为准
interface SmsLoginRequest {
  phone: string;            // 手机号，国际格式 +86 等
  code: string;            // 6 位数字验证码
}

interface SmsLoginResponse {
  token: string;           // JWT
  refreshToken: string;
  expiresIn: number;       // 秒
}

// POST /api/auth/sms-login
async function smsLogin(req: SmsLoginRequest): Promise<SmsLoginResponse>;

// POST /api/auth/sms-send
async function sendSmsCode(phone: string): Promise<{ expiresAt: string }>;
```

### 错误码

| Code | 含义 | HTTP Status |
|------|------|-------------|
| `E_INVALID_PHONE` | 手机号格式错误 | 400 |
| `E_CODE_INVALID` | 验证码错误或过期 | 401 |
| `E_RATE_LIMITED` | 触发发送频率限制 | 429 |
| `E_PROVIDER_UNAVAILABLE` | 短信服务商不可用 | 503 |

## 数据结构

```typescript
// 用户表扩展
interface User {
  // ...既有字段
  phone?: string;         // 可选，唯一索引（除空）
  phoneVerified: boolean;
}

// 短信验证码表
interface SmsCode {
  id: number;
  phone: string;
  code: string;           // 明文或加密，具体取决于存储安全要求
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}
```

## 关键流程

```
用户 -> POST /api/auth/sms-send { phone }
  -> 校验手机号格式
  -> 检查发送频率
  -> 生成验证码
  -> 调用短信服务商
  -> 写入 SmsCode 表
  -> 返回 { expiresAt }

用户 -> POST /api/auth/sms-login { phone, code }
  -> 查询 SmsCode
  -> 校验未过期 & 未使用
  -> 生成 JWT
  -> 标记 SmsCode.usedAt
  -> 返回 { token, refreshToken }
```

## 集成点（会改动的文件）

### 后端

- `src/backend/auth/controller.ts` — 新增 `smsLogin`、`sendSmsCode` 接口
- `src/backend/auth/service.ts` — 新增业务逻辑
- `src/backend/auth/sms-provider.ts` — 新增短信服务商适配
- `src/backend/db/schema.prisma` — 新增 SmsCode 表、User.phone 字段
- `src/backend/db/migrations/` — 新增 migration

### 前端

- `src/frontend/components/LoginForm.vue` — 新增 SMS 登录 tab
- `src/frontend/stores/auth.ts` — 新增 smsLogin action

### 配置

- `src/backend/config/sms.ts` — 短信服务商配置
- `.env.example` — 新增 SMS_API_KEY 等变量

## 边界与异常

- 手机号未注册 → 是否自动创建账号？（决策：是）
- 验证码过期 → 明确错误码 `E_CODE_INVALID`
- 短信服务商超时 → 重试 1 次，超时后降级
- 用户同时发送多次 → 频率限制（1 分钟 1 次）

## 非功能性需求

- **性能**：登录接口 P95 < 500ms
- **安全**：验证码加密存储、传输走 HTTPS、防暴力破解
- **可观测性**：发送成功率、登录成功率、错误分布
- **可扩展性**：短信服务商可插拔

## 风险与权衡

- 依赖第三方短信服务商可用性 → 考虑多服务商切换
- 手机号唯一约束 → 若用户已用邮箱注册，处理合并逻辑
- 验证码暴力破解 → 加图形验证码兜底（本期不做）
