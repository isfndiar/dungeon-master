import { generateCharacter } from "../pixelgen";
import type { GenOptions } from "../pixelgen";
import type { Building, NpcDef, TownMap } from "./types";
import { WORLD_W, WORLD_H } from "./types";

export function buildTownMap(): TownMap {
  // Buildings (decorative + landmarks) — spread across the big world.
  const buildings: Building[] = [
    // Grand Castle (top center)
    {
      x: 500, y: 70, w: 280, h: 130, color: "#6a6f7a", roof: "#4a4f59",
      asset: "/sprites/building/noble-manor-royal.png", drawSize: 360, drawHeight: 230,
      label: "CASTLE",
    },
    // Blacksmith (left)
    {
      x: 180, y: 250, w: 150, h: 100, color: "#7a5a3a", roof: "#5a3a1a",
      asset: "/sprites/building/noble-manor-forest.png", drawSize: 220, label: "SMITHY",
    },
    // Shop / market (right)
    {
      x: 950, y: 250, w: 150, h: 100, color: "#5a6a8a", roof: "#3a4a6a",
      asset: "/sprites/building/noble-manor-renaissance.png", drawSize: 220, label: "MARKET",
    },
    // Royal Castle (left, home of the king & his nobleman) — keyed PNG
    {
      x: 120, y: 520, w: 230, h: 116, color: "#7a7f8a", roof: "#3a4f8a",
      asset: "/sprites/building/castle_keyed.png", drawSize: 330, drawHeight: 300,
      label: "ROYAL CASTLE",
    },
    // Dungeon gate (bottom center) - dark ominous arch
    {
      x: 560, y: 600, w: 170, h: 90, color: "#2a2230", roof: "#1a141f",
      asset: "/sprites/building/noble-manor-gothic.png", drawSize: 240,
      label: "DUNGEON GATE", banner: "gate",
    },
    // Endless raid cave entrance (bottom right, aligned with dungeon gate)
    {
      x: 980, y: 600, w: 170, h: 90, color: "#1a1818", roof: "#0f0f0f",
      asset: "/sprites/building/dungeon-cave-entrance.png", drawSize: 240,
      label: "RAID ENDLESS", banner: "gate",
    },
    // Portal to next village (far right)
    {
      x: 1180, y: 400, w: 80, h: 100, color: "#3a2a6a", roof: "#2a1a4a",
      asset: "", drawSize: 160,
      label: "PORTAL", portal: true,
    },
  ];

  // NPCs — each carries a procedural-character bias (gen) that the generator
  // turns into a unique pixel sprite (unless a static PNG asset is supplied).
  const npcs: NpcDef[] = [
    {
      id: "captain", name: "Captain Mara",
      gen: { headgear: "helmet", cloth: "#caa23a", trim: "#7a1f2a", hair: "#6a4a22" },
      x: 720, y: 250, action: "heroes", facing: -1,
      lines: [
        "Choose your champion wisely, hunter.",
        "Each hero fights differently.",
      ],
    },
    {
      id: "blacksmith", name: "Borin the Smith",
      gen: {}, asset: "/sprites/villager/blachsmith_keyed.png", drawSize: 60,
      x: 255, y: 372, action: "equipment", facing: 1,
      lines: [
        "Bring me loot from the depths!",
        "Let's see what gear suits you.",
      ],
    },
    {
      id: "merchant", name: "Merchant Pell",
      gen: {}, asset: "/sprites/villager/merchant_keyed.png", drawSize: 60,
      x: 1025, y: 372, action: "talk", facing: -1,
      lines: [
        "Goods from afar! ...well, soon.",
        "Gold burns a hole in your pocket, eh?",
      ],
    },
    {
      id: "guard", name: "Gate Guard",
      gen: { headgear: "helmet", cloth: "#4a4a55", trim: "#3a4f8a", hair: "#4a3018" },
      x: 645, y: 710, action: "dungeon", facing: 1,
      lines: [
        "The dungeon gate lies beyond.",
        "Pick your destination, and may fortune favor you.",
      ],
    },
    {
      id: "endless_guard", name: "Portal Keeper",
      gen: { headgear: "helmet", cloth: "#2a2a33", trim: "#c0c8d8", hair: "#3a3a44" },
      x: 1065, y: 710, action: "endless", facing: -1,
      lines: [
        "The endless abyss awaits the brave.",
        "No retreat. No mercy. How long can you survive?",
      ],
    },
    {
      id: "villager1", name: "Villager",
      gen: {}, asset: "/sprites/villager/villager_01_keyed.png", drawSize: 58,
      x: 500, y: 430, action: "talk", facing: 1,
      lines: ["Lovely day, isn't it?", "Heard the crypt is haunted... brr."],
    },
    {
      id: "villager2", name: "Villager",
      gen: {}, asset: "/sprites/villager/villager_02_keyed.png", drawSize: 58,
      x: 820, y: 470, action: "talk", facing: -1,
      lines: ["Be careful out there!", "My cousin went to the volcano. Never came back."],
    },
    // --- Royal Castle residents (static PNG sprites) ---
    {
      id: "king_aldric", name: "King Aldric",
      gen: {}, asset: "/sprites/king/king_keyed.png", drawSize: 68,
      x: 200, y: 668, action: "talk", facing: 1,
      lines: [
        "Rise, hunter. The realm has need of you.",
        "Clear the dungeons and your name shall be sung in these halls.",
      ],
    },
    {
      id: "nobleman", name: "Lord Castellan",
      gen: {}, asset: "/sprites/nobleman/nobleman_keyed.png", drawSize: 60,
      x: 285, y: 666, action: "talk", facing: -1,
      lines: [
        "His Majesty does not grant audience to just anyone.",
        "Prove your worth in the depths first.",
      ],
    },
    {
      id: "portal_keeper", name: "Portal Keeper",
      gen: { headgear: "helmet", cloth: "#3a2a6a", trim: "#7a5aaa", hair: "#2a1a3a" },
      x: 1180, y: 530, action: "talk", facing: -1,
      lines: [
        "This portal is dormant for now.",
        "Other lands may open in time.",
      ],
    },
    {
      id: "west_guide", name: "Road Guide",
      gen: { headgear: "hat", cloth: "#5a4a2a", trim: "#8a7a4a", hair: "#4a3018" },
      x: 100, y: 490, action: "talk", facing: 1,
      lines: [
        "The west road is closed for now.",
        "Best stay near town, traveler.",
      ],
    },
  ];

  // wandering townsfolk — procedural sprites that stroll around plazas/paths
  const wanderers: Array<{ id: string; name: string; gen: GenOptions; x: number; y: number; radius: number; speed: number; }> = [
    { id: "w_tom",  name: "Tom",   gen: { cloth: "#6a8f3a", hair: "#5a3a1a" }, x: 460, y: 460, radius: 90,  speed: 32 },
    { id: "w_lia",  name: "Lia",   gen: { cloth: "#8f4a6a", hair: "#caa23a" }, x: 880, y: 500, radius: 90,  speed: 34 },
    { id: "w_rod",  name: "Rodric",gen: { cloth: "#3a4f8a", hair: "#2a1a0a" }, x: 640, y: 360, radius: 120, speed: 30 },
    { id: "w_meg",  name: "Megan", gen: { cloth: "#caa23a", hair: "#6a4a22" }, x: 320, y: 560, radius: 70,  speed: 36 },
    { id: "w_owen", name: "Owen",  gen: { cloth: "#4a8f6a", hair: "#4a3018" }, x: 980, y: 580, radius: 80,  speed: 32 },
  ];
  for (const w of wanderers) {
    npcs.push({
      id: w.id, name: w.name, gen: w.gen,
      x: w.x, y: w.y, action: "talk", facing: 1,
      lines: [
        "Just taking a stroll around town.",
        "Nice weather for a walk, eh?",
      ],
      wander: {
        cx: w.x, cy: w.y, radius: w.radius,
        vx: 0, vy: 0, timer: 0,
        speed: w.speed, moving: false, animTime: 0,
        homeX: w.x, homeY: w.y,
      },
    });
  }

  // wandering PNG townsfolk — use static villager sprites, stroll around
  const pngWanderers: Array<{ id: string; name: string; asset: string; drawSize: number; x: number; y: number; radius: number; speed: number; }> = [
    { id: "w_v3",  name: "Brant",  asset: "/sprites/villager/villager_03_keyed.png", drawSize: 52, x: 540, y: 430, radius: 100, speed: 30 },
    { id: "w_v4",  name: "Elsa",   asset: "/sprites/villager/villager_04_keyed.png", drawSize: 52, x: 760, y: 520, radius: 100, speed: 32 },
    { id: "w_v5",  name: "Caleb",  asset: "/sprites/villager/villager_05_keyed.png", drawSize: 52, x: 420, y: 620, radius: 90,  speed: 28 },
    { id: "w_v6",  name: "Iris",   asset: "/sprites/villager/villager_06_keyed.png", drawSize: 52, x: 900, y: 640, radius: 90,  speed: 34 },
    { id: "w_v7",  name: "Dunn",   asset: "/sprites/villager/villager_07_keyed.png", drawSize: 52, x: 600, y: 480, radius: 130, speed: 30 },
    { id: "w_v8",  name: "Mara",   asset: "/sprites/villager/villager_08_keyed.png", drawSize: 52, x: 360, y: 500, radius: 80,  speed: 33 },
    { id: "w_v9",  name: "Otto",   asset: "/sprites/villager/villager_09_keyed.png", drawSize: 52, x: 1050,y: 460, radius: 70,  speed: 31 },
    { id: "w_v10", name: "Wren",   asset: "/sprites/villager/villager_10_keyed.png", drawSize: 52, x: 700, y: 680, radius: 110, speed: 29 },
    { id: "w_v11", name: "Pell",   asset: "/sprites/villager/villager_11_keyed.png", drawSize: 52, x: 240, y: 440, radius: 80,  speed: 35 },
  ];
  for (const w of pngWanderers) {
    npcs.push({
      id: w.id, name: w.name, gen: {},
      x: w.x, y: w.y, action: "talk", facing: 1,
      asset: w.asset, drawSize: w.drawSize,
      lines: [
        "Out for a walk, friend.",
        "The town's lively today!",
      ],
      wander: {
        cx: w.x, cy: w.y, radius: w.radius,
        vx: 0, vy: 0, timer: 0,
        speed: w.speed, moving: false, animTime: 0,
        homeX: w.x, homeY: w.y,
      },
    });
  }

  // bake a unique procedural sprite for each NPC (seeded by its id),
  // or preload a static PNG sprite when one is supplied.
  for (const n of npcs) {
    if (n.asset) {
      const img = new Image();
      img.src = n.asset;
      n.image = img;
      // derive directional walk strips from the base asset name, e.g.
      // /sprites/villager/villager_03_keyed.png -> *_walkingup_keyed.png.
      // only villagers with wandering behavior get these.
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
    id: "town",
    name: "Town",
    worldW: WORLD_W,
    worldH: WORLD_H,
    buildings,
    npcs,
    spawnX: WORLD_W / 2,
    spawnY: WORLD_H - 60,
    exits: {}, // west_village disabled — kept in codebase but not accessible
    plazas: [
      { x: 120, y: 340, w: 1040, h: 230 },
      { x: 460, y: 200, w: 360, h: 140 },
      { x: 1100, y: 340, w: 180, h: 230 },
      { x: 0, y: 400, w: 120, h: 120 },
    ],
  };
}
