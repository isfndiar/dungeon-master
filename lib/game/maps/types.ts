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
  type: "brick" | "water";
  x: number;
  y: number;
  w: number;
  h: number;
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
  exits: { left?: string; right?: string };
  plazas: Plaza[];
  terrainRects?: TerrainRect[]; // optional painted terrain (brick/water)
}

export interface TownCallbacks {
  onNearby: (npc: NpcDef | null) => void;
  onInteract: (npc: NpcDef) => void;
}
