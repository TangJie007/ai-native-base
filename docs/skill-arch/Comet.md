# Comet 架构与优缺点

> 一句话：Comet 是一个 **Agent Skill Harness**，把 OpenSpec（管 WHAT，需求与 spec 生命周期）和 Superpowers（管 HOW，工程方法论）链成一条 **5 阶段自动化流水线**，并补上两者的共同短板——**持久状态机、可中断续跑、文档自动同步、Guard 脚本护栏、Skill 评估与发布**。
>
> 官方包：`@rpamis/comet`
> 文档：`https://docs.comet.rpamis.com`
> npm 镜像：`@ck123pm/comet`（早期版本）、`chancemate-comet`
> GitHub：`https://github.com/rpamis/comet`

---

## 1. 定位：为什么在 OpenSpec + Superpowers 之上再来一个

Comet 官方明确点出的两个原始痛点：

| 上游短板 | 具体表现 |
|----------|----------|
| **OpenSpec 的 proposal / tasks 缺乏实现细节** | Delta 只写「行为变什么」，不写「怎么做」；agent apply 时仍要靠自己猜文件路径、代码骨架，容易跑偏 |
| **Superpowers 的 spec 文档缺乏状态设计** | Brainstorming 产出的 spec 只是一次性文档；完成后只有 checkbox 被勾掉，agent 常常**忘了勾**；长任务中断后 agent 要重新读文档 + 读代码反推进度，浪费大量 token |

Comet 的定位：**不是替代 OpenSpec 或 Superpowers，而是把它们编排起来并加上运行时保障**。

官方原文定位：

> "OpenSpec handles **WHAT** (outlines, proposals, spec lifecycle, archiving).
> Superpowers handles **HOW** (technical design, planning, execution, wrap-up).
> Comet chains both into a **five-phase automated pipeline**."

---

## 2. 两条工作流

Comet 同时提供 **Native** 和 **Classic** 两条独立工作流，由 `.comet/config.yaml` 在初始化时选定：

| 维度 | Native | Classic |
|------|--------|---------|
| 定位 | 面向强模型的轻量流 | 面向团队的完整阶段治理 |
| 阶段数 | 4 阶段：Shape → Build → Verify → Archive | 5 阶段：Open → Design → Build → Verify → Archive |
| 是否规定方法 | ❌ 不预设 TDD / plan / review | ✅ 完整继承 OpenSpec + Superpowers |
| 是否有状态机 | ✅ `.comet.yaml` | ✅ `.comet.yaml`（更完整字段） |
| 适用模型 | Claude Sonnet 4.5+、GPT-5+ 等强模型 | 任意模型，尤其弱模型 / 团队协作者 |
| 目标产物 | 详细需求 + 完整目标 spec + 状态检查 + 验证证据 | OpenSpec change + Superpowers design + planning + archive 全套 |

**新项目默认 Native**；只有两种情况选 Classic：

1. 需要 OpenSpec/Superpowers 式的完整阶段治理；
2. 项目已有 Classic 状态，或已经在用 OpenSpec + Superpowers。

两条工作流**互不干扰**，可用 `comet init --workflow both` 在同一项目同时启用。

---

## 3. 核心架构

```
┌────────────────────────────────────────────────────────────────┐
│                     用户入口（AI 聊天框）                        │
│                                                                  │
│   /comet            /comet-any         /comet-review            │
│   ├─ /comet-open      (Skill Creator)   (按需 review，独立)     │
│   ├─ /comet-design                                          │
│   ├─ /comet-build                                             │
│   ├─ /comet-verify                                            │
│   └─ /comet-archive                                           │
└──────────────────────────────┬─────────────────────────────────┘
                               │
                     读取 .comet/config.yaml
                     决定走 Native 或 Classic
                               │
        ┌──────────────────────┴───────────────────────┐
        │                                                │
   ┌────▼─────────────┐                       ┌─────────▼────────┐
   │    Native         │                       │    Classic        │
   │  Shape → Build    │                       │ Open → Design →   │
   │  → Verify → Ar.   │                       │ Build → Verify →  │
   │                   │                       │ Archive           │
   └────┬──────────────┘                       └─────────┬────────┘
        │                                                │
        └──────────────────────┬─────────────────────────┘
                               │
        ┌──────────────────────▼───────────────────────────┐
        │  .comet.yaml（每个 change 的持久状态）              │
        │   phase / execution mode / verification results /   │
        │   archive status / linked OpenSpec change /          │
        │   linked Superpowers design + plan                  │
        └──────────────────────┬─────────────────────────────┘
                               │
        ┌──────────────────────▼───────────────────────────┐
        │  Guard 脚本（Shell，跨 mac/linux/windows git-bash） │
        │   comet-guard.sh          阶段出口条件检查          │
        │   comet-yaml-validate.sh  状态字段合法性            │
        │   comet-state.sh          状态机推进与回滚          │
        │   comet-verify.sh         验证证据链               │
        └──────────────────────────────────────────────────┘
                               │
        ┌──────────────────────▼───────────────────────────┐
        │  Skill 生态                                        │
        │   /comet-any: Skill 创建、评估、发布、分发           │
        │   comet eval: Rubric 打分 + Pass@k + Pass^k        │
        │   Skill Bundle: 可评估、可发布、可分发的组合包       │
        └──────────────────────────────────────────────────┘
```

---

## 4. Classic 五阶段流水线

### 4.1 阶段划分

| 阶段 | 命令 | 触发条件 | 干什么 |
|------|------|----------|--------|
| **Phase 1: Open** | `/comet-open` | 有想法，尚无 spec | 开 change（复用 OpenSpec `/opsx:propose` 的产物结构：proposal + delta + design + tasks） |
| **Phase 2: Design** | `/comet-design` | Open 完成 | 深度设计（复用 Superpowers `brainstorming` + `writing-plans`），产出 design doc + 实现计划 |
| **Phase 3: Build** | `/comet-build` | 设计获批 | 按 plan 执行；可切 TDD 模式；派发 subagent |
| **Phase 4: Verify** | `/comet-verify` | Build 完成 | 测试、验证报告、最终全面 code review |
| **Phase 5: Archive** | `/comet-archive` | Verify 通过 | 归档 OpenSpec change + Superpowers 设计文档 |

### 4.2 中断续跑（核心机制）

Comet 的核心承诺是**任何阶段中断后都可以无损恢复**：

```
用户：/comet continue
Comet：
  1. 读 .comet.yaml，找到 active change
     （有多个则列出让用户选）
  2. 检查 phase / status / 已完成 task / 验证证据
  3. 判断当前处于哪个阶段
  4. 输出「下一步应该做什么」的具体动作
  5. 派发对应 skill，从断点继续
```

对比 Superpowers：**Superpowers 没有状态，中断后要 agent 猜**；对比 OpenSpec：**OpenSpec 也没有状态，只能靠 `tasks.md` checkbox 反推**；Comet 用 `.comet.yaml` 明确记录。

### 4.3 状态机字段（`.comet.yaml`）

```yaml
change_name: add-rate-limiting
workflow: classic
phase: build                     # open | design | build | verify | archive
execution_mode: sdd              # sdd | executing-plans
tdd_enabled: true
review_mode: standard            # off | standard | thorough
auto_transition: true            # 阶段间是否自动交接

linked_artifacts:
  openspec_change: openspec/changes/add-rate-limiting/
  superpowers_design: docs/design/add-rate-limiting.md
  superpowers_plan: docs/plan/add-rate-limiting.md

progress:
  tasks_total: 12
  tasks_done: 7
  verify_evidence:
    tests_passed: true
    smoke_passed: true
    review_passed: false

history:
  - phase: open
    started_at: 2026-10-02T10:00:00Z
    completed_at: 2026-10-02T10:20:00Z
  - phase: design
    started_at: 2026-10-02T10:25:00Z
    completed_at: 2026-10-02T11:00:00Z
  - phase: build
    started_at: 2026-10-02T11:05:00Z

archive_status: pending
```

### 4.4 Review 模式

Classic Build 阶段的 code review 有三档：

| 模式 | 何时 review | 成本 | 适用 |
|------|-------------|------|------|
| `off` | 不 review，仅靠实现证据 | 最低 | hotfix / tweak / 文档改动 |
| `standard`（默认） | 只有命中**风险信号**的任务才 review | 中等 | 常规完整流程 |
| `thorough` | 每个任务都 review | 最高 | 认证 / 支付 / 数据迁移 / 跨模块改动 |

**风险信号示例**：涉及认证、加密、数据库迁移、权限、支付、并发等关键词。

**最终全面 review 只在 Verify 阶段跑一次**——Build 完成不会追加额外 reviewer。

**独立按需 review**：任何时候可以 `/comet-review`，只报告问题、不改文件、不推进工作流。

### 4.5 Build 模式

| `build_mode` | 说明 |
|--------------|------|
| `sdd`（Subagent-Driven Development，默认） | 每任务派新 subagent，隔离 context |
| `executing-plans` | 单 agent 批量执行 + 人工检查点 |

---

## 5. Native 工作流

面向强模型的轻量流，四阶段：

```
Shape → Build → Verify → Archive
```

- **Shape**：把模糊需求塑形成「详细需求 + 完整目标 spec」；不生成 Superpowers 的 design / plan
- **Build**：直接实现，不强制 TDD / plan / review
- **Verify**：产出验证证据（测试、review 报告）
- **Archive**：把 spec 合并到主 specs

**和 Classic 的取舍**：

| | Native | Classic |
|---|--------|---------|
| 假设模型能力 | 强（Sonnet 4.5+ / GPT-5+） | 任意 |
| 中间产物数量 | 少（需求 + spec + 证据） | 多（OpenSpec change + design + plan + evidence + archive） |
| 状态追踪 | 有（比 Native 轻） | 完整 |
| 中断续跑 | 支持 | 支持 |
| 团队治理 | 弱 | 强 |
| token 成本 | 低 | 高 |

---

## 6. Skill Creator（`/comet-any`）

Comet 的另一个独立能力：**把用户流程固化为可评估、可发布、可分发的 Skill Bundle**。

流程：

```
/comet-any 描述目标
  → 选择起点（新建 / 复用已有 / 混合）
  → 生成组合方案
  → 用户确认组合方案
  → comet eval（Rubric 打分 + Pass@k + Pass^k）
  → 生成 HTML 报告 + 失败归因
  → 用户 approve
  → 发布到 marketplace 或本地分发
```

配套命令：

- `comet eval`：为任意 Skill 生成评估报告（Rubric 打分、Pass@k、Pass^k、失败归因）
- `comet creator status <name>`：查看某个 bundle 的完成状态、blockers、evidence
- `comet creator next <name>`：给出「下一步应该做什么」的建议动作
- `comet publisher`：把 bundle 发布到 marketplace

**声明**：Skill Creator 是**实验特性**，官方明确说明后续版本可能大改流程。

---

## 7. 跨平台支持

Comet 号称支持 **37 个 AI 编码平台**，涵盖：

- Claude Code（原生）
- Codex CLI
- Cursor
- Gemini CLI
- Antigravity（Google）
- VS Code（Copilot 等）
- DeepSeek Harness
- Oh My Pi
- OpenCode
- ...

支持：

- **项目级 / 全局级** 安装
- **中文 / 英文** Skill 选择
- 平台特有目录差异（Antigravity 项目级和全局路径不同）
- macOS / Linux / Windows Git Bash 下的 Shell 脚本

安装方式：

```bash
npm i -g @rpamis/comet
comet init              # 交互式初始化
comet init --workflow both   # 同时启用 Native + Classic
comet doctor            # 健康检查
```

---

## 8. 优势

| 优势 | 说明 |
|------|------|
| **补齐了 OpenSpec + Superpowers 的最大短板**：状态机 + 可续跑 | `.comet.yaml` 明确记录 phase / progress / evidence，长任务中断后 `/comet continue` 能精准定位下一步，不再靠 agent 猜 |
| **文档同步自动化** | Handoff / 状态更新 / 验证 / Archive 全部脚本化，不再需要用户反复提醒「更新一下 design 文档」 |
| **Guard 脚本硬护栏** | `comet-guard.sh` / `comet-yaml-validate.sh` / `comet-state.sh` 在阶段出口检查任务完成度、状态字段合法性、验证证据、archive 条件；不满足则拒绝推进 |
| **5 阶段可自动交接** | `auto_transition` 配置让 5 阶段之间自动派发 skill；只在关键选择点（如 approve design）暂停 |
| **Review 模式分档** | `off / standard / thorough` 按风险面切换，兼顾成本和覆盖率；`standard` 只在命中风险信号时 review，成本可控 |
| **验证证据链** | 每个 change 有 `verify_evidence` 记录：测试是否通过、冒烟是否通过、review 是否通过；archive 前强制校验 |
| **中断续跑是内建能力** | `/comet continue` 自动读取 active spec、判断当前 phase、给出下一步；这是 Superpowers 和 OpenSpec 都不具备的 |
| **Skill 生态化** | `/comet-any` 把「团队流程」变成可评估、可发布、可分发的 Skill Bundle；`comet eval` 提供 Rubric 打分与失败归因 |
| **跨平台覆盖广** | 37 个平台，含 Antigravity / DeepSeek Harness 等小众平台；脚本跨 mac/linux/windows git-bash |
| **上下文压缩** | 内置 context compression（Beta），Build 阶段输入 token ↓25-30% |
| **CodeGraph 集成** | 一步集成 CodeGraph 语义代码索引，官方宣称成本 ↓16%、工具调用 ↓58% |
| **有状态设计让审计可查** | 每个 phase 有 history（started_at / completed_at），可追溯变更历程 |
| **Native 选项给强模型减负** | 不想走完整 5 阶段治理时，Native 提供更轻的替代 |

## 9. 劣势

| 劣势 | 影响 |
|------|------|
| **强耦合上游** | Classic 依赖 OpenSpec + Superpowers；上游 breaking change 会波及 Comet；用户需要理解三个体系才能用好 |
| **学习曲线陡** | Native vs Classic 两种模式 × Review 3 档 × Build 2 模式 × 多阶段命令 × Skill Creator —— 配置面宽，新人容易迷路 |
| **状态文件是隐藏复杂度** | `.comet.yaml` 字段多，手工改动风险高；`comet-yaml-validate.sh` 只在脚本执行时校验 |
| **脚本跨平台维护成本** | 需要在 mac/linux/windows git-bash 三平台跑通 shell 脚本；hash、YAML、状态机、archive 全部要处理跨平台差异 |
| **Token 成本高（Classic）** | 5 阶段 + 每任务 subagent + reviewer + fixer + 状态脚本 —— 全流程 token 显著高于直接写代码或纯 Superpowers |
| **Skill Creator 是实验特性** | 官方声明「subsequent versions may undergo significant refactoring」；不建议生产环境依赖 |
| **生态分散** | `@rpamis/comet` / `@ck123pm/comet` / `chancemate-comet` 多个 npm 包并存；社区认知分散 |
| **强制脚本护栏依赖 agent 调用** | 若 agent 决定绕过脚本直接推进阶段，护栏失效（与 Superpowers 同类问题） |
| **对简单任务过重** | 改一个 typo / 加一个字段，走完整 5 阶段成本远高于直接改 |
| **文档量大** | 官方文档覆盖 Native / Classic / Skill Creator / Evaluate / Publish / Multi-platform，学习材料本身很厚 |
| **状态与 git 分支的耦合需自己维护** | `.comet.yaml` 在 change 目录内；多 change 并行时需要额外的路径管理 |
| **无内置 PRD 追踪** | 假设 spec 从 OpenSpec change 进入，PRD 与 spec 的追溯仍要用户手动维护（Comet 不解决 PRD → Spec 语义映射） |

---

## 10. 三方对比速览

| 维度 | OpenSpec | Superpowers | Comet |
|------|----------|-------------|-------|
| 定位 | Spec-driven 变更工作流 | 工程方法论 Skill 库 | 融合 harness |
| 管 WHAT（需求 / spec） | ★★★★★ | ★☆☆☆☆ | ★★★★☆（复用 OpenSpec） |
| 管 HOW（工程方法） | ★★☆☆☆ | ★★★★★ | ★★★★☆（复用 Superpowers） |
| Delta / 真相源 | ✅ `specs/` + `changes/` | ❌ | ✅（继承 OpenSpec） |
| 强制 TDD | ❌ | ✅（会删先写代码的产物） | ✅（可选，`tdd_enabled`） |
| Code Review 强制 | ❌ | ✅（双 pass） | ✅（三档 review_mode） |
| 持久状态机 | ❌ | ❌ | ✅ `.comet.yaml` |
| 中断续跑 | ❌ | ❌ | ✅ `/comet continue` |
| 阶段自动交接 | 手动 | 手动 | ✅ `auto_transition` |
| Skill 生态 | 弱 | ✅ 丰富 | ✅ 有评估 + 发布 |
| 上手成本 | 低 | 中 | 高 |
| Token 成本（同等任务） | 中 | 高 | 高（Classic）/ 中（Native） |
| 生态成熟度 | 中 | 高（75 万+ 下载） | 低（多 npm 包、实验阶段） |
| 适用任务类型 | 增量变更、brownfield | 复杂新功能、bug 修复 | 长任务、团队治理、需要审计 |

---

## 11. 适用场景

| 场景 | 适配度 |
|------|--------|
| 已经在用 OpenSpec + Superpowers，想要自动接力 | ★★★★★ 直接定位区 |
| 长任务（跨多天、跨多个 session） | ★★★★★ 状态机 + 续跑是核心价值 |
| 团队需要治理规范和审计轨迹 | ★★★★☆ review_mode + history |
| 强模型 + 想减负（不想要 5 阶段） | ★★★★☆ Native 工作流 |
| 想把团队流程沉淀成可发布 Skill | ★★★★☆ `/comet-any` |
| 单点小改动 | ★☆☆☆☆ 过重 |
| 团队对 OpenSpec / Superpowers 都不熟悉 | ★★☆☆☆☆ 学习曲线陡，建议先上单一体系 |
| 强合规审计（金融、医疗） | ★★★☆☆ 比 OpenSpec / Superpowers 好，但仍缺 SLA / 电子签名 |

---

## 12. 与本仓库 `docs/prd-spec/` 的关系

本仓库的 **PRD-Spec** 属于 Comet 分类里的「轻量融合」路线，与 Comet 的思路同源但更轻：

| Comet 能力 | PRD-Spec 对应 |
|------------|---------------|
| 5 阶段流水线 | **无阶段流水线**，只 4 个 slash command（explore / propose / apply / archive） |
| `.comet.yaml` 状态机 | `change.yaml`（仅状态 + PRD 追溯 + atom 映射 + 门禁） |
| Guard 脚本 | **无脚本护栏**（`tasks.confirmed` / `tasks.complete` 是软门禁） |
| Native / Classic 双模式 | **仅一套流程**，通过路径分级（Spike / Bounded / Architectural）缩放 |
| Skill 评估 | 无 |
| Review 模式 | 无（未强制） |

PRD-Spec 明确「刻意做轻」的取舍（ARCHITECTURE.md 附录 B）：

- 无专用 CLI
- 无全局状态机（每 change 一个 `change.yaml` + git）
- 无验证脚本（Scenario + TDD tasks 即验收）
- PRD 读散写聚（外部 PRD 任意路径，产出集中在 `specs/`）

**判断**：如果团队规模小 / 任务短 / 单人主导，PRD-Spec 的成本收益更好；如果跨多人协作、长任务频繁、需要审计，考虑引入 Comet 或直接搭 Superpowers + OpenSpec 组合。

---

## 13. 参考

- 官方文档：https://docs.comet.rpamis.com
- Overview：https://docs.comet.rpamis.com/en/overview
- Native vs Classic：https://docs.comet.rpamis.com/en/native/native-vs-classic
- Code Review 机制：https://docs.comet.rpamis.com/en/concepts/review-mode
- Skill Creator：https://docs.comet.rpamis.com/en/skill-creator/getting-started
- GitHub：https://github.com/rpamis/comet
- CONTRIBUTING：https://github.com/rpamis/comet/blob/master/CONTRIBUTING.md
- npm（新包）：https://www.npmjs.com/package/@rpamis/comet
- npm（旧镜像）：https://www.npmjs.com/package/@ck123pm/comet
- Comet 文档 MCP（可在 Claude Code / Codex 内直接查文档）：
  ```bash
  claude mcp add --transport http docs-comet --scope user https://docs.comet.rpamis.com/mcp
  ```
