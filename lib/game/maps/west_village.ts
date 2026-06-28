import { generateCharacter } from "../pixelgen";
import type { Building, NpcDef, TownMap, TerrainRect, TerrainProp } from "./types";

/**
 * West Village — Stardew Valley inspired layout.
 * 
 * Design: organic village with dirt paths, flower patches, trees,
 * a natural lake, and scattered cottages with generous spacing.
 * 
 * Layout (1280 x 800):
 * ┌────────────────────────────────────────────────────────────────┐
 * │ [tree] [flowers]  [cottage1]  [tree]  [cottage2]   [tree]     │
 * │                                                                │
 * │      ~~~~~ dirt path east-west ~~~~~~~~~~~~~~~~~~~~~~~~→ exit  │
 * │                                                                │
 * │ [cottage3]  [tree]  [cottage4]   [flowers]  [cottage5] [tree] │
 * │                                                                │
 * │      ~~~~~ dirt path south fork ~~~~~~~                        │
 * │                                                                │
 * │ [tree] [cottage6]  [lake~~~~]  [cottage7]  [tree] [dark grass]│
 * │                     [~~~~~~~~]                                 │
 * │ [flowers]  [tree]  [rocks]  [tree]  [grass_tufts]  [tree]    │
 * └────────────────────────────────────────────────────────────────┘
 */

const WORLD_W = 1280;
const WORLD_H = 800;

const HOME_ASSETS = [
  "/sprites/building/villager-home/villager-home-1_keyed.png",
  "/sprites/building/villager-home/villager-home-2_keyed.png",
  "/sprites/building/villager-home/villager-home-3_keyed.png",
];

export function buildWestVillageMap(): TownMap {
  // Cottages — organic placement with generous spacing (min 120px between)
  const cottageCoords: Array<{ x: number; y: number }> = [
    // Top area
    { x: 200,  y: 60  },
    { x: 600,  y: 50  },
    // Middle area
    { x: 80,   y: 280 },
    { x: 420,  y: 300 },
    { x: 780,  y: 270 },
    // Bottom area
    { x: 140,  y: 530 },
    { x: 700,  y: 520 },
  ];

  const buildings: Building[] = cottageCoords.map((c, i) => ({
    x: c.x, y: c.y, w: 160, h: 120,
    color: "#7a5a3a", roof: "#5a3a1a",
    asset: HOME_ASSETS[i % HOME_ASSETS.length],
    drawSize: 180, drawHeight: 150,
  }));

  // Terrain — Stardew style layers
  const terrainRects: TerrainRect[] = [
    // === Brick paths (walkways connecting village) ===
    // Main east-west path
    { type: "brick", x: 60,   y: 220, w: 1160, h: 36 },
    // North-south connector (left)
    { type: "brick", x: 180,  y: 160, w: 36,   h: 60 },
    { type: "brick", x: 180,  y: 256, w: 36,   h: 130 },
    // North-south connector (middle)
    { type: "brick", x: 500,  y: 160, w: 36,   h: 60 },
    { type: "brick", x: 500,  y: 256, w: 36,   h: 180 },
    // South fork
    { type: "brick", x: 180,  y: 420, w: 700,  h: 32 },
    // Exit corridor east
    { type: "brick", x: 1140, y: 210, w: 140,  h: 56 },

    // === Farmland / Sawah (dirt plots near cottages) ===
    // Farm plot next to cottage 1 (top-left)
    { type: "dirt", x: 380,  y: 80,  w: 100, h: 80  },
    // Farm plot next to cottage 2 (top-right)
    { type: "dirt", x: 780,  y: 60,  w: 120, h: 90  },
    // Farm plot near cottage 3 (mid-left)
    { type: "dirt", x: 260,  y: 310, w: 100, h: 70  },
    // Large central farm
    { type: "dirt", x: 600,  y: 310, w: 140, h: 90  },
    // Farm plot near cottage 5 (mid-right)
    { type: "dirt", x: 960,  y: 290, w: 110, h: 80  },
    // Farm plot near cottage 6 (bottom-left)
    { type: "dirt", x: 320,  y: 550, w: 80,  h: 70  },
    // Farm near cottage 7 (bottom-right)
    { type: "dirt", x: 880,  y: 540, w: 100, h: 80  },

    // === Grass variety patches ===
    { type: "grass_flowers", x: 60,   y: 70,  w: 120, h: 70  },
    { type: "grass_flowers", x: 920,  y: 380, w: 100, h: 60  },
    { type: "grass_flowers", x: 660,  y: 650, w: 100, h: 60  },
    { type: "grass_tufts", x: 1000, y: 80,  w: 140, h: 80  },
    { type: "grass_tufts", x: 300,  y: 460, w: 90,  h: 50  },
    { type: "grass_tufts", x: 1020, y: 600, w: 120, h: 70  },
    { type: "grass_rocks", x: 460,  y: 650, w: 80,  h: 50  },
    { type: "grass_rocks", x: 1100, y: 160, w: 70,  h: 50  },
    // Dark grass (shade under tree clusters)
    { type: "dark_grass", x: 1020, y: 460, w: 100, h: 80  },
    { type: "dark_grass", x: 40,   y: 620, w: 90,  h: 70  },

    // === Water — natural lake + stream ===
    { type: "water", x: 420, y: 560, w: 220, h: 160 },
    { type: "water", x: 0,   y: 750, w: 1280, h: 50 },
  ];

  // Props — trees and lake decoration
  const props: TerrainProp[] = [
    // Trees scattered around the village (collision = true by default)
    { asset: "/terrain/tree.png", x: 40,   y: 20,  w: 80, h: 100 },
    { asset: "/terrain/tree.png", x: 480,  y: 10,  w: 70, h: 90  },
    { asset: "/terrain/tree.png", x: 850,  y: 30,  w: 75, h: 95  },
    { asset: "/terrain/tree.png", x: 1100, y: 60,  w: 70, h: 90  },
    { asset: "/terrain/tree.png", x: 300,  y: 280, w: 65, h: 85  },
    { asset: "/terrain/tree.png", x: 1060, y: 270, w: 80, h: 100 },
    { asset: "/terrain/tree.png", x: 60,   y: 500, w: 70, h: 90  },
    { asset: "/terrain/tree.png", x: 940,  y: 480, w: 75, h: 95  },
    { asset: "/terrain/tree.png", x: 1150, y: 520, w: 70, h: 90  },
    { asset: "/terrain/tree.png", x: 350,  y: 650, w: 65, h: 85  },
    { asset: "/terrain/tree.png", x: 700,  y: 670, w: 70, h: 90  },
    { asset: "/terrain/tree.png", x: 1060, y: 640, w: 75, h: 95  },
    // Lake image overlay (decorative, collision handled by water terrainRect)
    { asset: "/terrain/lake.png", x: 400, y: 540, w: 260, h: 200, collision: false },
  ];

  // NPCs
  const npcs: NpcDef[] = [
    {
      id: "wv_guide", name: "Road Guide",
      gen: { headgear: "hat", cloth: "#5a4a2a", trim: "#8a7a4a", hair: "#4a3018" },
      x: 1160, y: 240, action: "talk", facing: -1,
      lines: [
        "The road east leads back to town.",
        "This village is peaceful. Enjoy the quiet.",
      ],
    },
  ];

  // Wandering villagers on walkable areas
  const pngWanderers: Array<{ id: string; name: string; asset: string; drawSize: number; x: number; y: number; radius: number; speed: number }> = [
    { id: "wv_a", name: "Aldric",  asset: "/sprites/villager/villager_03_keyed.png", drawSize: 52, x: 300, y: 240, radius: 70,  speed: 28 },
    { id: "wv_b", name: "Mira",    asset: "/sprites/villager/villager_05_keyed.png", drawSize: 52, x: 600, y: 240, radius: 60,  speed: 30 },
    { id: "wv_c", name: "Jonas",   asset: "/sprites/villager/villager_07_keyed.png", drawSize: 52, x: 480, y: 440, radius: 50,  speed: 26 },
    { id: "wv_d", name: "Bridget", asset: "/sprites/villager/villager_08_keyed.png", drawSize: 52, x: 800, y: 240, radius: 80,  speed: 32 },
    { id: "wv_e", name: "Owen",    asset: "/sprites/villager/villager_10_keyed.png", drawSize: 52, x: 200, y: 440, radius: 60,  speed: 29 },
    { id: "wv_f", name: "Tara",    asset: "/sprites/villager/villager_01_keyed.png", drawSize: 52, x: 860, y: 440, radius: 70,  speed: 31 },
  ];

  for (const w of pngWanderers) {
    npcs.push({
      id: w.id, name: w.name, gen: {},
      x: w.x, y: w.y, action: "talk", facing: 1,
      asset: w.asset, drawSize: w.drawSize,
      lines: [
        "Quiet little village, isn't it?",
        "The lake's nice this time of year.",
        "Not much happens out west here.",
      ],
      wander: {
        cx: w.x, cy: w.y, radius: w.radius,
        vx: 0, vy: 0, timer: 0,
        speed: w.speed, moving: false, animTime: 0,
        homeX: w.x, homeY: w.y,
      },
    });
  }

  // Bake sprites/images for each NPC
  for (const n of npcs) {
    if (n.asset) {
      const img = new Image();
      img.src = n.asset;
      n.image = img;
      const stem = n.asset.replace(/_keyed\.png$/, "");
      if (n.wander && stem !== n.asset) {
        const mk = (dir: string) => {
          const im = new Image();
          im.src = `${stem}_${dir}_keyed.png`;
          return im;
        };
        n.walkImgs = {
          up: mk("walkingup"),
          down: mk("walkingdown"),
          left: mk("walkingleft"),
        };
      }
    } else {
      n.sprite = generateCharacter(n.id, n.gen);
    }
  }

  return {
    id: "west_village",
    name: "West Village",
    worldW: WORLD_W,
    worldH: WORLD_H,
    buildings,
    npcs,
    spawnX: WORLD_W - 60,
    spawnY: 240,
    exits: { right: "town" },
    plazas: [],
    terrainRects,
    props,
  };
}
