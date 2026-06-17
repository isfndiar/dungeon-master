import { MonsterKind, BossKind } from "./monsters";

export type DungeonId = "forest" | "cave" | "crypt" | "volcano";

export interface DungeonDef {
  id: DungeonId;
  name: string;
  desc: string;
  monsters: MonsterKind[]; // pool that spawns
  boss: BossKind;
  rooms: number; // non-boss rooms before boss room
  baseSpawns: number; // monsters in first room
  spawnGrowth: number; // extra per room
  difficulty: number; // hp/dmg multiplier
  floor: string; // ground color
  wall: string; // wall color
  accent: string; // theme accent
  order: number;
}

export const DUNGEONS: Record<DungeonId, DungeonDef> = {
  forest: {
    id: "forest",
    name: "Whispering Forest",
    desc: "Slimes and wolves prowl the mossy glades.",
    monsters: ["slime", "wolf"],
    boss: "giant_slime",
    rooms: 5,
    baseSpawns: 4,
    spawnGrowth: 2,
    difficulty: 1.0,
    floor: "#2f4a32",
    wall: "#1c2e1f",
    accent: "#5fd35f",
    order: 1,
  },
  cave: {
    id: "cave",
    name: "Gloomdeep Cave",
    desc: "Bats and spiders cling to the dripping dark.",
    monsters: ["bat", "spider"],
    boss: "spider_queen",
    rooms: 6,
    baseSpawns: 5,
    spawnGrowth: 2,
    difficulty: 1.25,
    floor: "#3a3340",
    wall: "#221d28",
    accent: "#9a6ab0",
    order: 2,
  },
  crypt: {
    id: "crypt",
    name: "Forsaken Crypt",
    desc: "The restless dead rise: skeletons and ghosts.",
    monsters: ["skeleton", "ghost"],
    boss: "lich",
    rooms: 7,
    baseSpawns: 5,
    spawnGrowth: 2,
    difficulty: 1.5,
    floor: "#3a3a44",
    wall: "#22222a",
    accent: "#7ad7ff",
    order: 3,
  },
  volcano: {
    id: "volcano",
    name: "Ember Volcano",
    desc: "Imps and golems forged in molten rock.",
    monsters: ["imp", "golem"],
    boss: "lava_golem",
    rooms: 8,
    baseSpawns: 6,
    spawnGrowth: 3,
    difficulty: 1.9,
    floor: "#4a2a22",
    wall: "#2a1610",
    accent: "#ff6a1a",
    order: 4,
  },
};

export const DUNGEON_IDS: DungeonId[] = ["forest", "cave", "crypt", "volcano"];
