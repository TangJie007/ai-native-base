# spec-craft

PRD 驱动的全链路 Spec 工作流。让 AI 编码 agent 从「凭感觉写代码」切换到「有规格契约的开发」。

## 一句话

**PRD 说明产品要什么 → `change.yaml` 记录这次改什么 → 各 atom 的 `tasks/` 驱动 TDD 实现 → `archive` 将 delta 写入 `specs/atom/` 作为真相源。**

## 特性

- **单一真相源**：`specs/atom/` 是行为契约的唯一权威版本
- **增量管理**：`specs/changes/` 用 delta 描述变更，不全量复制
- **路径分级**：Spike / Bounded / Architectural 三档，流程厚度按需缩放
- **状态机**：`change.yaml` 是唯一机器读的状态位
- **TDD 强制**：`tasks/{domain}/{atom}.md` 红绿重构粒度
- **平台无关**：只依赖标准 Markdown，任何支持 Markdown 的 agent 都能用

## 快速开始

### 1. 复制 skill 到你的项目

```bash
# 建议位置（任选其一）
cp -r skills/spec-craft <your-project>/.skills/spec-craft/
# 或放到项目根任意位置，只要 agent 能读到
```

### 2. 初始化 `specs/`

```bash
cd <your-project>
mkdir -p specs/atom specs/changes specs/changes/archive
cp .skills/spec-craft/templates/specs-README.md specs/README.md
```

### 3. 让 agent 读 SKILL.md

在你的对话中告诉 agent：

> 请先读 `.skills/spec-craft/SKILL.md`，然后按 `/spec <stage>` 工作。

或直接把 `SKILL.md` 作为系统 prompt 的一部分。

### 4. 走完整流程

```
/spec explore   # 需求不清晰时先澄清
/spec propose   # 建 change
/spec design    # 补技术设计
/spec tasks     # 生成 TDD 任务
/spec apply     # TDD 实现
/spec archive   # 归档
```

每个阶段结束后，agent 会**主动请求用户确认**（Iron Law #1）。

## 目录结构

```
spec-craft/
├── SKILL.md                       # 入口（本文件索引全部子 skill）
├── README.md                      # 本文件
├── CHANGELOG.md
├── skills/                        # 6 个阶段子 skill
│   ├── 01-explore/SKILL.md
│   ├── 02-propose/SKILL.md
│   ├── 03-design/SKILL.md
│   ├── 04-tasks/SKILL.md
│   ├── 05-apply/SKILL.md
│   └── 06-archive/SKILL.md
├── references/                    # 按需读的详细规范
│   ├── spec-format.md
│   ├── change-yaml-schema.md
│   ├── rfc-2119.md
│   ├── scenario-examples.md
│   ├── path-tiering.md
│   ├── tdd-loop.md
│   ├── prd-ingestion.md
│   └── review-checklist.md
├── templates/                     # 复制即用的骨架
│   ├── change.yaml
│   ├── proposal.md
│   ├── design.md
│   ├── delta-atom.md
│   ├── tasks-atom.md
│   └── specs-README.md
├── guard/                         # 可选 Guard 脚本（Python 3 + PyYAML，跨平台）
│   ├── validate-change-yaml.py
│   ├── check-delta-mirror.py
│   └── guard-archive.py
└── examples/                      # 端到端样例
    └── add-sms-login/
```

## 平台接入

本 skill **不绑定任何具体平台**。以下给出常见平台的接入方式：

| 平台 | 接入方式 |
|------|---------|
| Claude Code | 复制到 `.claude/skills/spec-craft/`，agent 读 `SKILL.md` 即可；`/spec` 命令映射到子 skill |
| Cursor | 把 `SKILL.md` 主体复制到 `.cursor/rules/spec-craft.mdc`，`skills/` 与 `references/` 保持原位置 |
| Trae | 加入用户级 skills 目录，Slash command 手动映射到对应子 skill |
| Gemini CLI | 用 `@~/path/to/SKILL.md` 引用 |
| 其他 agent | 只要能读 Markdown + 按指令写文件即可 |

**关键**：所有子 skill 与 references 使用**相对路径**互链，跨平台可移植。

## 与现有体系的对比

| 维度 | OpenSpec | Superpowers | **spec-craft** |
|------|----------|-------------|----------------|
| 定位 | spec-driven 工作流 | 工程方法论 skill 集合 | PRD 驱动的 spec 工作流 |
| 格式 | YAML spec | Markdown skill | YAML change + MD spec/tasks |
| 增量管理 | 强（delta 模型） | 弱 | 强（借鉴 OpenSpec） |
| TDD 强制 | 中 | 强 | 强（借鉴 Superpowers） |
| PRD 支持 | 中 | 弱 | 强（专属 `prd-ingestion.md`） |
| 平台绑定 | 依赖 CLI | 跨平台 | 跨平台（纯 Markdown） |
| CLI 依赖 | 需要 `openspec` CLI | 无 | 可选（guard 脚本） |

## 示例

`examples/add-sms-login/` 展示了完整流程：

1. PRD 提到「手机号验证码登录」需求
2. 分类 Architectural
3. 建立 `change.yaml` + `proposal.md` + `delta/auth/sms-login.md`
4. 补 `design.md` + `tasks/auth/sms-login.md`
5. TDD 实现
6. `archive` 合并到 `specs/atom/auth/sms-login.md`

## 设计原则

1. **读散写聚**：PRD 可任意路径读；skill 产出只在 `specs/` 下
2. **YAML 管元数据、MD 管正文**：`change.yaml` 是唯一机器读状态位
3. **路径分级**：流程厚度按风险缩放
4. **先确认再动手**：Iron Law #1 是最强的护栏
5. **单一真相源**：`specs/atom/` 是唯一权威版本，`tasks/` 只留在 archive

## 版本

当前版本见 `CHANGELOG.md`。
