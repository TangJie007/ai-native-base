# TDD 循环

本文件规范 `05-apply` 阶段使用的红绿重构节奏。

## 1. 循环模型

每个 task 走一次完整的 TDD 循环：

```
RED → 确认 FAIL → GREEN → 确认 PASS → REFACTOR → 确认仍 PASS → 勾选 checkbox
```

**每个 task 独立一次循环**，不允许"批量写多个测试后再批量实现"。

## 2. 四阶段详解

### RED — 写失败测试

**目标**：写一个能反映"预期行为"的测试，且当前实现下必然失败。

**步骤**：

1. 读 `tasks/{domain}/{atom}.md` 的当前 task 描述
2. 根据 Verification 类型选择测试工具：
   - `unit-test`：Vitest / Jest / pytest / ...
   - `integration-test`：Playwright / Cypress / Supertest
   - `manual`：写"预期行为清单"
   - `script`：写 shell 脚本 / curl 命令
3. 写测试代码
4. 运行测试，**必须失败**
5. 检查失败原因是否**预期**

**"预期失败"的判断标准**：

- ✅ 因为功能未实现（`undefined is not a function`、`expected X got Y`）
- ❌ 因为测试本身有 bug（导入错误、类型错误、语法错误）
- ❌ 因为环境未配置（数据库未启动、环境变量未设）

**若失败原因非预期** → 停，先修复测试代码。

### GREEN — 写最小实现

**目标**：写让测试通过的**最少代码**。

**规则**：

- 不做优化、不重构
- 不"顺手"添加功能
- 不处理边界情况（除非测试覆盖）
- 不"预防性"添加错误处理

**步骤**：

1. 写最小实现
2. 运行测试，**必须通过**
3. 若未通过，检查：
   - 实现是否符合测试的期望？
   - 是否遗漏了测试的前置条件？
   - 是否有隐藏的类型不匹配？
4. 迭代直到通过

**"最小实现"的判断标准**：

- ✅ 只满足当前测试
- ❌ 满足当前测试且"顺便"支持其他场景
- ❌ 满足当前测试且"顺便"处理错误情况

### REFACTOR — 重构

**目标**：在保持测试通过的前提下，改善代码质量。

**规则**：

- 每次修改后运行测试
- 一次只改一处（重命名、提取函数、消除重复）
- 不做行为变更

**常见重构**：

- 提取常量 / 提取函数
- 消除重复代码
- 重命名变量（提高可读性）
- 调整函数结构（保持行为一致）

**不做的事**：

- ❌ 引入新特性
- ❌ 修改测试
- ❌ 修改公共 API 签名

### 勾选 checkbox

**目标**：更新 `tasks/{domain}/{atom}.md` 的进度。

**规则**：

- 只在**完成 RED + GREEN + REFACTOR** 三步后勾选
- 不允许"提前勾选再改代码"
- 每个 checkbox 一个任务

**格式**：

```markdown
- [x] T-1: 发送验证码接口（covers REQ-auth.sms-login.1, SC-1.1）
```

## 3. 循环节奏示例

假设 task 是"实现手机号验证码发送接口"：

### RED

```typescript
// test/auth/sms-send.test.ts
describe('POST /api/auth/sms-send', () => {
  it('SC-1.1: 正常发送验证码', async () => {
    // GIVEN
    const phone = '+8613800000000';
    mockSmsProvider.send = jest.fn().mockResolvedValue({ sid: 'SMS_123456' });

    // WHEN
    const res = await request(app)
      .post('/api/auth/sms-send')
      .send({ phone });

    // THEN
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('expiresAt');
    // ...更多断言
  });
});
```

**运行**：

```bash
$ npm test -- test/auth/sms-send.test.ts
FAIL  auth/sms-send
✕ SC-1.1: 正常发送验证码  (5 ms)
  TypeError: Cannot POST /api/auth/sms-send
```

**判断**：✅ 预期失败（路由不存在，因为功能未实现）。

### GREEN

```typescript
// src/auth/controller.ts
router.post('/sms-send', async (req, res) => {
  const { phone } = req.body;
  await smsService.sendCode(phone);
  res.json({ expiresAt: new Date(Date.now() + 300000).toISOString() });
});

// src/auth/service.ts
class SmsService {
  async sendCode(phone: string) {
    // 校验手机号格式
    // 检查频率限制
    // 调用短信服务商
    // 写入数据库
  }
}
```

**运行**：

```bash
$ npm test -- test/auth/sms-send.test.ts
PASS  auth/sms-send
✓ SC-1.1: 正常发送验证码  (15 ms)
```

### REFACTOR

```typescript
// src/auth/service.ts
// 提取常量
const SMS_TTL_MS = 5 * 60 * 1000;  // 5 分钟
const SMS_RATE_LIMIT_MS = 60 * 1000;  // 60 秒

class SmsService {
  private rateLimiter: RateLimiter;

  constructor(private smsProvider: SmsProvider) {
    this.rateLimiter = new RateLimiter({ windowMs: SMS_RATE_LIMIT_MS });
  }

  async sendCode(phone: string) {
    validatePhone(phone);
    await this.checkRateLimit(phone);
    const code = generateCode(6);
    await this.smsProvider.send(phone, formatSms(code));
    await this.persist(phone, code);
  }

  private async checkRateLimit(phone: string) {
    if (await this.rateLimiter.hit(phone)) {
      throw new RateLimitError();
    }
  }
}
```

**运行**：

```bash
$ npm test -- test/auth/sms-send.test.ts
PASS  auth/sms-send
✓ SC-1.1: 正常发送验证码  (14 ms)
```

### 勾选

```markdown
- [x] T-1: 实现验证码发送接口（covers REQ-auth.sms-login.1, SC-1.1）
```

## 4. 常见错误

### ❌ 先写实现再写测试

**症状**：实现代码先跑通，然后补一个"肯定通过"的测试。

**问题**：测试无法保证正确性，只是形式上的 TDD。

**修复**：写测试前先写代码 → 删除实现代码 → 重跑测试确认失败 → 重写实现。

### ❌ 测试通过原因不对

**症状**：测试 PASS 但业务逻辑其实错了。

**问题**：测试断言不够严格，或 mock 数据不合适。

**修复**：加强断言，增加边界值测试。

### ❌ 一次写多个测试

**症状**：一次写完 5 个测试，再一起改代码让它们通过。

**问题**：一次改太多，无法定位问题；违反"一次一个 task"原则。

**修复**：一次写一个测试，跑绿一个，再写下一个。

### ❌ 忘记 refactor

**症状**：GREEN 后立即写下一个测试，代码逐渐腐化。

**问题**：技术债积累。

**修复**：GREEN 后必须至少走一次 refactor（重命名 / 提取函数即可）。

### ❌ Refactor 引入 bug

**症状**：Refactor 后测试仍通过，但业务出问题了。

**问题**：测试覆盖不够。

**修复**：补测试覆盖 refactor 涉及的场景。

## 5. 特殊情况处理

### 无法先写测试的场景

**举例**：

- 纯配置变更
- 数据库 migration
- 依赖升级

**处理方式**：

1. Task 的 Verification 写 `script` 或 `manual`
2. RED 阶段用「预期行为清单」代替测试代码
3. GREEN 阶段跑实际命令验证（如 `migrate up && migrate down` 应成功）
4. 若可写测试，优先写回归测试验证不破坏既有功能

### 集成测试很慢

**举例**：Playwright 端到端测试需要 30 秒。

**处理方式**：

1. 每个 task 先写单元测试（快）
2. 阶段末跑一次集成测试验证
3. 若集成测试失败，回退到 unit 阶段修复

### 修改既有代码

**举例**：改动既有 service，怕破坏其他用例。

**处理方式**：

1. 先跑**现有测试**，记录当前通过率（baseline）
2. RED → GREEN → REFACTOR 循环
3. 阶段末再跑一次全量测试，对比 baseline
4. 若新增失败，逐一排查

## 6. 完整示例（一个 task 全流程）

假设 task 是"修复金额精度问题"：

```
T-5: 修复 checkout 接口金额的浮点误差
- Type: impl
- Covers: REQ-billing.checkout.2 SC-2.3
- Verification: unit-test
```

### RED

```typescript
describe('POST /api/checkout', () => {
  it('SC-2.3: 金额精度 - 应使用整数分而非浮点元', async () => {
    // GIVEN 用户订单包含 3 件商品，每件 0.10 元
    const items = [
      { price: 0.10, qty: 1 },
      { price: 0.10, qty: 1 },
      { price: 0.10, qty: 1 },
    ];

    // WHEN
    const res = await checkout(items);

    // THEN
    expect(res.totalCents).toBe(30);  // 30 分
    expect(res.totalYuan).toBe(0.30);  // 3 角
  });
});
```

```bash
$ npm test -- test/billing/checkout.test.ts
FAIL  billing/checkout
✕ SC-2.3: 金额精度 (2 ms)
  expected 30.000000000000004 got 30
```

✅ 预期失败：确实存在浮点误差。

### GREEN

```typescript
// src/billing/checkout.ts
export function checkout(items: Item[]): CheckoutResult {
  // 用整数分计算
  const totalCents = items.reduce((sum, item) => {
    return sum + Math.round(item.price * 100) * item.qty;
  }, 0);
  const totalYuan = totalCents / 100;
  return { totalCents, totalYuan };
}
```

```bash
$ npm test -- test/billing/checkout.test.ts
PASS  billing/checkout
✓ SC-2.3: 金额精度 (1 ms)
```

### REFACTOR

```typescript
// src/billing/checkout.ts
const YUAN_TO_CENTS = 100;

export function checkout(items: Item[]): CheckoutResult {
  const totalCents = sumCents(items);
  return {
    totalCents,
    totalYuan: centsToYuan(totalCents),
  };
}

function sumCents(items: Item[]): number {
  return items.reduce((sum, item) => {
    return sum + yuanToCents(item.price) * item.qty;
  }, 0);
}

function yuanToCents(yuan: number): number {
  return Math.round(yuan * YUAN_TO_CENTS);
}

function centsToYuan(cents: number): number {
  return cents / YUAN_TO_CENTS;
}
```

```bash
$ npm test -- test/billing/checkout.test.ts
PASS  billing/checkout
✓ SC-2.3: 金额精度 (1 ms)
```

### 勾选

```markdown
- [x] T-5: 修复 checkout 接口金额的浮点误差（covers REQ-billing.checkout.2 SC-2.3）
```

## 7. 检查清单

每个 task 完成后自查：

- [ ] RED 阶段测试失败且原因预期？
- [ ] GREEN 阶段测试通过？
- [ ] REFACTOR 阶段测试仍通过？
- [ ] checkbox 已勾选？
- [ ] commit message 已写（若启用）？
