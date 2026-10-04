# Delta: auth/sms-login

> 本文件描述相对 `specs/atom/auth/sms-login.md` 的需求增量。
> 本 atom 是新增（ADDED），因此 delta 内容即为完整的初始 spec。

## Purpose

支持用户使用手机号 + 6 位验证码完成登录。系统负责验证码校验、账号查找/创建、身份凭证颁发。

## Change Type

- [x] ADDED — 新增 atom
- [ ] MODIFIED — 修改既有 Requirement
- [ ] REMOVED — 弃用某些 Requirement

## Requirements

### REQ-auth.sms-login.1: 验证码校验

**Keywords**: MUST
**Operation**: ADDED

系统 MUST 校验用户提供的验证码与最近一次发送的一致且未过期。

#### Scenarios

##### SC-1.1: 验证码有效

- **GIVEN** 数据库中存在 SmsCode 记录：phone 匹配、codeHash 匹配、expiresAt > now()、usedAt IS NULL
- **WHEN** 用户 POST /api/auth/sms-login { phone, code }
- **THEN** 验证码校验 MUST 通过
- **AND THEN** 系统 MUST 继续执行后续流程

##### SC-1.2: 验证码错误

- **GIVEN** 数据库中的 SmsCode.codeHash 与 SHA-256(phone + code + salt) 不匹配
- **WHEN** 用户 POST /api/auth/sms-login { phone, code }
- **THEN** 接口 MUST 返回 HTTP 401
- **AND THEN** 响应 body.error.code MUST 为 "E_CODE_INVALID"
- **AND THEN** 用户账号 MUST NOT 被创建或修改
- **AND THEN** SmsCode.usedAt MUST 保持为 null

##### SC-1.3: 验证码过期

- **GIVEN** 数据库中的 SmsCode.expiresAt < now()
- **WHEN** 用户 POST /api/auth/sms-login { phone, code }
- **THEN** 接口 MUST 返回 HTTP 401
- **AND THEN** 响应 body.error.code MUST 为 "E_CODE_INVALID"

##### SC-1.4: 验证码已使用

- **GIVEN** 数据库中的 SmsCode.usedAt IS NOT NULL
- **WHEN** 用户 POST /api/auth/sms-login { phone, code }
- **THEN** 接口 MUST 返回 HTTP 401
- **AND THEN** 响应 body.error.code MUST 为 "E_CODE_INVALID"

### REQ-auth.sms-login.2: 账号查找或创建

**Keywords**: MUST
**Operation**: ADDED

系统 MUST 按手机号查找用户；若不存在则自动创建。

#### Scenarios

##### SC-2.1: 老用户

- **GIVEN** 数据库中存在 User 记录，User.phone = phone
- **WHEN** 验证码校验通过
- **THEN** 系统 MUST 使用既有 User 记录
- **AND THEN** 不应创建新的 User 记录
- **AND THEN** 该 User.phoneVerified MUST 为 true

##### SC-2.2: 新用户

- **GIVEN** 数据库中不存在 User 记录，且 User.phone 与 phone 均无匹配
- **WHEN** 验证码校验通过
- **THEN** 系统 MUST 创建新的 User 记录
- **AND THEN** 新 User.phone MUST 等于输入的 phone
- **AND THEN** 新 User.phoneVerified MUST 为 true
- **AND THEN** 新 User.passwordHash MUST 为 null（无密码）

### REQ-auth.sms-login.3: 消费验证码

**Keywords**: MUST
**Operation**: ADDED

系统 MUST 在验证通过后标记验证码为已使用，防止重复使用。

#### Scenarios

##### SC-3.1: 单次使用

- **GIVEN** 验证码校验通过
- **WHEN** 系统生成 JWT
- **THEN** SmsCode.usedAt MUST 被更新为当前时间
- **AND THEN** 同一 SmsCode 记录 MUST NOT 再被用于后续登录

### REQ-auth.sms-login.4: 颁发身份凭证

**Keywords**: MUST
**Operation**: ADDED

系统 MUST 颁发 JWT 与 refreshToken，有效期 1 天。

#### Scenarios

##### SC-4.1: 成功登录

- **GIVEN** 验证码校验通过 + 账号查找或创建完成
- **WHEN** 系统生成 token
- **THEN** 响应 MUST 返回 HTTP 200
- **AND THEN** 响应 body.token MUST 为有效 JWT（≥ 50 字符）
- **AND THEN** 响应 body.refreshToken MUST 为非空字符串
- **AND THEN** 响应 body.expiresIn MUST 为 86400（1 天）
- **AND THEN** 响应 body.user MUST 含 { id, phone }

##### SC-4.2: JWT 声明内容

- **GIVEN** JWT 已生成
- **WHEN** 解析 JWT payload
- **THEN** payload.sub MUST 等于 User.id
- **THEN** payload.phone MUST 等于 User.phone
- **THEN** payload.exp MUST 为签发时间 + 86400 秒

### REQ-auth.sms-login.5: 登录失败锁定

**Keywords**: SHOULD
**Operation**: ADDED

系统 SHOULD 在连续 5 次错误后临时锁定手机号 15 分钟。

#### Scenarios

##### SC-5.1: 触发锁定

- **GIVEN** 该手机号在过去 15 分钟内已连续 5 次验证码错误
- **WHEN** 用户第 6 次 POST /api/auth/sms-login
- **THEN** 接口 SHOULD 返回 HTTP 429
- **AND THEN** 响应 body.error.code SHOULD 为 "E_ACCOUNT_LOCKED"

##### SC-5.2: 锁定期解除

- **GIVEN** 锁定到期（15 分钟后）
- **WHEN** 用户再次 POST /api/auth/sms-login
- **THEN** 系统 SHOULD 恢复正常验证流程

## Non-Goals

- 不处理账号合并（同手机号已存在邮箱账号时的合并）
- 不处理多设备会话管理
- 不处理验证码的多语言版本
- 不做生物识别或 2FA 叠加（下版本再考虑）

## Change History

| Date | Change | By | Ref |
|------|--------|----|-----|
| 2026-10-04 | ADDED REQ-auth.sms-login.1 ~ REQ-auth.sms-login.5 | agent | change: add-sms-login |
