---
name: spec-craft
description: |
  PRD 驱动的全链路 Spec 工作流。从需求澄清到 TDD 实现再到归档，
  用 specs/atom 作真相源、specs/changes 承载增量、change.yaml 管状态。
version: 1.0.0
language: zh-CN
---

# spec-craft

**一句话**：把 PRD 变成可测试的行为契约，用 change/delta 管理增量，用 TDD 交付实现。

## 何时使用

- 用户明确要「写需求规格」「写 spec」「拆解需求」「评审 PRD」「从 PRD 落地到代码」
- 有正式或半正式的产品文档需要转成可测试的 Requirement + Scenario
- 需要维护一份能追溯「行为随时间演进」的真相源

## 何时不用

- 只有代码实现细节要讨论，无 spec 需求 → 用实现类 skill
- 只想聊 PRD 但没打算留下 artifact → 直接对话
- 已有完备的 spec 系统（如 OpenSpec 已装）→ 不要重复造轮子

## Iron Law（不可违反）

1. **未确认不写代码**：`change.yaml.tasks.confirmed ≠ true` 时禁止改 `src/`
2. **先分类再动手**：进入任何阶段前先分类 Spike / Bounded / Architectural
3. **产出归 `specs/`**：skill 一切写出物只在 `specs/` 下
4. **PRD 读散写聚**：外部 PRD 可任意路径读；spec 产出只能落 `specs/`
5. **路径只升不降**：Spike → Bounded → Architectural，不可逆
6. **未读 PRD 不 propose**：`change.yaml.prd_inputs` 必填，路径可验证

## 阶段与命令

| # | 命令 | 子 skill | 主要产出 | 阻塞 |
|---|------|---------|---------|------|
| 1 | `/spec explore` | `skills/01-explore/SKILL.md` | 对话澄清 | — |
| 2 | `/spec propose` | `skills/02-propose/SKILL.md` | `change.yaml` + `proposal.md` + `delta/` | 用户确认 |
| 3 | `/spec design`  | `skills/03-design/SKILL.md`  | `design.md` | 用户确认 |
| 4 | `/spec tasks`   | `skills/04-tasks/SKILL.md`   | `tasks/{domain}/{atom}.md` | 用户确认 |
| 5 | `/spec apply`   | `skills/05-apply/SKILL.md`   | 代码 + tasks 勾选 | TDD 红绿 |
| 6 | `/spec archive` | `skills/06-archive/SKILL.md` | `specs/atom/` 更新 + 归档 | Guard 通过 |

**路径分级决定走多深**：

- **Spike**：只走 1 → 6，跳过 2–5（无 change 目录）
- **Bounded**：只走 2 → 4 → 6，跳过 1 和 3
- **Architectural**：全 6 阶段，全量 artifact

## 路径分级决策

见 `references/path-tiering.md`。三个关键问题：

1. 任务涉及「能不能 / 试一下」？→ **Spike**
2. 是否只影响单个 atom 或单接口？→ **Bounded**
3. 涉及 PRD 更新、跨模块、跨 atom？→ **Architectural**

## 核心概念

| 概念 | 位置 | 说明 |
|------|------|------|
| **atom** | `specs/atom/{domain}/{atom}.md` | 原子需求单元，真相源 |
| **change** | `specs/changes/{name}/` | 一次变更工作区 |
| **change.yaml** | change 根目录 | 状态机 + PRD 映射（YAML） |
| **delta** | `changes/{name}/delta/` | 需求增量，路径镜像 `atom/` |
| **tasks** | `changes/{name}/tasks/` | TDD 任务，路径镜像 `atom/` |
| **archive** | `changes/archive/` | 完成历史，含完整 delta + tasks |

## 关键规范（按需读）

- **Spec 语法**（Requirement / Scenario / RFC 2119）：`references/spec-format.md`
- **change.yaml 字段与状态机**：`references/change-yaml-schema.md`
- **RFC 2119 用词**：`references/rfc-2119.md`
- **GIVEN/WHEN/THEN 例子**：`references/scenario-examples.md`
- **路径分级决策树**：`references/path-tiering.md`
- **TDD 红绿重构**：`references/tdd-loop.md`
- **PRD 抽取策略**：`references/prd-ingestion.md`
- **Review 三档 checklist**：`references/review-checklist.md`

## 模板

- `templates/change.yaml` — 变更记录骨架
- `templates/proposal.md` — 提案骨架
- `templates/design.md` — 技术设计骨架
- `templates/delta-atom.md` — delta 需求骨架
- `templates/tasks-atom.md` — TDD tasks 骨架
- `templates/specs-README.md` — 首次使用时初始化 `specs/README.md`

## Guard 脚本

- `guard/validate-change-yaml.py` — 校验 change.yaml schema
- `guard/check-delta-mirror.py` — 校验 delta 与 atom 路径镜像
- `guard/guard-archive.py` — 归档前检查所有门禁

依赖 Python 3 + PyYAML（`pip install pyyaml`），Windows / macOS / Linux 通用。

## 首次使用

若目标项目尚无 `specs/`，从 `templates/specs-README.md` 初始化：

```bash
mkdir -p specs/atom specs/changes specs/changes/archive
cp templates/specs-README.md specs/README.md
```

## 版本与变更

见 `CHANGELOG.md`。

## 参考

- 完整示例：`examples/add-sms-login/`
- 使用手册：`README.md`
