// Random grid-based dungeon map generator.
// Rooms live on a grid; connected rooms share a door (N/E/S/W).
// Start room = entry, boss room = the cell farthest from start.

export type Dir = "n" | "e" | "s" | "w";
export const DIRS: Dir[] = ["n", "e", "s", "w"];

export const OPPOSITE: Record<Dir, Dir> = { n: "s", s: "n", e: "w", w: "e" };
export const DELTA: Record<Dir, { dx: number; dy: number }> = {
  n: { dx: 0, dy: -1 },
  s: { dx: 0, dy: 1 },
  e: { dx: 1, dy: 0 },
  w: { dx: -1, dy: 0 },
};

export interface RoomNode {
  id: number;
  gx: number; gy: number;          // grid coords
  doors: Record<Dir, boolean>;     // which sides have a passage
  neighbors: Partial<Record<Dir, number>>; // dir -> room id
  depth: number;                   // distance (in rooms) from start
  isStart: boolean;
  isBoss: boolean;
  cleared: boolean;                // monsters defeated here
  visited: boolean;                // player has entered
}

export interface DungeonMap {
  rooms: RoomNode[];
  startId: number;
  bossId: number;
  gridW: number;
  gridH: number;
  maxDepth: number;
}

function key(x: number, y: number) {
  return x + "," + y;
}

/**
 * Generate a connected map with `totalRooms` rooms (including start + boss).
 * Uses randomized growth: keep attaching new rooms to random existing cells.
 */
export function generateMap(totalRooms: number, seed?: number): DungeonMap {
  const rng = makeRng(seed ?? (Math.random() * 1e9) | 0);
  const target = Math.max(2, totalRooms);

  const cells = new Map<string, RoomNode>();
  let nextId = 0;

  const makeRoom = (gx: number, gy: number): RoomNode => {
    const r: RoomNode = {
      id: nextId++,
      gx, gy,
      doors: { n: false, e: false, s: false, w: false },
      neighbors: {},
      depth: 0,
      isStart: false,
      isBoss: false,
      cleared: false,
      visited: false,
    };
    cells.set(key(gx, gy), r);
    return r;
  };

  // start at origin
  const start = makeRoom(0, 0);
  start.isStart = true;
  start.cleared = true; // start room is safe (no monsters)
  start.visited = true;

  // grow until we hit target room count
  let guard = 0;
  while (cells.size < target && guard < target * 200) {
    guard++;
    // pick a random existing room to extend from
    const arr = [...cells.values()];
    const from = arr[(rng() * arr.length) | 0];
    // pick a random direction
    const dir = DIRS[(rng() * 4) | 0];
    const { dx, dy } = DELTA[dir];
    const nx = from.gx + dx, ny = from.gy + dy;
    const nk = key(nx, ny);
    let to = cells.get(nk);
    if (!to) {
      to = makeRoom(nx, ny);
    } else {
      // already exists: sometimes link them (creates loops), sometimes skip
      if (rng() > 0.25) continue;
    }
    // open the door both ways
    from.doors[dir] = true;
    from.neighbors[dir] = to.id;
    to.doors[OPPOSITE[dir]] = true;
    to.neighbors[OPPOSITE[dir]] = from.id;
  }

  const rooms = [...cells.values()].sort((a, b) => a.id - b.id);
  const byId = new Map(rooms.map((r) => [r.id, r]));

  // BFS from start to compute depth + find farthest = boss
  for (const r of rooms) r.depth = -1;
  start.depth = 0;
  const queue: RoomNode[] = [start];
  let farthest = start;
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.depth > farthest.depth) farthest = cur;
    for (const d of DIRS) {
      if (!cur.doors[d]) continue;
      const nb = byId.get(cur.neighbors[d]!)!;
      if (nb.depth === -1) {
        nb.depth = cur.depth + 1;
        queue.push(nb);
      }
    }
  }

  farthest.isBoss = true;

  const maxDepth = rooms.reduce((m, r) => Math.max(m, r.depth), 0);
  const gx = rooms.map((r) => r.gx);
  const gy = rooms.map((r) => r.gy);

  return {
    rooms,
    startId: start.id,
    bossId: farthest.id,
    gridW: Math.max(...gx) - Math.min(...gx) + 1,
    gridH: Math.max(...gy) - Math.min(...gy) + 1,
    maxDepth,
  };
}

// small deterministic RNG (mulberry32)
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
