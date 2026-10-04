---
name: apply
stage: 5
previous: 04-tasks
next: 06-archive
produces:
  - src/**  # 代码
  - specs/changes/{name}/tasks/**/*.md  # 勾选 checkbox
requires_confirm: false  # 阶段内每个 task 自己走 TDD 循环
blocked_by:
  - change.yaml.tasks.confirmed == true
  - change.yaml.tasks.complete == false
---

# 05-apply：TDD 实现

## 何时进入

- `change.yaml.tasks.confirmed == true`（用户已确认 tasks）
- `change.yaml.tasks.complete == false`

## Iron Law（最严格的阶段）

1. **未确认不写代码**：`tasks.confirmed != true` 时**禁止**执行本阶段
2. **红绿重构严格顺序**：RED → 确认 FAIL → GREEN → 确认 PASS → REFACTOR
3. **一次一个 task**：不允许"批量实现然后统一补测试"
4. **测试先于实现**：写实现前先写会失败的测试
5. **不跳过 refactor**：GREEN 后必须 refactor（即使只是重命名）
6. **每个 task 一个 checkbox**：完成一个勾一个，不要延迟勾选
7. **不修改未授权的代码**：`design.md` 集成点列表之外的文件不动

## 前置检查（Agent 必须在开始前执行）

```bash
# 1. 校验 tasks.confirmed
grep "confirmed: true" specs/changes/{name}/change.yaml

# 2. 校验 change.yaml.tasks 完整
python guard/validate-change-yaml.py specs/changes/{name}/change.yaml
```

任一检查失败 → 拒绝进入 apply。

## 步骤（每个 task 重复）

对 `tasks/{domain}/{atom}.md` 中的每个未勾选 task：

### 1. RED — 写失败测试

- 根据 task 的验收方式（unit / integration / manual）
- 写测试代码，运行，**确认失败**
- 失败原因必须是**预期的**（不是类型错误、导入错误等"意外失败"）

```bash
npm test -- test/path/to/new.test.ts   # 或对应框架的命令
```

若失败原因不是预期 → **停**，先修复测试代码。

### 2. GREEN — 写最小实现

- 只写让测试通过的**最少代码**
- 不做优化、不重构、不"顺手加功能"
- 运行测试，**确认通过**

### 3. REFACTOR — 重构

- 保持测试通过的前提下，改善代码
- 重命名、提取函数、消除重复
- 每次修改后运行测试，**确认仍通过**

### 4. 勾选 checkbox

在 `tasks/{domain}/{atom}.md` 里把 `[ ]` 改成 `[x]`。

### 5. （可选）commit

- 建议每个 task 一次 commit，信息格式：`feat(<atom>): <task 摘要> (T-n)`
- 或每 3-5 个 task 批量 commit

## 特殊情况处理

### 测试无法先写

极少数场景（如纯配置变更、SQL migration）无法写传统测试：

- 在 task 的验收方式写"手动验证"或"脚本验证"
- RED 阶段用一份「预期行为清单」代替测试，人工核对
- GREEN 阶段跑实际命令验证

### 测试通过但 refactor 破坏行为

若 refactor 导致测试失败：

- 撤销 refactor，重新设计
- 或者补充测试覆盖 refactor 后的新行为

### 发现需求理解错误

若实现过程中发现 delta 写错：

1. **停止实现**
2. **回退到 propose** 阶段，更新 delta
3. 用户确认后重新 design / tasks
4. 不要"边写边改"

### 发现影响面超出预期

若发现影响其他 atom 或需要更多改动：

1. **停止 apply**
2. **升级路径分级**：Bounded → Architectural
3. 补 design 与 tasks
4. 用户确认后继续

## 完成判据

所有 task checkbox 全部勾选（`[x]`）：

- `grep -c '\[ \]' tasks/**/*.md` 应为 0
- 所有测试通过：`npm test` 或对应命令
- `change.yaml.tasks.complete: true`（agent 或用户手动更新）

## 常见错误

- **批量实现后统一补测试**：违背 TDD，测试无法反映真实设计决策
- **实现比测试多得多**：说明测试不够细，回到 04-tasks 阶段重拆
- **跳过 refactor**：代码会腐化，测试仍通过但难维护
- **勾选太快**：`[x]` 应该在 test + refactor 都完成后才勾
- **修改未授权文件**：违反设计边界，应回退并回 04-tasks 补设计

## 参考

- TDD 循环：`../../references/tdd-loop.md`
- 集成点检查：`../../references/review-checklist.md §Implementation Review`

## 下一步

所有 task 完成后 → `../06-archive/SKILL.md`
