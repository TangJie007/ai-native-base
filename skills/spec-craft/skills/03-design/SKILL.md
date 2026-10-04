---
name: design
stage: 3
previous: 02-propose
next: 04-tasks
produces:
  - specs/changes/{name}/design.md
requires_confirm: true
---

# 03-design：定义「怎么做」

## 何时进入

- propose 已完成且用户已确认
- 路径分级为 Bounded 或 Architectural
- **Spike 不走本阶段**

## 何时跳过

- **Bounded 小改动**（改 TTL、加一个字段、修一个接口）可以跳过 design，直接进入 tasks
- 但要在 `change.yaml` 里显式记录 `design.skipped: true` 与理由

## Iron Law

1. **未读代码不 design**：设计必须基于对现状的理解
2. **不写业务需求**：本阶段不重新讨论"要什么"，只讨论"怎么做"
3. **不写具体代码**：写关键伪码 / 接口签名 / 数据结构即可
4. **未获用户确认不进入 tasks**

## 步骤

### 1. 读代码现状

- 相关 atom 的既有实现（若存在）
- 相关模块的架构（读关键文件）
- 相关接口 / 数据模型

### 2. 建 design.md

复制 `../../templates/design.md`，填：

- **概述**：一段话说明技术方案
- **技术选型**：为什么选 A 不选 B（列出被否决的方案与理由）
- **接口设计**：关键 API 签名（伪码或 IDL）
- **数据结构**：核心 entity / DTO 定义
- **时序 / 流程**：关键调用链（可选 ASCII 或 Mermaid）
- **边界与异常**：错误码、异常场景处理
- **与既有代码的集成点**：文件级 diff 预期（列出会改的文件）
- **风险与权衡**：已知 trade-off

### 3. 关键决策记录（ADR-lite）

对每个**非显而易见**的技术决策，写一段 ADR：

```
## ADR: <决策标题>

**背景**：<为什么需要这个决策>
**决策**：<选择了什么>
**理由**：<为什么选这个>
**权衡**：<被否决的选项及理由>
**后续**：<如果决策错了怎么办>
```

### 4. 请求用户确认

向用户展示：

- 技术选型摘要
- 关键 ADR
- 集成点列表（会改哪些文件）
- 已知的风险

**用户确认后**：

- 更新 `change.yaml.status`：`proposed` → `designing`（或 `implementing`）
- 设置 `change.yaml.design.approved_at`

## 完成判据

- `design.md` 存在且非空
- 用户已明确确认
- `change.yaml.status` 已更新
- **未**修改 `src/`

## 常见错误

- **过度设计**：本阶段不要重构不相关的代码；只写与本次 change 相关的设计
- **忽略非功能性需求**：性能、安全、可观测性、可扩展性至少各问一遍
- **不写被否决的方案**：ADR 的价值在于记录「为什么不是 XXX」
- **过早写代码细节**：写接口签名即可，具体实现留给 apply

## 参考

- ADR 通用格式：`../../references/change-yaml-schema.md §ADR`
- 集成点检查：`../../references/review-checklist.md §Design Review`

## 下一步

用户确认后 → `../04-tasks/SKILL.md`
