# Review Checklist

本文件定义 `spec-craft` 各阶段的评审清单，分三档：

- **standard**：格式与结构正确
- **thorough**：需求覆盖度 + 一致性 + 冲突检查
- **off**：仅 Spike 路径

Agent 在 `06-archive` 阶段应根据 `change.yaml.review.mode` 选择对应清单。

## 1. 分档使用场景

| 路径 | 默认 review mode | 说明 |
|------|------------------|------|
| Spike | off | 不评审 |
| Bounded | standard | 中等 |
| Architectural | thorough | 严格 |

用户可以在 `change.yaml.review.mode` 手动覆盖。

## 2. Standard Review Checklist

适用于 Bounded 路径，检查**格式与结构**。

### 2.1 Proposal Review

- [ ] `proposal.md` 存在且非空
- [ ] 背景 / 目标 / Scope In / Scope Out 都有内容
- [ ] Scope Out 明确列出至少 1 项"不做什么"
- [ ] 关联 PRD 路径已登记在 `change.yaml.prd_inputs`

### 2.2 Delta Review

- [ ] 每个 `delta/{domain}/{atom}.md` 存在且非空
- [ ] Requirement 有 RFC 2119 关键词（MUST / SHALL / SHOULD / MAY）
- [ ] Scenario 有 GIVEN / WHEN / THEN 结构
- [ ] 无模糊词（快速、高效、友好、合理）

### 2.3 Tasks Review

- [ ] 每个 `tasks/{domain}/{atom}.md` 存在
- [ ] 每个 task 有编号 T-n
- [ ] 每个 task 有 Verification 类型
- [ ] 无循环依赖

### 2.4 Change.yaml Review

- [ ] `path` 是合法枚举值
- [ ] `status` 是合法枚举值
- [ ] `atoms[]` 与 `delta/`、`tasks/` 路径一致
- [ ] `tasks.confirmed` 状态与实际用户确认一致

## 3. Thorough Review Checklist

在 standard 基础上，增加**需求覆盖度**、**一致性**与**冲突检查**。

### 3.1 Proposal Review（追加）

- [ ] Scope In 的每项都对应 delta 中的某个 Requirement
- [ ] Scope Out 与 PRD 的"不做"部分一致
- [ ] 影响范围列出的模块确实存在（读源码验证）

### 3.2 Delta Review（追加）

- [ ] 每个 Requirement 至少 1 个 Scenario
- [ ] 每个 Scenario 可测试（无歧义断言）
- [ ] Requirement 编号连续（无跳号、无复用）
- [ ] Scenario 编号与父 Requirement 关联（SC-n.m 中的 n 对应 REQ-n）
- [ ] 每个 Requirement 强度（MUST / SHALL）与业务重要性匹配
- [ ] 关键 Requirement 有 MUST，非关键 Requirement 用 SHOULD 或 MAY

### 3.3 Tasks Review（追加）

- [ ] 每个 delta 的 Scenario 至少被 1 个 task 覆盖
- [ ] 无覆盖不足的 Requirement（所有 SC 都被测试）
- [ ] task 粒度合适（每个 task 一个可测行为）
- [ ] task 顺序 topological 合法（无循环）
- [ ] 关键路径 task 类型正确（如核心逻辑用 unit-test）

### 3.4 Design Review（追加）

- [ ] 技术选型有 ADR 记录
- [ ] 集成点列表覆盖所有可能改动的文件
- [ ] 与既有代码无冲突（如不引入重复实现）
- [ ] 非功能性需求至少覆盖性能、安全、可观测性中的 2 项

### 3.5 一致性检查（追加）

- [ ] 新 atom 的命名与既有 atom 一致
- [ ] 术语与既有 atom 一致（如"用户"vs"账户"）
- [ ] 编号规范一致（REQ / SC 命名规则）

### 3.6 冲突检查（追加）

- [ ] 与既有 atom 无逻辑冲突（如不重复定义相同行为）
- [ ] 与既有 change 无路径冲突（如有活跃 change 修改同一 atom，需协调）
- [ ] 与既有 API 无破坏性冲突（不修改既有接口签名）

### 3.7 PRD 追溯检查（追加）

- [ ] PRD 中提到的所有功能点都在 delta 中有对应 Requirement
- [ ] PRD 中提到的所有边界都在 delta 中有对应 Scenario
- [ ] PRD 中的"不做"部分都在 proposal 的 Scope Out 中
- [ ] 无编造：所有需求都能追溯到 PRD 或用户对话

### 3.8 边界与异常检查（追加）

- [ ] 关键场景覆盖了正常流程 + 常见错误 + 边界值
- [ ] 安全相关场景有明确断言（权限、认证、授权）
- [ ] 数据完整性场景有事务性断言

## 4. Off Review Checklist

仅 Spike 路径使用。

- [ ] 探针结论有简短报告（3-5 段）
- [ ] 明确"能不能 / 值不值得"的结论
- [ ] 若代码要保留，说明升级路径

## 5. Archive Review Checklist

`06-archive` 阶段专用，检查**归档准备就绪**。

### 5.1 前置检查

- [ ] 所有 tasks checkbox 已勾完
- [ ] 所有测试通过
- [ ] 用户已确认功能符合预期
- [ ] `change.yaml.tasks.confirmed == true`
- [ ] `change.yaml.tasks.complete == true`

### 5.2 Delta 就绪

- [ ] 所有 delta 文件非空
- [ ] 所有 Requirement 完整（无占位符）
- [ ] 所有 Scenario 完整
- [ ] Change History 表准备好（将追加新行）

### 5.3 Atom 合并检查

- [ ] ADDED：目标 atom 不存在，将新建
- [ ] MODIFIED：既有 atom 存在，将追加或修改 Requirement
- [ ] REMOVED：既有 atom 存在，将标记弃用

### 5.4 归档准备

- [ ] 归档日期已确定
- [ ] commit message 已准备
- [ ] specs/README.md 已准备好更新

### 5.5 后续准备

- [ ] 无未关闭的 open_questions
- [ ] 所有 [待确认] 项都已回答

## 6. 使用方式

Agent 在各阶段完成时，应主动选择对应 checklist 检查：

```
1. 判断当前阶段（propose / design / tasks / apply / archive）
2. 读取 change.yaml.review.mode
3. 选择对应清单（standard / thorough / off）
4. 逐项检查，输出 checklist 结果
5. 未通过项要求修复或标注
```

## 7. 输出格式

Agent 输出 review 结果时，用以下格式：

```markdown
## Review 结果: propose / standard

### 通过项 (10/12)
- [x] proposal.md 存在且非空
- [x] 背景 / 目标 / Scope In / Scope Out 都有内容
- ...

### 未通过项 (2)
- [ ] Scope Out 至少 1 项  ← 请补充"不做什么"
- [ ] 关联 PRD 已登记  ← 请在 change.yaml.prd_inputs 补充

### 建议
修复未通过项后可进入下一阶段。
```

## 8. 各阶段与 Review 的映射

| 阶段 | 使用的 Review | 阻塞性 |
|------|--------------|--------|
| 01-explore | 无 | 不阻塞 |
| 02-propose | Proposal Review + Delta Review + Change.yaml Review | 阻塞 |
| 03-design | Design Review | 阻塞（可 skip） |
| 04-tasks | Tasks Review | 阻塞 |
| 05-apply | 阶段内 TDD 循环自检 | 阻塞每个 task |
| 06-archive | Archive Review | 阻塞 |

## 9. Review 与 Guard 的关系

- **Review checklist**：由 agent 或用户主动执行，判断"内容是否好"
- **Guard 脚本**：由 agent 在阶段切换时自动执行，判断"结构是否合法"

两者互补：

- Guard 失败 = 结构错误，必须修复
- Review 未通过 = 内容问题，需修复或明确例外

## 10. 常见 review 场景

### 场景 1：Scope Out 缺失

**症状**：proposal 只有 Scope In，没有 Scope Out。

**问题**：容易导致 scope creep。

**修复**：至少写 1 条"本 change 不涉及 XXX"，防止误解。

### 场景 2：Scenario 覆盖率不足

**症状**：某个 Requirement 只有"正常流程"的 Scenario，没有错误场景。

**问题**：实现阶段无法验证错误处理。

**修复**：为每个 MUST 级别 Requirement 添加至少一个错误 Scenario。

### 场景 3：Task 覆盖不到 Scenario

**症状**：某个 SC 在 tasks 中找不到对应 task。

**问题**：验收时该场景无法保证实现。

**修复**：补一个 task，或在 delta 中标注"该 SC 由其他 task 覆盖"。

### 场景 4：既有 atom 冲突

**症状**：新 delta 的某 Requirement 与既有 atom 的 Requirement 描述同一行为。

**问题**：真相源可能产生矛盾。

**修复**：
- 若新 delta 是 MODIFIED → 明确指向基线 Requirement
- 若新 delta 是 ADDED → 检查是否需要合并到既有 atom

### 场景 5：模糊词

**症状**：Requirement 或 Scenario 中出现"快速"、"高效"、"友好"等词。

**问题**：无法验证。

**修复**：替换为具体数值或断言（如"快速"→"P95 < 500ms"）。
