# Tasks: <domain>/<atom-name>

> 本文件列出该 atom 的 TDD 任务清单。
> 每个 task 对应一个可独立红绿的测试。

## Overview

- 关联的 Requirement：REQ-<domain>.<atom>.<n>
- Task 总数：N
- 预估复杂度：S / M / L
- 关键路径依赖：见每个 task 的 Deps 字段

## Tasks

### T-<n>: <任务描述（动词开头，具体可测）>

- **Type**: test | impl | refactor | config | docs
- **Covers**: REQ-<domain>.<atom>.<n> / SC-<n>.<m>
- **Deps**: T-<n-1>, T-<n-2>  （无依赖则写 `-`）
- **Estimate**: S / M / L
- **Verification**: unit-test | integration-test | manual | script

**Description**:

<详细描述：要写什么测试？要改什么代码？预期结果是什么？>

**Done when**:

- [ ] 测试已写且能跑
- [ ] 实现已写且测试通过
- [ ] Refactor 已做
- [ ] 代码已提交（若需要）

---

### T-<n+1>: <任务描述>

- **Type**: impl
- **Covers**: REQ-<domain>.<atom>.<n>
- **Deps**: T-<n>
- **Estimate**: M
- **Verification**: integration-test

**Description**:

<描述>

**Done when**:

- [ ] ...

---

## Task Order

```
T-1 -> T-2 -> T-3 -> ...
```

## Coverage Check

- [x] REQ-<n>.1 covered by T-1, T-3
- [x] REQ-<n>.2 covered by T-5
- [ ] REQ-<n>.3 covered by T-?   ← 未覆盖，需补充 task
