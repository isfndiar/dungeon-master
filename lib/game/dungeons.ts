import { MonsterKind, BossKind } from "./monsters";

export type DungeonId = "forest" | "cave" | "crypt" | "volcano" | "endless" | "ruins" | "atlantis";

export interface DungeonDef {
  id: DungeonId;
  name: string;
  desc: string;
  monsters: MonsterKind[]; // pool that spawns
  boss: BossKind;
  bosses?: BossKind[];    // for endless: random boss pool
  rooms: number; // non-boss rooms before boss room
  endless?: boolean;      // wave-based arena, no map
  baseSpawns: number; // monsters in first room
  spawnGrowth: number; // extra per room
  difficulty: number; // hp/dmg multiplier
  floor: string; // ground color
  wall: string; // wall color
  accent: string; // theme accent
  order: number;
  useTemplates?: boolean; // rooms pull hand-designed obstacle/hazard templates
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
  endless: {
    id: "endless",
    name: "Raid Endless",
    desc: "Survive endless waves. Boss every 10 waves.",
    monsters: ["slime", "wolf", "bat", "spider", "skeleton", "ghost", "imp", "golem"],
    boss: "giant_slime",
    bosses: ["giant_slime", "spider_queen", "lich", "lava_golem"],
    rooms: 0,
    endless: true,
    baseSpawns: 3,
    spawnGrowth: 1,
    difficulty: 1.0,
    floor: "#1a1820",
    wall: "#0f0e14",
    accent: "#c0c8d8",
    order: 5,
  },
  ruins: {
    id: "ruins",
    name: "Sunken Ruins",
    desc: "Crumbling halls strewn with rubble and rot.",
    monsters: ["skeleton", "ghost"],
    boss: "lich",
    rooms: 6,
    baseSpawns: 5,
    spawnGrowth: 2,
    difficulty: 1.4,
    floor: "#2a3340",
    wall: "#1a2230",
    accent: "#5ad7d7",
    order: 6,
    useTemplates: true,
  },
  atlantis: {
    id: "atlantis",
    name: "Sunken Atlantis",
    desc: "Ancient halls drowned in the deep. Merrows and anglerfish lurk in the dark.",
    monsters: ["mermaid", "anglerfish"],
    boss: "lich", // kraken — reuses lich behavior
    rooms: 8,
    baseSpawns: 6,
    spawnGrowth: 3,
    difficulty: 2.0,
    floor: "#0a2a3a",
    wall: "#061e2e",
    accent: "#2ad4d4",
    order: 7,
    useTemplates: true,
  },
};

export const DUNGEON_IDS: DungeonId[] = ["forest", "cave", "crypt", "volcano", "endless", "ruins", "atlantis"];

// ---------- difficulty modes ----------
export type GameMode = "default" | "normal" | "hard" | "extreme" | "hell";

export interface ModeDef {
  label: string;
  mult: number;        // difficulty multiplier (compounds with dungeon.difficulty)
  rewardMult: number;  // gold + xp multiplier
  luck: number;        // loot rarity luck shift (passed to rollRarity)
  color: string;       // theme color
  desc: string;
}

export const MODE_DEF: Record<GameMode, ModeDef> = {
  default: { label: "Default", mult: 0.5, rewardMult: 0.7, luck: -2, color: "#5fd35f", desc: "Easy. For learning boss patterns." },
  normal:  { label: "Normal",  mult: 1.0, rewardMult: 1.0, luck: 0,  color: "#9a8fb0", desc: "Standard baseline challenge." },
  hard:    { label: "Hard",    mult: 2.0, rewardMult: 1.5, luck: 2,  color: "#ff8a2a", desc: "Double enemy stats. Better loot." },
  extreme: { label: "Extreme", mult: 3.0, rewardMult: 2.0, luck: 4,  color: "#ff3a3a", desc: "Triple stats. Epic+ loot common." },
  hell:    { label: "Hell",    mult: 5.0, rewardMult: 3.0, luck: 6,  color: "#8a0a0a", desc: "Brutal. Legendaries rain. You will die." },
};

export const MODE_LIST: GameMode[] = ["default", "normal", "hard", "extreme", "hell"];

export function modeDifficulty(dungeon: DungeonDef, mode: GameMode): number {
  return dungeon.difficulty * MODE_DEF[mode].mult;
}

export function isValidMode(m: string | null | undefined): m is GameMode {
  return !!m && (MODE_LIST as string[]).includes(m);
}
