# Proposal: add-sms-login

> 本文件说明「为什么做」与「做什么 / 不做什么」。
> 技术实现细节见 `design.md`。

## 背景

用户当前只能通过邮箱 + 密码登录系统，存在以下痛点：

1. 新用户需注册账号并记密码，流失率高
2. 老用户忘记密码时只能走邮箱找回流程，恢复时间长
3. 移动端输入密码体验差

PRD.md §3.1 提出新增「手机号验证码登录」能力，作为主登录方式的补充。

## 目标

- 新用户可用手机号验证码一次性登录，无需注册
- 老用户可用手机号验证码作为备用登录方式
- 登录接口 P95 < 500ms
- 验证码发送成功率 ≥ 99%

## Scope In（明确做什么）

- [REQ-1] 新增发送验证码接口，60 秒频率限制
- [REQ-2] 新增验证码登录接口，验证通过后返回 JWT
- [REQ-3] 新用户自动创建账号（手机号作为唯一标识）
- [REQ-4] 老用户（同手机号）返回既有账号 JWT
- [REQ-5] 验证码 5 分钟后过期
- [REQ-6] 错误码规范：E_CODE_INVALID / E_RATE_LIMITED / E_PROVIDER_UNAVAILABLE

## Scope Out / Non-Goals（明确不做什么）

- 本 change **不涉及**第三方 OAuth 登录（如微信、Google）
- 本 change **不支持**国际手机号（下版本再支持）
- 本 change **不处理**账号合并（邮箱账号与手机号账号合并下版本）
- 本 change **不做**图形验证码兜底（暴力破解防护）
- 本 change **不涉及**用户资料的其他字段（头像、昵称等）
- 本 change **不修改**既有邮箱登录流程

## 影响范围

### 涉及的 atom

- `specs/atom/auth/sms-send.md` — ADDED（新增）
- `specs/atom/auth/sms-login.md` — ADDED（新增）

### 涉及的模块（预期）

- `src/backend/auth/` — 新增 SMS 相关 controller/service
- `src/backend/db/schema.prisma` — 新增 SmsCode 表、User.phone 字段
- `src/frontend/components/LoginForm.vue` — 新增 SMS 登录 tab
- `src/frontend/stores/auth.ts` — 新增 smsLogin / smsSend action

### 外部依赖

- 阿里云短信服务商 API
- 手机号格式校验（中国大陆 11 位数字）

## 关键风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 短信成本超预算 | 财务 | 每日发送次数限制 + 频率限制 |
| 短信延迟 | 用户体验 | 验证码有效期 5 分钟 |
| 短信服务商不可用 | 系统稳定性 | 降级到备用服务商（本 change 不做，预留接口） |
| 暴力破解 | 安全 | 单 IP 频率限制（下版本图形验证码兜底） |
| 手机号误填 | 用户体验 | 输入时格式校验 |

## 关联 PRD

- `PRD.md` §3.1 — 手机号验证码登录

## 决策记录

详见 `design.md` 中的 ADR-1 / ADR-2 / ADR-3。

## 附录

### 术语表

- **验证码**：6 位数字字符串，通过短信发送给用户的一次性密码
- **SmsCode**：数据库中存储的验证码记录
- **JWT**：JSON Web Token，用于登录后获取的身份凭证
