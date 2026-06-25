import { generateCharacter } from "../pixelgen";
import type { Building, NpcDef, TownMap } from "./types";
import { WORLD_W, WORLD_H } from "./types";

export function buildWestVillageMap(): TownMap {
  const buildings: Building[] = [
    // cluster of 3 villager homes around center-left
    {
      x: 220, y: 260, w: 130, h: 90, color: "#7a5a3a", roof: "#5a3a1a",
      asset: "/sprites/building/villager-home/villager-home-1_keyed.png",
      drawSize: 180, drawHeight: 150, label: "HOMESTEAD",
    },
    {
      x: 420, y: 320, w: 130, h: 90, color: "#6a4a2a", roof: "#4a2a0a",
      asset: "/sprites/building/villager-home/villager-home-2_keyed.png",
      drawSize: 180, drawHeight: 150, label: "COTTAGE",
    },
    {
      x: 260, y: 480, w: 130, h: 90, color: "#7a5a3a", roof: "#5a3a1a",
      asset: "/sprites/building/villager-home/villager-home-3_keyed.png",
      drawSize: 180, drawHeight: 150, label: "FARMHOUSE",
    },
    // a well/town-sign post at plaza center (no asset, drawn as fallback box)
    {
      x: 540, y: 460, w: 40, h: 40, color: "#6a6a6a", roof: "#4a4a4a",
      asset: "", drawSize: 60, label: "WELL",
    },
  ];

  const npcs: NpcDef[] = [
    // Road Guide at right edge — orients player back toward town
    {
      id: "wv_guide", name: "Road Guide",
      gen: { headgear: "hat", cloth: "#5a4a2a", trim: "#8a7a4a", hair: "#4a3018" },
      x: 1230, y: 400, action: "talk", facing: -1,
      lines: [
        "The road east leads back to town.",
        "Stay safe on the trails.",
      ],
    },
  ];

  // wandering villagers — reuse existing villager PNGs + walk strips
  const pngWanderers: Array<{ id: string; name: string; asset: string; drawSize: number; x: number; y: number; radius: number; speed: number; }> = [
    { id: "wv_a", name: "Aldric", asset: "/sprites/villager/villager_03_keyed.png", drawSize: 52, x: 360, y: 420, radius: 100, speed: 30 },
    { id: "wv_b", name: "Mira",   asset: "/sprites/villager/villager_05_keyed.png", drawSize: 52, x: 500, y: 540, radius: 90,  speed: 32 },
    { id: "wv_c", name: "Jonas",  asset: "/sprites/villager/villager_07_keyed.png", drawSize: 52, x: 180, y: 580, radius: 80,  speed: 28 },
    { id: "wv_d", name: "Bridget",asset: "/sprites/villager/villager_08_keyed.png", drawSize: 52, x: 620, y: 380, radius: 110, speed: 33 },
    { id: "wv_e", name: "Owen",   asset: "/sprites/villager/villager_10_keyed.png", drawSize: 52, x: 340, y: 640, radius: 90,  speed: 31 },
    { id: "wv_f", name: "Tara",   asset: "/sprites/villager/villager_01_keyed.png", drawSize: 52, x: 700, y: 500, radius: 100, speed: 34 },
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

  return {
    id: "west_village",
    name: "West Village",
    worldW: WORLD_W,
    worldH: WORLD_H,
    buildings,
    npcs,
    spawnX: WORLD_W - 30,   // arrived from town via right edge
    spawnY: 400,
    exits: { right: "town" },
    plazas: [
      { x: 160, y: 400, w: 720, h: 280 },   // central dirt plaza around homes
      { x: 1100, y: 360, w: 180, h: 120 },  // approach road to east exit
    ],
  };
}
