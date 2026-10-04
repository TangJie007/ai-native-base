# change.yaml Schema

本文件定义 `change.yaml` 的字段、类型、合法值与状态机。

## 1. 完整字段

```yaml
# 标识
name: string          # kebab-case，如 add-sms-login
path: enum            # spike | bounded | architectural
created: datetime     # ISO 8601
status: enum          # 见状态机
author: string

# 描述
description: string

# PRD 输入
prd_inputs: array
  - path: string      # 仓库相对路径或 URL
    locate: string    # 章节定位（可选）
    sha256: string    # 内容 hash（可选，用于检测 PRD 变化）

# 影响的 atom
atoms: array
  - domain: string
    atom: string
    operation: enum   # ADDED | MODIFIED | REMOVED
    delta: string     # 相对 change 目录的 delta 路径
    tasks: string     # 相对 change 目录的 tasks 路径
    target: string    # 仓库相对路径的真相源

# 任务状态
tasks: object
  confirmed: boolean  # 用户是否已确认 tasks
  complete: boolean   # 所有 task 是否已完成
  confirmed_at: datetime | null
  completed_at: datetime | null

# 设计
design: object
  skipped: boolean
  skip_reason: string | null
  approved_at: datetime | null

# 待确认项
open_questions: array
  - id: string
    question: string
    asked_at: datetime
    answered: boolean
    answer: string | null

# 归档
archive: object
  at: datetime | null
  commit: string | null
  reviewer: string | null
```

## 2. 状态机

```
proposed
   │
   ▼
designing ────────────────► (若 design.skipped = true，直接跳到 implementing)
   │
   ▼
implementing
   │
   ▼
review (可选)
   │
   ▼
archived (终止态)
```

### 状态转换规则

| 当前状态 | 可转到 | 触发条件 |
|---------|--------|---------|
| proposed | designing | 用户确认 proposal + delta |
| proposed | implementing | design.skipped = true 且 tasks.confirmed = true |
| proposed | abandoned | 用户取消 |
| designing | implementing | design.approved_at 已设 + tasks.confirmed = true |
| designing | proposed | 修改 proposal / delta 后回退 |
| implementing | review | tasks.complete = true |
| implementing | designing | 发现影响面扩大，回退 |
| implementing | abandoned | 用户取消 |
| review | implementing | 需修改 |
| review | archived | 最终确认 |
| 任何状态 | abandoned | 用户主动放弃 |

### 非法转换

- ❌ proposed → archived（必须经过 design / tasks / implement）
- ❌ archived → 任何状态（终态）
- ❌ abandoned → 任何状态（终态）
- ❌ implementing → proposing（回退只能到 designing）

## 3. path 枚举

### spike
- 适用：可行性探针、技术调研、"能不能"、"试一下"
- 流程：只有对话 + 简短报告，不建 change 目录（可选最小 change.yaml）
- 门禁：无

### bounded
- 适用：单 atom 小改动、改字段、改配置、修接口
- 流程：change.yaml + tasks/ 即可，可选 delta，可选 design（skip）
- 门禁：tasks.confirmed = true

### architectural
- 适用：新功能、PRD 驱动、跨模块
- 流程：完整 6 阶段
- 门禁：tasks.confirmed = true + tasks.complete = true

### 单向规则

```
spike ──► bounded ──► architectural
```

升级不可逆。发现 spike 需要保留代码 → 升级为 bounded 或 architectural，重建完整 artifact。

## 4. operation 枚举

- **ADDED**：该 atom 首次出现，`delta` 完整描述
- **MODIFIED**：既有 atom 修改，`delta` 只描述差异
- **REMOVED**：该 atom 或部分 Requirement 弃用，`delta` 注明弃用原因

## 5. ADR-lite 格式（用于 design.md）

```markdown
### ADR-<n>: <决策标题>

**背景**：<为什么需要这个决策>

**决策**：<选择了什么>

**理由**：<为什么选这个>

**权衡**：<被否决的选项及理由>

**后续**：<如果决策错了怎么办>
```

**何时需要 ADR**：

- 技术选型（框架、语言、数据库）
- 架构模式（同步 vs 异步、单体 vs 微服务）
- 关键权衡（性能 vs 成本、灵活 vs 简单）
- 破坏性变更（API 变更、数据迁移）

**何时不需要**：

- 遵循项目既有惯例
- 明显的最佳实践
- 纯技术细节（如具体库的版本）

## 6. 校验规则

Guard 脚本 `validate-change-yaml.py` 会检查：

- [ ] `name` 非空且 kebab-case
- [ ] `path` 是合法枚举值
- [ ] `status` 是合法枚举值
- [ ] `created` 是合法 ISO 日期
- [ ] `prd_inputs` 至少一条（除 spike 路径外）
- [ ] `atoms` 至少一条（除 spike 路径外）
- [ ] 每个 `atoms[].operation` 是合法枚举值
- [ ] 每个 `atoms[].delta` 与 `atoms[].tasks` 路径存在或即将创建
- [ ] 每个 `atoms[].target` 路径合法

## 7. 常见问题

**Q: 一个 change 里可以包含多个不相关的改动吗？**

A: 不推荐。每个 change 应该聚焦一个业务主题。多个不相关改动应拆成多个 change，即使它们一起实施。

**Q: `tasks.confirmed` 是用户确认整个 change 还是确认 tasks？**

A: 只确认 tasks。proposal / delta / design 分别在各自阶段确认。

**Q: 中途发现需求理解错误怎么办？**

A: 停止当前阶段，回退到 propose，更新 delta。`change.yaml.status` 可回退到 `proposed`（若仍在 design 之前）或 `designing`（若已在 implement 阶段发现，需升级 path 或重写 tasks）。

**Q: 多个 change 修改同一 atom 怎么办？**

A: 以最新 PRD 为准，最新的 change 应重新读既有 atom 与所有相关 delta，然后 archive 时合并所有变更。
