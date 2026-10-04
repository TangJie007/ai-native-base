# OpenSpec 架构与优缺点

> 一句话：OpenSpec 是一个 **spec-driven（规格驱动）** 的 AI 开发工作流，核心是 `specs/` 作为「系统当前行为」的真相源，`changes/` 承载「这次改什么」的提案，用 delta 描述增量，archive 合并回真相源。
>
> 仓库地址：`github.com/Fission-AI/OpenSpec`
> 文档：`https://openspec.dev`

---

## 1. 定位与哲学

OpenSpec 解决的是：**AI 编码工具「上来就写代码」，产品意图和技术契约之间没有中间层** 的问题。

四条官方设计原则：

| 原则 | 含义 |
|------|------|
| **Fluid not rigid** | 无强制阶段门，artifact 可按需产出、可回头修改 |
| **Iterative not waterfall** | 边建边学，`proposal`/`design`/`tasks` 都允许在实现中发现新问题后回改 |
| **Easy not complex** | 秒级初始化，无重型工具链，Markdown + CLI 双入口 |
| **Brownfield-first** | 面向已有代码库的**增量变更**，而非从零搭新项目 |

**它管什么、不管什么**：

| 管 | 不管 |
|----|------|
| 系统当前行为是什么（`specs/`） | 具体怎么实现（`design.md` 只写决策，不写代码） |
| 这次要改什么（`changes/{name}/specs/`） | 任务拆解到分钟粒度（`tasks.md` 只是 checkbox） |
| 提案到归档的完整生命周期 | 断点续跑（无持久状态机） |
| Spec 与代码的一致性追溯 | 强制 TDD、Code Review、Subagent 派发 |

---

## 2. 目录结构

```
openspec/
├── specs/                                # ★ 真相源：系统当前行为
│   ├── auth/
│   │   └── spec.md
│   ├── payments/
│   │   └── spec.md
│   └── ui/
│       └── spec.md
│
├── changes/                              # 变更提案工作区
│   ├── add-rate-limiting/                # 一个 change 一个文件夹
│   │   ├── .openspec.yaml                # change 元数据（可选）
│   │   ├── proposal.md                   # Why / What Changes / Capabilities / Impact
│   │   ├── design.md                     # 技术方案与关键决策（无必要可省）
│   │   ├── specs/                        # ★ Delta specs
│   │   │   └── rate-limiting/
│   │   │       └── spec.md
│   │   └── tasks.md                      # 实现 checklist
│   └── archive/
│       └── 2026-10-24-add-rate-limiting/ # 归档：合并到 specs 后的历史
│
└── config.yaml                           # 项目配置（profile、schema 等）
```

两个入口位置（**最常被混**）：

| 入口 | 在哪里输 | 例子 |
|------|----------|------|
| `openspec <cmd>` | **终端** | `openspec init`、`openspec validate`、`openspec archive` |
| `/opsx:<cmd>` | **AI 聊天框** | `/opsx:propose`、`/opsx:apply`、`/opsx:archive` |

---

## 3. Spec 格式（`specs/<capability>/spec.md`）

**Requirement + Scenario**，用 RFC 2119 关键词表达强度：

```markdown
# Auth Specification

## Purpose
Authentication and session management for the application.

## Requirements

### Requirement: User Authentication
The system SHALL issue a JWT token upon successful login.

#### Scenario: Valid credentials
- GIVEN a user with valid credentials
- WHEN the user submits login form
- THEN a JWT token is returned
- AND the user is redirected to dashboard

#### Scenario: Invalid credentials
- GIVEN invalid credentials
- WHEN the user submits login form
- THEN an error message is displayed
- AND no token is issued

### Requirement: Session Expiration
The system MUST expire sessions after 30 minutes of inactivity.
```

| 元素 | 作用 |
|------|------|
| `## Purpose` | 该 capability 的高层描述 |
| `### Requirement:` | 一条具体行为要求 |
| `#### Scenario:` | 该 requirement 的可测试例子（GIVEN/WHEN/THEN） |
| `SHALL` / `MUST` / `SHOULD` | RFC 2119 关键词，标识强度 |

**关键设计**：Scenario 就是**验收清单**——不需要额外写测试用例，Scenario 本身描述「什么算做到」。

---

## 4. Delta Spec 格式（`changes/{name}/specs/<capability>/spec.md`）

Delta 是 OpenSpec 的核心概念，用章节标记变更类型：

```markdown
# Delta for Auth

## ADDED Requirements

### Requirement: Two-Factor Authentication
The system MUST require a second factor during login.

#### Scenario: OTP required
- GIVEN a user with 2FA enabled
- WHEN the user submits valid credentials
- THEN an OTP challenge is presented

## MODIFIED Requirements

### Requirement: Session Expiration
会话 MUST 在 30 分钟无操作后过期。
（Previously: 60 分钟）

#### Scenario: Idle timeout
- GIVEN 已认证会话
- WHEN 30 分钟无操作
- THEN 会话失效

## REMOVED Requirements

### Requirement: 密码登录
（v1.1 起废弃，统一验证码登录）

## RENAMED Requirements

- `SessionTimeout` → `SessionExpiration`
```

| Section | Archive 时行为 |
|---------|---------------|
| `ADDED` | 追加到主 `specs/` |
| `MODIFIED` | 替换原 Requirement |
| `REMOVED` | 从主 `specs/` 删除 |
| `RENAMED` | 重命名 |

**优势**：只写「变了什么」，不重复完整 spec——这是 OpenSpec 能用于 brownfield 的关键。

---

## 5. 五阶段工作流

```
    ┌─ specs ──┐
    │          │
/opsx:explore ──► /opsx:propose ──► 用户 review ──► /opsx:apply ──► /opsx:archive
  (可选，思考)     (生成 plan)         (你改 plan)      (建代码)         (spec 吸收 change)
```

| 阶段 | 命令 | 输入 | 输出 | 是否写代码 |
|------|------|------|------|-----------|
| **1. Explore** | `/opsx:explore` | 模糊想法 | 更清晰的想法（可选产出 proposal） | ❌ 明确禁止写代码 |
| **2. Propose** | `/opsx:propose <name>` | 想法 | `changes/{name}/`：proposal + delta + design + tasks | ❌ 只写 plan |
| **3. Review** | 无命令，人直接改 | 上面产物 | 用户订正的 plan | ❌ |
| **4. Apply** | `/opsx:apply` | 已 review 的 change | 代码 + `tasks.md` checkbox 勾选 | ✅ |
| **5. Archive** | `/opsx:archive` | 完成的 change | 主 `specs/` 更新 + change 移入 `archive/` | ❌ |

**扩展命令（`openspec config profile` 可选启用）**：

- `/opsx:new`：新建 change 但不生成全套 artifact
- `/opsx:ff`（fast-forward）：一次性生成所有 artifact 到可 apply 状态
- `/opsx:continue`：为已存在 change 追加下一个 artifact
- `/opsx:update`：更新现有 change 的 artifact
- `/opsx:sync`：实现完成后把 delta 合并进主 specs，**但不 archive**
- `/opsx:verify`：扩展流程中的验证门（`core` profile 默认不含）

### Artifact 依赖图

```
proposal ──► specs ──► design ──► tasks ──► apply
   why         what        how      steps
   ▲▲▲▲       ▲▲▲▲▲       ▲▲▲▲     ▲▲▲▲
   └──────────┴───────────┴─────────┘
        可任意回改
```

`design.md` 可在无强技术决策时省略；纯重构类可 `.openspec.yaml` 设 `skip_specs: true`。

---

## 6. 工具与集成

| 组件 | 用途 | 必需 |
|------|------|------|
| `@fission-ai/openspec` CLI | init / validate / archive / sync / store 管理 | 是（`openspec init` 生成骨架） |
| `/opsx:*` slash command | 在 Claude Code / Cursor / Codex 等 AI 工具中触发工作流 | 是（主要交互入口） |
| Skill（`.agents/skills/`） | 部分平台把命令封装为 skill | 否 |
| Git | change 隔离、archive 历史 | 推荐 |
| Stores（beta） | 跨仓库的独立 OpenSpec 仓库 | 否，跨仓规划才用 |

**Profile 概念**：

| Profile | 包含命令 |
|---------|----------|
| `core`（默认） | propose / explore / apply / update / sync / archive |
| `custom` | 用户自建 workflow（可加 verify、continue 等） |

**Schema 概念**：定义「一个 change 应产出哪些 artifact、以什么顺序」，`spec-driven` 是官方内置 schema，也可自定义。

---

## 7. 优势

| 优势 | 说明 |
|------|------|
| **Delta 模型天然适配增量开发** | 不重复写完整 spec，只描述「加了什么、改了什么、删了什么」，brownfield 项目零摩擦接入 |
| **Spec 是持续真相源** | Archive 后主 `specs/` 是**权威的行为契约**，比"看代码反推功能"稳定得多 |
| **Scenario 即验收清单** | GIVEN/WHEN/THEN 天然可读、可测，无需额外测试用例文档 |
| **Artifact 分离、职责清晰** | Why（proposal） / What（specs） / How（design） / Steps（tasks）各占一格，避免一份大文档糊在一起 |
| **不强制阶段门，可以回改** | 实现中发现新情况可以回去改 proposal，不像瀑布流程 |
| **纯 Markdown 可读性高** | 产品、后端、前端、测试都能读懂，无需安装 IDE 插件或专用查看器 |
| **多 change 可并行** | 每个 change 独立文件夹，Git 层面天然隔离 |
| **CLI + Skill 双入口** | 终端和 AI 聊天框都能操作，跨 AI 工具通用（Claude / Codex / Cursor 等） |
| **上手快、依赖少** | `npm i -g @fission-ai/openspec` + `openspec init` 即可完成，无数据库、无状态服务 |
| **零 delta change 有显式语义** | 纯重构 / 工具变更用 `skip_specs: true`，而不是编造一个 requirement |

## 8. 劣势

| 劣势 | 影响 |
|------|------|
| **缺少实现细节** | proposal / tasks 只是高层 checkbox，没有文件路径、代码骨架、验证步骤——直接 apply 时 agent 仍要靠自己猜实现，容易跑偏 |
| **无 TDD 强制** | `tasks.md` 是普通 checklist，不规定先写测试再实现；agent 可能直接写代码跳过测试 |
| **无强制 code review** | apply 阶段没有 review gate，产出质量依赖模型自觉 |
| **无持久状态机** | 长任务中断后没有可靠的「我从哪继续」；agent 需要重新读文档 + 代码反推当前进度，浪费 token |
| **无 subagent 派发策略** | 单 agent 顺序执行所有任务，跨任务上下文互相污染，长任务容易漂移 |
| **文档同步靠人/模型自觉** | 「记得更新 design.md」「记得把 delta 合并进 specs」这类动作没有脚本保底 |
| **无验证证据链** | Apply 完成后没有强制跑测试、没有 verify 报告；质量门禁全靠人肉 review |
| **面向 greenfield 弱** | 从零写一个新项目时，`specs/` 一开始是空的，delta 语义（ADDED/MODIFIED）不成立 |
| **CLI 单一实现** | 只有 `@fission-ai/openspec` 一个官方 CLI，社区 fork 少，出问题求助面窄 |
| **Profile / Schema 灵活度双刃剑** | 自定义 schema 门槛不低；新手容易卡在 profile 配置里 |

---

## 9. 适用场景

| 场景 | 适配度 |
|------|--------|
| 已有代码库、需求持续演进 | ★★★★★ delta 模型的核心价值区 |
| 产品与开发分离，需要 PRD → Spec 可追溯 | ★★★★☆ |
| 小团队、希望流程轻 | ★★★★★ |
| 完全从零搭新项目（greenfield） | ★★☆☆☆ 更适合配合 brainstorming 类的工具 |
| 高风险变更（认证、支付、数据迁移） | ★★★☆☆ 需叠加 review / TDD，否则质量门禁弱 |
| 强合规审计（金融、医疗） | ★★☆☆☆ 状态、验证证据不足 |

---

## 10. 与本仓库 `docs/prd-spec/` 的关系

本仓库的 **PRD-Spec** 是 OpenSpec 的**中文简化融合版**，借鉴了：

- ✅ `specs/atom/` 真相源 + `changes/` delta 模型（等价于 `openspec/specs/` + `openspec/changes/`）
- ✅ ADDED / MODIFIED / REMOVED 三段式 delta 格式
- ✅ Archive 时 delta 合并进真相源
- ✅ artifact 依赖顺序 proposal → specs → design → tasks
- ✅ "Fluid not rigid" 原则：不做死板阶段门
- ✅ 无专用 CLI，Skill 独立运行

刻意做了不同的地方：

| 维度 | OpenSpec | PRD-Spec |
|------|----------|----------|
| Spec 组织 | `specs/<capability>/spec.md`（domain 级） | `specs/atom/{domain}/{atom}.md`（**原子**级） |
| 元数据 | `.openspec.yaml`（可选） | `change.yaml`（**必填**，含 PRD 追溯 + atom 映射 + 门禁） |
| Tasks 组织 | change 级单 `tasks.md` | 镜像 atom 路径：`tasks/{domain}/{atom}.md` |
| CLI | `openspec` CLI（必需） | 无 CLI，`Agent + Markdown` |
| 外部 PRD | 不区分，都在 `specs/` 内管理 | 允许外部任意路径只读引用，`prd-index.md` 登记 |
| 路径分级 | 无 | 引入 Spike / Bounded / Architectural（来自 Superpowers） |

一句话：**PRD-Spec 保留了 OpenSpec 的 delta 模型，砍掉了 CLI，加了 atom 粒度 + 路径分级**。详见 `docs/prd-spec/ARCHITECTURE.md`。

---

## 11. 参考

- 官方文档：https://openspec.dev
- GitHub：https://github.com/Fission-AI/OpenSpec
- Concepts：https://openspec.dev/docs/concepts
- Getting Started：https://openspec.dev/docs/getting-started
- Schemas (spec-driven)：https://openspec.dev/docs/schemas/spec-driven
- Glossary：https://openspec.dev/docs/glossary
