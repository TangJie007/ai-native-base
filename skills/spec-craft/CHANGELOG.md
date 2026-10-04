# CHANGELOG

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 风格。版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-10-04

### Added

- **SKILL.md**：主入口，含 Iron Law 6 条、6 阶段命令映射、路径分级速览
- **6 个阶段子 skill**：
  - `01-explore`：需求澄清（只对话不落盘）
  - `02-propose`：建 change + proposal + delta
  - `03-design`：技术设计
  - `04-tasks`：TDD tasks 拆解
  - `05-apply`：TDD 红绿重构实现
  - `06-archive`：归档到真相源
- **8 份 references**：spec-format / change-yaml-schema / rfc-2119 / scenario-examples / path-tiering / tdd-loop / prd-ingestion / review-checklist
- **6 个 templates**：change.yaml / proposal.md / design.md / delta-atom.md / tasks-atom.md / specs-README.md
- **3 个 guard 脚本**（Python 3 + PyYAML，跨平台）：validate-change-yaml.py / check-delta-mirror.py / guard-archive.py
- **端到端示例**：`examples/add-sms-login/`

### Design Decisions

- 全链路（explore → archive），不做「只做需求侧」的精简版
- 平台无关（通用 Markdown），不做 marketplace 元数据
- `skills/` 目录用数字前缀 `01-` 到 `06-`，让目录按顺序展示且不依赖平台元数据排序
- `specs/` 是用户项目的产出目录，**不打包进 skill**
- Guard 脚本用纯 Python 3 + PyYAML 实现，Windows / macOS / Linux 直接运行
- Iron Law 6 条，明确「未确认不写代码」是最高约束

### 参考来源

- OpenSpec：`github.com/Fission-AI/OpenSpec`（delta 模型、archive 机制）
- Superpowers：`github.com/obra/superpowers`（三级路径分级、TDD 纪律、SKILL.md 三段式）
- Comet：`github.com/rpamis/comet`（Guard 脚本、状态机字段、Review 分档）
