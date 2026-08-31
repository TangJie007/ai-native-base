# State Machine

PetActor owns one `AnimatedSprite` and swaps its `textures` when state changes.

## States

| Id | Loop | Typical trigger |
| --- | --- | --- |
| `idle` | yes | default / after one-shot / after drag |
| `walk-right` | yes | move dx > threshold |
| `walk-left` | yes | move dx < -threshold |
| `wave` | no → `idle` | click / greet |
| `jump` | no → `idle` | double-click / command |
| `sleep` | yes | idle timeout |
| `drag` | yes | pointer down + move |

Projects may add `fail`, `eat`, `happy`, etc. Keep kebab-case ids and register them in both `pet.json.states` and `spritesheet.animations`.

## Transitions

```text
                    timeout
         ┌──────────────────────────┐
         ▼                          │
      sleep ◄──── idle ──── click ──► wave ──(complete)──► idle
               ▲    │
               │    ├─ drag ──► drag ──(up)──► idle
               │    │
               │    └─ move ──► walk-left / walk-right ──(stop)──► idle
               │
               └── jump ──(complete)──► idle
```

### Rules

1. **Same state no-op**: `setState(x)` when already `x` does nothing (do not reset frame unless caller passes `{ force: true }`).
2. **One-shot completion**: `loop = false`; `onComplete` → `states[x].next` (default `idle`).
3. **Interrupt policy**: read `pet.json.policy.interruptOneShotWith`. Default recommendation: only `drag` may interrupt `wave`/`jump`.
4. **Sleep wake**: any pointer event or `setState` other than `sleep` exits sleep.
5. **Walk vs drag**: while pointer is captured, prefer `drag` (or hold-pose) over walk unless the product wants a walking-drag.

## setState implementation sketch

```ts
setState(next: PetState, opts?: { force?: boolean }) {
  if (next === this.state && !opts?.force) return;
  if (this.isOneShot && !this.canInterruptWith(next)) return;

  const conf = this.meta.states[next];
  const keys = this.sheet.data.animations[next] as string[];
  const textures = keys.map((key) => ({
    texture: this.sheet.textures[key],
    time: this.sheet.data.frames[key]?.duration ?? 120,
  }));

  this.state = next;
  this.sprite.textures = textures;
  this.sprite.loop = conf.loop;
  this.sprite.onComplete = conf.loop
    ? null
    : () => this.setState(conf.next ?? "idle", { force: true });
  this.sprite.gotoAndPlay(0);
}
```

When using uniform `animationSpeed` instead of per-frame `duration`, assign `textures: this.sheet.animations[next]` (Texture[]) and set a single `animationSpeed`. Do not mix both models on the same actor without documenting which wins.

## Input mapping (default)

| Input | Action |
| --- | --- |
| pointer tap (no drag) | `policy.click` (default `wave`) |
| pointer down + move | `drag` + move stage position |
| pointer up after drag | `policy.dragEnd` (default `idle`) |
| idle ≥ `idleTimeoutMs` | `idleTimeoutState` (default `sleep`) |
| double tap | `jump` (optional) |

## Facing

```ts
faceToward(dx: number) {
  if (Math.abs(dx) < 1) return;
  this.setState(dx > 0 ? "walk-right" : "walk-left");
}
```

Prefer dedicated left/right frame sets over `scale.x *= -1` when the art is asymmetric (eyes, props, logos). Mirroring is OK for symmetric blobs.

## Reduced motion

If `prefers-reduced-motion: reduce`, freeze on `idle` frame 0 (or a dedicated still) and skip auto sleep/walk loops. Still allow click → brief wave if product wants feedback.
