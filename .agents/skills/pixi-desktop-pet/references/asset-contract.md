# Asset Contract

Canonical asset rules for `pixi-desktop-pet`. Keep cell size and naming consistent across every state.

## Directory

```text
public/pets/<pet-id>/
├── pet.json
├── spritesheet.json
└── spritesheet.png   # or spritesheet.webp
```

`<pet-id>` is kebab-case, matches `pet.json.id`.

## pet.json

```json
{
  "id": "momo",
  "displayName": "Momo",
  "description": "A small dumpling pet.",
  "spritesheet": "spritesheet.json",
  "frameSize": { "w": 128, "h": 128 },
  "anchor": { "x": 0.5, "y": 1 },
  "defaultState": "idle",
  "states": {
    "idle": { "loop": true },
    "walk-right": { "loop": true },
    "walk-left": { "loop": true },
    "wave": { "loop": false, "next": "idle" },
    "jump": { "loop": false, "next": "idle" },
    "sleep": { "loop": true },
    "drag": { "loop": true }
  },
  "policy": {
    "click": "wave",
    "dragStart": "drag",
    "dragEnd": "idle",
    "idleTimeoutMs": 20000,
    "idleTimeoutState": "sleep",
    "interruptOneShotWith": ["drag"]
  }
}
```

### Field notes

- `anchor`: Pixi normalized anchor. Feet-planted pets use `{ x: 0.5, y: 1 }`; centered stickers use `{ x: 0.5, y: 0.5 }`.
- `states.<id>.next`: required when `loop: false`.
- `policy.interruptOneShotWith`: states allowed to cancel an in-flight one-shot. Empty = one-shots are uninterruptible except destroy.

## Frame files (before packing)

```text
frames/
├── idle_00.png
├── idle_01.png
├── ...
├── walk-right_00.png
├── walk-left_00.png
├── wave_00.png
└── ...
```

Rules:

- Name: `<state>_<index:02d>.png` (zero-padded, contiguous from `00`)
- Same pixel size for every frame (see `frameSize`)
- Transparent background; no checkerboard, no floor shadow, no labels
- Export PNG-24/32 or lossless WebP; avoid JPEG

## spritesheet.json (Pixi / TexturePacker JSON Hash)

Minimal shape PixiJS `Assets.load` accepts:

```json
{
  "frames": {
    "idle_00.png": {
      "frame": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 },
      "duration": 200
    },
    "idle_01.png": {
      "frame": { "x": 128, "y": 0, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 },
      "duration": 160
    }
  },
  "animations": {
    "idle": ["idle_00.png", "idle_01.png"]
  },
  "meta": {
    "image": "spritesheet.png",
    "format": "RGBA8888",
    "size": { "w": 256, "h": 128 },
    "scale": 1
  }
}
```

### Requirements

1. Every `animations[state]` entry must exist in `frames`.
2. Animation key **must** equal the pet state id (`idle`, `walk-right`, …).
3. Frame order in `animations` is playback order.
4. `duration` is milliseconds. If omitted, runtime may use a per-state default (e.g. 120).
5. Prefer untrimmed frames for pets (`trimmed: false`) so anchors stay stable. If trimming is used, set TexturePacker pivot / `defaultAnchor` and enable `updateAnchor` carefully.

## Recommended frame counts & timing

| State | Frames | Duration hint (ms) |
| --- | ---: | --- |
| idle | 4–8 | 160–280, uneven OK (hold end pose) |
| walk-right / walk-left | 6–8 | 100–140 even |
| wave | 4–6 | 120–180; last frame may linger |
| jump | 4–6 | anticipation shorter, peak longer |
| sleep | 4–6 | 300–500 |
| drag | 1–2 | 200+ or static |

`idle` must show readable micro-motion (blink, breath, sway). Reject rows that are effectively identical frames.

## Packing tools

Any packer that emits TexturePacker-compatible JSON Hash is fine:

- TexturePacker (JSON Hash, include animation names)
- free-tex-packer / other CLI packers with animations map
- Hand-authored JSON for small pets (acceptable under ~64 frames)

Do not invent a custom non-Pixi atlas format unless also shipping a loader.

## Validation checklist

- [ ] `pet.json.id` === folder name
- [ ] every `states` key has `animations[key]` with ≥1 frame
- [ ] one-shot states declare `next`
- [ ] `meta.image` file exists beside JSON
- [ ] no unused opaque garbage in transparent cells
- [ ] left/right walk mirrors or redraws are directionally correct
