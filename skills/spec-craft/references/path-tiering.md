# 路径分级决策

本文件定义 Spike / Bounded / Architectural 三档路径的决策规则、适用场景与升级策略。

## 1. 三档总览

| 维度 | **Spike** | **Bounded** | **Architectural** |
|------|-----------|-------------|-------------------|
| **定义** | 可行性探针 | 单点修改 | 完整功能 |
| **典型规模** | 探索性 | 1-5 文件改动 | 10+ 文件、多模块 |
| **建 change？** | 可选（最小 change.yaml） | 是 | 是 |
| **走 propose？** | 否 | 是（简化） | 是（完整） |
| **走 design？** | 否 | 可选（skip） | 是 |
| **走 tasks？** | 否 | 是 | 是 |
| **走 apply？** | 是（throwaway） | 是 | 是 |
| **走 archive？** | 是（若留痕） | 是（若行为变更） | 是 |
| **用户确认** | 口头 | 聊天内 2-3 句 | 每步书面确认 |
| **产出保留** | 通常丢弃 | 部分保留 | 完整保留 |

## 2. 决策树

Agent 接到需求后，按顺序问：

```
Q1: 需求涉及"能不能"、"试一下"、"能不能支持 XXX"、"技术上可行吗"？
├─ 是 → 【Spike】
└─ 否 → Q2

Q2: 是否只影响一个 atom 或一个接口？
├─ 是 → Q2.1
│      Q2.1: 是否涉及 PRD 中的新功能点？
│      ├─ 是 → 【Architectural】
│      └─ 否 → 【Bounded】
└─ 否 → Q3

Q3: 是否涉及跨模块、跨 atom、或 PRD 驱动？
├─ 是 → 【Architectural】
└─ 否 → Q4

Q4: 是否涉及行为变更（用户可见）？
├─ 是 → 【Bounded】（保守升级）
└─ 否 → 【Bounded】（技术重构，无行为变化）
```

## 3. Spike 详细规则

### 适用场景

- "能不能用 Redis 缓存？"
- "这个 SDK 是否支持 XXX？"
- "试试这个新框架怎么样？"
- "POC：用 AI 生成用户头像可行吗？"

### 流程

1. **口头方案**：与用户确认探针方案（不建 change 目录）
2. **实现**：写 throwaway 代码（明确标注 `// THROWAWAY`）
3. **验证**：跑通 / 跑不通，记录结果
4. **输出**：一份简短报告（3-5 段），回答"能不能 / 值不值得"
5. **归档**：
   - 若代码要保留 → **升级为 Bounded 或 Architectural**，重建完整 artifact
   - 若代码丢弃 → 直接删除 throwaway 代码

### 特殊规则

- Spike **不阻塞**其他工作
- Spike 代码**不进主分支**（用独立分支或 worktree）
- Spike 结论**不直接**变成 spec

### 若需要留痕

极简 change.yaml：

```yaml
name: spike-redis-cache
path: spike
created: 2026-10-04
status: proposed
description: 探索 Redis 缓存方案
atoms: []
tasks:
  confirmed: false
  complete: false
archive:
  at: 2026-10-04
  commit: null
  reviewer: null
```

## 4. Bounded 详细规则

### 适用场景

- 修改一个接口的返回字段
- 调整一个配置值（如 session TTL）
- 修复一个非核心的 bug
- 给一个组件加一个 UI 元素
- 单 atom 内的行为微调

### 流程

1. **分类**：口头告诉用户"Bounded 路径"
2. **简化 propose**：
   - 建 `change.yaml`（`path: bounded`）
   - 建最小 `proposal.md`（3-5 行）
   - **可选** delta（若无行为变更则跳过）
   - 用户确认
3. **跳过 design**：`change.yaml.design.skipped: true`，填理由
4. **建 tasks**：`tasks/{domain}/{atom}.md`，通常 3-8 个 task
5. **apply**：TDD 实现
6. **archive**：若有行为变更则合并到 atom；若无变更则只记录到 changes/archive/

### Bounded 特殊规则

- **单一 atom 原则**：只影响一个 atom
- **单一模块原则**：通常只改一个模块（前后端其一）
- **无 API 破坏**：不修改既有接口的兼容性
- **无数据迁移**：不涉及数据库 schema 变更（若涉及则升级为 Architectural）

### 何时升级为 Architectural

- 发现影响 2 个以上 atom
- 发现需要修改 API 签名（破坏性）
- 发现需要修改数据库 schema
- 发现涉及安全、合规、性能指标
- 实现过程中预估工作量 > 3 天

## 5. Architectural 详细规则

### 适用场景

- PRD 中的新功能
- 跨模块的架构调整
- 数据库 schema 变更
- 破坏性 API 变更
- 涉及安全、合规、性能的关键路径
- 影响 3+ 文件的复杂改动

### 流程

完整 6 阶段：

1. **explore**（可选）：需求澄清
2. **propose**：完整 change.yaml + proposal.md + delta/
3. **design**：技术设计 + ADR
4. **tasks**：完整 TDD 拆解
5. **apply**：TDD 实现
6. **archive**：合并到真相源

### Architectural 特殊规则

- **每步用户确认**：propose → design → tasks 每一步都需要用户明确确认
- **完整 artifact**：change.yaml、proposal.md、design.md、delta/、tasks/ 全部填写
- **不允许 scope creep**：Scope Out 明确写不做什么
- **不允许跳过阶段**：即使小改动也不能跳过 design

## 6. 升级规则

### 单向升级

```
Spike ──► Bounded ──► Architectural
```

### 触发条件

- **实现过程中发现影响面扩大** → 立即升级
- **发现需求理解错误** → 回退到 propose，重新分级
- **发现技术选型有重大风险** → 升级为 Architectural（补 ADR）

### 升级流程

1. 停止当前阶段的动作
2. 更新 `change.yaml.path`（新值）
3. 补写缺失的 artifact（如 Bounded 升 Architectural 需补 design.md）
4. 通知用户已升级，等待确认
5. 恢复执行

### 禁止降级

- ❌ Architectural 不能降级为 Bounded
- ❌ Bounded 不能降级为 Spike

原因：一旦写了完整 artifact，成本已付出，应继续完成而非回退。

## 7. 常见错误

### ❌ 把新功能做成 Bounded

**症状**：新接口、新 atom、新数据表都塞在 Bounded 里。

**问题**：缺少 design.md 导致实现无方向，缺少 delta 导致 spec 更新滞后。

**修复**：只要涉及新 atom / 新接口 / 新数据，一律走 Architectural。

### ❌ 把探索性任务做成 Architectural

**症状**：只是想了解某个技术，但走了完整流程。

**问题**：浪费大量时间在 spec 与 tasks 上，代码还没写呢。

**修复**：先用 Spike 验证可行性，确认有价值后再升级。

### ❌ 中途降级

**症状**：Architectural 做了一半，觉得"Bounded 就够了"就跳过 design。

**问题**：spec 缺 delta、design 无 ADR，后续维护困难。

**修复**：规则禁止降级，继续完成 Architectural。

### ❌ 忘记升级

**症状**：Bounded 实现中发现影响其他 atom，但继续按 Bounded 做。

**问题**：改动越改越大，最后不得不回退重来。

**修复**：一旦发现影响面扩大，立即升级到 Architectural。

## 8. 快速判断表

给你 5 个任务，判断路径：

| 任务 | 路径 | 理由 |
|------|------|------|
| "改一下 session 过期时间" | Bounded | 单配置项，无行为变更 |
| "加一个手机号验证码登录" | Architectural | 新 atom、新接口、新数据表 |
| "Redis 缓存能不能扛住？" | Spike | 可行性探针 |
| "修一个空指针异常" | Bounded | 单文件修改 |
| "把用户模块从单体拆成微服务" | Architectural | 跨模块架构调整 |

## 9. 与 change.yaml 的关系

`change.yaml.path` 字段直接记录当前分级：

```yaml
path: architectural   # spike | bounded | architectural
```

升级时更新此字段，并保留历史（可在 description 或专门的 `path_history` 字段记录）。

## 10. 检查清单

Agent 分类后自查：

- [ ] 是否问了 3 个决策树问题？
- [ ] 是否明确告知用户当前分级？
- [ ] 是否写入 `change.yaml.path`？
- [ ] 若是 Spike，是否确认不建 change 目录（或建最小版）？
- [ ] 若是 Bounded，是否确认单 atom、无 API 破坏、无数据迁移？
- [ ] 若是 Architectural，是否准备走完整 6 阶段？
