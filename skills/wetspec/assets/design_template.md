# 技术设计：<!-- 功能名 / change 名 -->

**关联 Spec**：<!-- specs/..._spec.yaml -->
**PRD 版本**：<!-- PRD_xxx_vx.x.md -->
**日期**：<!-- YYYY-MM-DD -->

## 1. 目标与范围

<!-- 本设计解决什么问题；不做什么 -->

## 2. 架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| <!-- --> | <!-- --> | <!-- --> |

## 3. 数据流

```
<!-- 用户操作 → 前端 → 服务 → 存储 -->
```

## 4. 模块与文件布局

**模块 slug**（必填）：`<!-- 中文模块名 -->` → `<!-- english-slug，如 user-login -->`

| 路径 | 职责 |
|------|------|
| `src/<module-slug>/` | 实现（英文路径，禁止中文） |
| `src/<module-slug>/__tests__/` | 模块单元测试（框架见 `specs/.wetspec.yaml` → `unit_test`） |
| `tests/<feature_id>/` | AC 自动验收（固定 `node:test`，由 `wetspec verify` 执行） |

## 4.1 测试策略

| 层级 | 框架 | 配置来源 |
|------|------|----------|
| 单元测试 | <!-- node:test / vitest / jest / pytest --> | `specs/.wetspec.yaml` → `unit_test.framework` |
| AC 验收 | `node:test`（Node 项目） | SKILL 固定约定，不由 DP-0 改变 |

build 完成后执行：`unit_test.command`（如 `npm run test:unit`）。

## 5. 配置与常量

| 名称 | 值 | 来源（AC/PRD） |
|------|-----|----------------|
| <!-- SMS_CODE_TTL_SECONDS --> | <!-- 600 --> | <!-- AC-001 --> |

## 6. API / 接口（如有）

<!-- 请求、响应、错误码 -->

## 7. 验收映射

| AC ID | 设计要点 | 测试文件 |
|-------|----------|----------|
| AC-001 | <!-- --> | `ac-001.test.js` |

## 8. 风险与回滚

<!-- 风险、监控、回滚步骤 -->
