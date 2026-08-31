---
name: pixi-desktop-pet
description: >-
  Build PixiJS v8 desktop-pet animation systems from frame sequences or
  spritesheets: asset naming, TexturePacker/spritesheet JSON, AnimatedSprite
  playback, per-state timing, and a small pet state machine (idle / walk /
  wave / jump / sleep / drag). Use when the user asks for a PixiJS desktop pet,
  desktop mascot, 桌面宠物, pet animation frames, spritesheet animations, or
  wiring hatch-pet / Codex atlas rows into a PixiJS Electron/Tauri/transparent
  window pet. Prefer this skill over generic PixiJS skills when the goal is a
  clickable/draggable desktop pet driven by discrete animation states.
---

# PixiJS Desktop Pet (Animation Frames)

用 **PixiJS v8** 把离散动画帧做成可交互的桌面宠物：资产约定 → 加载 →
`AnimatedSprite` 播放 → 状态机。不负责生成角色原画（那是 `hatch-pet` / 出图工具）；
本 skill 负责 **帧资产规范 + PixiJS 运行时**。

## 何时使用

- 「做个 PixiJS 桌面宠物 / 桌面挂件 / mascot」
- 「把这些动画帧接成 spritesheet 并播放」
- 「idle / walk / wave 状态切换」
- 「把 hatch-pet / Codex 8×9 atlas 接到 PixiJS」

若用户只问通用 PixiJS API（Application、Filters…），用官方 `pixijs` skill；
本 skill 只管 **宠物动画帧工作流**。

## 工作流总览

```
Phase 0  输入对齐
  帧序列 PNG / 已有 spritesheet / hatch-pet atlas / 仅概念描述
  ▼
Phase 1  资产规范（本 skill 真相源）
  状态表 + 帧命名 + spritesheet.json + 可选 pet.json
  ▼
[Checkpoint] 对齐：状态列表 / 帧尺寸 / 循环与 one-shot / 壳层（Electron/Tauri/纯 Web）
  ▼
Phase 2  运行时
  Application（透明）→ Assets.load → PetActor 状态机 → 拖拽/点击
  ▼
Phase 3  验收
  每状态可读、切态无闪、拖拽时朝向、透明像素干净
```

## Phase 0 — 输入

| 输入 | 做法 |
| --- | --- |
| 每状态多张 PNG | 按 [references/asset-contract.md](references/asset-contract.md) 命名，打 spritesheet |
| 已有 TexturePacker JSON | 校验 `animations` 键名是否等于状态 id |
| hatch-pet / Codex atlas | 按 [references/hatch-pet-bridge.md](references/hatch-pet-bridge.md) 切行切帧 |
| 只有概念、没有帧 | 先出图/用 hatch-pet，再回到本 skill |

推断不足时先问清：**状态列表、单帧尺寸、是否透明窗、是否要拖拽**。能推断则推断，不要卡死。

## Phase 1 — 资产约定（必须遵守）

默认状态集（可增减，但 id 用 kebab-case）：

| State | 默认帧数 | 默认节奏 | 循环 |
| --- | ---: | --- | --- |
| `idle` | 4–8 | 慢（~120–280ms/帧） | loop |
| `walk-right` | 6–8 | 快（~100–140ms） | loop |
| `walk-left` | 6–8 | 同 walk-right | loop |
| `wave` | 4–6 | 中 | one-shot → `idle` |
| `jump` | 4–6 | 中 | one-shot → `idle` |
| `sleep` | 4–6 | 很慢 | loop |
| `drag` | 1–2 | — | 持姿（拖拽中） |

**帧命名**：`<state>_<index:02d>.png`，例如 `idle_00.png` … `idle_05.png`。

**Spritesheet**：一张图 + 一份 PixiJS 可加载的 JSON（TexturePacker JSON Hash / 等价），且：

- `meta.image` 指向同目录 PNG/WebP
- `frames` 键与文件名一致
- `animations.<state>` = 该状态帧键的有序列表
- 需要精确节奏时，在 `frames[key].duration` 写毫秒（Pixi `FrameObject.time` 也是 ms）

包目录建议：

```text
pet-name/
├── pet.json              # 元数据 + 默认状态 + 锚点
├── spritesheet.json      # Pixi Assets 入口
└── spritesheet.png       # 或 .webp
```

`pet.json` 最小形状见 [references/asset-contract.md](references/asset-contract.md)。

**透明规则**：帧内非角色像素必须可抠干净（真透明或纯色色键）。不要地板阴影、描边光晕、棋盘格背景——桌面宠物窗通常是透明的，脏边会非常明显。

## Checkpoint（硬节点）

开发运行时前，与用户对齐并记下：

1. **状态列表**（是否要 sleep / drag / fail…）
2. **单帧尺寸**（推荐 128×128 或 192×208；保持全状态一致）
3. **loop vs one-shot**（wave/jump 结束回 idle）
4. **壳层**：纯 Web 预览 / Electron / Tauri；是否要点击穿透
5. **交互**：点击切态、拖拽移动、贴边、多宠物

未对齐前不要大面积写壳层代码；可以先写 `PetActor` + 本地 Vite 预览。

## Phase 2 — PixiJS 运行时

### 2.1 Application（透明桌宠）

```ts
import { Application } from "pixi.js";

const app = new Application();
await app.init({
  backgroundAlpha: 0,
  antialias: false, // 像素风开 false；平滑插画可 true
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
  resizeTo: window,
});
document.body.appendChild(app.canvas);
```

桌面壳（Electron/Tauri）负责：无边框、透明、置顶、可选点击穿透。Pixi 侧只保证 `backgroundAlpha: 0` 与角色锚点稳定。

### 2.2 加载与 AnimatedSprite

```ts
import { AnimatedSprite, Assets } from "pixi.js";

const sheet = await Assets.load("/pets/momo/spritesheet.json");
// sheet.animations.idle / walk-right / ...

const sprite = new AnimatedSprite({
  textures: sheet.animations["idle"],
  anchor: 0.5, // 或从 pet.json 读；脚底锚点常用 { x: 0.5, y: 1 }
  animationSpeed: 1,
  loop: true,
  autoPlay: true,
});
app.stage.addChild(sprite);
```

**硬性规则（Pixi v8）**：

1. 必须先 `await Assets.load`，禁止对未加载帧用 `Texture.from`（会得到空贴图）。
2. 必须 `autoPlay: true` 或手动 `play()`，否则只停在第一帧。
3. 精确时长用 `FrameObject[]`：`{ texture, time }`，`time` 单位是 **毫秒**。
4. 切状态时替换 `sprite.textures`，再 `gotoAndPlay(0)`；one-shot 用 `loop = false` + `onComplete`。

从 `duration` 构建精确帧序：

```ts
function framesWithDuration(sheet: any, keys: string[]) {
  return keys.map((key) => ({
    texture: sheet.textures[key],
    time: sheet.data.frames[key]?.duration ?? 120,
  }));
}
```

### 2.3 状态机

完整模式与默认转移见 [references/state-machine.md](references/state-machine.md)。最小 API：

```ts
type PetState =
  | "idle"
  | "walk-right"
  | "walk-left"
  | "wave"
  | "jump"
  | "sleep"
  | "drag";

class PetActor {
  setState(next: PetState): void; // 同态 no-op；one-shot 结束回 idle
  faceToward(dx: number): void;   // 拖拽/行走时选 walk-left / walk-right
}
```

推荐行为：

- 点击宠物 → `wave`（one-shot）→ `idle`
- 拖拽开始 → `drag`；移动中可按速度切 `walk-*`；松手 → `idle`
- 长时间无操作 → `sleep`；任意输入 → `idle`
- `jump` / `wave` 播放中忽略同级打断（或仅允许 `drag` 打断）——选一种并写进 `pet.json.policy`

### 2.4 目录脚手架（Web 预览）

在用户指定目录生成最小 Vite + Pixi 预览（不要无关依赖）：

```text
desktop-pet/
├── package.json          # pixi.js ^8
├── index.html
├── src/
│   ├── main.ts
│   ├── pet/PetActor.ts
│   └── pet/types.ts
└── public/pets/<id>/
    ├── pet.json
    ├── spritesheet.json
    └── spritesheet.png
```

模板代码片段见 [references/runtime-snippets.md](references/runtime-snippets.md)。

## Phase 3 — 验收清单

- [ ] 每个 `animations.<state>` 帧序正确、无缺帧、无透明废格掺进循环
- [ ] `idle` 有可见微动（不是 N 张几乎相同的静帧）
- [ ] `walk-left` / `walk-right` 朝向与位移一致
- [ ] one-shot（wave/jump）结束回到 `idle`，无卡死最后一帧
- [ ] 切态无整图闪白 / 空纹理一帧
- [ ] 透明边干净；窗口背景下看不到色键残留
- [ ] 锚点稳定（拖拽时脚不「滑」）
- [ ] 降帧 / `animationSpeed` 可调，且 duration 方案与 speed 方案不混用打架

## 与 hatch-pet 的关系

| | hatch-pet | pixi-desktop-pet |
| --- | --- | --- |
| 目标 | Codex 8×9 atlas + `pet.json` | 任意桌宠壳 + Pixi 播放 |
| 网格 | 固定 192×208 × 8×9 | 自定义，推荐一致 cell |
| 运行时 | Codex webview CSS | PixiJS `AnimatedSprite` |

若输入是 Codex atlas，先走 bridge 切成 Pixi spritesheet，再进入 Phase 2。不要在 Pixi 里用 CSS `background-position` 模拟 atlas，除非用户明确要求兼容 Codex 包格式。

## 反模式

- 用 CSS 动画或 `<img>` 轮询代替 `AnimatedSprite`（除非无 Pixi 的静态预览）
- 每帧一张独立 `Assets.load`（应 spritesheet 一次加载）
- 状态名中英混用、空格、驼峰混 kebab（统一 kebab-case）
- 给桌宠加滤镜光晕 / 阴影（透明窗下脏且贵）
- 在 skill 里绑定过时的 Pixi v7 `PIXI.Loader` / `Application` 构造同步写法——只用 v8 `await app.init` + `Assets.load`

## 附加资源

- [references/asset-contract.md](references/asset-contract.md) — pet.json / spritesheet / 命名
- [references/state-machine.md](references/state-machine.md) — 状态转移与打断策略
- [references/runtime-snippets.md](references/runtime-snippets.md) — PetActor 与 main 模板
- [references/hatch-pet-bridge.md](references/hatch-pet-bridge.md) — Codex atlas → Pixi
