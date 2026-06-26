import { generateCharacter } from "../pixelgen";
import type { Building, NpcDef, TownMap, TerrainRect } from "./types";
import { WORLD_W } from "./types";

const HOME_ASSETS = [
  "/sprites/building/villager-home/villager-home-1_keyed.png",
  "/sprites/building/villager-home/villager-home-2_keyed.png",
  "/sprites/building/villager-home/villager-home-3_keyed.png",
];

export function buildWestVillageMap(): TownMap {
  // 12 cottages in two rows (designed in the layout editor), assets cycled.
  const homeCoords: Array<{ x: number; y: number }> = [
    { x: 0,    y: 0   }, { x: 240,  y: 0   }, { x: 480,  y: 0   },
    { x: 680,  y: 0   }, { x: 920,  y: 0   }, { x: 1120, y: 0   },
    { x: 0,    y: 200 }, { x: 240,  y: 200 }, { x: 480,  y: 200 },
    { x: 680,  y: 200 }, { x: 920,  y: 200 }, { x: 1120, y: 200 },
  ];
  const buildings: Building[] = homeCoords.map((c, i) => ({
    x: c.x, y: c.y, w: 160, h: 120,
    color: "#7a5a3a", roof: "#5a3a1a",
    asset: HOME_ASSETS[i % HOME_ASSETS.length],
    drawSize: 180, drawHeight: 150,
  }));
  // central well
  buildings.push({
    x: 600, y: 480, w: 40, h: 40,
    color: "#6a6a6a", roof: "#4a4a4a",
    asset: "", drawSize: 60, label: "WELL",
  });

  const npcs: NpcDef[] = [
    // Road Guide near the eastern arrival point — orients player back toward town
    {
      id: "wv_guide", name: "Road Guide",
      gen: { headgear: "hat", cloth: "#5a4a2a", trim: "#8a7a4a", hair: "#4a3018" },
      x: 1060, y: 480, action: "talk", facing: -1,
      lines: [
        "The road east leads back to town.",
        "Mind the water — it runs deep here.",
      ],
    },
  ];

  // wandering villagers — placed on the dry central area (away from water)
  const pngWanderers: Array<{ id: string; name: string; asset: string; drawSize: number; x: number; y: number; radius: number; speed: number; }> = [
    { id: "wv_a", name: "Aldric", asset: "/sprites/villager/villager_03_keyed.png", drawSize: 52, x: 300, y: 420, radius: 100, speed: 30 },
    { id: "wv_b", name: "Mira",   asset: "/sprites/villager/villager_05_keyed.png", drawSize: 52, x: 520, y: 560, radius: 90,  speed: 32 },
    { id: "wv_c", name: "Jonas",  asset: "/sprites/villager/villager_07_keyed.png", drawSize: 52, x: 240, y: 600, radius: 80,  speed: 28 },
    { id: "wv_d", name: "Bridget",asset: "/sprites/villager/villager_08_keyed.png", drawSize: 52, x: 760, y: 420, radius: 110, speed: 33 },
    { id: "wv_e", name: "Owen",   asset: "/sprites/villager/villager_10_keyed.png", drawSize: 52, x: 420, y: 600, radius: 90,  speed: 31 },
    { id: "wv_f", name: "Tara",   asset: "/sprites/villager/villager_01_keyed.png", drawSize: 52, x: 880, y: 540, radius: 100, speed: 34 },
  ];
  for (const w of pngWanderers) {
    npcs.push({
      id: w.id, name: w.name, gen: {},
      x: w.x, y: w.y, action: "talk", facing: 1,
      asset: w.asset, drawSize: w.drawSize,
      lines: [
        "Quiet little village, isn't it?",
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

  // bake sprites/images for each NPC (mirrors buildTownMap's bake loop)
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

  // painted terrain (from the layout editor) — brick walkways + water borders
  const terrainRects: TerrainRect[] = [
    // brick walkways between/around the cottages
    { type: "brick", x: 160,  y: 0,   w: 80,  h: 320 },
    { type: "brick", x: 400,  y: 0,   w: 80,  h: 320 },
    { type: "brick", x: 640,  y: 0,   w: 40,  h: 320 },
    { type: "brick", x: 840,  y: 0,   w: 80,  h: 320 },
    { type: "brick", x: 1080, y: 0,   w: 40,  h: 320 },
    { type: "brick", x: 0,    y: 120, w: 160, h: 80  },
    { type: "brick", x: 240,  y: 120, w: 160, h: 80  },
    { type: "brick", x: 480,  y: 120, w: 160, h: 80  },
    { type: "brick", x: 680,  y: 120, w: 160, h: 80  },
    { type: "brick", x: 920,  y: 120, w: 160, h: 80  },
    { type: "brick", x: 1120, y: 120, w: 160, h: 80  },
    { type: "brick", x: 120,  y: 200, w: 40,  h: 40  },
    { type: "brick", x: 680,  y: 200, w: 40,  h: 120 },
    { type: "brick", x: 240,  y: 240, w: 160, h: 40  },
    // water — right inlet (split by a wider dry arrival corridor) + bottom lake
    { type: "water", x: 1120, y: 320, w: 160,  h: 80  },
    { type: "water", x: 1120, y: 560, w: 160,  h: 240 },
    { type: "water", x: 0,    y: 680, w: 1120, h: 120 },
  ];

  return {
    id: "west_village",
    name: "West Village",
    worldW: WORLD_W,
    worldH: 800,
    buildings,
    npcs,
    spawnX: WORLD_W - 30,   // arrive from town via right edge
    spawnY: 480,            // dry corridor between the two water inlets
    exits: { right: "town" },
    plazas: [],             // brick handled entirely by terrainRects now
    terrainRects,
  };
}
