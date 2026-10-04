# Proposal: <change-name>

> 本文件说明「为什么做」与「做什么 / 不做什么」。
> 技术实现细节见 `design.md`。

## 背景

<一段话说明为什么现在要做这件事：业务需求、用户痛点、外部依赖、时间节点等>

## 目标

- 完成本 change 后，用户/系统能够：<具体可验证的结果>
- 相关的业务指标（可选）：<指标变化预期>

## Scope In（明确做什么）

- [REQ-1] <Requirement 摘要>
- [REQ-2] <Requirement 摘要>
- [REQ-3] <Requirement 摘要>

## Scope Out / Non-Goals（明确不做什么）

**这一节至关重要**，用于防止范围蔓延：

- 本 change 不涉及：<明确排除项>
- 本 change 不处理：<暂缓的能力>
- 本 change 不修改：<不动的模块或行为>

## 影响范围

### 涉及的 atom

- `specs/atom/auth/sms-login.md` — ADDED
- `specs/atom/user/session.md` — MODIFIED（延长 session 过期时间）

### 涉及的模块（预期）

- `src/backend/auth/`
- `src/frontend/components/LoginForm.vue`

### 外部依赖

- 短信服务商 API（如阿里云 SMS）
- 用户手机号的合规审查

## 关键风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 短信成本超预算 | 财务 | 每日发送次数限制 |
| 短信延迟导致登录失败 | 用户体验 | 验证码有效期 5 分钟 |
| 短信服务商 API 限流 | 系统稳定性 | 降级到备用服务商 |

## 关联 PRD

- `PRD.md` §3.1 — 手机号验证码登录

## 决策记录

详见 `design.md` 中的 ADR 段落。

## 附录

### 术语表

- <term>: <definition>
