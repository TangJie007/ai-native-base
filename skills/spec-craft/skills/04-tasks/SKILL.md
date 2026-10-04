---
name: tasks
stage: 4
previous: 03-design
next: 05-apply
produces:
  - specs/changes/{name}/tasks/**/*.md
requires_confirm: true
---

# 04-tasks：拆解 TDD 任务

## 何时进入

- design 已完成且用户已确认（或 Bounded 路径跳过 design 直接进入）
- 路径分级为 Bounded 或 Architectural

## Iron Law

1. **一个 task 对应一个可测行为**：不能写"实现登录功能"，要写"实现手机号 + 验证码登录 API 返回 200"
2. **task 粒度以 TDD 循环为单位**：写一个能独立红绿的测试
3. **task 顺序必须可执行**：不能颠倒依赖
4. **未获用户确认不进入 apply**（阻塞下一阶段）
5. **未确认不写代码**：本阶段仍不写 `src/`，只写 `tasks/*.md`

## 步骤

### 1. 读 delta 与 design

- `delta/{domain}/{atom}.md` 的 Requirements + Scenarios
- `design.md` 的接口与集成点
- 每个 Scenario 至少对应一个 task

### 2. 建 tasks/{domain}/{atom}.md

复制 `../../templates/tasks-atom.md` 到对应路径，填：

- **每个 task 的编号**：`T-{domain}.{atom}.{n}`
- **关联的 Requirement**：`T-1 covers REQ-auth.sms-login.1`
- **任务描述**：动词开头，具体可测
- **验收方式**：单元测试 / 集成测试 / 手动验证
- **依赖**：前置 task 编号（若需要）
- **预估复杂度**：S / M / L（用于用户判断粒度）

### 3. Task 拆分规则

**粒度检查**（每个 task 必须过）：

- ✅ 能独立写一个测试并跑红
- ✅ 能独立写最小实现并跑绿
- ✅ 修改范围 < 200 行代码
- ✅ 修改范围 < 5 个文件

**若超出**：继续拆，直到符合粒度。

**Task 类型**：

- `test`：只写测试
- `impl`：写实现
- `refactor`：重构（不改变行为）
- `config`：配置变更
- `docs`：文档更新

### 4. 排列顺序

按依赖关系排列，保证 topological 顺序合法：

```
T-1 [test]   -> T-2 [impl] -> T-3 [test+impl] -> ... -> T-N [refactor]
```

### 5. 关键检查

- **所有 delta 的 Scenario 都被 task 覆盖**：`change.yaml` 里每个 atom 的 delta 场景至少被一个 task 引用
- **无孤儿 task**：每个 task 都对应某个 REQ / SC
- **无循环依赖**

### 6. 请求用户确认

向用户展示：

- Task 总数与预估总工作量
- 关键的 T-M / T-L 粒度任务
- 覆盖到哪些 Requirement / Scenario
- 是否有未覆盖的场景

**用户确认后**：

- 更新 `change.yaml.tasks.confirmed: true`
- 更新 `change.yaml.status: implementing`

## 完成判据

- 每个 atom 都有 `tasks/{domain}/{atom}.md`
- 所有 Scenario 都被 task 覆盖
- 无循环依赖
- `change.yaml.tasks.confirmed == true`
- 用户已明确确认

## 常见错误

- **task 太粗**：一个 task 涵盖多个 Requirement → 无法用 TDD 独立验证
- **task 太细**：拆到"新建文件"这种粒度 → 增加协调成本
- **只写 impl 不写 test**：违背 TDD，`05-apply` 无法执行
- **忘写依赖**：apply 阶段顺序执行时会踩坑
- **忘写验收方式**：无法判断 task 是否完成

## 参考

- TDD 循环：`../../references/tdd-loop.md`
- Review checklist：`../../references/review-checklist.md §Tasks Review`

## 下一步

用户确认后 → `../05-apply/SKILL.md`
