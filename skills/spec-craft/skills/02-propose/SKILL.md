---
name: propose
stage: 2
previous: 01-explore
next: 03-design
produces:
  - specs/changes/{name}/change.yaml
  - specs/changes/{name}/proposal.md
  - specs/changes/{name}/delta/**/*.md
requires_confirm: true
---

# 02-propose：定义「改什么」

## 何时进入

- 需求已清晰（或跳过 explore 直接进入）
- 用户想开始正式立项

## Iron Law

1. **未读 PRD 不 propose**：`change.yaml.prd_inputs` 必须登记至少一条
2. **未分类路径不 propose**：`change.yaml.path` 必须填 Spike / Bounded / Architectural
3. **未获用户确认不进入 design**（阻塞下一阶段）
4. **不写实现细节**：本阶段不写代码，不写具体技术方案

## 步骤

### 1. 定位 PRD 输入

- 用户直接给的 → 记录路径
- 仓库里已有的 → 读取并定位到相关章节（如 `PRD.md#§3.1`）
- 对话口述 → 建临时 `specs/prd/{name}.md` 记录（可选）

### 2. 路径分级

问 3 个问题（详见 `../../references/path-tiering.md`）：

- Q1：涉及「能不能 / 试一下」？→ Spike
- Q2：只影响单 atom / 单接口？→ Bounded
- Q3：涉及 PRD 更新、跨模块、跨 atom？→ Architectural

**若 Spike**：不建 change 目录，跳过本 skill，直接做探针 → `/spec archive`（若需要留痕则建最小 change.yaml）

### 3. 创建 change 目录

```bash
mkdir -p specs/changes/{name}/delta
mkdir -p specs/changes/{name}/tasks
```

`{name}` 命名规则：`kebab-case`，动词 + 宾语，如 `add-sms-login`、`fix-billing-tax-rounding`。

### 4. 建 change.yaml

复制 `../../templates/change.yaml`，填：

- `name`：change 名
- `path`：spike / bounded / architectural
- `created`：ISO 日期
- `status`：`proposed`
- `author`：用户或 agent 名
- `prd_inputs[]`：至少一条，含 `path` + `locate`
- `atoms[]`：至少一条，含 `domain` + `atom` + `operation` + `delta` 路径 + `target` 路径

### 5. 建 proposal.md

复制 `../../templates/proposal.md`，填：

- **背景**：为什么现在要做
- **目标**：做完后达成什么
- **Scope In**：明确做什么
- **Scope Out / Non-Goals**：明确不做什么（关键，防止范围蔓延）
- **影响范围**：涉及的 atom、模块
- **风险**：可能的坑

### 6. 为每个 atom 建 delta

复制 `../../templates/delta-atom.md` 到 `delta/{domain}/{atom}.md`：

- **Purpose**：一段话概括该 atom 要变什么
- **Requirements**：用 RFC 2119 关键词开头
  - MUST / SHALL / SHOULD / MAY
- **Scenarios**：GIVEN / WHEN / THEN 三元组
- **Change History**：初始为空，archive 时补

**关键**：`delta/{domain}/{atom}.md` 的路径必须与 `change.yaml.atoms[].delta` 一致；`target` 指向 `specs/atom/{domain}/{atom}.md`。

### 7. 运行 guard

```bash
python guard/validate-change-yaml.py specs/changes/{name}/change.yaml
```

必须通过，否则修复后重跑。

### 8. 请求用户确认

向用户展示：

- `change.yaml` 的 `path` 分类
- `proposal.md` 的 Scope In / Out
- 每个 delta 的 Requirements（简表）
- 待确认项（若有）

**用户明确确认后**，本阶段完成。

## 完成判据

- `change.yaml.status == "proposed"`
- `change.yaml.tasks.confirmed == false`
- `change.yaml.tasks.complete == false`
- `validate-change-yaml.py` 通过
- 用户已明确确认

## 常见错误

- **忘写 Scope Out**：会导致实现阶段 scope creep，一定要明确不做什么
- **delta 里写实现细节**：本阶段只写「行为要什么」，不写「代码怎么写」（那是 design 阶段）
- **一个 change 混合多个不相关的 atom**：应该拆成多个 change
- **忘记填 target**：`atoms[].target` 是 archive 阶段的合并目标，必须填

## 参考

- change.yaml 字段：`../../references/change-yaml-schema.md`
- Spec 语法：`../../references/spec-format.md`
- RFC 2119 用词：`../../references/rfc-2119.md`
- Scenario 例子：`../../references/scenario-examples.md`
- 路径分级：`../../references/path-tiering.md`
- PRD 抽取：`../../references/prd-ingestion.md`

## 下一步

用户确认后 → `../03-design/SKILL.md`
