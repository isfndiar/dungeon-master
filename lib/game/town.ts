import { Input } from "./input";
import { HeroId, HEROES } from "./heroes";
import { heroSprites, drawAnim, SpriteDef } from "./sprites";
import { generateCharacter, GenOptions } from "./pixelgen";
import {
  preloadHeroSprites, drawHeroDir, facingFromVec, Facing,
} from "./spriteLoader";

export const TOWN_W = 480;
export const TOWN_H = 270;

// Which interaction an NPC triggers (handled by the React layer).
export type TownAction = "dungeon" | "equipment" | "heroes" | "talk" | "shop";

export interface NpcDef {
  id: string;
  name: string;
  gen: GenOptions;      // procedural-character bias for this NPC
  x: number; y: number; // world position (sprite center)
  action: TownAction;
  lines: string[];      // dialog lines
  facing?: 1 | -1;
  sprite?: SpriteDef;   // baked procedural sprite (filled at build)
}

interface Building {
  x: number; y: number; w: number; h: number;
  color: string; roof: string;
  label?: string;
  banner?: string;
}

export interface TownCallbacks {
  onNearby: (npc: NpcDef | null) => void;
  onInteract: (npc: NpcDef) => void;
}

const PLAYER_SIZE = 18;
const INTERACT_DIST = 30;

export class TownEngine {
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  private raf = 0;
  private last = 0;
  private running = false;
  private paused = false;

  private heroId: HeroId;
  private px = TOWN_W / 2;
  private py = TOWN_H - 18;
  private faceLeft = false;
  private facing: Facing = "down";
  private animTime = 0; // seconds, drives frame index
  private moving = false;

  private npcs: NpcDef[] = [];
  private buildings: Building[] = [];
  private nearby: NpcDef | null = null;
  private prevInteract = false;

  private cb: TownCallbacks;

  constructor(canvas: HTMLCanvasElement, heroId: HeroId, cb: TownCallbacks) {
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.input = new Input(canvas);
    this.heroId = heroId;
    this.cb = cb;
    this.buildLayout();
    preloadHeroSprites();
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

  private buildLayout() {
    // Buildings (decorative + landmarks)
    this.buildings = [
      // Castle (top center)
      { x: 180, y: 22, w: 120, h: 60, color: "#6a6f7a", roof: "#4a4f59", label: "CASTLE" },
      // Blacksmith (left)
      { x: 40, y: 70, w: 70, h: 48, color: "#7a5a3a", roof: "#5a3a1a", label: "SMITHY" },
      // Shop / market (right)
      { x: 372, y: 70, w: 70, h: 48, color: "#5a6a8a", roof: "#3a4a6a", label: "MARKET" },
      // Dungeon gate (bottom center) - dark ominous arch
      { x: 196, y: 184, w: 88, h: 46, color: "#2a2230", roof: "#1a141f", label: "DUNGEON GATE", banner: "gate" },
    ];

    // NPCs — each carries a procedural-character bias (gen) that the generator
    // turns into a unique pixel sprite.
    this.npcs = [
      {
        id: "king", name: "King Aldric",
        gen: { headgear: "crown", cloth: "#7a1f2a", trim: "#ffd24a", hair: "#e8e8ec", beard: true },
        x: 240, y: 96, action: "talk", facing: 1,
        lines: [
          "Welcome back, brave hunter.",
          "The dungeons grow restless once more.",
          "Slay their masters and the kingdom shall reward you.",
        ],
      },
      {
        id: "captain", name: "Captain Mara",
        gen: { headgear: "helmet", cloth: "#caa23a", trim: "#7a1f2a", hair: "#6a4a22" },
        x: 300, y: 120, action: "heroes", facing: -1,
        lines: [
          "Choose your champion wisely, hunter.",
          "Each hero fights differently.",
        ],
      },
      {
        id: "blacksmith", name: "Borin the Smith",
        gen: { cloth: "#6a4a2a", trim: "#9aa3b5", hair: "#3a2a1a", beard: true, headgear: "none" },
        x: 75, y: 128, action: "equipment", facing: 1,
        lines: [
          "Bring me loot from the depths!",
          "Let's see what gear suits you.",
        ],
      },
      {
        id: "merchant", name: "Merchant Pell",
        gen: { headgear: "hat", cloth: "#6a3fb0", trim: "#ffd24a", hair: "#3a2a1a" },
        x: 407, y: 128, action: "talk", facing: -1,
        lines: [
          "Goods from afar! ...well, soon.",
          "Gold burns a hole in your pocket, eh?",
        ],
      },
      {
        id: "guard", name: "Gate Guard",
        gen: { headgear: "helmet", cloth: "#4a4a55", trim: "#3a4f8a", hair: "#4a3018" },
        x: 240, y: 232, action: "dungeon", facing: 1,
        lines: [
          "The dungeon gate lies beyond.",
          "Pick your destination, and may fortune favor you.",
        ],
      },
      {
        id: "villager1", name: "Villager",
        gen: { cloth: "#2f6a3a", trim: "#b8863a", hair: "#caa24a" },
        x: 120, y: 180, action: "talk", facing: 1,
        lines: ["Lovely day, isn't it?", "Heard the crypt is haunted... brr."],
      },
      {
        id: "villager2", name: "Villager",
        gen: { cloth: "#8a3a6a", trim: "#e8e8ec", hair: "#4a3018", headgear: "none" },
        x: 360, y: 180, action: "talk", facing: -1,
        lines: ["Be careful out there!", "My cousin went to the volcano. Never came back."],
      },
    ];

    // bake a unique procedural sprite for each NPC (seeded by its id)
    for (const n of this.npcs) {
      n.sprite = generateCharacter(n.id, n.gen);
    }
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
    let mx = 0, my = 0;
    if (this.input.pressed("a", "arrowleft")) mx -= 1;
    if (this.input.pressed("d", "arrowright")) mx += 1;
    if (this.input.pressed("w", "arrowup")) my -= 1;
    if (this.input.pressed("s", "arrowdown")) my += 1;
    const len = Math.hypot(mx, my);
    this.moving = len > 0;
    if (len > 0) {
      mx /= len; my /= len;
      const speed = 95;
      // axis-separated movement so we can slide along walls
      const nx = this.px + mx * speed * dt;
      if (!this.blocked(nx, this.py)) this.px = nx;
      const ny = this.py + my * speed * dt;
      if (!this.blocked(this.px, ny)) this.py = ny;
      if (mx !== 0) this.faceLeft = mx < 0;
      this.facing = facingFromVec(mx, my, this.facing);
    }
    this.animTime += dt;
    // bounds (walkable area)
    this.px = clamp(this.px, 14, TOWN_W - 14);
    this.py = clamp(this.py, 86, TOWN_H - 14);

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
    // grass
    ctx.fillStyle = "#3a6a3a";
    ctx.fillRect(0, 0, TOWN_W, TOWN_H);
    // grass texture
    ctx.fillStyle = "#347a34";
    for (let y = 0; y < TOWN_H; y += 16) {
      for (let x = 0; x < TOWN_W; x += 16) {
        if (((x + y) / 16) % 2 < 1) ctx.fillRect(x, y, 16, 16);
      }
    }

    // main stone path (vertical, castle -> gate) and horizontal cross
    ctx.fillStyle = "#9a8f7a";
    ctx.fillRect(TOWN_W / 2 - 16, 70, 32, TOWN_H - 80);
    ctx.fillRect(40, 130, TOWN_W - 80, 24);
    // path cobble detail
    ctx.fillStyle = "#8a7f6a";
    for (let y = 74; y < TOWN_H - 14; y += 12) ctx.fillRect(TOWN_W / 2 - 14, y, 28, 5);

    // buildings (draw back-to-front by y)
    for (const b of this.buildings) this.drawBuilding(b);

    // entities (NPCs + player) sorted by y for overlap
    const draws: { y: number; fn: () => void }[] = [];
    for (const n of this.npcs) {
      draws.push({ y: n.y, fn: () => this.drawNpc(n) });
    }
    draws.push({ y: this.py, fn: () => this.drawPlayer() });
    draws.sort((a, b) => a.y - b.y);
    for (const d of draws) d.fn();

    // interaction prompt above nearby NPC
    if (this.nearby) {
      const n = this.nearby;
      const bounce = Math.sin(performance.now() / 200) * 1.5;
      ctx.fillStyle = "#ffd24a";
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.fillText("E", n.x, n.y - 16 + bounce);
      ctx.fillStyle = "#fff";
      ctx.fillText(n.name, n.x, n.y + 16);
      ctx.textAlign = "left";
    }
  }

  private drawBuilding(b: Building) {
    const ctx = this.ctx;
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

    // label
    if (b.label) {
      ctx.fillStyle = "#000";
      ctx.font = "6px monospace";
      ctx.textAlign = "center";
      ctx.fillText(b.label, b.x + b.w / 2 + 1, b.y - 18 + 1);
      ctx.fillStyle = "#ffd24a";
      ctx.fillText(b.label, b.x + b.w / 2, b.y - 18);
      ctx.textAlign = "left";
    }
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
    const def = n.sprite;
    if (!def) return;
    const size = 18;
    // idle anim ~3.3 fps, phase-shifted per NPC so they don't sync
    const frame = Math.floor((performance.now() / 300) + n.x);
    this.drawShadow(n.x, n.y + size * 0.42, size);
    drawAnim(ctx, "npc_" + n.id, def, "idle",
      Math.round(n.x - size / 2), Math.round(n.y - size / 2), size, frame, n.facing === -1);
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
