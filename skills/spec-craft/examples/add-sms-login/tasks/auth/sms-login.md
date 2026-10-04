# Tasks: auth/sms-login

> 本文件列出该 atom 的 TDD 任务清单。
> 每个 task 对应一个可独立红绿的测试。

## Overview

- 关联的 Requirement：REQ-auth.sms-login.1 ~ REQ-auth.sms-login.5
- Task 总数：5
- 预估复杂度：M-L（约 1.5 天）
- 关键路径依赖：见每个 task 的 Deps 字段

## Tasks

### T-5: User.phone 字段扩展与 migration

- **Type**: config + impl
- **Covers**: REQ-auth.sms-login.2
- **Deps**: -（可与 sms-send 的 T-2 并行）
- **Estimate**: S
- **Verification**: integration-test

**Description**:

1. 修改 `schema.prisma`，User 新增 phone（可选唯一）与 phoneVerified 字段
2. 生成 migration
3. 写 `UserRepository.findByPhone(phone)`
4. 单元测试 repository

**Test file**: `test/backend/auth/user.repository.test.ts`

**Impl files**:

- `src/backend/db/schema.prisma`
- `src/backend/db/migrations/20261004_add_sms_support.sql`（与 sms-send T-2 合并）
- `src/backend/auth/user.repository.ts`

**Done when**:

- [x] migration 已应用
- [x] findByPhone 集成测试通过

---

### T-6: 验证码校验逻辑与单元测试

- **Type**: test + impl
- **Covers**: REQ-auth.sms-login.1, SC-1.1 / SC-1.2 / SC-1.3 / SC-1.4
- **Deps**: sms-send 的 T-2
- **Estimate**: M
- **Verification**: unit-test

**Description**:

写 `SmsService.verifyCode(phone, code)`：

1. 查询最近一条未使用未过期的 SmsCode
2. 计算 SHA-256(phone + code + salt) 并比对
3. 校验过期与使用状态

单元测试覆盖 4 个场景（有效 / 错误 / 过期 / 已用）。

**Test file**: `test/backend/auth/sms-login-verify.test.ts`

**Impl file**: `src/backend/auth/sms-service.ts`（verifyCode 方法）

**Done when**:

- [x] verifyCode 单元测试全部通过
- [x] SC-1.1 ~ SC-1.4 都被测试覆盖

---

### T-7: 账号查找或创建逻辑与单元测试

- **Type**: test + impl
- **Covers**: REQ-auth.sms-login.2, SC-2.1 / SC-2.2
- **Deps**: T-5
- **Estimate**: M
- **Verification**: unit-test

**Description**:

写 `SmsService.findOrCreateUser(phone)`：

1. `findByPhone(phone)`
2. 若存在：返回既有 User，确保 phoneVerified = true
3. 若不存在：INSERT 新 User（phoneVerified = true, passwordHash = null）

单元测试覆盖老用户 / 新用户两个场景。

**Test file**: `test/backend/auth/sms-login-user.test.ts`

**Impl file**: `src/backend/auth/sms-service.ts`（findOrCreateUser 方法）

**Done when**:

- [x] findOrCreateUser 单元测试全部通过
- [x] SC-2.1 / SC-2.2 都被测试覆盖

---

### T-8: 完整登录流程（controller + service）

- **Type**: test + impl
- **Covers**: REQ-auth.sms-login.1 / REQ-auth.sms-login.2 / REQ-auth.sms-login.3 / REQ-auth.sms-login.4
- **Deps**: T-6, T-7
- **Estimate**: M
- **Verification**: integration-test

**Description**:

1. 写 `SmsService.login(phone, code)`，串起 verifyCode → findOrCreateUser → markUsed → 生成 JWT
2. 写 `SmsController.login()`，绑定 POST /api/auth/sms-login
3. 集成测试覆盖 SC-1.x / SC-2.x / SC-3.1 / SC-4.1 / SC-4.2

**Test file**: `test/backend/auth/sms-login.test.ts`

**Impl files**:

- `src/backend/auth/sms-service.ts`（login 方法）
- `src/backend/auth/sms-controller.ts`（login 方法）

**Done when**:

- [x] 集成测试全部通过
- [x] 所有 Scenario 都被测试覆盖

---

### T-9: 登录失败锁定（风控）

- **Type**: test + impl
- **Covers**: REQ-auth.sms-login.5, SC-5.1 / SC-5.2
- **Deps**: T-8
- **Estimate**: S
- **Verification**: unit-test

**Description**:

新增 `AccountLockRepository`：

1. 记录每次失败（phone, timestamp）
2. 检查过去 15 分钟内失败次数
3. 达到 5 次返回锁定期结束时间

在 `SmsService.login` 前调用锁定检查。

**Test file**: `test/backend/auth/account-lock.test.ts`

**Impl files**:

- `src/backend/auth/account-lock.repository.ts`
- `src/backend/auth/sms-service.ts`（login 前置检查）

**Done when**:

- [x] account-lock 单元测试全部通过
- [x] SC-5.1 / SC-5.2 都被测试覆盖

---

## Task Order

```
T-5 ──┬──► T-7 ──┬──► T-8 ──► T-9
      │          │
      │          └──┐
      └──► T-6 ────┘
```

拓扑顺序：T-5 → T-6 → T-7 → T-8 → T-9

## Coverage Check

- [x] REQ-auth.sms-login.1 covered by T-6, T-8
- [x] REQ-auth.sms-login.2 covered by T-5, T-7, T-8
- [x] REQ-auth.sms-login.3 covered by T-8
- [x] REQ-auth.sms-login.4 covered by T-8
- [x] REQ-auth.sms-login.5 covered by T-9

## Execution Log

| Task | Status | Commit | Date |
|------|--------|--------|------|
| T-5  | ✅     | q3r4s5t | 2026-10-04 |
| T-6  | ✅     | u6v7w8x | 2026-10-04 |
| T-7  | ✅     | y9z0a1b | 2026-10-04 |
| T-8  | ✅     | c2d3e4f | 2026-10-05 |
| T-9  | ✅     | g5h6i7j | 2026-10-05 |
