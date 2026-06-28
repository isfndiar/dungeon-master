import type { GenOptions } from "../pixelgen";
import type { SpriteDef } from "../sprites";

// Viewport = the logical area the camera shows on screen (kept small so the
// pixel art stays chunky). The world is much larger and the camera follows the
// player across it.
export const TOWN_W = 480;   // viewport width  (kept name for page.tsx canvas sizing)
export const TOWN_H = 270;   // viewport height
export const WORLD_W = 1280; // full explorable world
export const WORLD_H = 800;

// Which interaction an NPC triggers (handled by the React layer).
export type TownAction = "dungeon" | "equipment" | "heroes" | "talk" | "shop" | "endless" | "village2";

export interface NpcDef {
  id: string;
  name: string;
  gen: GenOptions;      // procedural-character bias for this NPC
  x: number; y: number; // world position (sprite center)
  action: TownAction;
  lines: string[];      // dialog lines
  facing?: 1 | -1;
  sprite?: SpriteDef;   // baked procedural sprite (filled at build)
  asset?: string;       // optional static PNG sprite (overrides procedural)
  drawSize?: number;    // on-screen size for the static PNG (default 28)
  image?: HTMLImageElement; // preloaded static sprite (filled at build)
  // directional walk sprite STRIPS (derived from `asset` name when present).
  // Each is a horizontal strip of WALK_FRAMES frames. right = mirror of left.
  walkImgs?: {
    up?: HTMLImageElement;
    down?: HTMLImageElement;
    left?: HTMLImageElement;
  };
  // wandering behavior (optional)
  wander?: {
    cx: number; cy: number; // home center
    radius: number;         // wander range
    vx: number; vy: number; // current velocity
    timer: number;          // time until next direction pick
    speed: number;          // walk speed
    moving: boolean;        // currently walking
    animTime: number;       // walk anim clock
    homeX: number; homeY: number; // rest position
  };
}

export interface Building {
  x: number; y: number; w: number; h: number;
  color: string; roof: string;
  asset: string;
  drawSize: number;
  drawHeight?: number;
  image?: HTMLImageElement;
  label?: string;
  banner?: string;
  portal?: boolean;
}

export interface Plaza {
  x: number;
  y: number;
  w: number;
  h: number;
}

// A painted terrain rectangle (grid-aligned). "brick" overlays a road texture,
// "water" overlays the water tile and blocks the player (collision).
export interface TerrainRect {
  type: "brick" | "water" | "dirt" | "grass_tufts" | "grass_flowers" | "grass_rocks" | "dark_grass" | "lava" | "volcanic_cracked";
  x: number;
  y: number;
  w: number;
  h: number;
}

// Decorative prop (tree, lake image, etc.) — rendered depth-sorted by Y, no collision by default
export interface TerrainProp {
  asset: string;        // path to PNG
  x: number;
  y: number;
  w: number;            // display width
  h: number;            // display height
  collision?: boolean;  // blocks player movement (default true for trees)
  image?: HTMLImageElement; // preloaded (filled at build)
}

// Overworld enemy — visible on map, patrols, chases player, triggers encounter
export interface OverworldEnemy {
  id: string;
  monsterKind: string;     // reuse MonsterKind from monsters.ts
  x: number; y: number;   // current position
  patrol: { cx: number; cy: number; radius: number; speed: number };
  aggroRange: number;      // px — starts chasing player
  touchRange: number;      // px — triggers encounter
  defeated: boolean;       // disappears after beaten
  respawnTimer: number;    // seconds until respawn (0 = no respawn)
  respawnCooldown: number; // current countdown (0 = active)
  // runtime state
  vx: number; vy: number;
  aggro: boolean;
  animTime: number;
}

export interface TownMap {
  id: string;
  name: string;
  worldW: number;
  worldH: number;
  buildings: Building[];
  npcs: NpcDef[];
  spawnX: number;
  spawnY: number;
  exits: { left?: string; right?: string; up?: string; down?: string };
  plazas: Plaza[];
  terrainRects?: TerrainRect[];
  props?: TerrainProp[];
  baseTile?: string;  // path to ground tile (default: grass-tile.png)
  enemies?: OverworldEnemy[]; // visible roaming enemies
}

export interface TownCallbacks {
  onNearby: (npc: NpcDef | null) => void;
  onInteract: (npc: NpcDef) => void;
  onEncounter?: (enemy: OverworldEnemy) => void; // triggered when player touches an overworld enemy
}
