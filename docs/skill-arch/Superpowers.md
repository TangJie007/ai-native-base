# Superpowers 架构与优缺点

> 一句话：Superpowers 是一套 **可组合的 Markdown Skill 集合**，让 AI 编码 agent 从「凭感觉写代码（vibing）」切换到「有工程方法论的开发」——强制 brainstorming、写 plan、TDD、subagent 派发、code review、系统化调试。
>
> 作者：Jesse Vincent（`obra`）
> 仓库：`github.com/obra/superpowers`
> 官方入口：`https://langlabs.io/obra/superpowers/skill.md`
> 安装：Claude Code Marketplace / Gemini CLI / Codex CLI / Cursor / OpenCode（跨 30+ 平台）
> 下载量：约 75 万（Claude Code 官方统计）

---

## 1. 定位与哲学

Superpowers 解决的是：**通用 AI 编码 agent 有三个通病**——

1. 上来就写代码，先写代码再想清楚要什么；
2. 不写测试，写完「看起来对」就说完成；
3. 几分钟内偏离原计划，任务中途忘记目标。

Superpowers 的思路不是训模型，而是**在模型外围装上强制流程**——用 Markdown 文件描述流程，agent 读到就当作不可违反的指令执行。

**关键洞察**：Skill 是纯 Markdown，没有 runtime。这意味着：

- 零安装（除了拉取 SKILL.md）；
- 跨平台（任何读 Markdown 的 agent 都能用）；
- 可以按 skill 粒度选择性启用；
- 无法自动执行——所有强制力来自「agent 相信 SKILL.md 是规矩」这一假设。

**它管什么、不管什么**：

| 管 | 不管 |
|----|------|
| Agent 的行为纪律（先想后写、先测后码） | 产品意图 / 需求真相源 |
| 工程方法论（TDD / SDD / systematic debugging） | 变更的可归档、可对比、可回滚 |
| 任务粒度的执行与评审 | Spec 的 delta 追踪、跨 change 一致性 |
| 单个任务的高质量完成 | 长任务的持久状态与断点续跑 |

---

## 2. Skill 的组成

一个 Skill = 一个 `SKILL.md` 文件 + 可选的引用文档。

```
skills/
├── brainstorming/
│   └── SKILL.md
├── test-driven-development/
│   └── SKILL.md
├── systematic-debugging/
│   ├── SKILL.md
│   └── references/
│       ├── root-cause-tracing.md
│       ├── defense-in-depth.md
│       └── condition-based-waiting.md
├── writing-plans/
│   └── SKILL.md
└── ...
```

### SKILL.md 结构

```markdown
---
name: test-driven-development
description: Enforce RED-GREEN-REFACTOR cycle. Use when implementing new code or fixing bugs where tests should come first.
---

# Test-Driven Development

## When to Use
When you are implementing new behavior...

## Process
1. Write a failing test
2. Run it — verify RED
3. Write minimal code
4. Run it — verify GREEN
5. Refactor

## Iron Law
NO CODE BEFORE TESTS. Any code written before tests gets deleted.
```

### 三级加载（**关键机制**）

| Level | 加载时机 | 占用上下文 |
|-------|----------|-----------|
| **Metadata**（YAML frontmatter） | 启动时始终加载 | 只有 name + description |
| **Instructions**（SKILL.md 正文） | Skill 被触发时才读 | 完整流程与规则 |
| **References**（引用文档） | Instructions 中显式要求时才读 | 更深的细节 |

这个渐进式加载让**安装几十个 Skill 也不撑爆上下文**——未触发的 Skill 只贡献几十字节描述。

### 触发机制

Skill **按上下文自动触发**，不需要用户手动调用：

| 场景 | 触发的 Skill |
|------|-------------|
| Agent 即将写代码 | `brainstorming`（先问清楚要什么） |
| 设计已批准 | `using-git-worktrees`（开隔离分支） |
| 有 approved design | `writing-plans`（拆 2–5 分钟粒度任务） |
| 有 ready plan | `subagent-driven-development`（每任务派 subagent） |
| 进入实现阶段 | `test-driven-development`（红-绿-重构） |
| 任务完成后 | `requesting-code-review`（review 自己） |
| 遇到 flaky failure | `systematic-debugging`（四阶段调试） |
| 所有任务完成 | `finishing-a-development-branch`（清理 worktree、给合并选项） |

**核心承诺**：用户不需要记住任何命令，Superpowers 会自己按情况接管流程。

---

## 3. Skill 分类

### Workflow Skills（主流程）

| Skill | 触发条件 | 干什么 |
|-------|----------|--------|
| `brainstorming` | 准备写代码前 | 苏格拉底式提问澄清需求，分段展示设计让用户签字，产出 Spec 文档 |
| `using-git-worktrees` | 设计获批后 | 开 git worktree + 新分支，跑项目 setup，验证 clean test baseline |
| `writing-plans` | 有 approved design | 拆成 2–5 分钟粒度任务，每个任务写清：文件路径、完整代码、验证步骤 |
| `subagent-driven-development`（SDD） | 有 ready plan | 每个任务派**全新** subagent，两阶段 review（spec 合规 → 代码质量），迭代 |
| `executing-plans` | 有 ready plan（SDD 替代方案） | 不用 subagent，主 agent 批量执行 + 人工检查点 |
| `test-driven-development` | 实现阶段 | 强制 RED→GREEN→REFACTOR，先写测试跑红，写最少代码跑绿，再重构 |
| `requesting-code-review` | 任务之间 | 让 agent 按 plan review 自己的实现，遇关键问题阻塞 |
| `receiving-code-review` | 收到 review 反馈 | 引导 agent 正确响应反馈 |
| `finishing-a-development-branch` | 所有任务完成 | 验证测试通过，给出 merge/PR/keep/discard 选项，清理 worktree |

### Utility Skills（工具型）

| Skill | 用途 |
|-------|------|
| `systematic-debugging` | 四阶段根因调试：复现 → 模式分析 → 假设验证 → 实现 |
| `verification-before-completion` | 确认修复真的生效再声明完成（防止「感觉对」） |
| `dispatching-parallel-agents` | 并发 subagent 处理独立任务 |
| `writing-skills` | 教你按约定写新 Skill（**用 TDD 方式写文档**） |

### 关键子概念

| 概念 | 含义 |
|------|------|
| **RED-GREEN-REFACTOR** | TDD 强制循环；`test-driven-development` 会**删除先写代码的产物** |
| **SDD（Subagent-Driven Development）** | 主要执行模式：一任务一 subagent + 双 pass review |
| **Worktree** | 每 feature 一个 `git worktree` + 独立分支，main 保持干净 |
| **Plan Document** | `writing-plans` 产出，含精确文件路径、完整代码片段、验证步骤 |
| **Iron Law** | 每条 Skill 都有一条硬性规则（NO CODE BEFORE TESTS / NO SKILL WITHOUT A FAILING TEST FIRST 等） |

---

## 4. 端到端工作流

```
        ┌─────────────┐
用户 goal ─► brainstorming ─► [用户签字] ─► design spec
        │
        ├─► using-git-worktrees ─► 隔离分支 + clean baseline
        │
        ├─► writing-plans ─► 2–5 分钟任务 + 完整代码 + 验证步骤
        │
        ├─► subagent-driven-development
        │     ├─ 每任务派新 subagent
        │     ├─ 执行时启用 test-driven-development（RED→GREEN→REFACTOR）
        │     ├─ subagent 完成后 requesting-code-review（合规 + 质量双 pass）
        │     └─ receiving-code-review（吸收反馈）
        │
        └─► finishing-a-development-branch ─► 验证 + 清理 + 交付选项
```

**SDD 一次任务的展开**：

```
Task 3: 添加 rate limiting
│
├─ 主 agent 派 subagent-task3（新 context）
│   └─ 读 plan Task 3 → 写测试 → RED → 写实现 → GREEN → 重构
│
├─ 主 agent 派 reviewer-1（新 context）
│   └─ 检查 Task 3 是否符合 spec 合规
│
├─ 主 agent 派 reviewer-2（新 context）
│   └─ 检查代码质量、可维护性
│
├─ 如 reviewer 有反馈
│   └─ 主 agent 派 fixer（新 context）处理反馈
│
└─ 主 agent 检查通过 → 进入 Task 4
```

**核心思想**：**新 context 消除污染**。每个 subagent 只看到它需要的上下文，不会被之前任务的假设干扰。

---

## 5. 优势

| 优势 | 说明 |
|------|------|
| **强制工程纪律** | TDD 从「可选」变成「默认必做」；agent 不再跳过测试、不再跳过 review |
| **RED-GREEN-REFACTOR 是真强制** | `test-driven-development` 会**删除先写代码的产物**，从行为层面堵漏洞 |
| **Subagent 隔离上下文** | 一任务一 subagent，每个新 context 不会互相污染；长任务漂移问题被结构性解决 |
| **Brainstorming 前置** | 不再「上来就写代码」；用苏格拉底式提问把模糊需求变成可签字的 design |
| **系统化调试方法论** | 四阶段根因调试，避免「换个参数再试」的猜测式修复 |
| **Worktree 隔离** | 每 feature 独立分支和目录，main 保持干净，可并行多个 feature |
| **双 pass code review** | 每个任务完成后强制 spec 合规 + 代码质量双审，问题在任务粒度被发现，而不是最后才暴露 |
| **零 runtime 依赖** | 纯 Markdown Skill，跨 AI 平台（Claude / Codex / Cursor / Gemini / OpenCode 等）通用 |
| **渐进式加载，上下文友好** | 未触发的 Skill 只占 metadata 几十字节，可以装几十个 |
| **Skill 创作流程成熟** | `writing-skills` 用 TDD 方法写 Skill 本身：先写压力测试场景，验证 baseline 失败，再写 Skill，再验证通过 |
| **社区与下载量大** | 75 万+ 下载，Claude Code 官方 Marketplace 收录，社区 Skill 生态活跃 |
| **不侵入代码库** | 没有 `openspec/` 或 `specs/` 目录约定，纯 agent 行为约束 |

## 6. 劣势

| 劣势 | 影响 |
|------|------|
| **无持久状态机** | 长任务中断后，agent 需要重新读 plan + 代码反推「我从哪继续」；plan 中的 checkbox 甚至可能不被 agent 主动勾选 |
| **无 Spec 档案** | Brainstorming 产出的 spec 是「一次性文档」，没有 archive 到某个真相源；下次改同一片功能时历史丢失 |
| **无 Delta 追踪** | 没有「相对当前行为的增量」语义，无法回答「这次改动了什么行为」 |
| **无跨工具协调** | OpenSpec 管 spec，Superpowers 管执行，两者之间的接力靠用户或第三个工具（如 Comet） |
| **多 skill 同时触发有歧义** | 上下文同时符合多个 skill 触发条件时，agent 的选择行为不稳定 |
| **强制 TDD 增加 token 消耗** | 每个任务至少 2 次编译/测试往返，加上 reviewer + fixer 派生，token 成本显著高于直接写代码 |
| **Subagent 派发依赖平台能力** | SDD 假设平台支持新 context subagent（Claude Code 原生支持；某些平台需 hack） |
| **强制力靠 agent 自觉** | 没有脚本护栏；agent 若决定「忽略 SKILL.md」，无法阻止（这是纯 Markdown 的宿命） |
| **对团队规范无感** | Skill 是通用的，不承载团队特定的规范（如「所有 API 用 POST」「错误码必须 xxx 前缀」）；这些得写进 CLAUDE.md |
| **文档膨胀风险** | 一个 feature 会产出 brainstorming spec + worktree 分支 + plan + 每任务 review 反馈，长任务文档散落 |
| **不适合纯探索** | Spike 类任务（快速验证可行性）不适合 SDD，太重 |

---

## 7. 适用场景

| 场景 | 适配度 |
|------|--------|
| 复杂、长流程的新功能开发 | ★★★★★ SDD + TDD + review 的核心价值区 |
| 团队希望统一 agent 的工程方法论 | ★★★★★ |
| Bug 修复、系统化调试 | ★★★★☆ `systematic-debugging` 特别契合 |
| 高风险代码（认证、支付、迁移） | ★★★★☆ 双 pass review 有价值 |
| 快速试错 / 探索式开发 | ★☆☆☆☆ 太重，用不上 |
| 单人小改（改一个字段、修一个 typo） | ★★☆☆☆☆ 流程成本 > 收益 |
| 纯文档任务 | ★☆☆☆☆ |
| 已有严格 Spec 工作流（如 OpenSpec） | ★★★☆☆ 需搭配，Superpowers 补 HOW |

---

## 8. 与本仓库 `docs/prd-spec/` 的关系

本仓库的 **PRD-Spec** 借鉴了 Superpowers 的**流程纪律**，但保留了自己的 spec 追踪能力：

| 借鉴点 | 落地 |
|--------|------|
| 三级路径分级 | **Spike / Bounded / Architectural**（WORKFLOW.md §4） |
| 先确认再实现 | 每级路径都有对应级别的确认门；Architectural 强制 `tasks.confirmed: true` 才能 apply |
| 按任务 TDD | `tasks/{domain}/{atom}.md` 是 TDD 任务清单，红→绿→重构粒度 |
| 不可降级 | 任务中途发现复杂度超预期 → 立即升级路径 |

刻意**不引入**的部分：

| Superpowers 有 | PRD-Spec 没有 | 原因 |
|----------------|---------------|------|
| 强制 SDD（每任务新 subagent） | 保留单 agent 顺序执行 | PRD-Spec 面向「需求驱动的 spec 变更」，任务粒度较粗，SDD 收益/成本不划算 |
| Worktree 强制 | 用普通 git 分支 | 简化，避免每 change 一个 worktree 的目录噪音 |
| Skill 自动触发 | 显式 slash command（`/spec propose/apply/archive`） | 可预测性 > 惊喜度 |
| Brainstorming 苏格拉底提问 | `/spec explore` 命令（可选） | 与 spec 目录解耦，避免污染 `specs/` |

一句话：**PRD-Spec 吸收了 Superpowers 的「分级 + 确认 + TDD」纪律，砍掉了 SDD/worktree/自动触发的运行时机制**。

---

## 9. 参考

- 官方入口（Skill 索引）：https://langlabs.io/obra/superpowers/skill.md
- GitHub：https://github.com/obra/superpowers
- Claude Code 插件页：https://claude.com/plugins/superpowers
- Creating Skills 文档：https://mintlify.wiki/obra/superpowers/development/creating-skills
- 安装方式：
  - Claude Code Marketplace：`/plugin install superpowers@claude-plugins-official`
  - Gemini CLI：`gemini extensions install https://github.com/obra/superpowers`
  - Cursor：Agent 中 `/add-plugin superpowers`
  - OpenCode：`/add-plugin superpowers` 或按 `.opencode/INSTALL.md` 操作
