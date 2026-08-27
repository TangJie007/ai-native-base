# PRD-Spec

轻量级 PRD → Spec 工作流。**所有工作流产出集中在 `specs/` 目录。**

## 文档

| 文件 | 说明 |
|------|------|
| [WORKFLOW.md](./WORKFLOW.md) | **工作流**（命令、路径分级、端到端示例） |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架构设计（目录、格式、协作） |
| [templates/](./templates/) | 各 artifact 模板 |

## 核心理念

```
specs/                                    ← 唯一产出根目录
├── atom/{domain}/{atom}.md               ← 需求 spec 真相源（原子化）
├── prd-index.md                          ← PRD 外部输入登记（可选）
├── prd/                                  ← 可选 PRD 副本
└── changes/{name}/                       ← 变更工作区
    ├── change.yaml                       ← ★ 变更记录（YAML：状态、PRD、atom 映射）
    ├── proposal.md · design.md
    ├── delta/{domain}/{atom}.md        ← 需求增量（镜像 atom 路径）
    └── tasks/{domain}/{atom}.md        ← TDD 任务（镜像 atom 路径，留 archive）
```

- **需求 spec** 写在 `specs/atom/` 下，一个 atom 一个文件
- **`change.yaml`** 登记 PRD 输入、atom 映射、实现门禁（`tasks.confirmed` / `tasks.complete`）
- `delta/`、`tasks/` 路径与 `specs/atom/` **镜像**（方案 B）
- 外部 PRD 可读仓库任意路径

## 快速开始

1. 阅读 [WORKFLOW.md](./WORKFLOW.md) 了解流程
2. 阅读 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解 atom 格式与 `change.yaml` 字段
3. 创建 `specs/atom/` 与 `specs/changes/`
4. `/spec propose` → `/spec apply` → `/spec archive`
