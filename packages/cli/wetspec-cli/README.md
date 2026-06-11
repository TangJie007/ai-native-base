# wetspec-cli

PRD → Spec 工作流命令行工具。**与 Cursor Skill 分仓发布**，可在任意 Agent / CI / 本地终端独立使用。

| 仓库 | 内容 | 安装 |
|------|------|------|
| **wetspec-cli**（本仓库） | 确定性脚本：`compare` / `change` / `verify` / `doctor` … | `npm install` 或 `pnpm add wetspec-cli` |
| **wetspec-skill** | Agent 编排：`SKILL.md` + 模板 + 决策点 | 见下方 [Skill 安装](#与-skill-配合使用) |

Skill **不包含** `scripts/`；所有命令通过本包的 `wetspec` 二进制执行。

## 安装

```bash
# 在业务项目根目录（推荐）
npm install wetspec-cli
# 或
pnpm add wetspec-cli

# 验证
npx wetspec --help
# 或
pnpm exec wetspec --help
```

全局安装（可选）：

```bash
npm install -g wetspec-cli
# 或
pnpm add -g wetspec-cli
wetspec --help
```

可选 Python 插件（PDF 摄入、正文级 diff、覆盖率）：

```bash
# 安装（推荐）
wetspec py-install

# 仅检测
wetspec py-install --check

# 无全局写权限时
wetspec py-install --user
```

等价：`npm run py:install`（项目或 wetspec-cli 源码目录内已配置时）

## 与 Skill 配合使用

推荐顺序：先 CLI，后 Skill。若用户**只装了 Skill**，Agent 会检测并提示安装本包，不会自动执行 `npm install`。CLI 就绪后若 Python 插件未装，Agent 会 **AskQuestion** 询问是否执行 `wetspec py-install`（见 Skill DP-0a）。

1. **先**在本项目安装 CLI：`npm install wetspec-cli` 或 `pnpm add wetspec-cli`
2. **再**安装 Skill（Cursor）：

```bash
npx skills add https://github.com/TangJie007/ai-native-base/tree/main/.agents/skills/wetspec \
  --skill prd-to-spec -a cursor -y
```

Skill 所在仓库：<https://github.com/TangJie007/ai-native-base>（路径：`.agents/skills/wetspec`）

## 快速开始

```bash
# PRD 对比
wetspec compare PRD_用户登录_v1.0.md PRD_用户登录_v1.1.md \
  --spec-dir specs/ --output diff.json

# 初始化 change
wetspec change init wetspec/changes/user-login-v1 \
  --main-specs specs/ --change-name user-login-v1 --prd PRD.md

# 校验 delta
wetspec change validate-delta wetspec/changes/user-login-v1

# 归档回写主 specs
wetspec archive wetspec/changes/user-login-v1 --dry-run
wetspec archive wetspec/changes/user-login-v1

# 健康检查
wetspec doctor specs/
```

## 命令一览

| 命令 | 说明 |
|------|------|
| `compare` | PRD 差异 + affected_specs 映射 |
| `coverage` | PRD↔Spec 覆盖率 |
| `ingest` | PDF/Word → Markdown |
| `validate` | Spec YAML 校验 |
| `sync-md` | YAML → MD |
| `indexes` | 重建 INDEX/README |
| `state` | `.wetspec.yaml` 状态机 |
| `doctor` | 健康诊断（含 unit_test 配置检查） |
| `unit-test` | 单元测试框架 detect / configure（DP-0） |
| `verify` | AC 自动验收 |
| `change` | delta 隔离 |
| `archive` | delta → 主 specs |
| `preflight` | 多人预检 |
| `init` | 初始化 Spec 目录结构 |
| `py-install` | 安装 / 检测 Python 插件 |

运行 `wetspec --help` 查看完整用法。

## 发布（npm）

本包为纯 Node.js CLI，**无需打包**，在仓库根目录：

```bash
npm pack --dry-run   # 预览发布内容
npm publish          # 发布到 npm
```

## 目录约定（业务项目）

```
specs/                      # 主 Spec 库
wetspec/changes/<name>/     # change 工作区（changes_root 可配置）
  wetspec-delta/
  design.md / tasks.md
```

在 `specs/.wetspec.yaml` 设置 `changes_root: wetspec/changes`。

## 本地开发（monorepo 联调）

若 CLI 与示例项目在同一仓库：

```bash
npm install ./wetspec-cli
```

或在 `wetspec-cli` 目录执行 `npm link`，再在业务项目 `npm link wetspec-cli`。
