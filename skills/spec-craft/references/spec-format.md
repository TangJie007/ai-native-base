# Spec 格式规范

本文件定义 `spec-craft` 中所有 Requirement 与 Scenario 的书写格式。

## 1. 文件结构

每个 atom 文件（`specs/atom/{domain}/{atom}.md`）包含：

```markdown
# <Atom 名>

## Purpose
<一段话说清这个 atom 要解决什么问题>

## Requirements
### REQ-<domain>.<atom>.<n>: <标题>
...

## Non-Goals
<明确不做什么>

## Change History
| Date | Change | By | Ref |
|------|--------|----|-----|
```

## 2. Requirement 格式

### 2.1 编号规则

- **格式**：`REQ-<domain>.<atom>.<n>`
- **示例**：`REQ-auth.sms-login.1`
- **n**：从 1 开始递增，永不复用（即使 Requirement 被删除）
- **稳定性**：一旦发布，Requirement ID 不可更改

### 2.2 关键词

每个 Requirement 必须以 **RFC 2119** 关键词之一开头：

| 关键词 | 强度 | 含义 |
|--------|------|------|
| **MUST** | 必须 | 违反即错误，实现必须满足 |
| **SHALL** | 强推荐 | 必须满足，除非有明确例外说明 |
| **SHOULD** | 建议 | 建议满足，可解释例外 |
| **MAY** | 可选 | 满足或不满足都可 |

详细用词见 `rfc-2119.md`。

### 2.3 完整格式

```markdown
### REQ-auth.sms-login.1: 手机号 + 验证码登录

**Keywords**: MUST
**Operation**: ADDED

系统 MUST 允许用户使用手机号和 6 位验证码登录，无需密码。

#### Scenarios

##### SC-1.1: 首次登录

- **GIVEN** 用户在系统中不存在
- **WHEN** 用户提供有效的手机号和验证码
- **THEN** 系统 MUST 创建用户账号
- **AND THEN** 返回有效的 JWT token

##### SC-1.2: 重复登录

- **GIVEN** 用户在系统中已存在
- **WHEN** 用户提供有效的手机号和验证码
- **THEN** 系统 MUST 返回既有账号的 JWT token
```

## 3. Scenario 格式

### 3.1 结构

每个 Scenario 由四部分组成：

- **GIVEN** — 前置状态（可验证，不含模糊词）
- **WHEN** — 单一触发事件
- **THEN** — 可验证结果
- **AND THEN** — 附加断言（可选，可以有多个）

### 3.2 编号规则

- **格式**：`SC-<req-n>.<n>`
- **示例**：`SC-1.2` 表示 REQ-auth.sms-login.1 下的第 2 个场景
- 与父 Requirement 的编号强关联

### 3.3 书写规则

- **GIVEN 必须是可验证的**：
  - ✅ "用户账号存在且 phone 字段为 +8613800000000"
  - ❌ "用户已注册"（无法验证"注册"的定义）

- **WHEN 必须是单一事件**：
  - ✅ "用户 POST /api/auth/sms-login 携带 phone 与 code"
  - ❌ "用户尝试登录"（不清楚具体操作）

- **THEN 必须可验证**：
  - ✅ "接口返回 HTTP 200，body.token 长度 ≥ 50"
  - ❌ "登录成功"（不含具体验证条件）

- **禁止模糊词**：
  - ❌ "快速"、"高效"、"友好"、"合理"
  - ✅ 用具体数值（如 P95 < 500ms）

## 4. Non-Goals

明确列出本 atom **不覆盖**的能力：

```markdown
## Non-Goals

- 本 atom 不处理第三方 OAuth 登录（见 user/oauth-login）
- 本 atom 不处理账号合并逻辑（见 user/account-merge）
- 本 atom 不处理短信服务商的降级切换（见 auth/sms-fallback）
```

## 5. Change History

每次 archive 时追加一行：

```markdown
## Change History

| Date | Change | By | Ref |
|------|--------|----|-----|
| 2026-10-04 | ADDED REQ-auth.sms-login.1, REQ-auth.sms-login.2 | agent | change: add-sms-login |
| 2026-11-01 | MODIFIED REQ-auth.sms-login.1 (SC-1.3 新增) | agent | change: extend-sms-login |
```

## 6. 完整示例

```markdown
# SMS Login

## Purpose
支持用户使用手机号 + 6 位验证码登录系统，无需记忆密码。

## Requirements

### REQ-auth.sms-login.1: 发送验证码

**Keywords**: MUST
**Operation**: ADDED

系统 MUST 支持向指定手机号发送一次性登录验证码。

#### Scenarios

##### SC-1.1: 正常发送

- **GIVEN** 手机号格式合法
- **WHEN** 用户 POST /api/auth/sms-send { phone: "+8613800000000" }
- **THEN** 接口 MUST 返回 HTTP 200 与 { expiresAt: "2026-10-04T10:05:00Z" }
- **AND THEN** 3 分钟内该手机号 MUST 收到一条含 6 位数字的短信

##### SC-1.2: 频率限制

- **GIVEN** 该手机号 60 秒内已发送过一次验证码
- **WHEN** 用户再次 POST /api/auth/sms-send
- **THEN** 接口 MUST 返回 HTTP 429，错误码 E_RATE_LIMITED

### REQ-auth.sms-login.2: 验证码登录

**Keywords**: MUST
**Operation**: ADDED

系统 MUST 允许用户用有效验证码完成登录。

#### Scenarios

##### SC-2.1: 新用户

- **GIVEN** 系统中无该手机号对应的用户
- **WHEN** 用户 POST /api/auth/sms-login { phone, code } 且验证码有效
- **THEN** 系统 MUST 创建用户账号并返回 JWT
- **AND THEN** User.phoneVerified = true

##### SC-2.2: 老用户

- **GIVEN** 系统中已有该手机号的用户
- **WHEN** 用户 POST /api/auth/sms-login { phone, code } 且验证码有效
- **THEN** 返回既有账号的 JWT

##### SC-2.3: 验证码错误

- **GIVEN** 提供的 code 与最近一次发送的不一致
- **WHEN** 用户 POST /api/auth/sms-login
- **THEN** 接口 MUST 返回 HTTP 401，错误码 E_CODE_INVALID
- **AND THEN** 不应创建或修改任何用户账号

## Non-Goals

- 不处理第三方 OAuth 登录
- 不处理多设备会话管理

## Change History

| Date | Change | By | Ref |
|------|--------|----|-----|
| 2026-10-04 | ADDED REQ-auth.sms-login.1, REQ-auth.sms-login.2 | agent | change: add-sms-login |
```
