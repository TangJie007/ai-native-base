# Tasks: auth/sms-send

> 本文件列出该 atom 的 TDD 任务清单。
> 每个 task 对应一个可独立红绿的测试。

## Overview

- 关联的 Requirement：REQ-auth.sms-send.1 ~ REQ-auth.sms-send.5
- Task 总数：4
- 预估复杂度：M（约 1 天）
- 关键路径依赖：见每个 task 的 Deps 字段

## Tasks

### T-1: 手机号格式校验工具与单元测试

- **Type**: test + impl
- **Covers**: REQ-auth.sms-send.1, SC-1.1 / SC-1.2 / SC-1.3
- **Deps**: -
- **Estimate**: S
- **Verification**: unit-test

**Description**:

写一个 `validatePhone(phone: string): boolean` 工具函数，返回是否为合法中国大陆手机号。规则：

- 长度必须为 11
- 必须以 "1" 开头
- 全部为数字

先写测试，验证合法 / 非法场景，再写实现。

**Test file**: `test/backend/auth/sms-validator.test.ts`

**Impl file**: `src/backend/auth/sms-validator.ts`

**Done when**:

- [x] validatePhone 单元测试全部通过
- [x] SC-1.1 / SC-1.2 / SC-1.3 都被测试覆盖

---

### T-2: SmsCode 数据库表与 repository

- **Type**: config + impl
- **Covers**: REQ-auth.sms-send.3
- **Deps**: -
- **Estimate**: M
- **Verification**: integration-test

**Description**:

1. 修改 `schema.prisma`，新增 SmsCode model
2. 生成 migration
3. 写 `SmsCodeRepository`，封装常用 CRUD：
   - `save(phone, codeHash, expiresAt, ip)`
   - `findLatestByPhone(phone)`（返回最近未使用未过期的）
   - `markUsed(id)`
4. 单元测试 repository 的 SQL 拼装

**Test file**: `test/backend/auth/sms-code.repository.test.ts`

**Impl files**:

- `src/backend/db/schema.prisma`
- `src/backend/db/migrations/20261004_add_sms_support.sql`
- `src/backend/auth/sms-code.repository.ts`

**Done when**:

- [x] migration 已应用
- [x] repository 集成测试全部通过
- [x] schema.prisma 已通过 prisma generate

---

### T-3: 频率限制逻辑与单元测试

- **Type**: test + impl
- **Covers**: REQ-auth.sms-send.2, SC-2.1 / SC-2.2
- **Deps**: T-2
- **Estimate**: S
- **Verification**: unit-test

**Description**:

写 `checkRateLimit(phone)` 方法，查询 SmsCode 表 60 秒内是否有记录。

- 无记录 → 返回 true（允许发送）
- 有记录 → 返回 false（拒绝，触发 E_RATE_LIMITED）

**Test file**: `test/backend/auth/sms-service.test.ts`

**Impl file**: `src/backend/auth/sms-service.ts`

**Done when**:

- [x] checkRateLimit 单元测试全部通过
- [x] SC-2.1 / SC-2.2 都被测试覆盖

---

### T-4: SMS 发送完整流程（controller + service）

- **Type**: test + impl
- **Covers**: REQ-auth.sms-send.3 / REQ-auth.sms-send.4 / REQ-auth.sms-send.5
- **Deps**: T-1, T-2, T-3
- **Estimate**: M
- **Verification**: integration-test

**Description**:

1. 写 `SmsProvider` 接口与 `AliyunSmsProvider` 实现
2. 写 `SmsService.sendCode(phone)`，串起校验 → 频率 → 生成 → 存储 → 发送
3. 写 `SmsController.send()`，绑定 POST /api/auth/sms-send
4. 集成测试覆盖 SC-3.1 / SC-4.1 / SC-4.2 / SC-4.3 / SC-5.1
5. mock SmsProvider 避免真实发送

**Test file**: `test/backend/auth/sms-send.test.ts`

**Impl files**:

- `src/backend/auth/sms-provider.ts`
- `src/backend/auth/sms-service.ts`（sendCode 方法）
- `src/backend/auth/sms-controller.ts`

**Done when**:

- [x] 集成测试全部通过
- [x] 所有 Scenario 都被测试覆盖
- [x] mock SmsProvider 时不发起真实 HTTP 调用

---

## Task Order

```
T-1 ──┬──► T-3 ──┬──► T-4
      │          │
      └──► T-2 ──┘
```

拓扑顺序：T-1 → T-2 → T-3 → T-4（T-1 与 T-2 可并行）

## Coverage Check

- [x] REQ-auth.sms-send.1 covered by T-1
- [x] REQ-auth.sms-send.2 covered by T-3, T-4
- [x] REQ-auth.sms-send.3 covered by T-2, T-4
- [x] REQ-auth.sms-send.4 covered by T-4
- [x] REQ-auth.sms-send.5 covered by T-4

## Execution Log

| Task | Status | Commit | Date |
|------|--------|--------|------|
| T-1  | ✅     | a1b2c3d | 2026-10-04 |
| T-2  | ✅     | e4f5g6h | 2026-10-04 |
| T-3  | ✅     | i7j8k9l | 2026-10-04 |
| T-4  | ✅     | m0n1o2p | 2026-10-04 |
