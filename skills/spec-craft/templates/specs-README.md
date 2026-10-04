# <project-name> Spec

> 本项目的行为规格真相源。
> 由 `spec-craft` skill 管理。

## 目录结构

```
specs/
├── README.md          # 本文件
├── atom/              # 行为规格真相源（archive 后合并）
│   └── <domain>/
│       └── <atom>.md
├── changes/           # 进行中的 change
│   └── <name>/
│       ├── change.yaml
│       ├── proposal.md
│       ├── design.md
│       ├── delta/
│       └── tasks/
└── changes/archive/   # 已归档的 change 历史
    └── YYYY-MM-DD-<name>/
```

## Atoms

| Domain | Atom | 说明 | 最近更新 |
|--------|------|------|----------|
| <auth> | <sms-login> | 手机号验证码登录 | 2026-10-04 |

## 进行中的 Change

| Name | Path | Status | 创建日期 |
|------|------|--------|----------|
| <add-sms-login> | architectural | proposed | 2026-10-04 |

## 已归档的 Change

| Name | Archived At | Commit |
|------|-------------|--------|
| <add-user-auth> | 2026-10-01 | abc1234 |

## 工作流命令

| 命令 | 说明 |
|------|------|
| `/spec explore` | 需求澄清（不落盘） |
| `/spec propose` | 建 change + delta |
| `/spec design`  | 技术设计 |
| `/spec tasks`   | TDD tasks 拆解 |
| `/spec apply`   | TDD 实现 |
| `/spec archive` | 归档到真相源 |

## 路径分级

- **Spike**：可行性探针，通常不建 change
- **Bounded**：单 atom 小改，简化 artifact
- **Architectural**：完整流程

详见 skill 的 `references/path-tiering.md`。
