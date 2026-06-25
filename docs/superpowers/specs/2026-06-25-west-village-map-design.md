# West Village Map — Design Spec

Date: 2026-06-25
Status: Approved (pending implementation plan)

## Goal

Add a second explorable map ("West Village") accessible by walking off the left edge of the existing town. Establishes a multi-map system so additional maps can be added later without engine rewrites.

## Non-goals

- No new gameplay features in West Village (no new dungeons, merchants, quest givers). Decorative + wandering NPCs only.
- No persistence of which map the player is on across sessions. Player always resumes in the main town on reload (matches current behavior — `app/page.tsx` mounts `TownEngine` with default spawn).
- No changes to raid flow, save data, sprite loading, or React UI layer.

## User decisions (from brainstorm)

| Question | Choice |
|---|---|
| Transition mechanism | Walk off left edge (auto-fade, no NPC trigger needed) |
| Content richness | Decorative + wandering NPCs only |
| Visual theme | Rustic village (reuse existing villager-home assets) |
| Size + exits | 1280×800, 2 exits (right back to town, left blocked for future map 3) |

## Architecture

### Current state

`TownEngine` in `lib/game/town.ts` (1000 lines) owns a single hardcoded world:
- Module constants `WORLD_W = 1280`, `WORLD_H = 800`
- `buildLayout()` populates `this.buildings` + `this.npcs` once
- `update()`/`render()`/`drawMinimap()`/`resize()` reference `WORLD_W`/`WORLD_H` directly
- `clamp(this.px, 14, WORLD_W - 14)` blocks player at world edges — no exit possible today
- "WEST VILLAGE" arrow hint at `px < 100` is decorative only

### Target state: Map Registry + Active Map Swap

```ts
interface TownMap {
  id: string;
  name: string;
  worldW: number;
  worldH: number;
  buildings: Building[];
  npcs: NpcDef[];
  spawnX: number;
  spawnY: number;
  exits: { left?: string; right?: string };  // mapId of neighbor
  terrain: { grassTile?: string; roadTile?: string; plazaColor: string };
  // baked at build time:
  bakedBuildings: Building[];  // images preloaded
  bakedNpcs: NpcDef[];         // sprites/images preloaded
}
```

`TownEngine` changes:
- Replace single `buildings`/`npcs` fields with `maps: Record<string, TownMap>` + `currentMap: TownMap` + `currentMapId: string`.
- Split `buildLayout()` into `buildTownMap()` + `buildWestVillageMap()`, each returning a `TownMap` with preloaded building images + NPC sprites/walk strips (existing preload logic moves into each builder).
- Replace every `WORLD_W`/`WORLD_H` reference inside instance methods with `this.currentMap.worldW`/`this.currentMap.worldH` (or a local `const W = this.currentMap.worldW, H = this.currentMap.worldH`).
- Module constants `WORLD_W`/`WORLD_H` become defaults used only by `buildTownMap()`. Engine no longer reads them at runtime.
- `clamp(this.px, 14, W - 14)` becomes edge-aware:
  - If `exits.left` defined and `px <= 0` → `transitionTo(exits.left, "from-right")`
  - If `exits.right` defined and `px >= W` → `transitionTo(exits.right, "from-left")`
  - Otherwise clamp to `[14, W - 14]` as before.
- Y bounds stay clamped to `[40, H - 14]` (no vertical exits).

### Transition

```ts
private transitionState: "none" | "fade-out" | "fade-in" = "none";
private transitionTimer = 0;       // seconds elapsed in current phase
private transitionTarget?: string; // mapId to load on fade-out complete
private transitionSpawn?: { x: number; y: number };

transitionTo(mapId: string, fromEdge: "left" | "right") {
  if (this.transitionState !== "none") return;
  this.transitionTarget = mapId;
  this.transitionState = "fade-out";
  this.transitionTimer = 0;
  // spawn on opposite edge of new map
  const target = this.maps[mapId];
  this.transitionSpawn = fromEdge === "left"
    ? { x: target.worldW - 30, y: target.spawnY }  // entered from left edge → spawn right
    : { x: 30, y: target.spawnY };                  // entered from right edge → spawn left
}
```

- `update()` skips player movement while `transitionState !== "none"`.
- Fade-out 0.3s → swap map + set px/py to `transitionSpawn` → fade-in 0.3s → `none`.
- Render overlay: black rect alpha = `transitionTimer / 0.3` (out) or `1 - transitionTimer / 0.3` (in) covering viewport.

### West Village map definition

- `id: "west_village"`, `name: "West Village"`
- `worldW: 1280, worldH: 800` (same as town)
- `spawnX: 1250, spawnY: 400` (right side, where player arrives from town)
- `exits: { right: "town" }` (no `left` — blocked for future map 3)
- `terrain`: same `grass-tile.png` + `gray-brick-road-tile.png`, plaza color `#8a7a5a` (slightly warmer/rustic than town's `#9a8f7a`)
- Buildings (3-4): `villager-home-1_keyed.png`, `villager-home-2_keyed.png`, `villager-home-3_keyed.png` placed in a loose cluster around center-left. `drawSize` ~120 (smaller than town manors). Collision rectangles matching footprint.
- Wandering NPCs (5-7): reuse `villager_{01..11}_keyed.png` + their `*_walking{up,down,left}_keyed.png` strips. Wander radii 70-100. Names: simple rustic (e.g. "Aldric", "Mira", "Jonas", "Bridget", "Owen", "Tara").
- Static NPCs (1): a "Road Guide" at right edge (x ~1230, y ~400) facing left, `action: "talk"`, lines: "The road east leads back to town." / "Stay safe on the trails." — gives player orientation on arrival.
- Exit markers: floating "TOWN →" arrow near right edge (mirror of existing "WEST VILLAGE" arrow logic) when player approaches right edge.

### Town map (existing, refactored) changes

- Add `exits: { left: "west_village" }`.
- Keep "WEST VILLAGE" arrow hint at `px < 100` (already exists at `town.ts:640`).
- Remove `clamp` lower bound blocking left edge — now player can walk to `px <= 0`.
- Road Guide NPC at left (`id: "west_guide"`, already exists at `town.ts:313`) stays for flavor.

### React layer (`app/page.tsx`)

No changes. `TownEngine` constructor signature unchanged. Player resumes in main town on page reload (no map persistence). This is acceptable per non-goals.

## Files changed

| File | Change |
|---|---|
| `lib/game/town.ts` | Major refactor: introduce `TownMap` interface, `maps` registry, split `buildLayout`, edge-transition logic, fade render. Replace hardcoded `WORLD_W/H` in instance methods with `currentMap.worldW/H`. Add `buildWestVillageMap()`. |

No other files touched.

## Edge cases & risks

1. **Wanderer NPCs across map swap**: wander state lives on `NpcDef` instances. When swapping maps we swap the entire `npcs` array, so wanderers on the previous map pause/freeze and resume when player returns (their `wander.timer` will count down on first frame back — minor, acceptable).
2. **Preload timing**: building images + NPC images load async. Existing pattern uses `image.complete && image.naturalWidth > 0` guards before draw. Same pattern works for new map — first few frames may show fallback colors, then images pop in. Acceptable, matches current behavior.
3. **Camera bounds on smaller maps**: not relevant — both maps are 1280×800. If future maps differ in size, camera clamp uses `currentMap.worldW/H` so it adapts automatically.
4. **Transition during dialog**: if player opens a dialog (panel) while walking off edge, `setPaused(true)` already halts `update()`. Transition won't fire mid-dialog. Good.
5. **Re-entry direction**: player exits town left → spawns at right of west village. Player exits west village right → spawns at left of town (x=30). Symmetric. Matches `transitionSpawn` logic.
6. **Minimap**: `drawMinimap()` uses `currentMap.worldW/H` for scaling, draws `currentMap.buildings` + non-wanderer NPCs of `currentMap.npcs`. Works per-map.
7. **Performance**: two maps' worth of `HTMLImageElement` objects loaded up front. ~12 buildings + ~30 NPCs total. Negligible memory. No per-frame cost difference (we only iterate current map's arrays).

## Testing approach

No automated test framework in this project (per `package.json`: only `dev`, `build`, `start`, `typecheck` scripts). Verification:

1. `npm run typecheck` — must pass with no errors.
2. `npm run build` — must succeed (Next.js production build).
3. Manual playtest in `npm run dev`:
   - Walk left in town → fade → arrive in West Village at right edge.
   - Walk right in West Village → fade → arrive in town at left edge.
   - Verify wandering NPCs animate, buildings render, minimap shows current map.
   - Verify "TOWN →" / "WEST VILLAGE" arrows appear near respective edges.
   - Verify dialogs/panels still open via E key on Road Guide NPCs.
   - Verify camera clamps at all 4 edges of both maps.
