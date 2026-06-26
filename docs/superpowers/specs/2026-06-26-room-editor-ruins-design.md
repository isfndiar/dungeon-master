# Room Editor + Dungeon "Ruins" — Design Spec (Phase 1)

Date: 2026-06-26
Status: Approved (pending implementation plan)

## Context

This is **Phase 1 of 6** for an "editable custom dungeon" feature. The full vision is a sea-themed "Atlantis" dungeon with hand-designed room layouts, new sea monsters (mermaids, fish), and an Octopus boss. That full scope is enormous (the boss alone needs 9 new spells coded into the engine). It is therefore split into independent phases, each shippable and testable on its own:

```
Phase 1: Room editor + collision/hazard  → dungeon uses EXISTING monsters   ← THIS SPEC
Phase 2: Atlantis dungeon + sea theme (reskin visuals)
Phase 3: New monsters (mermaid + fish): sprites + behavior
Phase 4: Boss Octopus part 1 (def + 3 phase-1 spells)
Phase 5: Boss Octopus part 2 (3 phase-2 spells)
Phase 6: Boss Octopus part 3 (3 phase-3 spells)
```

Phase 1 delivers the core mechanic the user originally asked for: a tool to hand-design dungeon rooms (obstacles + hazards) that the random generator then uses, with the engine auto-spawning monsters as it does today.

## Goal

Add a room-template system and a standalone room editor. Introduce a new dungeon `ruins` (6th dungeon) whose rooms pull from a pool of hand-designed templates. Each template places solid obstacles and static damage hazards inside the room. Monster spawning stays automatic (existing system). The five existing dungeons are untouched.

## Non-goals (Phase 1)

- No new monsters or bosses (reuse crypt's skeleton+ghost+lich).
- No sea/Atlantis theme yet (ruins uses crypt-like colors as placeholder).
- No monster pathfinding (monsters slide along obstacles, same as town NPCs).
- No changes to the five existing dungeons, endless mode, save data, hero/skill/loot systems.
- No fully hand-authored dungeon graph — the graph stays procedural (`generateMap`); only room *interiors* are hand-designed.

## User decisions (from brainstorm)

| Question | Choice |
|---|---|
| What is editable | Room interiors: obstacles + hazards + door positions. Monster spawn stays auto. |
| Combat engine | Reuse existing `Engine` (hero, skills, monsters, projectiles, loot). |
| Generator usage | Pool of templates, random pick per room + procedural graph connect. |
| Monster vs obstacle | Slide along walls (axis-separated), no pathfinding. |
| Build approach | Visual + collision + hazard all in Phase 1 (full functional editor). |
| Test dungeon | New dungeon `ruins` (reuses crypt monsters), existing dungeons untouched. |
| Access | Gate Guard dungeon select (appears as 6th dungeon automatically). |

## Architecture

### Coordinate space

Room interior uses the engine's `FIELD` rectangle (the play area inside the outer walls): `x: 16..464`, `y: 16..254` (i.e. `FIELD = { x: WALL, y: WALL, w: VIEW_W - 2*WALL, h: VIEW_H - 2*WALL }` where `WALL=16`, `VIEW_W=480`, `VIEW_H=270`). All template rects use these absolute view coordinates. The editor uses an 8px snap grid.

### New files

```
lib/game/rooms/
  types.ts        RoomRect, RoomTemplate
  templates.ts    hand-designed RoomTemplate[] (3-4 starter templates)
  index.ts        ROOM_TEMPLATES + pickTemplate(rng, openDoors)
room-editor.html  standalone editor (mirrors layout-preview.html pattern)
```

### Types

```ts
// rooms/types.ts
export interface RoomRect { x: number; y: number; w: number; h: number }

export interface RoomTemplate {
  id: string;
  obstacles: RoomRect[];   // solid: block player + monsters + projectiles
  hazards: RoomRect[];     // static: damage the player while standing in them
  needDoors?: ("n" | "e" | "s" | "w")[]; // doors that MUST stay clear (no obstacle covering the corridor)
}
```

### Registry + pick

```ts
// rooms/index.ts
export const ROOM_TEMPLATES: RoomTemplate[];

// Pick a template whose obstacles don't block any of the room's open doors.
// Returns null if none fit (caller leaves the room empty).
export function pickTemplate(rng: () => number, openDoors: Dir[]): RoomTemplate | null;
```

Door clearance: for each open door, a corridor strip runs from the door inward to the room center. A template is rejected if any obstacle overlaps any open door's corridor strip. (Hazards are allowed to overlap — they don't block movement, only damage.)

### Modified files (additive, existing behavior preserved)

**`lib/game/map.ts`** — `RoomNode` gains two optional fields:
```ts
obstacles?: RoomRect[];
hazards?: RoomRect[];
```
`generateMap` does not populate them (kept generic). They're filled by the engine at `enterRoom` time for template dungeons. Existing dungeons never set them, so `undefined` = no interior (today's behavior).

**`lib/game/dungeons.ts`** — add `useTemplates?: boolean` to `DungeonDef`, and a new dungeon:
```ts
ruins: {
  id: "ruins", name: "Sunken Ruins", desc: "Crumbling halls of the deep.",
  monsters: ["skeleton", "ghost"], boss: "lich",
  rooms: 6, baseSpawns: 5, spawnGrowth: 2, difficulty: 1.4,
  floor: "#2a3340", wall: "#1a2230", accent: "#5ad7d7",
  order: 6, useTemplates: true,
}
```
`DungeonId` type gains `"ruins"`; `DUNGEON_IDS` gains `"ruins"`. This makes it appear in the Gate Guard select and `/raid?dungeon=ruins` automatically (the raid page validates against `DUNGEON_IDS`).

**`lib/game/engine.ts`** — five additive changes:
1. `enterRoom`: if `this.dungeon.useTemplates` and the room is **not** start and **not** boss and not yet assigned, call `pickTemplate(Math.random-rng, openDoors(room))` and store result onto `room.obstacles`/`room.hazards`. Start + boss rooms stay empty (safe arena).
2. Render: in `drawRoom`, after floor and before entities, draw `curRoom.obstacles` (filled blocks, wall color + darker edge) and `curRoom.hazards` (pulsing accent-red translucent fill with a telegraph border).
3. Spawn avoid: `edgePos()` / `spawnMonster` retry the position if it lands inside an obstacle.
4. Collision (axis-separated, mirrors town `blocked()`):
   - Player movement: test new x then new y against obstacle rects; block the axis that collides.
   - Monster movement: same axis-separated slide against obstacles.
   - Projectiles (both player and enemy): if a projectile's position enters an obstacle, remove it (treat as wall hit).
5. Hazard damage: each frame, if the player's position is inside any `curRoom.hazards` rect, apply damage per second (reuse the existing pool-damage tick pattern — a `dmgPerSec` accumulator, same as `this.pools`).

### Editor (`room-editor.html`)

Standalone HTML (same self-contained pattern as `layout-preview.html`), opened directly in a browser. Not part of the Next.js build.

- Canvas showing one room at `480×270`, scaled 2× (960×540 display).
- Draws the four outer walls and four door openings (N/E/S/W), each door toggle-able on/off (to preview clearance against different door configs).
- Tools: **+ Obstacle**, **+ Hazard**, Select (drag to move, corner handle to resize), Delete, Duplicate, snap-to-grid (8px) toggle.
- Property panel: edit x/y/w/h numerically for the selected rect.
- **Door clearance check**: for each enabled door, draw the corridor strip; if an obstacle overlaps it, highlight that door red and warn. Hazards don't trigger the warning.
- **Export**: produce a `RoomTemplate` literal (`{ id, obstacles, hazards, needDoors }`) in a textarea + a "Download JSON" button (writes `room_<id>.json`), ready to paste into `templates.ts`.
- Auto-save current design to `localStorage`.

## Files changed summary

| File | Change |
|---|---|
| `lib/game/rooms/types.ts` | NEW — RoomRect, RoomTemplate |
| `lib/game/rooms/templates.ts` | NEW — starter templates |
| `lib/game/rooms/index.ts` | NEW — ROOM_TEMPLATES, pickTemplate |
| `lib/game/map.ts` | RoomNode optional obstacles/hazards |
| `lib/game/dungeons.ts` | add `useTemplates`, `ruins` dungeon, `"ruins"` id |
| `lib/game/engine.ts` | enterRoom template assign, render, spawn-avoid, collision, hazard dmg |
| `room-editor.html` | NEW — standalone editor |

`app/page.tsx` / `app/raid/page.tsx` need no logic changes — they read `DUNGEON_IDS`/`DUNGEONS` which now include `ruins`. (Verify the dungeon-select UI renders from `DUNGEON_IDS` and doesn't hardcode the five names.)

## Edge cases & risks

1. **Small field**: play area is ~448×238. Big obstacles easily wall off the room. Editor's door-clearance warning + grid mitigate. `pickTemplate` rejects templates that block open doors at runtime.
2. **Door config varies per room**: a room can have 1-4 open doors in any combination. A template authored for "needs N+S clear" may be rejected in a room that opens E+W through where its obstacles sit. `pickTemplate` filters by actual open doors; if no template fits, room is left empty (graceful fallback).
3. **Monster stuck on obstacle corners**: slide collision can pin a monster against a concave corner. Acceptable (same as town NPCs); monsters still reachable by player.
4. **Projectile-through-wall feel**: enemy ranged attacks (ghost bolts) vanish on obstacles — this is intended (obstacles are cover).
5. **Boss/start rooms**: deliberately skip templates so the boss arena and entry spawn stay clean and safe.
6. **Spawn inside obstacle**: retry loop in `edgePos`/`spawnMonster`; if it can't find a clear spot after N tries, fall back to current behavior (spawn anyway) to avoid infinite loop.
7. **Endless mode**: `useTemplates` is false for endless; arena stays open.

## Testing approach

No automated test framework (project has only `dev`/`build`/`typecheck`). Verification:

1. `npm run typecheck` — passes.
2. `npm run build` — succeeds.
3. Manual playtest (`npm run dev`):
   - Gate Guard select shows "Sunken Ruins"; launch it.
   - Rooms (non-start, non-boss) show obstacles + hazards.
   - Player cannot walk through obstacles (slides along them).
   - Monsters cannot walk through obstacles (slide).
   - Player + enemy projectiles vanish on obstacles.
   - Standing in a hazard drains HP over time.
   - Doors are always passable (no template blocks a used door).
   - Start room + boss room are empty/safe.
   - Existing dungeons (forest etc.) unchanged — no obstacles, identical to before.
   - `room-editor.html` opens, lets you place/drag/resize obstacles + hazards, warns on door blockage, exports a template literal.
