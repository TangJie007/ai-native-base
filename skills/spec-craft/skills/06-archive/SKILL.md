---
name: archive
stage: 6
previous: 05-apply
produces:
  - specs/atom/{domain}/{atom}.md  # 更新或新建
  - specs/changes/archive/YYYY-MM-DD-{name}/  # 整个 change 移入
requires_confirm: true  # 归档前需最后确认
---

# 06-archive：归档到真相源

## 何时进入

- 所有 tasks 已完成且勾选
- 所有测试通过
- 用户已确认功能符合预期

## Iron Law

1. **未通过 guard 不 archive**：必须运行 `guard-archive.py`
2. **archive 是不可逆的**：一旦合并到 `specs/atom/`，历史只能通过 `changes/archive/` 追溯
3. **不修改 tasks/**：tasks 留在 archive 里供审计，不 merge 到真相源
4. **archive 前最后确认**：给用户最后一次的确认机会

## 前置检查（Guard）

```bash
python guard/guard-archive.py specs/changes/{name}/
```

Guard 会检查：

- [ ] `change.yaml.tasks.confirmed == true`
- [ ] `change.yaml.tasks.complete == true`
- [ ] 所有 `tasks/**/*.md` 的 checkbox 已勾完
- [ ] 所有 `delta/**/*.md` 存在且非空
- [ ] 无循环依赖
- [ ] `delta` 与 `target` 路径合法

任一失败 → 修复后重跑。

## 步骤

### 1. 用户最终确认

向用户展示：

- 即将合并到哪些 `specs/atom/**.md`
- 各 Requirement 的最终版本（简要）
- 归档日期与 commit 信息

**用户确认后**继续。

### 2. 合并 delta 到 atom

对 `change.yaml.atoms[]` 中的每个 atom：

- **operation == ADDED**：直接复制 `delta/{domain}/{atom}.md` 到 `specs/atom/{domain}/{atom}.md`
- **operation == MODIFIED**：
  - 读既有 `specs/atom/{domain}/{atom}.md`
  - 应用 delta 的变更（新增 Requirement / 修改 Requirement / 删除 Requirement）
  - 更新 `Change History` 段
- **operation == REMOVED**：
  - 从 `specs/atom/{domain}/{atom}.md` 移除对应 Requirement
  - 更新 `Change History` 注明弃用原因

### 3. 更新 specs/README.md

- 更新 atom 表（列出所有已 archive 的 atom）
- 移除进行中的 change
- 更新进行中 change 表

### 4. 更新 change.yaml

- `status: archived`
- `archive.at`：ISO 日期
- `archive.commit`：当前 HEAD SHA（若 git 可用）

### 5. 移动到 archive

```bash
mv specs/changes/{name} specs/changes/archive/YYYY-MM-DD-{name}
```

**保留**整个 change 目录，包括：

- `change.yaml`
- `proposal.md`
- `design.md`
- `delta/`（供审计"当时打算改什么"）
- `tasks/`（供审计"当时怎么做的 TDD"）

### 6. 提交（推荐）

```bash
git add specs/atom/ specs/changes/
git commit -m "archive({name}): <一句话概括>"
```

## 完成判据

- `specs/atom/{domain}/{atom}.md` 已更新
- `specs/changes/{name}/` 已不存在（移入 archive）
- `specs/changes/archive/YYYY-MM-DD-{name}/` 存在
- `change.yaml.status == archived`
- `specs/README.md` 已更新

## 常见错误

- **archive 后发现 bug**：不要回滚 archive；建新的 change 修正
- **两个 change 修改同一 atom**：以 PRD 最新为准，重跑 propose
- **忘更新 specs/README.md**：会导致后续 propose 无法快速定位既有 atom
- **直接改 specs/atom/ 而不走 change**：有活跃 change 时禁止；应改 delta

## 参考

- Review checklist：`../../references/review-checklist.md §Archive Review`
- 变更追溯：`../../references/change-yaml-schema.md §archive`

## 后续

Archive 后，本 change 生命周期结束。若需修改，建新的 change。
