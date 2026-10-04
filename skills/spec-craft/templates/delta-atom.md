# Delta: <domain>/<atom-name>

> 本文件描述相对 `specs/atom/<domain>/<atom-name>.md` 的需求增量。
> 使用 RFC 2119 关键词（MUST / SHALL / SHOULD / MAY），见 `references/rfc-2119.md`。

## Purpose

<一段话说明该 atom 要变什么>

## Change Type

- [ ] ADDED — 新增 atom
- [ ] MODIFIED — 修改既有 Requirement
- [ ] REMOVED — 弃用某些 Requirement

## Requirements

### REQ-<domain>.<atom>.<n>: <Requirement 标题>

**Keywords**: MUST | SHALL | SHOULD | MAY
**Operation**: ADDED | MODIFIED | REMOVED
**Baseline**: <若 MODIFIED / REMOVED，指向既有 atom 的 Requirement ID>

<Requirement 正文，一段话说清「行为契约」>

#### Scenarios

##### SC-<n>.1: <场景标题>

- **GIVEN** <前置状态，可验证>
- **WHEN** <单一触发事件>
- **THEN** <可验证结果>
- **AND THEN** <附加断言，可选>

##### SC-<n>.2: <场景标题>

- **GIVEN** ...
- **WHEN** ...
- **THEN** ...

## Non-Goals

- <本 delta 明确不做什么>

## Change History

| Date | Change | By | Ref |
|------|--------|----|-----|
| 2026-10-04 | ADDED REQ-auth.sms-login.1 | agent | change: add-sms-login |
