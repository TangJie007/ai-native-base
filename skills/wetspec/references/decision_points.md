# wetspec 阻塞决策点（AskQuestion 手册）

> **硬规则**：到达决策点时，Agent **必须**调用 `AskQuestion` 工具并**等待用户选择**。
> 不得用「建议下一步」、默认选项、历史偏好或纯文字列表代替。
> 分析跑完 ≠ 工作流结束；**未 AskQuestion 视为违规**。

## AskQuestion 选项文案规范

每个选项的 `label` **必须**包含括号说明，格式：

```
<动作名称>（<选了这个会发生什么>）
```

示例：`归档 delta 到主 specs（将 change 内 3 个 delta YAML 回写主库，之后才能以主库为准做 build）`

**禁止**无说明的裸选项，如仅写「归档」「设计」「暂停」。

---

## 决策点一览

| # | 时机 | phase 前置 | 不得跳过 |
|---|------|-----------|----------|
| DP-0a | CLI 就绪后，Py 插件未就绪 | 任意工作流入口 | ✅（`--check` 通过则跳过） |
| DP-0 | 首次 `wetspec init` 后 | `parse` 中 / init 刚完成 | ✅（仅首次；已配置则跳过） |
| DP-1 | Spec / delta 分析完成 | → `specs-ready` | ✅ |
| DP-2 | PRD 结构大变 | `update` 中 | ✅ |
| DP-3 | 设计产物生成后 | `design` | ✅ |
| DP-4 | 验收失败 | `verify` | ✅ |
| DP-5 | archive 预览后 | `done` | 推荐 |

---

## DP-0a：Python 插件就绪（工作流入口）

**触发**：**CLI Guard 已通过**，且 `wetspec py-install --check` 退出非 0（无 Python、或核心依赖 PyYAML/rapidfuzz 未装）。

**已就绪则跳过**：`wetspec py-install --check` 退出 0（核心依赖齐全；可选 PDF/Word 包未装不触发本决策点，仅 doctor 警告）。

**必须先执行**（展示摘要后再 AskQuestion）：

```bash
wetspec py-install --check
# 或 JSON：wetspec py-install --check --json
```

摘要须含：Python 是否可用、缺少核心/可选包、本轮任务是否强依赖 Py（见下表）。

| 本轮任务 | 是否强依赖 Py |
|----------|----------------|
| `wetspec ingest` PDF/Word | ✅ 强依赖 |
| `wetspec compare` / `coverage`（增强模式） | 推荐 Py，可 `--node-only` 回退 |
| `validate` / `verify` / `sync-md` / `state` / `build` / `design` | ❌ 不依赖 |

**无 Python 3 时**（`--check` 显示 python 不可用）：**不得**提供「安装插件」为有效路径（`wetspec py-install` 必然失败），仅提供「跳过 Node 回退」与「暂停」。

**AskQuestion 选项**（`label` 须含括号说明）：

| id | label（含括号说明） | 动作 |
|----|---------------------|------|
| `py-install` | 安装 Python 插件（执行 `wetspec py-install`；增强 compare/coverage，支持 PDF/Word 摄入） | `wetspec py-install` → 成功后继续 |
| `skip-node` | 跳过，使用 Node 回退（compare/coverage 加 `--node-only`；PDF/Word ingest 本轮不可用） | 会话内标记；强依赖 Py 的任务须 HARD STOP |
| `pause` | 暂停（自行安装 Python 3 / pip 后重试 `wetspec py-install --check`） | 结束本轮 |

用户选 `py-install` 后 **必须执行** `wetspec py-install`（失败则报告错误，可改选 `skip-node` 或 `pause`）。

**禁止**未经 AskQuestion 擅自执行 `wetspec py-install`（与 CLI npm 安装策略一致：用户确认后再装）。

---

## DP-0：单元测试框架（项目首次初始化）

**触发**：全量解析 **Step 4 `wetspec init` 完成后**，且 `specs/.wetspec.yaml` 中 **无** `unit_test.framework`（`unit_test` 为 `null` 或未配置）。

**已配置则跳过**（`unit_test.framework` 已存在，或 `deferred: false` 且 framework 非空）。

**必须先执行**（给 Agent 推荐依据）：

```bash
wetspec unit-test detect --root . --json
```

根据 `recommendation` 展示推荐及理由。说明：**验收与单元测试同一套**：`wetspec verify` 在 `src/**/__tests__/` 按 `describe(LOG-xxx)→describe(AC-xxx)` 逐条跑（`node:test`）；非 `node:test` 时整包执行 `unit_test.command`。

**AskQuestion 选项**（`label` 须含括号说明；推荐项放第一）：

| id | label（含括号说明） | 动作 |
|----|---------------------|------|
| `node:test` | node:test（推荐纯 Node 模块：零依赖，Node 18+ 内置；写入 .wetspec.yaml 与 test:unit 脚本） | `configure --framework node:test` |
| `vitest` | vitest（适合 Vite/前端；写入配置并添加 vitest devDependency） | `configure --framework vitest [--install]` |
| `jest` | jest（适合 React/Next 等已有 Jest 项目；写入配置并添加 jest devDependency） | `configure --framework jest [--install]` |
| `pytest` | pytest（Python 项目；仅写入 .wetspec.yaml，不修改 package.json） | `configure --framework pytest` |
| `defer` | 暂缓选定（记录 deferred；build 前必须再跑 DP-0 或 configure） | `configure --framework defer` |

用户选定后 **必须执行**：

```bash
wetspec unit-test configure specs/ --framework <id> --root . [--install]
```

`vitest` / `jest` 用户确认安装依赖时加 `--install`。

---

## DP-1：Spec / delta 就绪（最常用）

**触发**：全量解析、主库增量、或 **Change 工作流** `validate-delta` 通过后。

**必须先执行**：

```bash
wetspec state set specs/ --field phase --value specs-ready
```

**展示摘要**（再 AskQuestion）：PRD 版本、变更条数、`affected_specs`、覆盖率、change 路径。

**AskQuestion 选项**（`label` 照抄或等价改写）：

| id | label（含括号说明） | 动作 |
|----|---------------------|------|
| `design` | 进入技术设计（生成 proposal/design/tasks，明确架构、配置常量与 AC 映射，不写代码） | `start-design` → `/wetspec-design` |
| `archive` | 归档 delta 到主 specs（把 change 内 affected YAML 回写主库并同步 MD，主库成为最新 Spec 真相源） | dry-run → DP-5 → `wetspec_archive.js` |
| `build` | 直接实现（跳过设计，按 Spec/delta 写 src 与测试；适合改动小且需求已够清晰） | `skip-design` 或 done → `/wetspec-build` |
| `review` | 先 review / 修改（人工检查 delta 或 Spec 内容，确认无误后再选归档或设计；不执行任何写库/写代码） | 保持 `specs-ready` |
| `pause` | 暂停，稍后继续（保留 change 工作区与当前 phase，本次会话结束，下次从同一 change 恢复） | 保持 `specs-ready`，输出路径 |

---

## DP-1b：全量解析完成（Step 7 专用，选项略少）

| id | label（含括号说明） | 动作 |
|----|---------------------|------|
| `design` | 进入技术设计（基于新生成的 Spec 写技术方案，再进入实现） | `/wetspec-design` |
| `skip-design` | 暂不设计，到此为止（Spec 已就绪但不写 design；可直接 doctor/覆盖率检查，实现时再 build） | `skip-design` → `done` |
| `review` | 先 review / 修改 Spec（检查解析结果、改 YAML/MD 后重新 validate，不进入设计或实现） | 保持 `specs-ready` |
| `build` | 跳过设计，直接实现（已有清晰 Spec，立即写代码与 AC 测试） | `/wetspec-build` |

---

## DP-2：增量 vs 全量同步

**触发**：`compare_prd` 显示模块大规模增删、或增量映射不可靠。

| id | label（含括号说明） | 动作 |
|----|---------------------|------|
| `incremental` | 继续增量更新（只改 affected_specs，走 change delta，改动面最小） | Change 隔离工作流 |
| `full-sync` | 改走全量同步（PRD 与主 Spec 整库对齐，适合结构重组；先 dry-run 预览 diff） | `wetspec_sync.js --dry-run` |
| `abort` | 暂停，人工确认 PRD（PRD 本身可能有问题，先不改 Spec） | 保持当前 phase |

---

## DP-3：设计产物确认

**触发**：`proposal.md` / `design.md` / `tasks.md` 生成后。

| id | label（含括号说明） | 动作 |
|----|---------------------|------|
| `confirm` | 确认设计，进入实现（认可 design.md，写入 design_doc，之后可 /wetspec-build） | `design-complete` → 提示 build |
| `archive-first` | 先归档 Spec 再实现（先把 delta 回写主库，再按主库 Spec + design 写代码） | archive → build |
| `edit` | 需要修改设计（对 proposal/design/tasks 提修改意见，保持 design 阶段不重开 Spec） | 保持 `phase=design` |
| `pause` | 暂停（设计文档已生成但未确认，下次从 design 阶段续作） | 保持 `phase=design` |

---

## DP-4：验收失败

**触发**：`wetspec_verify.js` 返回 fail。

| id | label（含括号说明） | 动作 |
|----|---------------------|------|
| `fix` | 修复代码后重试（改 src/tests 使 AC 通过，回到 build→verify） | `verify-fail` → `/wetspec-build` |
| `update-spec` | Spec 有误，先改 Spec（需求或 AC 写错，先更新 YAML 再重新实现） | 回到 `specs-ready` |
| `accept-deviation` | 接受偏差并记录（已知不满足 AC 但业务认可，文档记录原因，人工 sign-off） | 记录偏差，不自动标 implemented |

---

## DP-5：archive 预览后

**触发**：`wetspec_archive.js --dry-run` 成功。

| id | label（含括号说明） | 动作 |
|----|---------------------|------|
| `archive` | 确认回写主 specs（执行真实 archive，主库版本/changelog 更新，change delta 使命完成） | `wetspec_archive.js`（无 dry-run） |
| `cancel` | 取消，继续改 delta（不回写主库，继续在 change 内修改 Spec 后重新 validate） | 保持 change |

---

## Agent 自检（每次分析结束）

在输出总结**之前**自问：

1. 是否已做 **CLI Guard**（未装 `@wetspace/wetspec-cli` 时是否 HARD STOP 而非擅自 npm install）？
2. 是否已做 **Py Guard**（`py-install --check` 失败时是否 **AskQuestion DP-0a**，而非擅自 `py-install`）？
3. 当前 phase 是否应为 `specs-ready` / `design` / `verify`？
4. 是否已调用 **AskQuestion**，且每个选项 label 含 **（）说明**？
5. 是否擅自执行了 archive / design / build / py-install？

任一为「否」→ 停止输出，先补齐 Guard 或 AskQuestion。
