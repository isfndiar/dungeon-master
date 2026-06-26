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
