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
