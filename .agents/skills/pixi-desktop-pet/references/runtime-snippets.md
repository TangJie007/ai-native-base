# Runtime Snippets

Copy/adapt these into a Vite + TypeScript + `pixi.js@^8` preview app. Keep files small; do not add UI frameworks unless the user asks.

## src/pet/types.ts

```ts
export type PetState =
  | "idle"
  | "walk-right"
  | "walk-left"
  | "wave"
  | "jump"
  | "sleep"
  | "drag"
  | (string & {});

export interface PetMeta {
  id: string;
  displayName: string;
  description?: string;
  spritesheet: string;
  frameSize: { w: number; h: number };
  anchor: { x: number; y: number };
  defaultState: PetState;
  states: Record<
    string,
    { loop: boolean; next?: PetState }
  >;
  policy?: {
    click?: PetState;
    dragStart?: PetState;
    dragEnd?: PetState;
    idleTimeoutMs?: number;
    idleTimeoutState?: PetState;
    interruptOneShotWith?: PetState[];
  };
}
```

## src/pet/PetActor.ts

```ts
import { AnimatedSprite, Assets, Container, Spritesheet } from "pixi.js";
import type { PetMeta, PetState } from "./types";

export class PetActor extends Container {
  readonly sprite: AnimatedSprite;
  readonly meta: PetMeta;
  private sheet!: Spritesheet;
  private _state: PetState;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(meta: PetMeta, sheet: Spritesheet) {
    super();
    this.meta = meta;
    this.sheet = sheet;
    this._state = meta.defaultState;

    const keys = sheet.data.animations[meta.defaultState] as string[];
    this.sprite = new AnimatedSprite({
      textures: this.buildFrames(keys),
      anchor: meta.anchor,
      loop: meta.states[meta.defaultState]?.loop ?? true,
      autoPlay: true,
    });
    this.addChild(this.sprite);
    this.eventMode = "static";
    this.cursor = "pointer";
    this.resetIdleTimer();
  }

  static async create(baseUrl: string, metaUrl = "pet.json"): Promise<PetActor> {
    const meta = (await Assets.load(baseUrl + metaUrl)) as PetMeta;
    // If pet.json is not registered as a parser, fetch it:
    // const meta = await fetch(baseUrl + "pet.json").then((r) => r.json());
    const sheet = (await Assets.load(baseUrl + meta.spritesheet)) as Spritesheet;
    return new PetActor(meta, sheet);
  }

  get state(): PetState {
    return this._state;
  }

  private buildFrames(keys: string[]) {
    return keys.map((key) => ({
      texture: this.sheet.textures[key],
      time: (this.sheet.data.frames as any)[key]?.duration ?? 120,
    }));
  }

  private isOneShot(state: PetState) {
    return this.meta.states[state]?.loop === false;
  }

  private canInterruptWith(next: PetState) {
    const allow = this.meta.policy?.interruptOneShotWith ?? ["drag"];
    return allow.includes(next);
  }

  setState(next: PetState, opts?: { force?: boolean }) {
    if (next === this._state && !opts?.force) return;
    if (this.isOneShot(this._state) && !opts?.force && !this.canInterruptWith(next)) {
      return;
    }

    const conf = this.meta.states[next];
    if (!conf) throw new Error(`Unknown pet state: ${next}`);
    const keys = this.sheet.data.animations[next] as string[] | undefined;
    if (!keys?.length) throw new Error(`No animation frames for: ${next}`);

    this._state = next;
    this.sprite.textures = this.buildFrames(keys);
    this.sprite.loop = conf.loop;
    this.sprite.onComplete = conf.loop
      ? null
      : () => this.setState((conf.next ?? "idle") as PetState, { force: true });
    this.sprite.gotoAndPlay(0);

    if (next === "idle") this.resetIdleTimer();
    else this.clearIdleTimer();
  }

  private clearIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private resetIdleTimer() {
    this.clearIdleTimer();
    const ms = this.meta.policy?.idleTimeoutMs ?? 20000;
    const to = (this.meta.policy?.idleTimeoutState ?? "sleep") as PetState;
    this.idleTimer = setTimeout(() => this.setState(to), ms);
  }

  onTap() {
    const next = (this.meta.policy?.click ?? "wave") as PetState;
    this.setState(next, { force: true });
  }

  onDragStart() {
    const next = (this.meta.policy?.dragStart ?? "drag") as PetState;
    this.setState(next, { force: true });
  }

  onDragEnd() {
    const next = (this.meta.policy?.dragEnd ?? "idle") as PetState;
    this.setState(next, { force: true });
  }

  destroy(options?: boolean | { children?: boolean; texture?: boolean }) {
    this.clearIdleTimer();
    super.destroy(options);
  }
}
```

> Note: `Assets.load('pet.json')` needs a JSON load path; simplest is `fetch` for `pet.json` and `Assets.load` only for the spritesheet.

## src/main.ts

```ts
import { Application } from "pixi.js";
import { PetActor } from "./pet/PetActor";

const app = new Application();
await app.init({
  backgroundAlpha: 0,
  antialias: false,
  resolution: Math.min(devicePixelRatio, 2),
  autoDensity: true,
  resizeTo: window,
});
document.body.style.margin = "0";
document.body.style.background = "transparent";
document.body.appendChild(app.canvas);

const pet = await PetActor.create("/pets/momo/");
pet.position.set(app.screen.width / 2, app.screen.height / 2);
app.stage.addChild(pet);

let dragging = false;
let moved = false;
const grab = { x: 0, y: 0 };

pet.on("pointerdown", (e) => {
  dragging = true;
  moved = false;
  const local = e.getLocalPosition(app.stage);
  grab.x = local.x - pet.x;
  grab.y = local.y - pet.y;
  pet.onDragStart();
});

app.stage.eventMode = "static";
app.stage.hitArea = app.screen;

app.stage.on("pointermove", (e) => {
  if (!dragging) return;
  const local = e.getLocalPosition(app.stage);
  const nx = local.x - grab.x;
  const ny = local.y - grab.y;
  if (Math.hypot(nx - pet.x, ny - pet.y) > 3) moved = true;
  pet.position.set(nx, ny);
});

app.stage.on("pointerup", () => {
  if (!dragging) return;
  dragging = false;
  if (moved) pet.onDragEnd();
  else pet.onTap();
});

app.stage.on("pointerupoutside", () => {
  if (!dragging) return;
  dragging = false;
  pet.onDragEnd();
});
```

## package.json (minimal)

```json
{
  "name": "desktop-pet-preview",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "pixi.js": "^8"
  },
  "devDependencies": {
    "typescript": "^5",
    "vite": "^6"
  }
}
```

## Electron / Tauri notes (shell only)

- Window: frameless, transparent, always-on-top optional.
- Forward mouse only where the pet's opaque pixels are if click-through is required (OS-specific hit testing). Pixi cannot do OS click-through alone.
- Load the same `public/pets/<id>` assets; do not fork a second atlas format for the shell.
