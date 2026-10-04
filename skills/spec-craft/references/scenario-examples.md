# 场景（Scenario）写法

本文件提供 GIVEN / WHEN / THEN 场景描述的正例与反例，帮助 agent 与用户写出可测试的行为契约。

## 1. 核心原则

好的 Scenario 必须满足 **TAMPER** 5 要素：

| 字母 | 要素 | 说明 |
|------|------|------|
| **T** | Testable | 可测试，有明确的通过/失败判据 |
| **A** | Atomic | 单一事件，一次触发 |
| **M** | Measurable | 可度量，避免模糊词 |
| **P** | Precise | 精确描述，不含歧义 |
| **E** | Executable | 实现者能据此写代码 |
| **R** | Reviewable | 评审者能据此判断是否符合 |

## 2. GIVEN 的正反例

### ✅ 好

```
- GIVEN 用户账号存在且 phone = "+8613800000000"
- GIVEN 上次发送验证码时间为 3 分钟前
- GIVEN 数据库中有 SmsCode 记录且 expiresAt > now()
- GIVEN 用户处于未登录状态
- GIVEN 请求通过 HTTPS 发送且包含有效的 CSRF token
```

**特点**：可验证的具体状态，包含关键属性。

### ❌ 坏

```
- GIVEN 用户已注册              # 无法验证"已注册"的定义
- GIVEN 用户是正常用户          # "正常"含模糊词
- GIVEN 系统运行正常            # 无法验证
- GIVEN 用户想登录              # "想"是主观状态
```

**问题**：模糊、无法验证、无法据此准备测试数据。

### 修复策略

- 用**具体的字段值**代替形容词
- 用**时间点**代替"之前"、"之后"
- 用**明确的对象状态**代替"正常"、"有效"

## 3. WHEN 的正反例

### ✅ 好

```
- WHEN 用户 POST /api/auth/sms-login { phone: "+8613800000000", code: "123456" }
- WHEN 短信服务商 API 返回 HTTP 200 与 { sid: "SMS_123456" }
- WHEN 用户点击"发送验证码"按钮
- WHEN 后台任务在 10 秒后开始处理
```

**特点**：单一、明确、可观察的事件。

### ❌ 坏

```
- WHEN 用户尝试登录              # 不清楚"尝试"是啥
- WHEN 系统在空闲时              # "空闲"含模糊词
- WHEN 网络不稳定                # 主观描述
- WHEN 用户遇到问题              # 无法验证
```

**问题**：不是单一事件、无法验证。

### 修复策略

- 用**具体 API 调用**或**具体 UI 操作**
- 用**具体返回值**或**具体状态变化**
- 避免"当...时"、"遇到...时"这种宽泛表达

## 4. THEN 的正反例

### ✅ 好

```
- THEN 接口 MUST 返回 HTTP 200
- THEN 响应 body 中 MUST 包含字段 token 且长度为 64 位 base64 字符串
- THEN 数据库中 User.phoneVerified MUST 被设置为 true
- THEN 短信服务商 API MUST 被调用恰好 1 次
- THEN 用户在 60 秒内 MUST 收到一条含 6 位数字的短信
```

**特点**：可验证的断言，含具体字段与数值。

### ❌ 坏

```
- THEN 登录成功                  # 无法验证"成功"的定义
- THEN 用户完成认证              # 无具体指标
- THEN 系统表现良好              # 主观
- THEN 用户满意                  # 无法测
```

**问题**：无法验证、无法据此写测试。

### 修复策略

- 用**HTTP 状态码**代替"成功"、"失败"
- 用**具体字段**代替"响应正确"
- 用**具体数值**代替"很快"、"很多"
- 用**具体操作次数**代替"处理完毕"

## 5. AND THEN 的用法

用于**附加断言**，与 THEN 一起组成完整的行为契约：

```
- THEN 接口 MUST 返回 HTTP 200
- AND THEN 响应 body.token 长度 MUST 为 64 位
- AND THEN 响应 body.expiresIn 值 MUST 为 86400（1 天）
- AND THEN 数据库中 User.lastLoginAt MUST 被更新为当前时间
```

**规则**：

- 最多 5 个 AND THEN（超过请拆分成多个 Scenario）
- 每个 AND THEN 独立可验证
- 顺序无关（不是执行顺序）

## 6. 反例集合：常见模糊词

| 模糊词 | 具体问题 | 替代方案 |
|--------|---------|---------|
| 快速 / 慢 | 无量化标准 | 用具体毫秒数（如 P95 < 500ms） |
| 高效 | 定义不清 | 用具体资源指标（如内存 < 100MB） |
| 友好 | 主观 | 用具体 UI/UX 规范（如错误信息含 request_id） |
| 合理 | 主观 | 用具体数值范围（如价格 [1, 10000]） |
| 稳定 | 主观 | 用具体 SLI（如可用率 > 99.9%） |
| 简单 | 主观 | 用具体复杂度指标（如函数行数 < 50） |
| 正确 | 定义不清 | 用具体断言（如"字段 x == y"） |
| 完成 | 定义不清 | 用具体状态（如"数据库记录状态 = DONE"） |
| 用户满意 | 主观 | 用具体指标（如 NPS ≥ 30） |

## 7. 完整正例

### 例 1：验证码发送

```markdown
##### SC-1.1: 正常发送验证码

- **GIVEN** 用户手机号 "+8613800000000" 已通过格式校验
- **GIVEN** 该手机号在 60 秒内未发送过验证码
- **WHEN** 用户 POST /api/auth/sms-send { phone: "+8613800000000" }
- **THEN** 接口 MUST 返回 HTTP 200
- **AND THEN** 响应 body 结构 MUST 为 { expiresAt: string(ISO 8601) }
- **AND THEN** expiresAt 值 MUST 为当前时间 + 5 分钟
- **AND THEN** 数据库中 SmsCode 表 MUST 新增一条记录
- **AND THEN** 3 分钟内该手机号 MUST 收到一条含 6 位数字的短信

##### SC-1.2: 触发频率限制

- **GIVEN** 该手机号在 60 秒内已发送过一次验证码
- **WHEN** 用户再次 POST /api/auth/sms-send
- **THEN** 接口 MUST 返回 HTTP 429
- **AND THEN** 响应 body 中 error.code MUST 为 "E_RATE_LIMITED"
- **AND THEN** 数据库中 SmsCode 表 MUST NOT 新增记录
```

### 例 2：错误处理

```markdown
##### SC-2.3: 验证码错误

- **GIVEN** 数据库中的 SmsCode 记录 code 值为 "999999"
- **GIVEN** 验证码未过期且未使用
- **WHEN** 用户 POST /api/auth/sms-login { phone: "+8613800000000", code: "123456" }
- **THEN** 接口 MUST 返回 HTTP 401
- **AND THEN** 响应 body 中 error.code MUST 为 "E_CODE_INVALID"
- **AND THEN** 数据库中用户账号 MUST NOT 被创建
- **AND THEN** SmsCode.usedAt MUST 保持为 null
- **AND THEN** 系统日志 MUST 记录一条 WARN 级别条目，含 phone 与 request_id
```

## 8. 与测试的映射

每个 Scenario 对应一个或多个测试用例：

```typescript
// 例 1 SC-1.1 对应的单元测试骨架
describe('SC-1.1: 正常发送验证码', () => {
  it('should return 200 with expiresAt within 5 minutes', async () => {
    // GIVEN
    const phone = '+8613800000000';
    mockSmsProvider.send = jest.fn().mockResolvedValue({ sid: 'SMS_123456' });

    // WHEN
    const res = await smsController.sendCode({ phone });

    // THEN
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('expiresAt');
    expect(new Date(res.body.expiresAt).getTime())
      .toBeGreaterThan(Date.now() + 4 * 60 * 1000);
    expect(new Date(res.body.expiresAt).getTime())
      .toBeLessThan(Date.now() + 6 * 60 * 1000);
  });
});
```

## 9. 场景拆分规则

**拆分成多个 Scenario** 的情况：

- 不同的 Given 条件（如不同用户状态、不同前置数据）
- 不同的 Then 断言（如不同错误码、不同 HTTP 状态）
- 边界条件（如临界值：刚好过期 vs 未过期）

**合并成一个 Scenario** 的情况：

- 相同的 Given，仅 Then 断言略多（用 AND THEN 表示）
- 顺序无关的附加断言

**一个 Scenario 最多 5 个 AND THEN**：超过 5 个，考虑拆分。

## 10. 检查清单

写完 Scenario 后自查：

- [ ] GIVEN 可验证？（有具体字段值）
- [ ] WHEN 是单一事件？（有具体 API / 操作）
- [ ] THEN 可验证？（有具体字段 / 数值 / 状态）
- [ ] 无模糊词（快速、高效、友好、合理、稳定、简单）？
- [ ] AND THEN ≤ 5 个？
- [ ] 可以用测试代码写出来？
