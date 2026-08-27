# Specs 索引

> 本目录为 PRD-Spec **唯一产出根**。

## Atom 规格（真相源）

路径：`specs/atom/{domain}/{atom}.md`

| 领域 | Atom | 文件 | 说明 |
|------|------|------|------|
| auth | sms-login | [atom/auth/sms-login.md](./atom/auth/sms-login.md) | 验证码登录 |
| auth | session | [atom/auth/session.md](./atom/auth/session.md) | 会话管理 |
| billing | checkout | [atom/billing/checkout.md](./atom/billing/checkout.md) | 结账 |

## 进行中的变更

| Change | 路径 | 状态 |
|--------|------|------|
| add-sms-login | [changes/add-sms-login/](./changes/add-sms-login/) | 进行中（见 change.yaml） |

## PRD 输入

见 [prd-index.md](./prd-index.md)（可选）；各 change 的 `change.yaml` 登记本 change 用到的 PRD。

## 目录说明

```
specs/
├── atom/{domain}/{atom}.md     ← 需求 spec 真相源
├── prd-index.md
├── prd/
└── changes/{name}/             ← 变更 + archive/
    ├── change.yaml             ← 状态、PRD、atom 映射
    ├── delta/{domain}/{atom}.md
    └── tasks/{domain}/{atom}.md
```
