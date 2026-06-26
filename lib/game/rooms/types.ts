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
  // Authoring metadata only: records which doors this template was designed
  // around (set by the room editor). The picker checks clearance against the
  // ROOM's actual open doors, not this field.
  needDoors?: Dir[];
}
