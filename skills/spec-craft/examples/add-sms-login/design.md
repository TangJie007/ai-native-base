# Design: add-sms-login

> 本文件说明「怎么做」。行为需求见 `proposal.md` 与 `delta/`。

## 概述

新增两个 RESTful API：

- `POST /api/auth/sms-send` — 发送验证码
- `POST /api/auth/sms-login` — 验证码登录

数据存储上使用 `SmsCode` 表保存验证码记录，`User` 表新增 `phone` 字段作为可选唯一索引。短信服务商通过抽象接口 `SmsProvider` 封装，便于后续替换。

## 技术选型

### 选型 A：JWT vs Session

**决策**：选用 JWT。

- **理由**：项目既有邮箱登录使用 JWT，一致性优先
- **权衡**：JWT 无法服务端主动吊销，但本项目 session 生命周期较短（1 天），可接受

### 选型 B：明文验证码 vs 加密存储

**决策**：加密存储（SHA-256 hash）。

- **理由**：即使数据库泄露，也无法直接读取验证码
- **权衡**：需多一次 hash 计算，性能可忽略

### 选型 C：短信服务商 SDK 直用 vs 抽象接口

**决策**：抽象接口 `SmsProvider`。

- **理由**：便于后续替换服务商、便于 mock 测试
- **权衡**：多一层抽象，但换来可测试性

## ADR（架构决策记录）

### ADR-1: 使用 JWT 而非 session

**背景**：需要为验证码登录颁发身份凭证。

**决策**：使用 JWT，与既有邮箱登录保持一致。

**理由**：

- 团队熟悉 JWT 模式
- 后端无状态，便于扩展
- 项目已有 JWT 中间件

**权衡**：

- 未选：Session（需要服务端存储，与既有设计冲突）

**后续**：

- 若未来需要强制登出，考虑引入 token blacklist

### ADR-2: 抽象短信服务商接口

**背景**：需要调用第三方短信 API，但服务商未来可能替换。

**决策**：定义 `SmsProvider` 接口，`AliyunSmsProvider` 作为实现。

**理由**：

- 便于 mock 测试
- 便于切换到腾讯云、阿里云等多家服务商
- 便于降级处理（多服务商）

**权衡**：

- 未选：直接调用阿里云 SDK（少一层抽象，但难以替换）

**后续**：

- 若未来需要多服务商降级，实现 `MultiSmsProvider` 装饰器

### ADR-3: 验证码加密存储

**背景**：数据库可能被入侵，明文验证码会造成安全风险。

**决策**：数据库中存储 `SHA-256(phone + code + salt)` 的 hash。

**理由**：

- 数据库泄露时验证码不可还原
- 用户无法通过重放攻击
- 性能开销可接受（SHA-256 极快）

**权衡**：

- 未选：明文（简单，但泄露风险大）
- 未选：AES 加密（需要密钥管理）

**后续**：

- salt 每次生成，与 phone + code 绑定

## 接口设计

### 对外接口

```typescript
// 发送验证码
interface SmsSendRequest {
  phone: string;  // 11 位数字，不含国家码
}

interface SmsSendResponse {
  expiresAt: string;  // ISO 8601，验证码过期时间
}

// POST /api/auth/sms-send
async function sendSmsCode(req: SmsSendRequest): Promise<SmsSendResponse>;


// 验证码登录
interface SmsLoginRequest {
  phone: string;   // 11 位数字
  code: string;    // 6 位数字
}

interface SmsLoginResponse {
  token: string;           // JWT
  refreshToken: string;    // 刷新 token
  expiresIn: number;       // 秒，通常 86400（1 天）
  user: {
    id: string;
    phone: string;
  };
}

// POST /api/auth/sms-login
async function smsLogin(req: SmsLoginRequest): Promise<SmsLoginResponse>;
```

### 错误码

| Code | 含义 | HTTP Status |
|------|------|-------------|
| `E_INVALID_PHONE` | 手机号格式错误（非 11 位数字） | 400 |
| `E_INVALID_CODE` | 验证码格式错误（非 6 位数字） | 400 |
| `E_CODE_INVALID` | 验证码错误或已过期 | 401 |
| `E_RATE_LIMITED` | 触发频率限制（60 秒内发送过） | 429 |
| `E_PROVIDER_UNAVAILABLE` | 短信服务商不可用 | 503 |
| `E_INTERNAL` | 系统内部错误 | 500 |

## 数据结构

```typescript
// User 表扩展
interface User {
  id: string;
  email?: string;           // 既有字段
  phone?: string;           // 新增，唯一索引（除空）
  phoneVerified: boolean;   // 新增，默认 false
  passwordHash?: string;    // 既有字段（JWT 登录无需）
  createdAt: string;
  updatedAt: string;
}

// SmsCode 表（新增）
interface SmsCode {
  id: number;
  phone: string;            // 11 位数字
  codeHash: string;         // SHA-256(phone + code + salt)
  expiresAt: string;        // ISO 8601
  usedAt: string | null;    // 使用后立即更新
  ip?: string;              // 发送时的 IP，用于风控
  createdAt: string;
}
```

### 数据库 migration

```sql
-- 新增 SmsCode 表
CREATE TABLE `sms_code` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `phone` VARCHAR(20) NOT NULL,
  `code_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME NULL,
  `ip` VARCHAR(45) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_phone_created` (`phone`, `created_at`),
  INDEX `idx_expires` (`expires_at`)
);

-- User 表新增字段
ALTER TABLE `user` ADD COLUMN `phone` VARCHAR(20) NULL;
ALTER TABLE `user` ADD COLUMN `phone_verified` TINYINT(1) NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX `uniq_user_phone` ON `user` (`phone`) WHERE phone IS NOT NULL;
```

## 关键流程

### 发送验证码

```
用户 → POST /api/auth/sms-send { phone }
  → 1. 校验手机号格式（11 位数字，以 1 开头）
  → 2. 检查频率限制（同手机号 60 秒内是否发过）
  → 3. 生成 6 位随机数字
  → 4. 计算 codeHash = SHA-256(phone + code + salt)
  → 5. 写入 SmsCode 表（expiresAt = now + 5min）
  → 6. 调用 SmsProvider.send(phone, template, code)
  → 7. 返回 { expiresAt }
```

### 验证码登录

```
用户 → POST /api/auth/sms-login { phone, code }
  → 1. 校验 phone 与 code 格式
  → 2. 查询 SmsCode 表（WHERE phone = X AND expiresAt > now() AND usedAt IS NULL ORDER BY createdAt DESC LIMIT 1）
  → 3. 若不存在 → 返回 E_CODE_INVALID
  → 4. 计算 hash = SHA-256(phone + code + salt)
  → 5. 若 hash != codeHash → 返回 E_CODE_INVALID
  → 6. 查找或创建 User（WHERE phone = X）
     → 不存在：INSERT 新 User（phoneVerified = true）
     → 存在：使用既有账号
  → 7. 更新 SmsCode.usedAt = now
  → 8. 生成 JWT + refreshToken
  → 9. 返回 { token, refreshToken, expiresIn, user }
```

## 集成点（会改动的文件）

### 后端

- `src/backend/auth/sms-controller.ts` — 新增
- `src/backend/auth/sms-service.ts` — 新增
- `src/backend/auth/sms-provider.ts` — 新增（接口 + 阿里云实现）
- `src/backend/auth/sms-code.repository.ts` — 新增（数据访问）
- `src/backend/auth/sms-validator.ts` — 新增（格式校验）
- `src/backend/db/schema.prisma` — 修改（新增 SmsCode model + User.phone 字段）
- `src/backend/db/migrations/20261004_add_sms_support.sql` — 新增

### 前端

- `src/frontend/components/LoginForm.vue` — 修改（新增 SMS 登录 tab）
- `src/frontend/components/SmsSendForm.vue` — 新增
- `src/frontend/stores/auth.ts` — 修改（新增 smsSend / smsLogin action）
- `src/frontend/api/auth.ts` — 修改（新增 API 调用）

### 配置

- `src/backend/config/sms.ts` — 新增
- `.env.example` — 新增 SMS_PROVIDER / SMS_ACCESS_KEY / SMS_SECRET / SMS_SIGN_NAME

### 测试

- `test/backend/auth/sms-send.test.ts` — 新增
- `test/backend/auth/sms-login.test.ts` — 新增
- `test/backend/auth/sms-provider.test.ts` — 新增（mock）
- `test/e2e/auth-sms-login.spec.ts` — 新增

## 边界与异常

| 情况 | 处理 |
|------|------|
| 手机号未注册 | 自动创建账号，phoneVerified = true |
| 手机号已注册（其他账号） | 使用既有账号 |
| 验证码已过期 | 返回 E_CODE_INVALID，不消耗该记录 |
| 验证码已使用 | 返回 E_CODE_INVALID，不重复使用 |
| 短信服务商超时 | 重试 1 次，仍失败则返回 E_PROVIDER_UNAVAILABLE |
| 短信服务商限流 | 返回 E_RATE_LIMITED |
| 手机号非法（非 11 位 / 非数字） | 返回 E_INVALID_PHONE |
| 短信内容模板失败 | 记录日志，返回 E_PROVIDER_UNAVAILABLE |

## 非功能性需求

### 性能

- 发送接口 P95 < 1000ms（含第三方 API 调用）
- 登录接口 P95 < 500ms
- 验证码生成不阻塞主线程

### 安全

- 验证码传输走 HTTPS
- 数据库存储 hash，不存明文
- 单 IP 每日限发 100 次
- 单手机号 60 秒内限发 1 次
- 连续 5 次错误锁定手机号 15 分钟

### 可观测性

- 每次发送 / 登录记录一条结构化日志，含 phone（脱敏）、request_id、duration、outcome
- 错误分类统计：E_CODE_INVALID / E_RATE_LIMITED / E_PROVIDER_UNAVAILABLE 各占比
- 关键指标暴露到 metrics：send_count, login_success_count, error_rate

### 可扩展性

- `SmsProvider` 接口便于添加腾讯云、AWS SNS 等实现
- `SmsService` 依赖注入，便于替换实现

## 风险与权衡

### 依赖第三方可用性

**风险**：阿里云短信 API 故障会阻塞所有验证码登录。

**权衡**：本 change 只接一个服务商，多服务商降级下版本再实现（预留 `SmsProvider` 接口）。

### 手机号唯一约束冲突

**风险**：用户已用邮箱注册，现在用手机号登录，会创建第二个账号。

**权衡**：本 change 不处理合并，作为独立账号；账号合并能力下版本。

### 暴力破解

**风险**：用户可能暴力尝试验证码。

**权衡**：本 change 只加频率限制（1 分钟 1 次）；图形验证码兜底下版本。
