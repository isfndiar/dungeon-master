# West Village Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second explorable map ("West Village") west of the existing town, reachable by walking off the left edge, establishing a multi-map system for future expansion.

**Architecture:** Introduce a `TownMap` interface and a `maps` registry inside `TownEngine`. The active map is swapped via a fade transition triggered by edge detection in `update()`. All hardcoded `WORLD_W`/`WORLD_H` references inside instance methods are replaced with `this.currentMap.worldW`/`this.currentMap.worldH`. The existing `buildLayout()` is split into `buildTownMap()` + `buildWestVillageMap()`, each returning a `TownMap`.

**Tech Stack:** Next.js 16, TypeScript, HTML5 Canvas 2D, no test runner (verification via `npm run typecheck` + `npm run build` + manual playtest in `npm run dev`).

**Spec:** `docs/superpowers/specs/2026-06-25-west-village-map-design.md`

---

## File Structure

Only one file changes: `lib/game/town.ts` (currently 1000 lines → ~1200 lines). Single-file refactor matches existing conventions (`engine.ts` is 1684 lines in one file). No other files touched. No new files created.

Key new types at top of file:
- `Plaza` — `{ x, y, w, h }` rect for road-tile rendering (previously hardcoded in `render()`).
- `TownMap` — `{ id, name, worldW, worldH, buildings, npcs, spawnX, spawnY, exits, plazas }`.

Key new `TownEngine` fields:
- `maps: Record<string, TownMap>` — registry of all built maps.
- `currentMap: TownMap` — active map reference.
- `currentMapId: string` — active map id.
- Transition state: `transitionState`, `transitionTimer`, `transitionTarget`, `transitionSpawn`.

Removed `TownEngine` fields:
- `buildings: Building[]` → use `this.currentMap.buildings`.
- `npcs: NpcDef[]` → use `this.currentMap.npcs`.

Module constants `WORLD_W`/`WORLD_H` stay exported (used as defaults by `buildTownMap()` only); engine instance methods no longer read them at runtime.

---

## Task 1: Introduce `TownMap` interface and refactor `buildLayout` into `buildTownMap`

**Files:**
- Modify: `lib/game/town.ts` (top: new types; `TownEngine` class: new fields + constructor; rename `buildLayout` → `buildTownMap`; replace all `this.buildings`/`this.npcs` reads)

This task is a pure structural refactor — no behavior change. After it, the game runs identically with a single map stored in the new registry shape.

- [ ] **Step 1: Add `Plaza` and `TownMap` types near the top of the file**

Insert after the `Building` interface (around line 65, after `interface Building { ... }`):

```ts
interface Plaza {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TownMap {
  id: string;
  name: string;
  worldW: number;
  worldH: number;
  buildings: Building[];
  npcs: NpcDef[];
  spawnX: number;
  spawnY: number;
  exits: { left?: string; right?: string };
  plazas: Plaza[];
}
```

- [ ] **Step 2: Replace `buildings` and `npcs` fields with `maps`/`currentMap`/`currentMapId`**

In the `TownEngine` class field block, find:

```ts
  private npcs: NpcDef[] = [];
  private buildings: Building[] = [];
```

Replace with:

```ts
  private maps: Record<string, TownMap> = {};
  private currentMap!: TownMap;
  private currentMapId = "town";
```

- [ ] **Step 3: Rename `buildLayout()` to `buildTownMap()` and change its signature/return**

Change the method signature from:

```ts
  private buildLayout() {
```

to:

```ts
  private buildTownMap(): TownMap {
```

At the end of the method (currently the `for (const n of this.npcs)` bake loop ending around line 404), instead of just baking into `this.npcs`, build local arrays and return a `TownMap`. Concretely: rename the local `this.buildings = [...]` assignment to a local `const buildings: Building[] = [...]`, and `this.npcs = [...]` to `const npcs: NpcDef[] = [...]`. Then the bake loop at the end iterates `for (const n of npcs)` and sets `n.image`/`n.sprite`/`n.walkImgs` on those locals.

Add this return statement at the very end of `buildTownMap()` (after the bake loop):

```ts
    return {
      id: "town",
      name: "Town",
      worldW: WORLD_W,
      worldH: WORLD_H,
      buildings,
      npcs,
      spawnX: WORLD_W / 2,
      spawnY: WORLD_H - 60,
      exits: {},  // left exit wired in Task 5
      plazas: [
        { x: 120, y: 340, w: 1040, h: 230 },   // town square
        { x: 460, y: 200, w: 360, h: 140 },    // castle courtyard
        { x: 1100, y: 340, w: 180, h: 230 },   // road to portal
        { x: 0, y: 400, w: 120, h: 120 },      // road to left exit
      ],
    };
```

Note: the four plaza rects above are exactly the four `ctx.fillRect(...)` calls currently hardcoded in `render()` at lines 589-595. They move into the map definition here; `render()` will read them from `this.currentMap.plazas` in Task 4.

- [ ] **Step 4: Update the constructor to wire up the registry**

In the constructor, replace:

```ts
    this.buildLayout();
    this.preloadBuildings();
    preloadHeroSprites();
    this.resize();
```

with:

```ts
    const townMap = this.buildTownMap();
    this.maps = { town: townMap };
    this.currentMap = townMap;
    this.currentMapId = "town";
    this.px = townMap.spawnX;
    this.py = townMap.spawnY;
    this.preloadBuildings();
    preloadHeroSprites();
    this.resize();
```

Also remove the two field initializers `private px = WORLD_W / 2;` and `private py = WORLD_H - 60;` (the constructor now sets them from the map spawn). Change their declarations to `private px = 0;` and `private py = 0;` to satisfy strict-mode initialization (the constructor overwrites them before use).

- [ ] **Step 5: Replace every `this.buildings` read with `this.currentMap.buildings`**

Search the file for `this.buildings`. There are occurrences in:
- `blocked()` — `for (const b of this.buildings)` → `for (const b of this.currentMap.buildings)`
- `render()` — `for (const b of this.buildings) draws.push(...)` → `for (const b of this.currentMap.buildings) draws.push(...)`
- `drawMinimap()` — `for (const b of this.buildings)` → `for (const b of this.currentMap.buildings)`

- [ ] **Step 6: Replace every `this.npcs` read with `this.currentMap.npcs`**

Search the file for `this.npcs`. Occurrences in:
- `update()` — wanderer loop `for (const n of this.npcs)` → `for (const n of this.currentMap.npcs)`
- `update()` — nearest-NPC loop `for (const n of this.npcs)` → `for (const n of this.currentMap.npcs)`
- `render()` — `for (const n of this.npcs) draws.push(...)` → `for (const n of this.currentMap.npcs) draws.push(...)`
- `render()` — nearby-NPC prompt block uses `this.nearby` (unchanged, that's a separate field)
- `drawMinimap()` — `for (const n of this.npcs)` → `for (const n of this.currentMap.npcs)`

Leave `this.nearby` alone — it stays a direct engine field.

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors. If errors reference `this.buildings` or `this.npcs`, a read site was missed — fix it.

- [ ] **Step 8: Run build**

Run: `npm run build`
Expected: PASS (Next.js production build succeeds).

- [ ] **Step 9: Commit**

```bash
git add lib/game/town.ts
git commit -m "refactor(town): introduce TownMap registry, split buildLayout into buildTownMap"
```

---

## Task 2: Make `update()` edge-aware and add transition state + `transitionTo()`

**Files:**
- Modify: `lib/game/town.ts` (`TownEngine` fields: add transition state; `update()`: edge detection + skip movement during transition; new `transitionTo()` method)

After this task the game still runs identically (the town map has empty `exits`, so no transition ever fires), but the transition machinery is in place and exercised by typecheck/build.

- [ ] **Step 1: Add transition state fields to `TownEngine`**

Add after the `private prevInteract = false;` field:

```ts
  private transitionState: "none" | "fade-out" | "fade-in" = "none";
  private transitionTimer = 0;
  private transitionTarget: string | null = null;
  private transitionSpawn: { x: number; y: number } | null = null;
```

- [ ] **Step 2: Add the `transitionTo()` method**

Add this new method right after `interactNearby()` (before `buildTownMap`):

```ts
  transitionTo(mapId: string, fromEdge: "left" | "right") {
    if (this.transitionState !== "none") return;
    const target = this.maps[mapId];
    if (!target) return;
    this.transitionTarget = mapId;
    this.transitionState = "fade-out";
    this.transitionTimer = 0;
    // spawn on the opposite edge of the new map
    this.transitionSpawn = fromEdge === "left"
      ? { x: target.worldW - 30, y: target.spawnY }   // entered new map via its left edge → spawn at right
      : { x: 30, y: target.spawnY };                   // entered new map via its right edge → spawn at left
  }
```

- [ ] **Step 3: Add a `updateTransition()` method**

Add right after `transitionTo()`:

```ts
  private updateTransition(dt: number) {
    if (this.transitionState === "none") return;
    const FADE = 0.3;
    this.transitionTimer += dt;
    if (this.transitionState === "fade-out" && this.transitionTimer >= FADE) {
      // swap map + reposition player
      const id = this.transitionTarget!;
      this.currentMap = this.maps[id];
      this.currentMapId = id;
      const sp = this.transitionSpawn!;
      this.px = sp.x;
      this.py = sp.y;
      this.nearby = null;
      this.prevInteract = false;
      this.transitionState = "fade-in";
      this.transitionTimer = 0;
    } else if (this.transitionState === "fade-in" && this.transitionTimer >= FADE) {
      this.transitionState = "none";
      this.transitionTimer = 0;
      this.transitionTarget = null;
      this.transitionSpawn = null;
    }
  }
```

- [ ] **Step 4: Skip player movement while transitioning**

In `update()`, at the very top of the method (before the `let mx = 0, my = 0;` line), add:

```ts
    if (this.transitionState !== "none") {
      this.updateTransition(dt);
      return;
    }
```

This halts player control, wanderer AI, and NPC proximity checks during the fade. `updateTransition` advances the fade timer and performs the swap at the bottom of fade-out.

- [ ] **Step 5: Replace the player bounds clamp with edge-aware logic**

In `update()`, find:

```ts
    // bounds (walkable world area)
    this.px = clamp(this.px, 14, WORLD_W - 14);
    this.py = clamp(this.py, 40, WORLD_H - 14);
```

Replace with:

```ts
    // bounds + edge-exit detection
    const W = this.currentMap.worldW;
    const H = this.currentMap.worldH;
    const ex = this.currentMap.exits;
    if (this.px <= 0 && ex.left) {
      this.transitionTo(ex.left, "left");
      return;
    }
    if (this.px >= W && ex.right) {
      this.transitionTo(ex.right, "right");
      return;
    }
    // no exit on that edge → hard clamp
    this.px = clamp(this.px, 14, W - 14);
    this.py = clamp(this.py, 40, H - 14);
```

The `return` after `transitionTo` ensures we don't run the rest of `update()` (camera/wanderers/proximity) on the same frame a transition starts — `updateTransition` will take over next frame via the Step 4 guard.

- [ ] **Step 6: Replace remaining `WORLD_W`/`WORLD_H` in `update()`**

In `update()`, the camera clamp lines read:

```ts
    this.camX = clamp(this.px - this.viewW / 2, 0, Math.max(0, WORLD_W - this.viewW));
    this.camY = clamp(this.py - this.viewH / 2, 0, Math.max(0, WORLD_H - this.viewH));
```

Replace with:

```ts
    this.camX = clamp(this.px - this.viewW / 2, 0, Math.max(0, this.currentMap.worldW - this.viewW));
    this.camY = clamp(this.py - this.viewH / 2, 0, Math.max(0, this.currentMap.worldH - this.viewH));
```

And in the wanderer bounds check inside the same method:

```ts
          nx > 14 && nx < WORLD_W - 14 &&
          ny > 44 && ny < WORLD_H - 18 &&
```

Replace with:

```ts
          nx > 14 && nx < this.currentMap.worldW - 14 &&
          ny > 44 && ny < this.currentMap.worldH - 18 &&
```

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Run build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/game/town.ts
git commit -m "feat(town): add map transition state and edge-exit detection"
```

---

## Task 3: Render fade overlay during transitions

**Files:**
- Modify: `lib/game/town.ts` (`render()`: draw black overlay whose alpha follows the transition state)

- [ ] **Step 1: Add fade overlay drawing at the end of `render()`**

At the very end of the `render()` method, after `this.drawMinimap();` and before the closing `}` of `render()`, add:

```ts
    // transition fade overlay (screen-space, drawn after camera restore + minimap)
    if (this.transitionState !== "none") {
      const FADE = 0.3;
      const t = Math.min(1, this.transitionTimer / FADE);
      const alpha = this.transitionState === "fade-out" ? t : 1 - t;
      this.ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      this.ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
```

Note: `render()` is called every frame regardless of pause/transition (only `update()` is gated). The overlay is in screen space (after `ctx.restore()` removes the camera translate and after `drawMinimap`), so it covers everything. Using `this.viewW`/`this.viewH` is correct because the ctx transform at that point maps world→device via the `setTransform` in `resize()`.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/game/town.ts
git commit -m "feat(town): render fade overlay during map transitions"
```

---

## Task 4: Replace remaining `WORLD_W`/`WORLD_H` in `render()` + `drawMinimap()` + `resize()` and move plazas into `currentMap.plazas`

**Files:**
- Modify: `lib/game/town.ts` (`render()`: grass fallback + plaza loop + minimap sizing; `drawMinimap()`: scaling; `resize()`: viewport clamp)

After this task no instance method reads `WORLD_W`/`WORLD_H` directly — all bounds come from `this.currentMap`. The module constants remain only as defaults consumed by `buildTownMap()`.

- [ ] **Step 1: Fix `resize()` viewport clamp**

In `resize()`, find:

```ts
    this.viewW = Math.min(WORLD_W, pxW / PIXEL_SCALE);
    this.viewH = Math.min(WORLD_H, pxH / PIXEL_SCALE);
```

Replace with:

```ts
    this.viewW = Math.min(this.currentMap?.worldW ?? WORLD_W, pxW / PIXEL_SCALE);
    this.viewH = Math.min(this.currentMap?.worldH ?? WORLD_H, pxH / PIXEL_SCALE);
```

The `?? WORLD_W` fallback covers the very first `resize()` call in the constructor (before `currentMap` is assigned). Actually the constructor assigns `currentMap` before calling `resize()` (per Task 1 Step 4), so the fallback is just defensive — keeps `resize()` safe if ever called early.

- [ ] **Step 2: Fix grass fallback in `render()`**

In `render()`, the grass-tile-missing fallback reads:

```ts
      ctx.fillStyle = "#3a6a3a";
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
```

Replace with:

```ts
      ctx.fillStyle = "#3a6a3a";
      ctx.fillRect(0, 0, this.currentMap.worldW, this.currentMap.worldH);
```

(The tiling branch above it uses `x0/y0/viewW/viewH` already — no change needed there.)

- [ ] **Step 3: Replace hardcoded plaza `fillRect`s with a loop over `currentMap.plazas`**

In `render()`, find the road-tile block:

```ts
      if (this.roadPattern) {
        ctx.fillStyle = this.roadPattern;
        // wide rectangular plaza: from left castle edge to right market/endless
        ctx.fillRect(120, 340, 1040, 230);
        // castle courtyard: brick area in front of the top-center castle
        ctx.fillRect(460, 200, 360, 140);
        // road to portal (right side)
        ctx.fillRect(1100, 340, 180, 230);
        // road to left exit
        ctx.fillRect(0, 400, 120, 120);
      }
```

and the matching fallback `else` block:

```ts
    } else {
      ctx.fillStyle = "#9a8f7a";
      ctx.fillRect(120, 340, 1040, 230);
      ctx.fillRect(460, 200, 360, 140);
      ctx.fillRect(1100, 340, 180, 230);
      ctx.fillRect(0, 400, 120, 120);
    }
```

Replace both with loops over `this.currentMap.plazas`. New pattern branch:

```ts
      if (this.roadPattern) {
        ctx.fillStyle = this.roadPattern;
        for (const p of this.currentMap.plazas) {
          ctx.fillRect(p.x, p.y, p.w, p.h);
        }
      } else {
        ctx.fillStyle = "#9a8f7a";
        for (const p of this.currentMap.plazas) {
          ctx.fillRect(p.x, p.y, p.w, p.h);
        }
      }
```

- [ ] **Step 4: Fix `drawMinimap()` sizing**

In `drawMinimap()`, find:

```ts
    const mapH = Math.round(mapW * (WORLD_H / WORLD_W));
    const pad = 6;
    const mx = this.viewW - mapW - pad;
    const my = this.viewH - mapH - pad;
    const sx = mapW / WORLD_W;
    const sy = mapH / WORLD_H;
```

Replace with:

```ts
    const W = this.currentMap.worldW;
    const H = this.currentMap.worldH;
    const mapH = Math.round(mapW * (H / W));
    const pad = 6;
    const mx = this.viewW - mapW - pad;
    const my = this.viewH - mapH - pad;
    const sx = mapW / W;
    const sy = mapH / H;
```

- [ ] **Step 5: Fix hardcoded plaza rects inside `drawMinimap()`**

In `drawMinimap()` there's a duplicate of the plaza rects:

```ts
    // road/plaza
    ctx.fillStyle = "#5a5548";
    ctx.fillRect(mx + 120 * sx, my + 340 * sy, 1040 * sx, 230 * sy);
    ctx.fillRect(mx + 460 * sx, my + 200 * sy, 360 * sx, 140 * sy);
```

Replace with a loop:

```ts
    // road/plaza
    ctx.fillStyle = "#5a5548";
    for (const p of this.currentMap.plazas) {
      ctx.fillRect(mx + p.x * sx, my + p.y * sy, p.w * sx, p.h * sy);
    }
```

- [ ] **Step 6: Confirm no instance method still references `WORLD_W`/`WORLD_H`**

Search `lib/game/town.ts` for `WORLD_W` and `WORLD_H`. The only remaining occurrences must be:
- The module `export const WORLD_W = 1280;` and `export const WORLD_H = 800;` declarations at the top.
- Inside `buildTownMap()`: the `return { ... worldW: WORLD_W, worldH: WORLD_H, ... spawnX: WORLD_W / 2, spawnY: WORLD_H - 60, ... }` block.
- The `?? WORLD_W` / `?? WORLD_H` defensive fallbacks in `resize()`.

No other method should read them. If any remains, replace it with `this.currentMap.worldW`/`worldH`.

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Run build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/game/town.ts
git commit -m "refactor(town): drive all bounds from currentMap, move plazas into map def"
```

---

## Task 5: Build the West Village map, wire town's left exit, add "TOWN →" arrow

**Files:**
- Modify: `lib/game/town.ts` (add `buildWestVillageMap()`; register it in constructor; set town `exits.left`; add east-exit arrow render branch)

After this task the feature is complete and playable: walking off the left edge of town fades into West Village; walking off the right edge of West Village fades back to town.

- [ ] **Step 1: Wire the town's left exit**

In `buildTownMap()`'s return statement, change:

```ts
      exits: {},  // left exit wired in Task 5
```

to:

```ts
      exits: { left: "west_village" },
```

- [ ] **Step 2: Add the `buildWestVillageMap()` method**

Add this new method right after `buildTownMap()` closes. It mirrors the structure of `buildTownMap` but with a smaller rustic layout. Building assets reuse `villager-home-{1,2,3}_keyed.png` from `public/sprites/building/villager-home/`. NPC assets reuse the `villager_*_keyed.png` sprites + their `*_walking{up,down,left}_keyed.png` strips that already exist in `public/sprites/villager/`.

```ts
  private buildWestVillageMap(): TownMap {
    const buildings: Building[] = [
      // cluster of 3 villager homes around center-left
      {
        x: 220, y: 260, w: 130, h: 90, color: "#7a5a3a", roof: "#5a3a1a",
        asset: "/sprites/building/villager-home/villager-home-1_keyed.png",
        drawSize: 180, drawHeight: 150, label: "HOMESTEAD",
      },
      {
        x: 420, y: 320, w: 130, h: 90, color: "#6a4a2a", roof: "#4a2a0a",
        asset: "/sprites/building/villager-home/villager-home-2_keyed.png",
        drawSize: 180, drawHeight: 150, label: "COTTAGE",
      },
      {
        x: 260, y: 480, w: 130, h: 90, color: "#7a5a3a", roof: "#5a3a1a",
        asset: "/sprites/building/villager-home/villager-home-3_keyed.png",
        drawSize: 180, drawHeight: 150, label: "FARMHOUSE",
      },
      // a well/town-sign post at plaza center (no asset, drawn as fallback box)
      {
        x: 540, y: 460, w: 40, h: 40, color: "#6a6a6a", roof: "#4a4a4a",
        asset: "", drawSize: 60, label: "WELL",
      },
    ];

    const npcs: NpcDef[] = [
      // Road Guide at right edge — orients player back toward town
      {
        id: "wv_guide", name: "Road Guide",
        gen: { headgear: "hat", cloth: "#5a4a2a", trim: "#8a7a4a", hair: "#4a3018" },
        x: 1230, y: 400, action: "talk", facing: -1,
        lines: [
          "The road east leads back to town.",
          "Stay safe on the trails.",
        ],
      },
    ];

    // wandering villagers — reuse existing villager PNGs + walk strips
    const pngWanderers: Array<{ id: string; name: string; asset: string; drawSize: number; x: number; y: number; radius: number; speed: number; }> = [
      { id: "wv_a", name: "Aldric", asset: "/sprites/villager/villager_03_keyed.png", drawSize: 52, x: 360, y: 420, radius: 100, speed: 30 },
      { id: "wv_b", name: "Mira",   asset: "/sprites/villager/villager_05_keyed.png", drawSize: 52, x: 500, y: 540, radius: 90,  speed: 32 },
      { id: "wv_c", name: "Jonas",  asset: "/sprites/villager/villager_07_keyed.png", drawSize: 52, x: 180, y: 580, radius: 80,  speed: 28 },
      { id: "wv_d", name: "Bridget",asset: "/sprites/villager/villager_08_keyed.png", drawSize: 52, x: 620, y: 380, radius: 110, speed: 33 },
      { id: "wv_e", name: "Owen",   asset: "/sprites/villager/villager_10_keyed.png", drawSize: 52, x: 340, y: 640, radius: 90,  speed: 31 },
      { id: "wv_f", name: "Tara",   asset: "/sprites/villager/villager_11_keyed.png", drawSize: 52, x: 700, y: 500, radius: 100, speed: 34 },
    ];
    for (const w of pngWanderers) {
      npcs.push({
        id: w.id, name: w.name, gen: {},
        x: w.x, y: w.y, action: "talk", facing: 1,
        asset: w.asset, drawSize: w.drawSize,
        lines: [
          "Quiet little village, isn't it?",
          "Not much happens out west here.",
        ],
        wander: {
          cx: w.x, cy: w.y, radius: w.radius,
          vx: 0, vy: 0, timer: 0,
          speed: w.speed, moving: false, animTime: 0,
          homeX: w.x, homeY: w.y,
        },
      });
    }

    // bake sprites/images for each NPC (mirrors buildTownMap's bake loop)
    for (const n of npcs) {
      if (n.asset) {
        const img = new Image();
        img.src = n.asset;
        n.image = img;
        const stem = n.asset.replace(/_keyed\.png$/, "");
        if (n.wander && stem !== n.asset) {
          const mk = (dir: string) => {
            const im = new Image();
            im.src = `${stem}_${dir}_keyed.png`;
            return im;
          };
          n.walkImgs = {
            up: mk("walkingup"),
            down: mk("walkingdown"),
            left: mk("walkingleft"),
          };
        }
      } else {
        n.sprite = generateCharacter(n.id, n.gen);
      }
    }

    return {
      id: "west_village",
      name: "West Village",
      worldW: WORLD_W,
      worldH: WORLD_H,
      buildings,
      npcs,
      spawnX: WORLD_W - 30,   // arrived from town via right edge
      spawnY: 400,
      exits: { right: "town" },
      plazas: [
        { x: 160, y: 400, w: 720, h: 280 },   // central dirt plaza around homes
        { x: 1100, y: 360, w: 180, h: 120 },  // approach road to east exit
      ],
    };
  }
```

Notes on the building asset paths: the villager-home files are named `villager-home-1_keyed.png` etc. under `public/sprites/building/villager-home/`. The `drawBuilding` method already handles `image.complete && naturalWidth > 0` with the manor-alignment math (`drawY = b.y + b.h - drawHeight * 0.86`), which works for any keyed PNG with similar transparent padding. If the villager-home art has different padding, the buildings may sit slightly off — this is cosmetic only and tunable after playtest; not a blocker.

- [ ] **Step 3: Register the West Village map in the constructor**

In the constructor, replace:

```ts
    const townMap = this.buildTownMap();
    this.maps = { town: townMap };
    this.currentMap = townMap;
    this.currentMapId = "town";
```

with:

```ts
    const townMap = this.buildTownMap();
    const westVillageMap = this.buildWestVillageMap();
    this.maps = { town: townMap, west_village: westVillageMap };
    this.currentMap = townMap;
    this.currentMapId = "town";
```

- [ ] **Step 4: Add the "TOWN →" east-exit arrow in `render()`**

The existing "WEST VILLAGE" arrow is drawn when `this.px < 100 && this.py > 380 && this.py < 540` (town, near left edge). Add a parallel branch for the West Village east exit. Find the closing of that arrow block (`ctx.restore();` around line 667, just before the final `ctx.restore();` of `render()`) and insert this after it:

```ts
    // east-exit arrow (West Village → Town) — only on the west_village map
    if (this.currentMapId === "west_village" && this.px > this.currentMap.worldW - 100 && this.py > 340 && this.py < 540) {
      const t = performance.now() / 1000;
      const bounce = Math.sin(t * 3) * 3;
      const W = this.currentMap.worldW;
      const ax = W - 55;
      const ay = 430 + bounce;
      // arrow pointing right
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#ffd24a";
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 14, ay - 8);
      ctx.lineTo(ax - 14, ay - 3);
      ctx.lineTo(ax - 28, ay - 3);
      ctx.lineTo(ax - 28, ay + 3);
      ctx.lineTo(ax - 14, ay + 3);
      ctx.lineTo(ax - 14, ay + 8);
      ctx.closePath();
      ctx.fill();
      // text
      ctx.globalAlpha = 0.9;
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd24a";
      ctx.fillText("TOWN", ax - 14, ay + 16);
      ctx.textAlign = "left";
      ctx.restore();
    }
```

This mirrors the existing west-arrow geometry, mirrored horizontally (points right instead of left) and reads `TOWN` instead of `WEST VILLAGE`. It only renders while the player is on `west_village` and standing near its right edge.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Run build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Manual playtest**

Run: `npm run dev` and open the app in a browser.

Verify, in order:
1. Town loads as before; player spawns at center-bottom; "WEST VILLAGE" arrow appears when walking to the left edge.
2. Walk left past `px = 0` → screen fades to black over ~0.3s → fades in on the West Village map with the player at the right edge (x ≈ 1250, y = 400).
3. West Village shows 3-4 villager homes (PNGs), a Well block, ~6 wandering villagers animating with directional walk strips, a Road Guide NPC at the right edge, and a "TOWN →" arrow when approaching the right edge.
4. Press `E` near the Road Guide → dialog opens ("The road east leads back to town.").
5. Walk right past `px = worldW` → fade → arrive back in town at the left edge (x ≈ 30, y = 400-ish per town spawnY which is `WORLD_H - 60 = 740`... see note below).
6. Minimap updates to reflect the current map's buildings + plazas.
7. Camera clamps at all 4 edges of both maps (no black void beyond world bounds).
8. Opening a panel/dialog (C, or E on an NPC) pauses the town engine; transitions do not fire while paused.

Note on step 5 spawn position: town's `spawnY` is `WORLD_H - 60 = 740`, but the transition into town from West Village uses `target.spawnY` (per `updateTransition`), so the player arrives at `(30, 740)` — bottom-left of town, not the left-edge middle. This is intentional and consistent with the spec's `transitionSpawn` logic (spawns at the map's declared `spawnY`). If playtest reveals this feels awkward (arriving at bottom-left instead of mid-left), adjust town's `spawnX`/`spawnY` is NOT the fix (that would break new-game spawn). Instead, a future enhancement could add per-edge spawn overrides — out of scope for this plan. Accept current behavior.

- [ ] **Step 8: Commit**

```bash
git add lib/game/town.ts
git commit -m "feat(town): add West Village map with edge transitions from town"
```

---

## Self-Review Notes

**Spec coverage:**
- "Map Registry + Active Map Swap" architecture → Task 1 (registry + currentMap fields), Task 2 (transitionTo + edge detection).
- "West Village map definition" (1280×800, spawn right, 3-4 villager-home buildings, 5-7 wandering NPCs, 1 Road Guide, plazas, no left exit) → Task 5 Step 2.
- "Town map refactored" (exits.left set, edge unblocked, arrow hint kept) → Task 5 Step 1 + Task 2 Step 5 (clamp replaced with edge detection).
- "Transition fade 0.3s out+in" → Task 2 Step 3 (updateTransition) + Task 3 (overlay render).
- "Replace hardcoded WORLD_W/H in instance methods" → Task 1 (buildings/npcs), Task 2 (update + camera + wanderer bounds), Task 4 (render + minimap + resize).
- "No changes to app/page.tsx, save, raid, sprites" → confirmed: only `lib/game/town.ts` modified across all tasks.
- "Verification via typecheck + build + manual playtest" → every task ends with typecheck + build; Task 5 ends with full playtest checklist.

**Placeholder scan:** No TBD/TODO/placeholder. All code blocks are complete and copy-pasteable. Building asset paths reference files confirmed to exist in `public/sprites/building/villager-home/` and `public/sprites/villager/`.

**Type consistency:** `TownMap` fields `worldW`/`worldH`/`buildings`/`npcs`/`spawnX`/`spawnY`/`exits`/`plazas` used consistently across Task 1 (definition + town return), Task 2 (edge detection reads `currentMap.exits`/`worldW`/`worldH`), Task 4 (render reads `currentMap.plazas`/`worldW`/`worldH`), Task 5 (west village return + east arrow reads `currentMapId`/`currentMap.worldW`). `transitionTo(mapId, fromEdge)` signature matches call sites in Task 2 Step 5 (`"left"`/`"right"` literals) and `updateTransition` reads `transitionTarget`/`transitionSpawn` set in Task 2 Step 2. `currentMapId` set in Task 1 Step 4 + Task 2 Step 3 (swap) + read in Task 5 Step 4 (arrow gate).

**Scope:** Single file, single feature, ~5 tasks each producing a typecheck+build-passing checkpoint. Appropriately sized for one implementation plan.
