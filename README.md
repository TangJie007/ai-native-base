# AI Native Base

> pnpm + Turbo 管理的 Monorepo — AI 原生研发工具平台

## 项目简介

**AI Native Base** 是一个面向 AI 原生研发场景的工具平台，基于 monorepo 架构，采用 pnpm workspace + Turbo 管理。目前首个模块是 **wetspec**（PRD → Spec 工作流），后续将扩展更多 AI 研发工具链。

### 模块架构

```
packages/     # npm 包（CLI 工具、SDK 等）
skills/       # Cursor Agent Skills（编排逻辑与模板）
apps/         # Web 应用、API 服务等（待扩展）
```

## 当前模块

### wetspec — PRD → Spec 工作流

一套完整的 PRD（产品需求文档）到 Spec（结构化规格文档）工作流系统。

采用**双仓架构**设计：

- **`@wetspace/wetspec-cli`** — CLI 命令行工具，包含所有确定性脚本逻辑
- **wetspec Skill** — Cursor Agent Skill，包含编排文档、模板与决策点

#### 子命令

| 命令 | 功能 |
|------|------|
| `compare` | PRD 差异对比 + affected_specs 映射 |
| `coverage` | PRD ↔ Spec 覆盖率检查 |
| `ingest` | PDF/Word → Markdown 摄入 |
| `validate` | Spec YAML 格式校验 |
| `sync-md` | YAML → Markdown 同步 |
| `indexes` | 重建 INDEX/README |
| `sync` | 全量同步（fallback） |
| `state` | `.wetspec.yaml` 状态机管理 |
| `doctor` | 健康诊断 |
| `verify` | AC 自动验收测试 |
| `change` | Delta 隔离管理（多人协作） |
| `archive` | Delta → 主 Specs 回写 |
| `preflight` | 多人协作预检 |
| `init` | 初始化 Spec 目录结构 |
| `unit-test` | 单元测试框架检测/配置 |
| `py-install` | 安装/检测 Python 插件 |

#### 核心机制

- **Change 隔离** — 多人协作时各自只存变更 delta，互不干扰，archive 时回写主库
- **Spec 双格式** — YAML（结构化）+ Markdown（可读）双格式同步
- **自动验收** — 按 Spec 的 `acceptance_criteria` 自动运行验收测试

## 目录结构

```
ai-native-base/
├── packages/
│   └── cli/
│       └── wetspec-cli/          # @wetspace/wetspec-cli
├── skills/
│   └── wetspec/                  # wetspec Cursor Skill
├── apps/                         # 应用目录（待扩展）
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── LICENSE
```

## 环境要求

| 工具 | 最低版本 |
|------|----------|
| Node.js | ≥ 18.0.0 |
| pnpm | ≥ 9.0.0 |
| Python | ≥ 3.8（部分功能需要） |

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 常用命令

```bash
pnpm run build    # 构建所有包
pnpm run dev      # 开发模式
pnpm run lint     # 代码检查
pnpm run test     # 运行测试
pnpm run clean    # 清理构建产物
pnpm run format   # 格式化代码
```

### 使用 wetspec

```bash
# 全局安装 CLI
npm install -g @wetspace/wetspec-cli

# 安装 Python 插件
wetspec py-install

# 检查环境
wetspec doctor
```

## 技术栈

- **Monorepo 管理** — pnpm workspace + Turbo
- **运行时** — Node.js + Python
- **构建工具** — tsup（TypeScript）
- **代码格式化** — Prettier

## 许可证

[MIT](LICENSE) © TangJie007
