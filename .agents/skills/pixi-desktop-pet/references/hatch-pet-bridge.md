# Hatch-Pet / Codex Atlas → Pixi Bridge

Use when the input is a Codex-compatible pet package from `hatch-pet`:

```text
spritesheet.webp   # 1536×1872
pet.json           # Codex manifest
```

Codex atlas grid (fixed):

| | Value |
| --- | --- |
| Cell | 192×208 |
| Columns | 8 |
| Rows | 9 |
| Sheet | 1536×1872 |

## Row → Pixi state map

| Row | Codex state | Pixi state id | Used columns |
| ---: | --- | --- | ---: |
| 0 | idle | `idle` | 0–5 |
| 1 | running-right | `walk-right` | 0–7 |
| 2 | running-left | `walk-left` | 0–7 |
| 3 | waving | `wave` | 0–3 |
| 4 | jumping | `jump` | 0–4 |
| 5 | failed | `fail` | 0–7 |
| 6 | waiting | `wait` | 0–5 |
| 7 | running | `work` | 0–5 |
| 8 | review | `review` | 0–5 |

Rename freely in `pet.json`, but keep spritesheet `animations` keys in sync. Default duration table (ms) from hatch-pet:

| State | Durations |
| --- | --- |
| idle | 280, 110, 110, 140, 140, 320 |
| walk-right / walk-left | 120×7 + 220 |
| wave | 140×3 + 280 |
| jump | 140×4 + 280 |
| fail | 140×7 + 240 |
| wait | 150×5 + 260 |
| work | 120×5 + 220 |
| review | 150×5 + 280 |

## Conversion steps

1. Load atlas image.
2. For each used cell `(col, row)`, crop `192×208` at `(col*192, row*208)`.
3. Skip fully transparent unused cells after each row's last used column.
4. Write `frames/<pixi-state>_<ii>.png` (or pack directly).
5. Emit Pixi `spritesheet.json` with `animations` + per-frame `duration`.
6. Write desktop-pet `pet.json` (this skill's shape), not the Codex-only `{ spritesheetPath }` shape — or keep both files if dual-target.

## Runtime alternative (no re-pack)

If you must play the Codex atlas in place:

- Build textures with Pixi `Texture` frame rectangles from the single atlas.
- Group into `animations` arrays manually in code.
- Still expose the same `PetActor.setState` API so the rest of the app does not care.

Re-packing into TexturePacker JSON is preferred for clarity and tooling.

## Do not

- Feed Codex `pet.json` unchanged to this skill's loader (field names differ).
- Assume all 8 columns are used on every row.
- Use CSS background-position in a Pixi project for the same atlas.
