# Example: add-sms-login

本目录展示 `spec-craft` 的**完整端到端示例**：从 PRD 中的手机号验证码登录需求，一路走到 TDD 实现与归档。

## 场景背景

某 SaaS 平台 `PRD.md` 第 3.1 节新增需求：**手机号验证码登录**。

用户当前只能通过邮箱+密码登录，希望新用户用手机号快速注册登录，老用户也能作为备用登录方式。

## 决策摘要

- **路径分级**：Architectural（新功能、新 atom、新数据表）
- **涉及的 atom**：
  - `auth/sms-login` — ADDED（新增 atom）
  - `auth/sms-send` — ADDED（新增 atom，独立拆分）
- **Change 状态**：本示例展示归档完成状态

## 目录结构

```
examples/add-sms-login/
├── change.yaml
├── proposal.md
├── design.md
├── delta/
│   └── auth/
│       ├── sms-send.md
│       └── sms-login.md
└── tasks/
    └── auth/
        ├── sms-send.md
        └── sms-login.md
```

## 走通流程

### 阶段 1: explore（略）

用户口头描述"想加手机号验证码登录"，Agent 提问澄清：

- 是否支持国际手机号？→ 本版本只做中国大陆
- 验证码有效期？→ 5 分钟
- 频率限制？→ 60 秒 1 次

### 阶段 2: propose

产出：`change.yaml` + `proposal.md` + `delta/auth/sms-send.md` + `delta/auth/sms-login.md`

`change.yaml.status: proposed`，`tasks.confirmed: false`。

**用户确认**：Scope In / Scope Out / delta 需求点确认无误。

### 阶段 3: design

产出：`design.md`（含 3 条 ADR）

关键决策：
- **ADR-1**：用整数分存储金额（不适用本例）→ 用 JWT 而非 session（本例）
- **ADR-2**：短信服务商接口抽象，便于替换
- **ADR-3**：验证码加密存储

`change.yaml.design.approved_at: 2026-10-04T10:00:00+08:00`

**用户确认**：设计可行。

### 阶段 4: tasks

产出：`tasks/auth/sms-send.md`（4 个 task）+ `tasks/auth/sms-login.md`（5 个 task）

每个 task 都关联到具体的 REQ + SC。

`change.yaml.tasks.confirmed: true`

**用户确认**：tasks 粒度合适，覆盖所有 Scenario。

### 阶段 5: apply

TDD 红绿重构循环，10 个 task 逐个执行。

`change.yaml.tasks.complete: true`

### 阶段 6: archive

- 运行 `guard/guard-archive.py` 通过
- `delta/auth/sms-send.md` 合并到 `specs/atom/auth/sms-send.md`（新建）
- `delta/auth/sms-login.md` 合并到 `specs/atom/auth/sms-login.md`（新建）
- `change.yaml.status: archived`，`archive.at: 2026-10-05`
- 整个 change 目录移到 `specs/changes/archive/2026-10-05-add-sms-login/`

## 各文件对应内容

- [change.yaml](./change.yaml) — 变更记录（归档后状态）
- [proposal.md](./proposal.md) — 提案：为什么做、做什么、不做什么
- [design.md](./design.md) — 技术设计：接口、数据结构、3 条 ADR
- [delta/auth/sms-send.md](./delta/auth/sms-send.md) — 发送验证码的 spec 增量
- [delta/auth/sms-login.md](./delta/auth/sms-login.md) — 验证码登录的 spec 增量
- [tasks/auth/sms-send.md](./tasks/auth/sms-send.md) — 发送验证码的 TDD tasks
- [tasks/auth/sms-login.md](./tasks/auth/sms-login.md) — 验证码登录的 TDD tasks

## 从本示例可以学到

1. **change.yaml 是全流程的中央状态位**：从 proposed → archived，所有门禁都在里面
2. **delta 用 RFC 2119 关键词**：MUST 表示强要求，Scenario 用 GIVEN/WHEN/THEN
3. **tasks 与 delta 一一对应**：每个 SC 至少被 1 个 task 覆盖
4. **ADR 记录技术决策**：只写非显而易见的关键决策
5. **archive 后真相源更新**：`specs/atom/` 是唯一权威版本，`tasks/` 留在 archive 供审计

## 复用方式

如果你想给自己的项目也做一个类似的 change，可以：

```bash
# 1. 复制本示例目录
cp -r examples/add-sms-login/ <your-project>/specs/changes/<your-change-name>/

# 2. 修改 change.yaml 的 name、created、author

# 3. 用你的 PRD 内容替换 proposal.md 与 delta/

# 4. 用你的技术选型替换 design.md

# 5. 用你的 TDD 任务替换 tasks/

# 6. 按 SKILL.md 走完整流程
```
