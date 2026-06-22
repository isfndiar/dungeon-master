import { Input } from "./input";
import { HeroId, HEROES } from "./heroes";
import { heroSprites, drawAnim, SpriteDef } from "./sprites";
import { generateCharacter, GenOptions } from "./pixelgen";
import {
  preloadHeroSprites, drawHeroDir, facingFromVec, Facing,
} from "./spriteLoader";
import {
  TownLayout, saveTownLayout, loadTownLayout, exportTownLayout, importTownLayout,
} from "./editor-layout";

// Viewport = the logical area the camera shows on screen (kept small so the
// pixel art stays chunky). The world is much larger and the camera follows the
// player across it.
export const TOWN_W = 480;   // viewport width  (kept name for page.tsx canvas sizing)
export const TOWN_H = 270;   // viewport height
export const WORLD_W = 1280; // full explorable world
export const WORLD_H = 800;
// Screen (device) pixels per world pixel. Bigger = chunkier art, smaller view.
const PIXEL_SCALE = 3;

// Which interaction an NPC triggers (handled by the React layer).
export type TownAction = "dungeon" | "equipment" | "heroes" | "talk" | "shop" | "endless" | "village2";

export interface NpcDef {
  id: string;
  name: string;
  gen: GenOptions;      // procedural-character bias for this NPC
  x: number; y: number; // world position (sprite center)
  action: TownAction;
  lines: string[];      // dialog lines
  facing?: 1 | -1;
  sprite?: SpriteDef;   // baked procedural sprite (filled at build)
  asset?: string;       // optional static PNG sprite (overrides procedural)
  drawSize?: number;    // on-screen size for the static PNG (default 28)
  image?: HTMLImageElement; // preloaded static sprite (filled at build)
  // directional walk sprite STRIPS (derived from `asset` name when present).
  // Each is a horizontal strip of WALK_FRAMES frames. right = mirror of left.
  walkImgs?: {
    up?: HTMLImageElement;
    down?: HTMLImageElement;
    left?: HTMLImageElement;
  };
  // wandering behavior (optional)
  wander?: {
    cx: number; cy: number; // home center
    radius: number;         // wander range
    vx: number; vy: number; // current velocity
    timer: number;          // time until next direction pick
    speed: number;          // walk speed
    moving: boolean;        // currently walking
    animTime: number;       // walk anim clock
    homeX: number; homeY: number; // rest position
  };
}

interface Building {
  x: number; y: number; w: number; h: number;
  color: string; roof: string;
  asset: string;
  drawSize: number;
  drawHeight?: number;
  image?: HTMLImageElement;
  label?: string;
  banner?: string;
  portal?: boolean;
}

export interface TownCallbacks {
  onNearby: (npc: NpcDef | null) => void;
  onInteract: (npc: NpcDef) => void;
}

export interface EditorCallbacks {
  onSelect: (kind: "building" | "npc" | null, index: number | null) => void;
}

const PLAYER_SIZE = 24;
const INTERACT_DIST = 30;
// Villager walk strips are a single row of 5 frames laid out horizontally.
const WALK_FRAMES = 5;
// Fraction of the cell height at which the sprite's feet actually sit.
// The PNGs have transparent padding below the feet, so anchoring the cell
// bottom to the ground leaves the character floating. These fracs line the
// content's feet up with the shadow instead.
const WALK_BOT_FRAC = 0.88;  // walk strip: content bot ~636/724
const IDLE_BOT_FRAC = 0.85;  // base idle sprite: content bot ~0.83-0.86

export class TownEngine {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private input: Input;
  private raf = 0;
  private last = 0;
  private running = false;
  private paused = false;

  // viewport size in WORLD pixels (derived from the canvas backing size / PIXEL_SCALE)
  private viewW = TOWN_W;
  private viewH = TOWN_H;

  private heroId: HeroId;
  private px = WORLD_W / 2;
  private py = WORLD_H - 60;
  private camX = 0;
  private camY = 0;
  private faceLeft = false;
  private facing: Facing = "down";
  private animTime = 0; // seconds, drives frame index
  private moving = false;

  private npcs: NpcDef[] = [];
  private buildings: Building[] = [];
  private grassTile?: HTMLImageElement;
  private grassPattern?: CanvasPattern;
  private roadTile?: HTMLImageElement;
  private roadPattern?: CanvasPattern;
  private nearby: NpcDef | null = null;
  private prevInteract = false;

  private cb: TownCallbacks;

  // --- Editor state ---
  private editorMode = false;
  private editorSelected: { kind: "building" | "npc"; index: number } | null = null;
  private editorDrag: { kind: "building" | "npc"; index: number; offX: number; offY: number } | null = null;
  private editorMouseWorld = { x: 0, y: 0 };
  private editorCallbacks: EditorCallbacks | null = null;

  constructor(canvas: HTMLCanvasElement, heroId: HeroId, cb: TownCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.input = new Input(canvas);
    this.heroId = heroId;
    this.cb = cb;
    this.buildLayout();
    this.preloadBuildings();
    preloadHeroSprites();
    this.resize();
  }

  // Size the canvas backing store to its on-screen pixel size and derive the
  // world-space viewport. Call whenever the element resizes.
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const pxW = Math.max(1, Math.round(rect.width * dpr));
    const pxH = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== pxW || this.canvas.height !== pxH) {
      this.canvas.width = pxW;
      this.canvas.height = pxH;
    }
    // world pixels visible = device pixels / PIXEL_SCALE, never larger than world
    this.viewW = Math.min(WORLD_W, pxW / PIXEL_SCALE);
    this.viewH = Math.min(WORLD_H, pxH / PIXEL_SCALE);
    // map world units -> device pixels (fills the whole backing store)
    const sx = pxW / this.viewW;
    const sy = pxH / this.viewH;
    this.ctx.setTransform(sx, 0, 0, sy, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  setHero(heroId: HeroId) {
    this.heroId = heroId;
  }

  setScale(scale: number) {
    this.input.setScale(scale);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (!p) this.last = performance.now();
  }

  start() {
    this.running = true;
    this.last = performance.now();
    this.loop(this.last);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.destroy();
  }

  // Called by React to trigger interaction with the nearby NPC (e.g. click).
  interactNearby() {
    if (this.nearby) this.cb.onInteract(this.nearby);
  }

  setEditorMode(on: boolean) {
    this.editorMode = on;
    if (!on) {
      this.editorSelected = null;
      this.editorDrag = null;
    }
  }

  isEditorMode(): boolean {
    return this.editorMode;
  }

  setEditorCallbacks(cb: EditorCallbacks) {
    this.editorCallbacks = cb;
  }

  getSelectedBuilding(): Building | null {
    if (this.editorSelected?.kind === "building") return this.buildings[this.editorSelected.index];
    return null;
  }

  getSelectedNpc(): NpcDef | null {
    if (this.editorSelected?.kind === "npc") return this.npcs[this.editorSelected.index];
    return null;
  }

  updateSelectedBuilding(props: Partial<Building>) {
    if (this.editorSelected?.kind === "building") {
      Object.assign(this.buildings[this.editorSelected.index], props);
      this.autoSaveLayout();
    }
  }

  updateSelectedNpc(props: Partial<NpcDef>) {
    if (this.editorSelected?.kind === "npc") {
      Object.assign(this.npcs[this.editorSelected.index], props);
      this.autoSaveLayout();
    }
  }

  addBuilding(b: Building) {
    this.buildings.push(b);
    this.autoSaveLayout();
  }

  removeSelected() {
    if (!this.editorSelected) return;
    const { kind, index } = this.editorSelected;
    this.editorSelected = null;
    if (kind === "building") {
      this.buildings.splice(index, 1);
    } else {
      this.npcs.splice(index, 1);
    }
    this.editorCallbacks?.onSelect(null, null);
    this.autoSaveLayout();
  }

  addNpc(n: NpcDef) {
    this.npcs.push(n);
    this.autoSaveLayout();
  }

  getLayout(): TownLayout {
    return {
      buildings: this.buildings.map((b) => ({
        x: b.x, y: b.y, w: b.w, h: b.h,
        color: b.color, roof: b.roof,
        asset: b.asset, drawSize: b.drawSize,
        label: b.label, banner: b.banner,
        portal: b.portal, drawHeight: b.drawHeight,
      })),
      npcs: this.npcs.map((n) => ({
        id: n.id, name: n.name, x: n.x, y: n.y,
        action: n.action, facing: n.facing ?? 1,
        lines: n.lines, asset: n.asset, drawSize: n.drawSize,
        headgear: n.gen.headgear as string | undefined,
        cloth: n.gen.cloth,
        trim: n.gen.trim,
        hair: n.gen.hair,
      })),
      roads: [],
    };
  }

  loadLayout(layout: TownLayout) {
    this.buildings = layout.buildings.map((b) => ({ ...b }));
    this.npcs = layout.npcs.map((n) => this.hydrateNpc(n));
  }

  doExportLayout() {
    exportTownLayout(this.getLayout());
  }

  async doImportLayout() {
    const layout = await importTownLayout();
    if (layout) this.loadLayout(layout);
  }

  private autoSaveLayout() {
    saveTownLayout(this.getLayout());
  }

  private hydrateNpc(n: any): NpcDef {
    const npc: NpcDef = {
      id: n.id, name: n.name,
      gen: { headgear: n.headgear as any, cloth: n.cloth, trim: n.trim, hair: n.hair },
      x: n.x, y: n.y, action: n.action as TownAction,
      facing: n.facing, lines: n.lines,
      asset: n.asset, drawSize: n.drawSize,
    };
    if (n.asset) {
      const img = new Image();
      img.src = n.asset;
      npc.image = img;
      const stem = n.asset.replace(/_keyed\.png$/, "");
      if (stem !== n.asset) {
        const mk = (dir: string) => { const im = new Image(); im.src = `${stem}_${dir}_keyed.png`; return im; };
        npc.walkImgs = { up: mk("walkingup"), down: mk("walkingdown"), left: mk("walkingleft") };
      }
    }
    return npc;
  }

  private hitTest(mx: number, my: number): { kind: "building" | "npc"; index: number } | null {
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      const size = n.drawSize ?? 24;
      if (mx >= n.x - size / 2 && mx <= n.x + size / 2 &&
          my >= n.y - size / 2 && my <= n.y + size / 2) {
        return { kind: "npc", index: i };
      }
    }
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        return { kind: "building", index: i };
      }
    }
    return null;
  }

  private updateEditor(_dt: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.editorMouseWorld.x = this.input.mouseX / (rect.width / this.viewW) + this.camX;
    this.editorMouseWorld.y = this.input.mouseY / (rect.height / this.viewH) + this.camY;

    const mx = this.editorMouseWorld.x;
    const my = this.editorMouseWorld.y;

    if (this.input.mouseDown && !this.prevInteract) {
      const hit = this.hitTest(mx, my);
      if (hit) {
        this.editorSelected = hit;
        this.editorCallbacks?.onSelect(hit.kind, hit.index);
        if (hit.kind === "building") {
          const b = this.buildings[hit.index];
          this.editorDrag = { ...hit, offX: mx - b.x, offY: my - b.y };
        } else {
          const n = this.npcs[hit.index];
          this.editorDrag = { ...hit, offX: mx - n.x, offY: my - n.y };
        }
      } else {
        this.editorSelected = null;
        this.editorCallbacks?.onSelect(null, null);
        this.editorDrag = null;
      }
    }

    if (this.input.mouseDown && this.editorDrag) {
      const newX = Math.round(mx - this.editorDrag.offX);
      const newY = Math.round(my - this.editorDrag.offY);
      if (this.editorDrag.kind === "building") {
        const b = this.buildings[this.editorDrag.index];
        b.x = newX; b.y = newY;
      } else {
        const n = this.npcs[this.editorDrag.index];
        n.x = newX; n.y = newY;
      }
    }

    if (!this.input.mouseDown && this.editorDrag) {
      this.autoSaveLayout();
      this.editorDrag = null;
    }

    this.prevInteract = this.input.mouseDown;
  }

  private buildLayout() {
    const saved = loadTownLayout();
    if (saved && saved.buildings.length > 0) {
      this.buildings = saved.buildings.map((b) => ({ ...b }));
      this.npcs = saved.npcs.map((n) => this.hydrateNpc(n));
      return;
    }

    // Buildings (decorative + landmarks) — spread across the big world.
    this.buildings = [
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
    this.npcs = [
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
        x: 1180, y: 530, action: "village2", facing: -1,
        lines: [
          "This portal leads to the next village.",
          "Are you ready to explore new lands?",
        ],
      },
      {
        id: "west_guide", name: "Road Guide",
        gen: { headgear: "hat", cloth: "#5a4a2a", trim: "#8a7a4a", hair: "#4a3018" },
        x: 100, y: 490, action: "village2", facing: 1,
        lines: [
          "This road leads west to the next village.",
          "The journey is long but the rewards are great!",
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
      this.npcs.push({
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
      this.npcs.push({
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
    for (const n of this.npcs) {
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
  }

  private preloadBuildings() {
    for (const b of this.buildings) {
      const img = new Image();
      img.src = b.asset;
      b.image = img;
    }
    const grass = new Image();
    grass.src = "/terrain/grass-tile.png";
    this.grassTile = grass;
    const road = new Image();
    road.src = "/terrain/gray-brick-road-tile.png";
    this.roadTile = road;
  }

  // collision: player feet (a small box at the sprite base) vs building bodies
  private blocked(px: number, py: number): boolean {
    const r = 6;        // half-width of the player's foot box
    const footY = 6;    // feet are a bit below sprite center
    const fx = px;
    const fy = py + footY;
    for (const b of this.buildings) {
      if (
        fx + r > b.x &&
        fx - r < b.x + b.w &&
        fy + r > b.y &&
        fy - r < b.y + b.h
      ) {
        return true;
      }
    }
    return false;
  }

  private loop = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    if (!this.paused) this.update(dt);
    this.render();
  };

  private update(dt: number) {
    if (this.editorMode) {
      this.updateEditor(dt);
      return;
    }
    let mx = 0, my = 0;
    if (this.input.pressed("a", "arrowleft")) mx -= 1;
    if (this.input.pressed("d", "arrowright")) mx += 1;
    if (this.input.pressed("w", "arrowup")) my -= 1;
    if (this.input.pressed("s", "arrowdown")) my += 1;
    const len = Math.hypot(mx, my);
    this.moving = len > 0;
    if (len > 0) {
      mx /= len; my /= len;
      const speed = 145;
      // axis-separated movement so we can slide along walls
      const nx = this.px + mx * speed * dt;
      if (!this.blocked(nx, this.py)) this.px = nx;
      const ny = this.py + my * speed * dt;
      if (!this.blocked(this.px, ny)) this.py = ny;
      if (mx !== 0) this.faceLeft = mx < 0;
      this.facing = facingFromVec(mx, my, this.facing);
    }
    this.animTime += dt;
    // bounds (walkable world area)
    this.px = clamp(this.px, 14, WORLD_W - 14);
    this.py = clamp(this.py, 40, WORLD_H - 14);

    // camera follows player, clamped to world edges
    this.camX = clamp(this.px - this.viewW / 2, 0, Math.max(0, WORLD_W - this.viewW));
    this.camY = clamp(this.py - this.viewH / 2, 0, Math.max(0, WORLD_H - this.viewH));

    // wanderer AI — pick a new direction periodically, stroll, pause, repeat
    for (const n of this.npcs) {
      const w = n.wander;
      if (!w) continue;
      // pause briefly if player is interacting with this wanderer
      w.timer -= dt;
      if (w.timer <= 0) {
        // 50% chance to stand still for a bit, else walk
        if (Math.random() < 0.4) {
          w.moving = false;
          w.vx = 0; w.vy = 0;
          w.timer = 1.5 + Math.random() * 2.5;
        } else {
          const ang = Math.random() * Math.PI * 2;
          w.vx = Math.cos(ang) * w.speed;
          w.vy = Math.sin(ang) * w.speed;
          w.moving = true;
          w.timer = 1.5 + Math.random() * 3;
        }
      }
      if (w.moving) {
        const nx = n.x + w.vx * dt;
        const ny = n.y + w.vy * dt;
        // stay within wander radius of home, and within walkable world
        const dHome = Math.hypot(nx - w.homeX, ny - w.homeY);
        const blockedByBuilding = this.blocked(nx, ny);
        const inBounds =
          nx > 14 && nx < WORLD_W - 14 &&
          ny > 44 && ny < WORLD_H - 18 &&
          dHome < w.radius;
        if (inBounds && !blockedByBuilding) {
          n.x = nx; n.y = ny;
        } else {
          // bump: reverse direction immediately
          w.vx = -w.vx; w.vy = -w.vy;
          w.timer = 0.4 + Math.random();
        }
        if (w.vx !== 0) n.facing = w.vx < 0 ? -1 : 1;
        w.animTime += dt;
      }
    }

    // nearest NPC within range
    let best: NpcDef | null = null;
    let bestD = INTERACT_DIST;
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - this.px, n.y - this.py);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (best !== this.nearby) {
      this.nearby = best;
      this.cb.onNearby(best);
    }

    // interact via E / Space (edge-triggered)
    const pressed = this.input.pressed("e", " ");
    if (pressed && !this.prevInteract && this.nearby) {
      this.cb.onInteract(this.nearby);
    }
    this.prevInteract = pressed;
  }

  // ---------- render ----------
  private render() {
    const ctx = this.ctx;
    const camX = Math.round(this.camX);
    const camY = Math.round(this.camY);

    // clear viewport
    ctx.fillStyle = "#1a2a1a";
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // everything below is drawn in WORLD coordinates under a camera translate
    ctx.save();
    ctx.translate(-camX, -camY);

    // visible world bounds (cull off-screen tiles)
    const x0 = camX, x1 = camX + this.viewW;
    const y0 = camY, y1 = camY + this.viewH;

    // grass — tiled texture over the visible region (fallback to flat fill)
    const grass = this.grassTile;
    if (grass && grass.complete && grass.naturalWidth > 0) {
      if (!this.grassPattern) {
        this.grassPattern = ctx.createPattern(grass, "repeat") ?? undefined;
      }
      if (this.grassPattern) {
        ctx.fillStyle = this.grassPattern;
        ctx.fillRect(x0, y0, this.viewW, this.viewH);
      }
    } else {
      ctx.fillStyle = "#3a6a3a";
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.fillStyle = "#347a34";
      const tx0 = Math.floor(x0 / 16) * 16, ty0 = Math.floor(y0 / 16) * 16;
      for (let y = ty0; y < y1; y += 16) {
        for (let x = tx0; x < x1; x += 16) {
          if (((x + y) / 16) % 2 < 1) ctx.fillRect(x, y, 16, 16);
        }
      }
    }

    // town square plaza — tiled brick texture, spanning left to right buildings
    const road = this.roadTile;
    if (road?.complete && road.naturalWidth > 0) {
      if (!this.roadPattern) {
        this.roadPattern = ctx.createPattern(road, "repeat") ?? undefined;
      }
      if (this.roadPattern) {
        ctx.fillStyle = this.roadPattern;
        // wide rectangular plaza: from left castle edge to right market/endless
        ctx.fillRect(120, 340, 1040, 230);
        // castle courtyard: brick area in front of the top-center castle
        ctx.fillRect(460, 200, 360, 140);
        // road to portal (right side)
        ctx.fillRect(1100, 340, 180, 230);
        // road to left exit
        ctx.fillRect(0, 400, 120, 120);
      }
    } else {
      ctx.fillStyle = "#9a8f7a";
      ctx.fillRect(120, 340, 1040, 230);
      ctx.fillRect(460, 200, 360, 140);
      ctx.fillRect(1100, 340, 180, 230);
      ctx.fillRect(0, 400, 120, 120);
    }

    // buildings + entities interleaved by Y for depth sorting
    // (entities behind buildings are hidden)
    const draws: { y: number; fn: () => void }[] = [];
    for (const b of this.buildings) {
      draws.push({ y: b.y + b.h, fn: () => this.drawBuilding(b) });
    }
    for (const n of this.npcs) {
      draws.push({ y: n.y, fn: () => this.drawNpc(n) });
    }
    draws.push({ y: this.py, fn: () => this.drawPlayer() });
    draws.sort((a, b) => a.y - b.y);
    for (const d of draws) d.fn();

    if (this.editorMode) {
      if (this.editorSelected?.kind === "building") {
        const b = this.buildings[this.editorSelected.index];
        ctx.strokeStyle = "#ffd24a";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
        ctx.setLineDash([]);
      } else if (this.editorSelected?.kind === "npc") {
        const n = this.npcs[this.editorSelected.index];
        const size = n.drawSize ?? 24;
        ctx.strokeStyle = "#ffd24a";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(n.x - size / 2 - 2, n.y - size / 2 - 2, size + 4, size + 4);
        ctx.setLineDash([]);
      }
    }

    // interaction prompt above nearby NPC (still world space)
    if (this.nearby) {
      const n = this.nearby;
      const bounce = Math.sin(performance.now() / 200) * 1.5;
      ctx.textAlign = "center";
      // E prompt
      ctx.font = "bold 10px monospace";
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#000";
      ctx.strokeText("E", n.x, n.y - 16 + bounce);
      ctx.fillStyle = "#ffd24a";
      ctx.fillText("E", n.x, n.y - 16 + bounce);
      // name
      ctx.font = "bold 8px monospace";
      ctx.strokeStyle = "#000";
      ctx.strokeText(n.name, n.x, n.y + 16);
      ctx.fillStyle = "#fff";
      ctx.fillText(n.name, n.x, n.y + 16);
      ctx.textAlign = "left";
    }

    // floating arrow sign near left road exit
    if (this.px < 100 && this.py > 380 && this.py < 540) {
      const t = performance.now() / 1000;
      const bounce = Math.sin(t * 3) * 3;
      const ax = 55;
      const ay = 430 + bounce;
      // arrow pointing left
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#ffd24a";
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + 14, ay - 8);
      ctx.lineTo(ax + 14, ay - 3);
      ctx.lineTo(ax + 28, ay - 3);
      ctx.lineTo(ax + 28, ay + 3);
      ctx.lineTo(ax + 14, ay + 3);
      ctx.lineTo(ax + 14, ay + 8);
      ctx.closePath();
      ctx.fill();
      // text
      ctx.globalAlpha = 0.9;
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd24a";
      ctx.fillText("WEST VILLAGE", ax + 14, ay + 16);
      ctx.textAlign = "left";
      ctx.restore();
    }

    ctx.restore();

    // minimap (screen-space, bottom-right corner)
    this.drawMinimap();
  }

  private drawMinimap() {
    const ctx = this.ctx;
    const mapW = 120;
    const mapH = Math.round(mapW * (WORLD_H / WORLD_W));
    const pad = 6;
    const mx = this.viewW - mapW - pad;
    const my = this.viewH - mapH - pad;
    const sx = mapW / WORLD_W;
    const sy = mapH / WORLD_H;

    // background
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(mx - 2, my - 2, mapW + 4, mapH + 4);
    ctx.globalAlpha = 1;

    // buildings
    for (const b of this.buildings) {
      ctx.fillStyle = "#4a4f5a";
      ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
    }

    // road/plaza
    ctx.fillStyle = "#5a5548";
    ctx.fillRect(mx + 120 * sx, my + 340 * sy, 1040 * sx, 230 * sy);
    ctx.fillRect(mx + 460 * sx, my + 200 * sy, 360 * sx, 140 * sy);

    // key NPCs (non-wanderers only)
    for (const n of this.npcs) {
      if (n.wander) continue;
      ctx.fillStyle = "#ffd24a";
      ctx.fillRect(mx + n.x * sx - 1, my + n.y * sy - 1, 3, 3);
    }

    // player
    ctx.fillStyle = "#5fff8f";
    ctx.fillRect(mx + this.px * sx - 2, my + this.py * sy - 2, 4, 4);

    // border
    ctx.strokeStyle = "#3a3a4a";
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 2, my - 2, mapW + 4, mapH + 4);

    ctx.restore();
  }

  private drawBuilding(b: Building) {
    if (b.portal) { this.drawPortal(b); return; }
    const ctx = this.ctx;
    if (b.image?.complete && b.image.naturalWidth > 0) {
      // Manor assets have transparent padding. Align the visible foundation
      // with the original collision rectangle's bottom edge.
      const drawHeight = b.drawHeight ?? b.drawSize;
      const drawX = b.x + b.w / 2 - b.drawSize / 2;
      const drawY = b.y + b.h - drawHeight * 0.86;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(b.image, drawX, drawY, b.drawSize, drawHeight);
      ctx.restore();
      this.drawBuildingLabel(b);
      return;
    }

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(b.x + 3, b.y + b.h, b.w, 5);
    // body
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // wall lines
    ctx.fillStyle = shade(b.color, -0.12);
    for (let yy = b.y + 6; yy < b.y + b.h; yy += 10) ctx.fillRect(b.x, yy, b.w, 1);
    // roof
    ctx.fillStyle = b.roof;
    ctx.beginPath();
    ctx.moveTo(b.x - 4, b.y);
    ctx.lineTo(b.x + b.w / 2, b.y - 16);
    ctx.lineTo(b.x + b.w + 4, b.y);
    ctx.closePath();
    ctx.fill();

    if (b.banner === "gate") {
      // dark archway doorway
      ctx.fillStyle = "#0a0710";
      const dw = 28, dh = 34;
      ctx.fillRect(b.x + b.w / 2 - dw / 2, b.y + b.h - dh, dw, dh);
      // torches
      ctx.fillStyle = "#ff7a2a";
      ctx.fillRect(b.x + 10, b.y + b.h - 24, 3, 6);
      ctx.fillRect(b.x + b.w - 13, b.y + b.h - 24, 3, 6);
    } else {
      // door
      ctx.fillStyle = "#3a2a1a";
      ctx.fillRect(b.x + b.w / 2 - 6, b.y + b.h - 16, 12, 16);
      // windows
      ctx.fillStyle = "#ffe9a0";
      ctx.fillRect(b.x + 8, b.y + 10, 8, 8);
      ctx.fillRect(b.x + b.w - 16, b.y + 10, 8, 8);
    }

    this.drawBuildingLabel(b);
  }

  private drawBuildingLabel(b: Building) {
    const ctx = this.ctx;
    if (b.label) {
      const fontSize = 9;
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = "center";
      // dark outline for readability
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#000";
      const labelY = b.y - 22;
      ctx.strokeText(b.label, b.x + b.w / 2, labelY);
      ctx.fillStyle = "#ffd24a";
      ctx.fillText(b.label, b.x + b.w / 2, labelY);
      ctx.textAlign = "left";
    }
  }

  private drawPortal(b: Building) {
    const ctx = this.ctx;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const t = performance.now() / 1000;

    // elliptical stone ring
    ctx.save();
    ctx.fillStyle = "#2a1a3a";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 40, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0a0515";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 32, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // portal glow (pulsing ellipse)
    const pulse = 0.6 + Math.sin(t * 2.5) * 0.2;
    ctx.save();
    ctx.globalAlpha = pulse;

    // outer glow
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
    grad.addColorStop(0, "#9a5aff");
    grad.addColorStop(0.4, "#5a3aaa");
    grad.addColorStop(1, "rgba(60,20,120,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 30, 38, 0, 0, Math.PI * 2);
    ctx.fill();

    // inner bright core
    const grad2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
    grad2.addColorStop(0, "#d4aaff");
    grad2.addColorStop(0.6, "#7a3acc");
    grad2.addColorStop(1, "rgba(80,30,160,0)");
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 14, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // swirling particles
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const a = t * 1.8 + (i / 8) * Math.PI * 2;
      const r = 14 + Math.sin(t * 3 + i) * 6;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r * 1.2;
      const alpha = 0.5 + Math.sin(t * 4 + i * 2) * 0.3;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = i % 2 === 0 ? "#c080ff" : "#60a0ff";
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // flickering light on ground
    ctx.save();
    ctx.globalAlpha = 0.15 + Math.sin(t * 3) * 0.08;
    ctx.fillStyle = "#7a3acc";
    ctx.beginPath();
    ctx.ellipse(cx, b.y + b.h + 4, 30, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.drawBuildingLabel(b);
  }

  private drawShadow(x: number, y: number, w: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.4, w * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawNpc(n: NpcDef) {
    const ctx = this.ctx;

    // static PNG sprite (e.g. king / nobleman / villagers)
    if (n.image) {
      const w = n.wander;
      const feetY = n.y + (n.drawSize ?? 28) * 0.42;

      // --- walking: directional strip frame (villagers) ---
      if (w && w.moving && n.walkImgs && (w.vx !== 0 || w.vy !== 0)) {
        const horiz = Math.abs(w.vx) > Math.abs(w.vy);
        let strip: HTMLImageElement | undefined;
        let flip = false;
        if (horiz) {
          strip = n.walkImgs.left;
          flip = w.vx > 0; // right = mirror of left
        } else if (w.vy < 0) {
          strip = n.walkImgs.up;
        } else {
          strip = n.walkImgs.down;
        }
        if (strip && strip.complete && strip.naturalWidth > 0) {
          const cellW = strip.naturalWidth / WALK_FRAMES;
          const cellH = strip.naturalHeight;
          const frame = Math.floor(w.animTime * 8) % WALK_FRAMES;
          const sx = frame * cellW;
          // keep the strip's aspect ratio; scale so height matches drawSize
          const size = n.drawSize ?? 28;
          const drawH = size;
          const drawW = drawH * (cellW / cellH);
          const drawX = Math.round(n.x - drawW / 2);
          const drawY = Math.round(feetY - WALK_BOT_FRAC * drawH);
          this.drawShadow(n.x, feetY, drawW * 0.8);
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          if (flip) {
            ctx.translate(drawX + drawW, drawY);
            ctx.scale(-1, 1);
            ctx.drawImage(strip, sx, 0, cellW, cellH, 0, 0, drawW, drawH);
          } else {
            ctx.drawImage(strip, sx, 0, cellW, cellH, drawX, drawY, drawW, drawH);
          }
          ctx.restore();
          return;
        }
        // fall through to static if strip not ready
      }

      // --- idle / static (king, nobleman, or strip not loaded) ---
      if (n.image.complete && n.image.naturalWidth > 0) {
        const size = n.drawSize ?? 28;
        // gentle idle breathing
        const bob = Math.sin(performance.now() / 600 + n.x) * 0.8;
        this.drawShadow(n.x, n.y + size * 0.42, size * 0.7);
        const dx = Math.round(n.x - size / 2);
        const dy = Math.round(n.y + size * 0.42 - IDLE_BOT_FRAC * size + bob);
        const flip = n.facing === -1;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        if (flip) {
          ctx.translate(dx + size, dy);
          ctx.scale(-1, 1);
          ctx.drawImage(n.image, 0, 0, size, size);
        } else {
          ctx.drawImage(n.image, dx, dy, size, size);
        }
        ctx.restore();
      }
      return;
    }

    const def = n.sprite;
    if (!def) return;
    const size = 24;
    this.drawShadow(n.x, n.y + size * 0.42, size);
    if (n.wander && n.wander.moving) {
      // walk cycle ~10 fps
      const frame = Math.floor(n.wander.animTime * 10);
      drawAnim(ctx, "npc_" + n.id, def, "walk",
        Math.round(n.x - size / 2), Math.round(n.y - size / 2), size, frame, n.facing === -1);
    } else {
      // idle anim ~3.3 fps, phase-shifted per NPC so they don't sync
      const frame = Math.floor((performance.now() / 300) + n.x);
      drawAnim(ctx, "npc_" + n.id, def, "idle",
        Math.round(n.x - size / 2), Math.round(n.y - size / 2), size, frame, n.facing === -1);
    }
  }

  private drawPlayer() {
    const ctx = this.ctx;
    const size = PLAYER_SIZE;
    this.drawShadow(this.px, this.py + size * 0.42, size);
    // new: directional PNG sprite (Option A). Falls back to the old
    // procedural anim until the PNGs finish loading.
    const drew = drawHeroDir(
      ctx, this.heroId, this.facing,
      Math.round(this.px - size / 2), Math.round(this.py - size / 2),
      size, this.animTime, this.moving,
    );
    if (drew) return;
    if (this.moving) {
      // walk cycle ~12 fps
      const frame = Math.floor(this.animTime * 12);
      drawAnim(ctx, "h_" + this.heroId, heroSprites[this.heroId], "walk",
        Math.round(this.px - size / 2), Math.round(this.py - size / 2), size, frame, this.faceLeft);
    } else {
      const frame = Math.floor(this.animTime * 3.5);
      drawAnim(ctx, "h_" + this.heroId, heroSprites[this.heroId], "idle",
        Math.round(this.px - size / 2), Math.round(this.py - size / 2), size, frame, this.faceLeft);
    }
  }
}

function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(Math.round(r + r * amt), 0, 255);
  g = clamp(Math.round(g + g * amt), 0, 255);
  b = clamp(Math.round(b + b * amt), 0, 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
