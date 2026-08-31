---
name: dynamic-wallpaper-video
description: >-
  Design and produce seamless looping dynamic wallpaper videos (live wallpaper /
  动态壁纸): creative brief, loop craft, resolution/codec presets for Lively /
  Wallpaper Engine / macOS / phone, AI or procedural generation guidance, and
  ffmpeg encode + packaging. Use when the user asks for 动态壁纸, live wallpaper,
  looping desktop background video, Wallpaper Engine / Lively MP4, aerial-style
  loops, or converting images/scenes into a wallpaper-ready seamless video.
  Prefer this over web-video-presentation when the deliverable is a silent or
  ambient full-screen loop for the desktop/phone background, not a click-driven
  narrated presentation.
---

# Dynamic Wallpaper Video

把概念 / 静图 / 短片做成 **可无缝循环的动态壁纸视频**（桌面或手机）。
交付物默认是 **MP4（H.264）主文件** + 可选 WebM / HEVC，并附带安装说明。

本 skill **不是** 口播演示片（那是 `web-video-presentation`），也 **不是** 可点击桌宠（那是 `pixi-desktop-pet`）。

## 何时使用

- 「做一张动态壁纸 / live wallpaper / 循环壁纸」
- 「给 Lively / Wallpaper Engine 用的 MP4」
- 「把这张图 / 这段视频做成无缝循环背景」
- 「雨天窗户 / 赛博城市 / 山水云海 类 ambient 循环」

## 工作流总览

```
Phase 0   输入与目标屏
Phase 1   Brief（情绪 / 运动语言 / 循环策略）
   ▼
[Checkpoint] 对齐：分辨率、时长、有无声、平台、生成路径
   ▼
Phase 2   成片来源（三选一或组合）
   A  AI / 视频模型生成 → 修环
   B  静图运动（Ken Burns / 视差 / 粒子）→ 导出
   C  已有视频 → 裁剪 / 稳像 / 修环
   ▼
Phase 3   无缝循环验收（必须过）
   ▼
Phase 4   ffmpeg 编码 + 多规格导出
   ▼
Phase 5   平台安装说明 + 文件清单
```

工作目录约定：

```text
wallpaper-<slug>/
├── brief.md                 # 情绪、运动、禁忌、循环策略
├── source/                  # 原图 / 原片 / 参考
├── work/                    # 中间序列、修环草稿
├── out/
│   ├── <slug>_1080p.mp4     # 默认交付（H.264）
│   ├── <slug>_1440p.mp4     # 可选
│   ├── <slug>_4k.mp4        # 可选
│   ├── <slug>_preview.gif   # 可选短预览（非主交付）
│   └── checksums.txt
└── INSTALL.md               # Lively / WE / 手机怎么用
```

---

## Phase 0 — 输入

收集或推断：

| 项 | 默认（可改） |
| --- | --- |
| 目标屏 | 用户主显示器；不知则按 **1920×1080** 出主文件，并问是否要 1440p/4K |
| 时长 | **8–20s** 无缝环（壁纸忌长剧情） |
| 帧率 | **24 或 30** fps（默认 30） |
| 音频 | **默认无声**（壁纸常关声；用户要雨声/环境音再加） |
| 平台 | Windows Lively / Wallpaper Engine / macOS / Android / iOS |
| 素材 | 文案概念 / 静图 / 视频 / 参考链接 |

素材不足时先补 brief，不要空跑编码。

---

## Phase 1 — Brief

写 `brief.md`，只保留壁纸需要的字段：

```markdown
# <title>
- mood: （1 句情绪）
- subject: （画面主体，避免文字 UI）
- motion: （主运动：飘 / 雨 / 光扫 / 云移 / 视差…）
- camera: （固定机位 / 极慢推拉；壁纸忌快切）
- loop: （策略名，见 references/loop-craft.md）
- palette: （3–5 色）
- avoid: （人脸特写、可读文字、闪烁、快速运镜、剧情高潮）
- target: 1920x1080 @ 30fps, silent, 12s loop
```

**壁纸运动语言（优先）**

- 慢、可预期、可无限看
- 单一主运动 + 最多一个副运动（如：云慢漂 + 窗上雨丝）
- 主体远离屏幕边缘热点（图标区）；重要细节放中央偏安全区
- 对比度不要整屏过曝；桌面图标要压得住

详规：[references/loop-craft.md](references/loop-craft.md)、[references/creative-prompts.md](references/creative-prompts.md)

---

## Checkpoint（硬节点）

动刀生成/编码前对齐：

1. **分辨率套装**（主交付 + 是否多尺寸）
2. **循环时长**（建议 ≤20s）
3. **有声 / 无声**
4. **生成路径** A / B / C
5. **平台**（影响编码与 INSTALL）

---

## Phase 2 — 成片来源

### Path A — AI / 视频模型

适用：有清晰氛围、允许「近环」再人工修。

1. 用 [references/creative-prompts.md](references/creative-prompts.md) 写 **wallpaper-safe** 提示（强调 seamless loop、locked camera、no text）。
2. 生成略长于目标的片段（如要 12s，可先拿 12–16s）。
3. 选最稳的一条 → Phase 3 修环。
4. 若模型支持「loop / morph」参数，优先打开；否则用交叉溶解或光流插帧收尾。

不要承诺某个商用模型的具体 UI 步骤；按用户当前工具（可灵 / Runway / 即梦 / 本地等）适配，**原则不变**。

### Path B — 静图驱动

适用：一张高质量静图。

常用手法（选一，忌堆叠）：

- 极慢 Ken Burns（缩放 ≤3–5%/环，平移极小）
- 多层视差（前景/中景/远景轻微错位；需抠图或深度估计）
- 粒子 / 雨 / 雪 / 光尘叠加在静图上
- 水面/灯光微反射循环

导出无压缩中间件（PNG 序列或 ProRes/FFV1），再进 Phase 4。

可用 Remotion / After Effects / DaVinci / 纯 ffmpeg zoompan——选用户环境已有的；无偏好时用 **ffmpeg + 静图** 或简单 HTML Canvas 录屏（见 snippets）。

### Path C — 已有视频

1. 裁成目标画幅（居中 crop，避免拉伸变形）。
2. 去掉剧情段落，保留 ambient 段。
3. 稳像（可选）→ 修环 → 编码。

---

## Phase 3 — 无缝循环（必须过）

壁纸失败几乎都死在「接缝一眼能看出来」。

**验收**

- [ ] 第 N 秒与第 0 秒在观感上连续（闪一下 / 跳一下 = 不过）
- [ ] 运动方向在接缝处不突变
- [ ] 亮度/色温在接缝处无 pop
- [ ] 无字幕、无水印、无 UI、无进度条
- [ ] 无高频闪烁（癫痫与护眼风险）

**修环手法（按代价从低到高）**

1. **选段**：找画面几乎自相似的区间直接 trim
2. **交叉溶解**：末 8–20 帧与开头叠化（ffmpeg `xfade`）
3. **来回摆**：A→B→A（boomerang）；只适合可逆运动（摆动、呼吸），不适合单向流水
4. **光流/插帧工具** 做 morph 接缝（重活，必要时再用）

细节与命令：[references/loop-craft.md](references/loop-craft.md)

---

## Phase 4 — 编码

默认主交付：

| 项 | 值 |
| --- | --- |
| 容器 | MP4 |
| 视频 | H.264 `yuv420p`，`+faststart` |
| 音频 | 无 → `-an`；有则 AAC 96–128k |
| 1080p 码率引导 | ~6–10 Mbps（安静画面可更低） |
| 4K | ~20–35 Mbps 或 CRF 18–20；HEVC 可选更小 |

完整预设与命令：[references/ffmpeg-presets.md](references/ffmpeg-presets.md)

编码后写入 `out/checksums.txt`（sha256）并更新 `INSTALL.md`。

**不要**把巨型 GIF 当主壁纸交付（色带差、体积大、耗电）。GIF 仅作聊天预览。

---

## Phase 5 — 平台与安装

| 平台 | 用法摘要 |
| --- | --- |
| **Lively** (Win) | Add Wallpaper → 选 MP4；建议开硬件解码 |
| **Wallpaper Engine** | 创建 → 视频壁纸 → 导入 MP4 |
| **macOS** | 用支持视频壁纸的 App（或系统 Aerial 类工具）；优先 HEVC 省电 |
| **Android** | 多数动态壁纸 App 吃 MP4；注意厂商省电杀后台 |
| **iOS** | 实况照片 / 专用 App；或短 Loop 导入；规范多变，交付 MP4 + 说明即可 |
| **纯网页壁纸** | Lively「网页」类型；另交付，不替代视频主文件 |

`INSTALL.md` 模板见 [references/install-templates.md](references/install-templates.md)。

分辨率与安全区：[references/specs.md](references/specs.md)。

---

## 质量条（交货前）

- [ ] 在真实桌面上看过至少 3 个循环（有图标叠加）
- [ ] 接缝不可察
- [ ] 文件体积合理（1080p 12s 通常数十 MB 内，视运动复杂度）
- [ ] 无版权不明素材硬贴
- [ ] 文件名无空格：`<slug>_<height>p.mp4`

---

## 反模式

- 快切、运镜晃、剧情高潮当壁纸
- 整屏强闪、高频霓虹爆闪
- 大字标题、Logo 水印、进度条、UI 截图
- 用 5 分钟 Vlog 原片直接 loop
- 主交付用 GIF / 未 `yuv420p` 的奇异像素格式（兼容性翻车）
- 拉伸变形（应用 crop 或 pad，不 stretch）

---

## 与其他 skill 的边界

| Skill | 何时用 |
| --- | --- |
| **dynamic-wallpaper-video**（本） | 桌面/手机循环背景视频 |
| `web-video-presentation` | 点击驱动、口播、录屏成片 |
| `pixi-desktop-pet` | 透明窗桌宠精灵 |
| `design-taste-frontend` | 网页视觉；仅当壁纸是 **HTML/Web** 类型时借用审美，仍按本 skill 做循环与交付 |

## 附加资源

- [references/specs.md](references/specs.md) — 分辨率、码率、安全区
- [references/loop-craft.md](references/loop-craft.md) — 无缝循环策略与 ffmpeg
- [references/ffmpeg-presets.md](references/ffmpeg-presets.md) — 导出命令
- [references/creative-prompts.md](references/creative-prompts.md) — 壁纸向提示词
- [references/install-templates.md](references/install-templates.md) — INSTALL.md 模板
