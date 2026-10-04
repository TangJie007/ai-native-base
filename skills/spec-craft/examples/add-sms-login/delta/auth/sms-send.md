# Delta: auth/sms-send

> 本文件描述相对 `specs/atom/auth/sms-send.md` 的需求增量。
> 本 atom 是新增（ADDED），因此 delta 内容即为完整的初始 spec。

## Purpose

支持用户请求发送登录验证码到指定手机号。系统负责格式校验、频率限制、验证码生成与短信投递。

## Change Type

- [x] ADDED — 新增 atom
- [ ] MODIFIED — 修改既有 Requirement
- [ ] REMOVED — 弃用某些 Requirement

## Requirements

### REQ-auth.sms-send.1: 手机号格式校验

**Keywords**: MUST
**Operation**: ADDED

系统 MUST 拒绝非 11 位中国大陆手机号格式的输入。

#### Scenarios

##### SC-1.1: 合法手机号

- **GIVEN** phone 参数为 11 位数字且以 1 开头
- **WHEN** 用户 POST /api/auth/sms-send { phone: "13800000000" }
- **THEN** 手机号校验 MUST 通过
- **AND THEN** 系统 MUST 继续执行后续流程

##### SC-1.2: 非数字

- **GIVEN** phone 参数含字母或符号
- **WHEN** 用户 POST /api/auth/sms-send { phone: "13800000abc" }
- **THEN** 接口 MUST 返回 HTTP 400
- **AND THEN** 响应 body.error.code MUST 为 "E_INVALID_PHONE"

##### SC-1.3: 位数不足

- **GIVEN** phone 参数少于 11 位
- **WHEN** 用户 POST /api/auth/sms-send { phone: "1380000000" }
- **THEN** 接口 MUST 返回 HTTP 400
- **AND THEN** 响应 body.error.code MUST 为 "E_INVALID_PHONE"

### REQ-auth.sms-send.2: 频率限制

**Keywords**: MUST
**Operation**: ADDED

系统 MUST 限制同一手机号在 60 秒内最多发送 1 次验证码。

#### Scenarios

##### SC-2.1: 首次发送

- **GIVEN** 该手机号在过去 60 秒内未发送过验证码
- **WHEN** 用户 POST /api/auth/sms-send { phone }
- **THEN** 频率限制检查 MUST 通过
- **AND THEN** 系统 MUST 继续执行后续流程

##### SC-2.2: 触发限制

- **GIVEN** 该手机号在过去 60 秒内已发送过 1 次验证码
- **WHEN** 用户再次 POST /api/auth/sms-send { phone }
- **THEN** 接口 MUST 返回 HTTP 429
- **AND THEN** 响应 body.error.code MUST 为 "E_RATE_LIMITED"
- **AND THEN** 数据库中 SmsCode 表 MUST NOT 新增记录

### REQ-auth.sms-send.3: 验证码生成与存储

**Keywords**: MUST
**Operation**: ADDED

系统 MUST 生成 6 位数字验证码并加密存储到数据库，5 分钟后过期。

#### Scenarios

##### SC-3.1: 成功生成

- **GIVEN** 手机号格式合法且未触发频率限制
- **WHEN** 系统执行验证码生成
- **THEN** 生成的 code MUST 为 6 位数字（0-9）
- **AND THEN** 数据库中 SmsCode 表 MUST 新增一条记录
- **AND THEN** 记录的 expiresAt MUST 为 now + 300 秒
- **AND THEN** 记录的 usedAt MUST 为 null
- **AND THEN** 记录的 codeHash MUST 为 SHA-256(phone + code + salt)

##### SC-3.2: 生成唯一性

- **GIVEN** 系统连续生成 1000 次验证码
- **WHEN** 检查生成结果
- **THEN** 每次 code MUST 通过随机数生成器（如 crypto.randomInt）
- **AND THEN** 不应有连续两次 code 相同（概率极低，允许）

### REQ-auth.sms-send.4: 短信发送

**Keywords**: SHALL
**Operation**: ADDED

系统 SHALL 通过短信服务商将验证码发送给用户，失败时应重试一次。

#### Scenarios

##### SC-4.1: 发送成功

- **GIVEN** 短信服务商 API 返回 200 与 { sid: "..." }
- **WHEN** 系统调用 SmsProvider.send(phone, template, code)
- **THEN** 系统 MUST 返回 HTTP 200
- **AND THEN** 响应 body.expiresAt MUST 为验证码过期时间（ISO 8601）
- **AND THEN** 系统日志 MUST 记录一条 INFO 级别条目，含 phone（脱敏）、sid、duration

##### SC-4.2: 发送超时重试

- **GIVEN** 首次调用短信服务商超时（> 5 秒）
- **WHEN** 系统触发重试
- **THEN** 系统 MUST 重试 1 次
- **AND THEN** 若重试成功，返回 HTTP 200
- **AND THEN** 若重试失败，返回 HTTP 503，错误码 E_PROVIDER_UNAVAILABLE

##### SC-4.3: 服务商不可用

- **GIVEN** 短信服务商返回 HTTP 5xx
- **WHEN** 系统调用 SmsProvider.send
- **THEN** 系统 MUST 重试 1 次
- **AND THEN** 若仍失败，返回 HTTP 503
- **AND THEN** 响应 body.error.code MUST 为 "E_PROVIDER_UNAVAILABLE"
- **AND THEN** 数据库中 SmsCode 记录 MUST 被保留（用户下次可直接使用同一验证码，若未过期）

### REQ-auth.sms-send.5: IP 风控

**Keywords**: SHOULD
**Operation**: ADDED

系统 SHOULD 记录发送时的 IP，用于风控统计。

#### Scenarios

##### SC-5.1: 记录 IP

- **GIVEN** 请求含 IP 头（X-Forwarded-For 或 remoteAddr）
- **WHEN** 系统创建 SmsCode 记录
- **THEN** SmsCode.ip 字段 MUST 被设置为该 IP

## Non-Goals

- 不处理国际手机号（本 change 仅支持中国大陆 +86 的 11 位数字）
- 不处理短信模板的多语言版本
- 不做图形验证码兜底（暴力破解防护下版本）
- 不处理多服务商降级切换（下版本再实现）

## Change History

| Date | Change | By | Ref |
|------|--------|----|-----|
| 2026-10-04 | ADDED REQ-auth.sms-send.1 ~ REQ-auth.sms-send.5 | agent | change: add-sms-login |
