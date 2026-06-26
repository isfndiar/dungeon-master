# Room Editor + Ruins Dungeon Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a room-template system + standalone room editor, and a new dungeon "ruins" whose rooms place hand-designed solid obstacles and damaging hazards, with monsters auto-spawned by the existing engine.

**Architecture:** New `lib/game/rooms/` module (types, template pool, picker). `RoomNode` gains optional `obstacles`/`hazards`. The `ruins` dungeon flags `useTemplates`; `enterRoom` assigns a template per non-start/non-boss room. Engine renders obstacles/hazards, adds axis-separated slide collision for player + monsters, removes projectiles that hit obstacles, and drains HP in hazards. A standalone `room-editor.html` authors templates.

**Tech Stack:** Next.js 16, TypeScript, HTML5 Canvas 2D. No test runner — verify via `npm run typecheck` + `npm run build` + manual playtest.

**Spec:** `docs/superpowers/specs/2026-06-26-room-editor-ruins-design.md`

**Key engine facts (verified):**
- Constants: `VIEW_W=480`, `VIEW_H=270`, `WALL=16`, `FIELD={x:16,y:16,w:448,h:238}`, `RENDER_SCALE=2`. `FIELD`/`WALL`/`doorCenter` are module-private in `engine.ts`.
- `RoomNode` is defined in `lib/game/map.ts`; `Dir = "n"|"e"|"s"|"w"`; `DIRS`, `DELTA`, `OPPOSITE` exported there.
- `enterRoom(room, fromDir)` at engine.ts ~379 clears entity arrays and spawns monsters when `!room.cleared`.
- `updatePlayer` moves at engine.ts ~707: `this.px += mx*moveSpeed*dt; this.py += my*moveSpeed*dt;` then `this.clampToRoom()`.
- Enemy movement at ~1040-1078 (ranged keep-distance, melee chase), then `e.x=clamp(...)`, `e.y=clamp(...)`.
- Projectile update loop ~2003: `p.x+=p.vx*dt; p.y+=p.vy*dt;` then collisions, then wall-cull at ~2039 sets `p.life=0` when outside FIELD.
- Pool damage tick pattern ~1742-1777 (`tickAcc`, every 0.5s `damagePlayer`).
- `render()` ~2254 draws floor+walls; `drawDoors()` ~2280. Good spot to draw obstacles/hazards is right after `drawDoors()`.
- Dungeon select UI (`app/page.tsx` ~316) maps `DUNGEON_IDS` → cards, sorted by `order`. Raid page validates `dungeonParam` against `DUNGEON_IDS`. Adding `"ruins"` to both lists is sufficient; no UI logic change.

---

## File Structure

```
lib/game/rooms/
  types.ts        NEW  RoomRect, RoomTemplate
  templates.ts    NEW  ROOM_TEMPLATES: RoomTemplate[]  (3 starter templates)
  index.ts        NEW  re-exports + pickTemplate(rng, openDoors)
lib/game/map.ts   MOD  RoomNode += obstacles?, hazards?
lib/game/dungeons.ts MOD  DungeonDef += useTemplates?; add "ruins"; DungeonId/DUNGEON_IDS += "ruins"
lib/game/engine.ts MOD  import rooms; enterRoom assign; render; spawn-avoid; collision; hazard dmg
room-editor.html  NEW  standalone editor
```

---

## Task 1: rooms module — types, picker, starter templates

**Files:**
- Create: `lib/game/rooms/types.ts`
- Create: `lib/game/rooms/templates.ts`
- Create: `lib/game/rooms/index.ts`

- [ ] **Step 1: Create `lib/game/rooms/types.ts`**

```ts
import type { Dir } from "../map";

// All coordinates are in engine VIEW space (480x270), inside the play FIELD
// (x: 16..464, y: 16..254). Editor authors with an 8px snap grid.
export interface RoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomTemplate {
  id: string;
  obstacles: RoomRect[]; // solid: block player + monsters + projectiles
  hazards: RoomRect[];   // static: damage the player while inside
  needDoors?: Dir[];     // doors that must stay clear (no obstacle in corridor)
}
```

- [ ] **Step 2: Create `lib/game/rooms/templates.ts` with 3 starter templates**

FIELD is x 16..464, y 16..254, center (240,135). Door corridors run from each door center to the room center; keep obstacles out of the central cross so all door configs stay passable.

```ts
import type { RoomTemplate } from "./types";

// Starter templates. Obstacles avoid the central cross (x 218..262 and
// y 113..157 strips) so doors on any side remain reachable.
export const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    id: "pillars",
    obstacles: [
      { x: 96, y: 56, w: 28, h: 28 },
      { x: 356, y: 56, w: 28, h: 28 },
      { x: 96, y: 186, w: 28, h: 28 },
      { x: 356, y: 186, w: 28, h: 28 },
    ],
    hazards: [],
  },
  {
    id: "corner_pits",
    obstacles: [],
    hazards: [
      { x: 40, y: 40, w: 56, h: 40 },
      { x: 384, y: 190, w: 56, h: 40 },
    ],
  },
  {
    id: "side_walls",
    obstacles: [
      { x: 120, y: 40, w: 24, h: 70 },
      { x: 336, y: 160, w: 24, h: 70 },
    ],
    hazards: [
      { x: 210, y: 200, w: 60, h: 30 },
    ],
  },
];
```

- [ ] **Step 3: Create `lib/game/rooms/index.ts` with `pickTemplate`**

Door corridor: a strip from the door opening to the room center. Player half-extent ~8px, so corridor half-width 24px is generous. A template is rejected if any obstacle rect overlaps any open door's corridor strip. Hazards never block.

```ts
import type { Dir } from "../map";
import type { RoomRect, RoomTemplate } from "./types";
import { ROOM_TEMPLATES } from "./templates";

export type { RoomRect, RoomTemplate } from "./types";
export { ROOM_TEMPLATES } from "./templates";

// engine VIEW/FIELD constants (kept in sync with engine.ts)
const VIEW_W = 480, VIEW_H = 270, WALL = 16;
const CX = VIEW_W / 2, CY = VIEW_H / 2;
const CORRIDOR_HALF = 24;

function rectsOverlap(a: RoomRect, b: RoomRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Corridor strip (as a RoomRect) from a door on `dir` to the room center.
function doorCorridor(dir: Dir): RoomRect {
  switch (dir) {
    case "n": return { x: CX - CORRIDOR_HALF, y: WALL, w: CORRIDOR_HALF * 2, h: CY - WALL };
    case "s": return { x: CX - CORRIDOR_HALF, y: CY, w: CORRIDOR_HALF * 2, h: VIEW_H - WALL - CY };
    case "w": return { x: WALL, y: CY - CORRIDOR_HALF, w: CX - WALL, h: CORRIDOR_HALF * 2 };
    case "e": return { x: CX, y: CY - CORRIDOR_HALF, w: VIEW_W - WALL - CX, h: CORRIDOR_HALF * 2 };
  }
}

function templateFits(t: RoomTemplate, openDoors: Dir[]): boolean {
  for (const dir of openDoors) {
    const corridor = doorCorridor(dir);
    for (const ob of t.obstacles) {
      if (rectsOverlap(ob, corridor)) return false;
    }
  }
  return true;
}

// Pick a random template whose obstacles clear all open doors. null = leave empty.
export function pickTemplate(rng: () => number, openDoors: Dir[]): RoomTemplate | null {
  const fits = ROOM_TEMPLATES.filter((t) => templateFits(t, openDoors));
  if (fits.length === 0) return null;
  return fits[Math.floor(rng() * fits.length)];
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (new files compile; nothing imports them yet).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/game/rooms/
git commit -m "feat(rooms): add room template types, starter pool, and door-aware picker"
```

---

## Task 2: RoomNode optional obstacles/hazards + ruins dungeon

**Files:**
- Modify: `lib/game/map.ts` (RoomNode interface)
- Modify: `lib/game/dungeons.ts` (DungeonDef, DungeonId, DUNGEON_IDS, add ruins)

- [ ] **Step 1: Add optional fields to `RoomNode` in `lib/game/map.ts`**

Find the `RoomNode` interface (ends with `visited: boolean;`). Add an import at the top of the file and two optional fields. At the very top add:

```ts
import type { RoomRect } from "./rooms/types";
```

Then inside `RoomNode`, after `visited: boolean;` add:

```ts
  obstacles?: RoomRect[];          // solid interior blocks (template dungeons)
  hazards?: RoomRect[];            // static damage zones (template dungeons)
```

`generateMap` does not set these — they stay `undefined` for existing dungeons.

- [ ] **Step 2: Add `useTemplates` to `DungeonDef` and the `ruins` dungeon in `lib/game/dungeons.ts`**

Change the `DungeonId` type union (add `"ruins"`):

```ts
export type DungeonId = "forest" | "cave" | "crypt" | "volcano" | "endless" | "ruins";
```

In `DungeonDef`, after `order: number;` add:

```ts
  useTemplates?: boolean; // rooms pull hand-designed obstacle/hazard templates
```

In the `DUNGEONS` record, after the `endless` entry (before the closing `};`), add:

```ts
  ruins: {
    id: "ruins",
    name: "Sunken Ruins",
    desc: "Crumbling halls strewn with rubble and rot.",
    monsters: ["skeleton", "ghost"],
    boss: "lich",
    rooms: 6,
    baseSpawns: 5,
    spawnGrowth: 2,
    difficulty: 1.4,
    floor: "#2a3340",
    wall: "#1a2230",
    accent: "#5ad7d7",
    order: 6,
    useTemplates: true,
  },
```

Update `DUNGEON_IDS` to include ruins:

```ts
export const DUNGEON_IDS: DungeonId[] = ["forest", "cave", "crypt", "volcano", "endless", "ruins"];
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (If `DungeonId` exhaustiveness errors appear anywhere, they indicate a `Record<DungeonId, ...>` missing `ruins` — the `DUNGEONS` entry added above covers the only such record.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game/map.ts lib/game/dungeons.ts
git commit -m "feat(dungeons): add ruins dungeon + RoomNode obstacle/hazard fields"
```

---

## Task 3: Engine — assign template on enterRoom + render obstacles/hazards

**Files:**
- Modify: `lib/game/engine.ts` (imports, enterRoom, render)

This task makes obstacles/hazards appear (visual + data) but NOT yet solid. Collision/damage come in Tasks 4-5.

- [ ] **Step 1: Import the rooms module in `lib/game/engine.ts`**

Near the existing import of `./map` (the line importing `generateMap, DungeonMap, RoomNode, Dir, DIRS, OPPOSITE, DELTA`), add below it:

```ts
import { pickTemplate } from "./rooms";
import type { RoomRect } from "./rooms";
```

- [ ] **Step 2: Assign a template at the top of `enterRoom`**

In `enterRoom(room, fromDir)` (engine.ts ~379), immediately after `this.curRoom = room;` and `room.visited = true;`, add template assignment. Only for template dungeons, only non-start/non-boss rooms, only once (cache on the room):

```ts
    // assign a hand-designed interior template once (template dungeons only)
    if (
      this.dungeon.useTemplates &&
      !room.isStart && !room.isBoss &&
      room.obstacles === undefined
    ) {
      const openDoors = DIRS.filter((d) => room.doors[d]);
      const tpl = pickTemplate(Math.random, openDoors);
      room.obstacles = tpl ? tpl.obstacles : [];
      room.hazards = tpl ? tpl.hazards : [];
    }
```

(`DIRS` is already imported from `./map`. `Math.random` satisfies the `() => number` picker signature.)

- [ ] **Step 3: Render obstacles + hazards**

In `render()` (engine.ts ~2254), find the call `if (!this.isEndless) this.drawDoors();` (~2280). Immediately AFTER that line, add a call:

```ts
    if (!this.isEndless) this.drawRoomTerrain();
```

Then add the new method. Place it right after the `render()` method's closing brace is too far; instead add it near `drawDoors` (search for `private drawDoors`). Add this new method directly above `private drawDoors(`:

```ts
  private drawRoomTerrain() {
    const ctx = this.ctx;
    const obstacles = this.curRoom.obstacles;
    const hazards = this.curRoom.hazards;
    // hazards first (under obstacles), pulsing translucent danger zones
    if (hazards && hazards.length) {
      const pulse = 0.22 + Math.sin(performance.now() / 260) * 0.08;
      for (const h of hazards) {
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = "#ff3a3a";
        ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.restore();
        ctx.strokeStyle = "#ff6a6a";
        ctx.lineWidth = 1;
        ctx.strokeRect(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1);
      }
    }
    // obstacles: solid blocks in the wall color with a lighter top edge
    if (obstacles && obstacles.length) {
      for (const o of obstacles) {
        ctx.fillStyle = this.dungeon.wall;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = shade(this.dungeon.wall, 0.18);
        ctx.fillRect(o.x, o.y, o.w, 4);
        ctx.strokeStyle = shade(this.dungeon.wall, -0.2);
        ctx.lineWidth = 1;
        ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
      }
    }
  }
```

(`shade` is a module helper already used in `render()`.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Manual smoke check**

Run: `npm run dev`. In the browser, Gate Guard → select "Sunken Ruins" → launch. Walk through a couple of rooms. Expect: some rooms show dark obstacle blocks and/or red hazard zones. Player can still walk through them (collision is Task 4). Start room + boss room have none.

- [ ] **Step 7: Commit**

```bash
git add lib/game/engine.ts
git commit -m "feat(engine): assign + render room templates in ruins dungeon"
```

---

## Task 4: Engine — obstacle collision (player, monsters, projectiles) + spawn avoidance

**Files:**
- Modify: `lib/game/engine.ts`

- [ ] **Step 1: Add an obstacle-collision helper method**

Add this private method near `clampToRoom` (search `private clampToRoom`). Place it directly above `private clampToRoom(`:

```ts
  // True if a point (with half-extent r) overlaps any obstacle in the room.
  private inObstacle(x: number, y: number, r: number): boolean {
    const obs = this.curRoom.obstacles;
    if (!obs || !obs.length) return false;
    for (const o of obs) {
      if (x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h) {
        return true;
      }
    }
    return false;
  }
```

- [ ] **Step 2: Player axis-separated slide vs obstacles**

In `updatePlayer` (engine.ts ~707), replace the movement application:

```ts
      mx /= len; my /= len;
      this.px += mx * moveSpeed * dt;
      this.py += my * moveSpeed * dt;
      this.walkBob += dt * 10;
```

with axis-separated movement that respects obstacles (player foot half-extent 7):

```ts
      mx /= len; my /= len;
      const pr = 7;
      const nx = this.px + mx * moveSpeed * dt;
      if (!this.inObstacle(nx, this.py, pr)) this.px = nx;
      const ny = this.py + my * moveSpeed * dt;
      if (!this.inObstacle(this.px, ny, pr)) this.py = ny;
      this.walkBob += dt * 10;
```

(The following `clampToRoom()` call is unchanged and still keeps the player in the field / handles doors.)

- [ ] **Step 3: Monster axis-separated slide vs obstacles**

In the enemy update loop (engine.ts ~1040-1078), the ranged and melee branches mutate `e.x`/`e.y` directly. Wrap those moves so obstacles block them. Replace the ranged keep-distance block:

```ts
        if (!locked) {
          if (d < desired - 10) {
            e.x -= (dx / d) * e.speed * slow * dt;
            e.y -= (dy / d) * e.speed * slow * dt;
          } else if (d > desired + 10) {
            e.x += (dx / d) * e.speed * slow * dt;
            e.y += (dy / d) * e.speed * slow * dt;
          }
        }
```

with:

```ts
        if (!locked) {
          let ex = 0, ey = 0;
          if (d < desired - 10) { ex = -(dx / d) * e.speed * slow * dt; ey = -(dy / d) * e.speed * slow * dt; }
          else if (d > desired + 10) { ex = (dx / d) * e.speed * slow * dt; ey = (dy / d) * e.speed * slow * dt; }
          const mr = e.size * 0.3;
          if (!this.inObstacle(e.x + ex, e.y, mr)) e.x += ex;
          if (!this.inObstacle(e.x, e.y + ey, mr)) e.y += ey;
        }
```

And replace the melee chase block:

```ts
        if (!locked) {
          e.x += (dx / d) * e.speed * slow * dt;
          e.y += (dy / d) * e.speed * slow * dt;
        }
```

with:

```ts
        if (!locked) {
          const ex = (dx / d) * e.speed * slow * dt;
          const ey = (dy / d) * e.speed * slow * dt;
          const mr = e.size * 0.3;
          if (!this.inObstacle(e.x + ex, e.y, mr)) e.x += ex;
          if (!this.inObstacle(e.x, e.y + ey, mr)) e.y += ey;
        }
```

- [ ] **Step 4: Projectiles vanish on obstacles**

In the projectile update loop, find the wall-cull block (engine.ts ~2039):

```ts
      // walls
      if (p.x < FIELD.x || p.x > FIELD.x + FIELD.w || p.y < FIELD.y || p.y > FIELD.y + FIELD.h) {
        p.life = 0;
      }
```

Replace with one that also culls inside obstacles:

```ts
      // walls + obstacles
      if (p.x < FIELD.x || p.x > FIELD.x + FIELD.w || p.y < FIELD.y || p.y > FIELD.y + FIELD.h) {
        p.life = 0;
      } else if (this.inObstacle(p.x, p.y, p.radius)) {
        p.life = 0;
      }
```

- [ ] **Step 5: Spawn avoidance in `edgePos`**

In `edgePos()` (engine.ts ~417), the loop picks an edge point and breaks when far from the player. Add an obstacle check to the break condition. Replace:

```ts
      if (dist(x, y, this.px, this.py) > 90) break;
```

with:

```ts
      if (dist(x, y, this.px, this.py) > 90 && !this.inObstacle(x, y, 10)) break;
```

(If all tries fail, the loop still returns the last point — acceptable fallback, no infinite loop.)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 8: Manual playtest**

`npm run dev` → ruins. Verify: player cannot walk through obstacle blocks (slides along edges); monsters are blocked by obstacles too; ghost bolts disappear when hitting an obstacle; monsters don't spawn on top of obstacles; doors remain passable.

- [ ] **Step 9: Commit**

```bash
git add lib/game/engine.ts
git commit -m "feat(engine): obstacle collision for player, monsters, projectiles + spawn avoidance"
```

---

## Task 5: Engine — hazard damage

**Files:**
- Modify: `lib/game/engine.ts`

- [ ] **Step 1: Add hazard-damage state fields**

Find the field declarations near `private playerSlow` / `private pools` (search `private pools`). Add a hazard tick accumulator field alongside the other player-state fields (e.g. near `private playerSnare = 0;`):

```ts
  private hazardTick = 0; // accumulator for static room-hazard damage
```

- [ ] **Step 2: Add a hazard-damage update method**

Add this method directly above `private updatePools(` is not guaranteed to exist; instead add it directly above the `inObstacle` method created in Task 4:

```ts
  // Drain HP while the player stands in a static room hazard (every 0.5s).
  private updateRoomHazards(dt: number) {
    const hz = this.curRoom.hazards;
    if (!hz || !hz.length) { this.hazardTick = 0; return; }
    const pr = 6;
    let inside = false;
    for (const h of hz) {
      if (this.px + pr > h.x && this.px - pr < h.x + h.w && this.py + pr > h.y && this.py - pr < h.y + h.h) {
        inside = true;
        break;
      }
    }
    if (!inside) { this.hazardTick = 0; return; }
    this.hazardTick += dt;
    if (this.hazardTick >= 0.5) {
      this.hazardTick = 0;
      // scales with dungeon difficulty so it stays relevant in higher modes
      this.damagePlayer(Math.round(10 * this.difficulty));
    }
  }
```

- [ ] **Step 3: Call it from the main update**

Find where `updatePlayer(dt)` is called in the main `update`/tick method (search `this.updatePlayer(`). Immediately after that call, add:

```ts
    if (!this.isEndless) this.updateRoomHazards(dt);
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Manual playtest**

`npm run dev` → ruins → find a room with a red hazard zone. Standing in it drains HP roughly every half-second; stepping out stops the drain. The drain is harsher in higher modes.

- [ ] **Step 7: Commit**

```bash
git add lib/game/engine.ts
git commit -m "feat(engine): static room hazard damage in template dungeons"
```

---

## Task 6: Standalone room editor (`room-editor.html`)

**Files:**
- Create: `room-editor.html` (project root, like the existing `layout-preview.html`)

This is a self-contained HTML file opened directly in a browser (not part of the Next build). It authors `RoomTemplate` literals to paste into `lib/game/rooms/templates.ts`.

- [ ] **Step 1: Create `room-editor.html` with the full editor**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Dungeon Room Editor</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #15161a; color: #ddd; font-family: ui-monospace, monospace; padding: 16px; }
  h1 { font-size: 15px; margin: 0 0 12px; }
  .wrap { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
  canvas { background: #000; image-rendering: pixelated; border: 1px solid #444; cursor: crosshair; }
  .side { width: 340px; font-size: 12px; }
  .bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  button { background: #2a2c33; color: #ddd; border: 1px solid #444; padding: 6px 10px; border-radius: 5px; cursor: pointer; font-family: inherit; font-size: 12px; }
  button:hover { background: #34373f; }
  button.active { background: #3a5a8a; border-color: #5a8aca; }
  button.danger:hover { background: #6a2a2a; }
  label.chk { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
  .sel { background: #1c1d22; border: 1px solid #383a42; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
  .sel h3 { margin: 0 0 8px; font-size: 12px; color: #9cf; }
  .grid2 { display: grid; grid-template-columns: auto 1fr; gap: 5px 8px; align-items: center; }
  .grid2 input { width: 100%; background: #0e0f12; color: #ddd; border: 1px solid #383a42; padding: 3px 5px; border-radius: 4px; font-family: inherit; }
  textarea { width: 100%; height: 200px; background: #0e0f12; color: #8fd; border: 1px solid #383a42; border-radius: 6px; padding: 8px; font-family: inherit; font-size: 11px; resize: vertical; }
  .hint { color: #888; font-size: 11px; line-height: 1.5; margin: 6px 0; }
  .swatch { display: inline-block; width: 11px; height: 11px; vertical-align: middle; margin-right: 5px; border: 1px solid #555; }
  .warn { color: #ff7a7a; font-size: 11px; min-height: 16px; margin: 4px 0; }
  .doors { display: flex; gap: 10px; margin-bottom: 10px; }
</style>
</head>
<body>
<h1>Dungeon Room Editor — field 480x270, snap 8px, scale 2x</h1>
<div class="wrap">
  <div>
    <canvas id="c" width="960" height="540"></canvas>
    <div class="hint">Click to select - drag to move - drag corner to resize. <label class="chk"><input type="checkbox" id="snap" checked> Snap 8px</label></div>
    <div class="doors">
      <span>Doors:</span>
      <label class="chk"><input type="checkbox" class="door" data-d="n" checked> N</label>
      <label class="chk"><input type="checkbox" class="door" data-d="e" checked> E</label>
      <label class="chk"><input type="checkbox" class="door" data-d="s" checked> S</label>
      <label class="chk"><input type="checkbox" class="door" data-d="w" checked> W</label>
    </div>
    <div class="bar">
      <button id="addObs">+ Obstacle</button>
      <button id="addHaz">+ Hazard</button>
      <button id="dup">Duplicate</button>
      <button id="del" class="danger">Delete</button>
      <button id="reset" class="danger">Reset</button>
    </div>
    <div class="warn" id="warn"></div>
  </div>
  <div class="side">
    <div class="sel" id="selPanel"><h3>No selection</h3><div class="hint">Select a rect to edit.</div></div>
    <div class="bar">
      <label class="chk">id <input id="tplId" type="text" value="room1" style="background:#0e0f12;color:#ddd;border:1px solid #383a42;border-radius:4px;padding:3px 6px;font-family:inherit;width:120px"></label>
      <button id="exportBtn" class="active">Export template</button>
      <button id="copyBtn">Copy</button>
      <button id="dlBtn">Download JSON</button>
    </div>
    <textarea id="out" readonly></textarea>
    <div class="hint">
      <span class="swatch" style="background:#3a4250"></span>obstacle (solid)
      <span class="swatch" style="background:#ff3a3a"></span>hazard (damage)
    </div>
  </div>
</div>
<script>
const SCALE = 2, GRID = 8, VIEW_W = 480, VIEW_H = 270, WALL = 16;
const FIELD = { x: WALL, y: WALL, w: VIEW_W - WALL*2, h: VIEW_H - WALL*2 };
const CX = VIEW_W/2, CY = VIEW_H/2, DOOR_HALF = 22, CORRIDOR_HALF = 24;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const snapEl = document.getElementById('snap');

function defaultModel(){ return { obstacles: [], hazards: [] }; }
let model = load() || defaultModel();
let doors = { n:true, e:true, s:true, w:true };
let sel = null, drag = null;

function snap(v){ return snapEl.checked ? Math.round(v/GRID)*GRID : Math.round(v); }
function all(){ return [...model.obstacles, ...model.hazards]; }
function kindOf(o){ return model.obstacles.includes(o) ? 'obstacle' : 'hazard'; }

function toWorld(e){ const r = cv.getBoundingClientRect(); return { x:(e.clientX-r.left)/SCALE, y:(e.clientY-r.top)/SCALE }; }
function hit(mx,my){ const a = all(); for(let i=a.length-1;i>=0;i--){ const o=a[i]; if(mx>=o.x&&mx<=o.x+o.w&&my>=o.y&&my<=o.y+o.h) return o; } return null; }
function handle(o,mx,my){ return Math.hypot((o.x+o.w)-mx,(o.y+o.h)-my) < 12; }

cv.addEventListener('mousedown', e=>{
  const {x,y}=toWorld(e);
  if(sel && handle(sel,x,y)){ drag={obj:sel,mode:'resize'}; return; }
  const o=hit(x,y); sel=o;
  if(o) drag={obj:o,mode:'move',dx:x-o.x,dy:y-o.y};
  panel(); draw();
});
window.addEventListener('mousemove', e=>{
  if(!drag) return;
  const {x,y}=toWorld(e); const o=drag.obj;
  if(drag.mode==='move'){
    o.x=snap(x-drag.dx); o.y=snap(y-drag.dy);
    o.x=Math.max(FIELD.x,Math.min(FIELD.x+FIELD.w-o.w,o.x));
    o.y=Math.max(FIELD.y,Math.min(FIELD.y+FIELD.h-o.h,o.y));
  } else {
    o.w=Math.max(GRID,snap(x-o.x)); o.h=Math.max(GRID,snap(y-o.y));
  }
  panel(); draw(); save();
});
window.addEventListener('mouseup', ()=>{ if(drag){ save(); exportTpl(); } drag=null; });

document.getElementById('addObs').onclick=()=>{ const o={x:120,y:110,w:40,h:40}; model.obstacles.push(o); sel=o; sync(); };
document.getElementById('addHaz').onclick=()=>{ const o={x:200,y:120,w:48,h:32}; model.hazards.push(o); sel=o; sync(); };
document.getElementById('dup').onclick=()=>{ if(!sel)return; const k=kindOf(sel); const c={...sel,x:sel.x+GRID,y:sel.y+GRID}; (k==='obstacle'?model.obstacles:model.hazards).push(c); sel=c; sync(); };
document.getElementById('del').onclick=()=>{ if(!sel)return; model.obstacles=model.obstacles.filter(o=>o!==sel); model.hazards=model.hazards.filter(o=>o!==sel); sel=null; sync(); };
document.getElementById('reset').onclick=()=>{ if(confirm('Reset room?')){ model=defaultModel(); sel=null; sync(); } };
document.getElementById('exportBtn').onclick=exportTpl;
document.getElementById('copyBtn').onclick=()=>{ out.select(); document.execCommand('copy'); };
document.getElementById('dlBtn').onclick=()=>{
  const blob=new Blob([out.value],{type:'text/plain'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='room_'+document.getElementById('tplId').value+'.txt'; a.click(); URL.revokeObjectURL(a.href);
};
document.querySelectorAll('.door').forEach(d=>{ d.onchange=()=>{ doors[d.dataset.d]=d.checked; draw(); exportTpl(); }; });

function sync(){ panel(); draw(); save(); exportTpl(); }

const selPanel=document.getElementById('selPanel');
function panel(){
  if(!sel){ selPanel.innerHTML='<h3>No selection</h3><div class="hint">Select a rect to edit.</div>'; return; }
  const o=sel, k=kindOf(sel);
  selPanel.innerHTML='<h3>'+k.toUpperCase()+'</h3><div class="grid2">'+
    ['x','y','w','h'].map(f=>'<label>'+f+'</label><input id="f_'+f+'" type="number" value="'+o[f]+'">').join('')+'</div>';
  for(const f of ['x','y','w','h']){ const i=document.getElementById('f_'+f); i.onchange=()=>{ o[f]=Number(i.value); draw(); save(); exportTpl(); }; }
}

function corridor(dir){
  switch(dir){
    case 'n': return {x:CX-CORRIDOR_HALF,y:WALL,w:CORRIDOR_HALF*2,h:CY-WALL};
    case 's': return {x:CX-CORRIDOR_HALF,y:CY,w:CORRIDOR_HALF*2,h:VIEW_H-WALL-CY};
    case 'w': return {x:WALL,y:CY-CORRIDOR_HALF,w:CX-WALL,h:CORRIDOR_HALF*2};
    case 'e': return {x:CX,y:CY-CORRIDOR_HALF,w:VIEW_W-WALL-CX,h:CORRIDOR_HALF*2};
  }
}
function overlap(a,b){ return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y; }
function blockedDoors(){
  const bad=[];
  for(const d of ['n','e','s','w']){ if(!doors[d])continue; const c=corridor(d); if(model.obstacles.some(o=>overlap(o,c))) bad.push(d); }
  return bad;
}

function R(x,y,w,h){ ctx.fillRect(x*SCALE,y*SCALE,w*SCALE,h*SCALE); }
function SR(x,y,w,h){ ctx.strokeRect(x*SCALE+0.5,y*SCALE+0.5,w*SCALE-1,h*SCALE-1); }
function draw(){
  ctx.fillStyle='#2a3340'; ctx.fillRect(0,0,VIEW_W*SCALE,VIEW_H*SCALE);
  // floor tiles
  ctx.fillStyle='#26303c';
  for(let y=FIELD.y;y<FIELD.y+FIELD.h;y+=24) for(let x=FIELD.x;x<FIELD.x+FIELD.w;x+=24) if(((x+y)/24)%2<1) R(x,y,24,24);
  // walls
  ctx.fillStyle='#1a2230';
  R(0,0,VIEW_W,WALL); R(0,VIEW_H-WALL,VIEW_W,WALL); R(0,0,WALL,VIEW_H); R(VIEW_W-WALL,0,WALL,VIEW_H);
  // doors (gaps)
  ctx.fillStyle='#3a4250';
  if(doors.n) R(CX-DOOR_HALF,0,DOOR_HALF*2,WALL);
  if(doors.s) R(CX-DOOR_HALF,VIEW_H-WALL,DOOR_HALF*2,WALL);
  if(doors.w) R(0,CY-DOOR_HALF,WALL,DOOR_HALF*2);
  if(doors.e) R(VIEW_W-WALL,CY-DOOR_HALF,WALL,DOOR_HALF*2);
  // corridors (faint)
  ctx.globalAlpha=0.08; ctx.fillStyle='#5af';
  for(const d of ['n','e','s','w']) if(doors[d]){ const c=corridor(d); R(c.x,c.y,c.w,c.h); }
  ctx.globalAlpha=1;
  // hazards
  for(const h of model.hazards){ ctx.globalAlpha=0.4; ctx.fillStyle='#ff3a3a'; R(h.x,h.y,h.w,h.h); ctx.globalAlpha=1; ctx.strokeStyle='#ff6a6a'; ctx.lineWidth=1; SR(h.x,h.y,h.w,h.h); }
  // obstacles
  for(const o of model.obstacles){ ctx.fillStyle='#3a4250'; R(o.x,o.y,o.w,o.h); ctx.fillStyle='#4e596a'; R(o.x,o.y,o.w,4); ctx.strokeStyle='#222'; ctx.lineWidth=1; SR(o.x,o.y,o.w,o.h); }
  // selection
  if(sel){ ctx.strokeStyle='#5cf'; ctx.lineWidth=2; ctx.strokeRect(sel.x*SCALE,sel.y*SCALE,sel.w*SCALE,sel.h*SCALE); ctx.fillStyle='#5cf'; ctx.fillRect((sel.x+sel.w)*SCALE-4,(sel.y+sel.h)*SCALE-4,8,8); }
  // warn
  const bad=blockedDoors();
  document.getElementById('warn').textContent = bad.length ? ('Warning: obstacle blocks door(s): '+bad.join(', ').toUpperCase()) : '';
}

const out=document.getElementById('out');
function exportTpl(){
  const id=document.getElementById('tplId').value||'room';
  const need=['n','e','s','w'].filter(d=>doors[d]);
  const fmt=r=>'{ x: '+r.x+', y: '+r.y+', w: '+r.w+', h: '+r.h+' }';
  let s='{\n  id: "'+id+'",\n  obstacles: [';
  s+= model.obstacles.length ? '\n'+model.obstacles.map(o=>'    '+fmt(o)+',').join('\n')+'\n  ' : '';
  s+='],\n  hazards: [';
  s+= model.hazards.length ? '\n'+model.hazards.map(o=>'    '+fmt(o)+',').join('\n')+'\n  ' : '';
  s+='],\n  needDoors: ['+need.map(d=>'"'+d+'"').join(', ')+'],\n},';
  out.value=s;
}

function save(){ localStorage.setItem('room_editor', JSON.stringify(model)); }
function load(){ try{ const s=localStorage.getItem('room_editor'); return s?JSON.parse(s):null; }catch{ return null; } }

snapEl.onchange=draw;
document.getElementById('tplId').oninput=exportTpl;
sync();
</script>
</body>
</html>
```

- [ ] **Step 2: Validate the embedded JS syntax**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('room-editor.html','utf8');const m=h.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log('JS OK')"
```
Expected: prints `JS OK`.

- [ ] **Step 3: Manual check**

Open `room-editor.html` in a browser. Add obstacles + hazards, drag/resize, toggle doors. Confirm: the door-block warning appears when an obstacle covers an enabled door's corridor; Export produces a `RoomTemplate` literal; Copy/Download work. The literal matches the shape in `lib/game/rooms/templates.ts` (paste-ready).

- [ ] **Step 4: Commit**

```bash
git add room-editor.html
git commit -m "feat(editor): standalone dungeon room editor with door-clearance warnings"
```

---

## Self-Review Notes

**Spec coverage:**
- rooms module (types/templates/index, door-aware pick) → Task 1.
- RoomNode optional fields + ruins dungeon + DungeonId/DUNGEON_IDS → Task 2.
- enterRoom template assignment (skip start/boss) + render → Task 3.
- Collision (player/monster slide, projectile cull) + spawn avoidance → Task 4.
- Hazard damage → Task 5.
- Standalone editor with door-clearance warning + export → Task 6.
- Gate Guard access: ruins added to DUNGEON_IDS (Task 2); page.tsx renders from DUNGEON_IDS (verified, no change needed).
- Existing dungeons untouched: obstacles/hazards undefined unless useTemplates; enterRoom guard checks this.

**Placeholder scan:** No TBD/TODO. All code blocks are complete and reference real engine symbols (`FIELD`, `shade`, `DIRS`, `dist`, `damagePlayer`, `clampToRoom`, `inObstacle`, `curRoom`, `dungeon`).

**Type consistency:** `RoomRect`/`RoomTemplate` defined in Task 1, imported in Tasks 2-4. `pickTemplate(rng, openDoors)` signature matches the call in Task 3. `inObstacle(x,y,r)` defined in Task 4 Step 1, used in Task 4 Steps 2-5 and (no) Task 5 — Task 5 inlines its own hazard rect test (doesn't reuse inObstacle, intentional since hazards are separate). `hazardTick`/`updateRoomHazards` defined + called in Task 5. `drawRoomTerrain` defined + called in Task 3.

**Ordering note:** Task 4 Step 2 (`inObstacle`) must exist before Task 5 places `updateRoomHazards` "above the inObstacle method". If executed out of order, place `updateRoomHazards` near `clampToRoom` instead — both are in the same method-cluster region.

**Scope:** Single phase, 6 tasks, each ends at a typecheck+build-green checkpoint. Editor is standalone (no build impact). Appropriately sized.
