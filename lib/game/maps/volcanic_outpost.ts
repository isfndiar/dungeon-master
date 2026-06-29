import { generateCharacter } from "../pixelgen";
import type { Building, NpcDef, TownMap, TerrainRect, TerrainProp, OverworldEnemy } from "./types";

/**
 * Volcanic Wasteland — south of main town.
 * 
 * A hellish volcanic landscape. No vegetation, no buildings.
 * Black rock ground, lava rivers, cracked earth glowing orange.
 * Dangerous enemies roam the paths.
 * 
 * Layout (1280 x 800):
 * ┌────────────────────────────────────────────────────────────────┐
 * │         ↑ exit north (to town)                                │
 * │     [cracked]  [dirt trail]  [cracked]                        │
 * │                                                                │
 * │  [LAVA LAKE]    [dirt trail]    [cracked]    [LAVA POOL]      │
 * │  [~~~~~~~~~]                                 [~~~~~~~~~]      │
 * │                                                                │
 * │     [cracked]  [dirt trail]  [LAVA RIVER ~~~~~~~~~~~~~~~~]    │
 * │                                                                │
 * │  [LAVA POOL]   [cracked]   [dirt]  [cracked]  [LAVA POOL]    │
 * │                                                                │
 * │  [═══════════ LAVA SEA (impassable) ═══════════════════════]  │
 * └────────────────────────────────────────────────────────────────┘
 */

const WORLD_W = 1280;
const WORLD_H = 800;

export function buildVolcanicOutpostMap(): TownMap {
  // No buildings in this hellscape
  const buildings: Building[] = [];

  // Terrain — pure volcanic/hell
  const terrainRects: TerrainRect[] = [
    // === Cracked volcanic rock (transition zones near lava — glowing cracks) ===
    { type: "volcanic_cracked", x: 60,   y: 60,  w: 200, h: 120 },
    { type: "volcanic_cracked", x: 400,  y: 40,  w: 160, h: 100 },
    { type: "volcanic_cracked", x: 900,  y: 50,  w: 220, h: 110 },
    { type: "volcanic_cracked", x: 100,  y: 320, w: 160, h: 100 },
    { type: "volcanic_cracked", x: 700,  y: 280, w: 180, h: 100 },
    { type: "volcanic_cracked", x: 1000, y: 320, w: 160, h: 90  },
    { type: "volcanic_cracked", x: 300,  y: 480, w: 140, h: 80  },
    { type: "volcanic_cracked", x: 800,  y: 480, w: 200, h: 100 },
    { type: "volcanic_cracked", x: 60,   y: 520, w: 160, h: 80  },

    // === Dirt trails (narrow safe paths — the only walkable routes) ===
    { type: "dirt", x: 560,  y: 0,   w: 60,  h: 200 },   // north entry
    { type: "dirt", x: 300,  y: 180, w: 700, h: 36 },    // main east-west upper
    { type: "dirt", x: 380,  y: 216, w: 36,  h: 180 },   // south connector left
    { type: "dirt", x: 700,  y: 216, w: 36,  h: 160 },   // south connector right
    { type: "dirt", x: 300,  y: 380, w: 500, h: 32 },    // lower east-west
    { type: "dirt", x: 500,  y: 412, w: 36,  h: 120 },   // deep south connector

    // === LAVA — dominant, dangerous, animated ===
    // Large western lava lake
    { type: "lava", x: 20,   y: 180, w: 240, h: 130 },
    // Eastern lava pool (upper)
    { type: "lava", x: 1020, y: 160, w: 200, h: 120 },
    // Central lava river (horizontal, splitting map)
    { type: "lava", x: 600,  y: 420, w: 680, h: 50  },
    // Western lower lava pool
    { type: "lava", x: 40,   y: 420, w: 180, h: 100 },
    // Eastern lower pool
    { type: "lava", x: 1060, y: 470, w: 180, h: 100 },
    // Scattered small lava pockets
    { type: "lava", x: 460,  y: 280, w: 80,  h: 60  },
    { type: "lava", x: 850,  y: 130, w: 70,  h: 60  },
    { type: "lava", x: 200,  y: 460, w: 70,  h: 50  },

    // === LAVA SEA — impassable southern border ===
    { type: "lava", x: 0,    y: 580, w: 1280, h: 60  },
    { type: "lava", x: 0,    y: 640, w: 1280, h: 160 },
  ];

  // No props/trees — dead volcanic wasteland (could add rock formations later)
  const props: TerrainProp[] = [];

  // NPCs — just 2 rugged survivors standing on safe trails
  const npcs: NpcDef[] = [
    {
      id: "vo_grak", name: "Grak the Bold",
      gen: { headgear: "none", cloth: "#4a2a1a", trim: "#8a4a2a", hair: "#2a1a0a" },
      x: 500, y: 195, action: "talk", facing: -1,
      lines: [
        "Watch yer step — one wrong move and you're ash.",
        "Monsters crawl up from the deep cracks.",
        "Only fools and heroes come this far south.",
      ],
    },
    {
      id: "vo_ember", name: "Ember",
      gen: { headgear: "hat", cloth: "#6a3a1a", trim: "#ffa040", hair: "#8a3a0a" },
      x: 650, y: 195, action: "talk", facing: 1,
      lines: [
        "The ground shakes more each day...",
        "Stick to the dirt paths. Everything else burns.",
        "Head north to get back to town.",
      ],
    },
  ];

  // Bake NPC sprites
  for (const n of npcs) {
    n.sprite = generateCharacter(n.id, n.gen);
  }

  // Overworld enemies — fire elementals and lava slimes roaming the paths
  // Map to existing MonsterKind: "imp" for fire_elemental, "slime" for lava_slime
  const enemies: OverworldEnemy[] = [
    // Fire elementals near lava pools (use imp as base)
    { id: "ve_1", monsterKind: "imp", x: 350, y: 300, patrol: { cx: 350, cy: 300, radius: 60, speed: 35 }, aggroRange: 80, touchRange: 18, defeated: false, respawnTimer: 120, respawnCooldown: 0, vx: 0, vy: 0, aggro: false, animTime: 0 },
    { id: "ve_2", monsterKind: "imp", x: 850, y: 200, patrol: { cx: 850, cy: 200, radius: 70, speed: 38 }, aggroRange: 90, touchRange: 18, defeated: false, respawnTimer: 120, respawnCooldown: 0, vx: 0, vy: 0, aggro: false, animTime: 0 },
    { id: "ve_3", monsterKind: "imp", x: 600, y: 380, patrol: { cx: 600, cy: 380, radius: 50, speed: 32 }, aggroRange: 75, touchRange: 18, defeated: false, respawnTimer: 120, respawnCooldown: 0, vx: 0, vy: 0, aggro: false, animTime: 0 },
    // Lava slimes on trails (use slime as base)
    { id: "vs_1", monsterKind: "slime", x: 420, y: 195, patrol: { cx: 420, cy: 195, radius: 50, speed: 25 }, aggroRange: 60, touchRange: 16, defeated: false, respawnTimer: 120, respawnCooldown: 0, vx: 0, vy: 0, aggro: false, animTime: 0 },
    { id: "vs_2", monsterKind: "slime", x: 750, y: 195, patrol: { cx: 750, cy: 195, radius: 45, speed: 22 }, aggroRange: 55, touchRange: 16, defeated: false, respawnTimer: 120, respawnCooldown: 0, vx: 0, vy: 0, aggro: false, animTime: 0 },
    { id: "vs_3", monsterKind: "slime", x: 500, y: 395, patrol: { cx: 500, cy: 395, radius: 55, speed: 28 }, aggroRange: 65, touchRange: 16, defeated: false, respawnTimer: 120, respawnCooldown: 0, vx: 0, vy: 0, aggro: false, animTime: 0 },
  ];

  return {
    id: "volcanic_outpost",
    name: "Volcanic Wasteland",
    worldW: WORLD_W,
    worldH: WORLD_H,
    buildings,
    npcs,
    spawnX: 590,
    spawnY: 30,
    exits: { up: "town" },
    plazas: [],
    terrainRects,
    props,
    baseTile: "/terrain/volcanic_rock.png",
    enemies,
  };
}
