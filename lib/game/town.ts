import { Input } from "./input";
import { HeroId, HEROES } from "./heroes";
import { heroSprites, drawAnim } from "./sprites";
import {
  preloadHeroSprites, drawHeroDir, facingFromVec, Facing,
} from "./spriteLoader";
import {
  buildAllMaps,
  TOWN_W, TOWN_H, WORLD_W, WORLD_H,
} from "./maps";
import type {
  TownMap, NpcDef, Building, TownCallbacks, TerrainRect,
} from "./maps";

export type { NpcDef, TownAction } from "./maps";

// Screen (device) pixels per world pixel. Bigger = chunkier art, smaller view.
const PIXEL_SCALE = 3;

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
  readonly input: Input;
  private raf = 0;
  private last = 0;
  private running = false;
  private paused = false;

  // viewport size in WORLD pixels (derived from the canvas backing size / PIXEL_SCALE)
  private viewW = TOWN_W;
  private viewH = TOWN_H;

  private heroId: HeroId;
  private px = 0;
  private py = 0;
  private camX = 0;
  private camY = 0;
  private faceLeft = false;
  private facing: Facing = "down";
  private animTime = 0; // seconds, drives frame index
  private moving = false;

  private maps: Record<string, TownMap> = {};
  private currentMap!: TownMap;
  private currentMapId = "town";
  private grassTile?: HTMLImageElement;
  private grassPattern?: CanvasPattern;
  private roadTile?: HTMLImageElement;
  private roadPattern?: CanvasPattern;
  private waterTile?: HTMLImageElement;
  private waterPattern?: CanvasPattern;
  private dirtTile?: HTMLImageElement;
  private dirtPattern?: CanvasPattern;
  private grassTuftsTile?: HTMLImageElement;
  private grassTuftsPattern?: CanvasPattern;
  private grassFlowersTile?: HTMLImageElement;
  private grassFlowersPattern?: CanvasPattern;
  private grassRocksTile?: HTMLImageElement;
  private grassRocksPattern?: CanvasPattern;
  private darkGrassTile?: HTMLImageElement;
  private darkGrassPattern?: CanvasPattern;
  private lavaTile?: HTMLImageElement;
  private lavaPattern?: CanvasPattern;
  private volcanicCrackedTile?: HTMLImageElement;
  private volcanicCrackedPattern?: CanvasPattern;
  private waterAnimTime = 0; // accumulates for water/lava wave offset
  private nearby: NpcDef | null = null;
  private prevInteract = false;
  private transitionState: "none" | "fade-out" | "fade-in" = "none";
  private transitionTimer = 0;
  private transitionTarget: string | null = null;
  private transitionSpawn: { x: number; y: number } | null = null;

  private cb: TownCallbacks;

  constructor(canvas: HTMLCanvasElement, heroId: HeroId, cb: TownCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.input = new Input(canvas);
    this.heroId = heroId;
    this.cb = cb;
    this.maps = buildAllMaps();
    this.currentMap = this.maps["town"];
    this.currentMapId = "town";
    this.px = this.currentMap.spawnX;
    this.py = this.currentMap.spawnY;
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
    this.viewW = Math.min(this.currentMap?.worldW ?? WORLD_W, pxW / PIXEL_SCALE);
    this.viewH = Math.min(this.currentMap?.worldH ?? WORLD_H, pxH / PIXEL_SCALE);
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

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.last = performance.now();
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

  markEnemyDefeated(enemyId: string) {
    for (const map of Object.values(this.maps)) {
      if (!map.enemies) continue;
      for (const e of map.enemies) {
        if (e.id === enemyId) {
          e.defeated = true;
          e.respawnCooldown = e.respawnTimer;
          return;
        }
      }
    }
  }

  transitionTo(mapId: string, fromEdge: "left" | "right" | "up" | "down") {
    if (this.transitionState !== "none") return;
    const target = this.maps[mapId];
    if (!target) return;
    this.transitionTarget = mapId;
    this.transitionState = "fade-out";
    this.transitionTimer = 0;
    // spawn on the opposite edge of the new map
    switch (fromEdge) {
      case "left":
        this.transitionSpawn = { x: target.worldW - 30, y: target.spawnY };
        break;
      case "right":
        this.transitionSpawn = { x: 30, y: target.spawnY };
        break;
      case "up":
        this.transitionSpawn = { x: target.spawnX, y: target.worldH - 50 };
        break;
      case "down":
        this.transitionSpawn = { x: target.spawnX, y: 50 };
        break;
    }
  }

  private updateTransition(dt: number) {
    if (this.transitionState === "none") return;
    const FADE = 0.3;
    this.transitionTimer += dt;
    if (this.transitionState === "fade-out" && this.transitionTimer >= FADE) {
      // swap map + reposition player
      const id = this.transitionTarget!;
      this.currentMap = this.maps[id];
      this.currentMapId = id;
      // reload base tile if different map has different ground
      const newBaseTile = this.currentMap.baseTile || "/terrain/grass-tile.png";
      if (this.grassTile?.src !== newBaseTile) {
        const grass = new Image();
        grass.src = newBaseTile;
        this.grassTile = grass;
        this.grassPattern = undefined; // force re-create pattern
      }
      // preload props for new map
      if (this.currentMap.props) {
        for (const p of this.currentMap.props) {
          if (!p.image) {
            const img = new Image();
            img.src = p.asset;
            p.image = img;
          }
        }
      }
      const sp = this.transitionSpawn!;
      this.px = sp.x;
      this.py = sp.y;
      this.camX = clamp(this.px - this.viewW / 2, 0, Math.max(0, this.currentMap.worldW - this.viewW));
      this.camY = clamp(this.py - this.viewH / 2, 0, Math.max(0, this.currentMap.worldH - this.viewH));
      this.nearby = null;
      this.prevInteract = false;
      this.transitionState = "fade-in";
      this.transitionTimer = 0;
    } else if (this.transitionState === "fade-in" && this.transitionTimer >= FADE) {
      this.transitionState = "none";
      this.transitionTimer = 0;
      this.transitionTarget = null;
      this.transitionSpawn = null;
    }
  }

  private preloadBuildings() {
    for (const map of Object.values(this.maps)) {
      for (const b of map.buildings) {
        if (b.asset) {
          const img = new Image();
          img.src = b.asset;
          b.image = img;
        }
      }
    }
    const grass = new Image();
    grass.src = this.currentMap.baseTile || "/terrain/grass-tile.png";
    this.grassTile = grass;
    const road = new Image();
    road.src = "/terrain/gray-brick-road-tile.png";
    this.roadTile = road;
    const water = new Image();
    water.src = "/terrain/water-tile.png";
    this.waterTile = water;
    const dirt = new Image();
    dirt.src = "/terrain/dirt_path.png";
    this.dirtTile = dirt;
    const grassTufts = new Image();
    grassTufts.src = "/terrain/grass_tufts.png";
    this.grassTuftsTile = grassTufts;
    const grassFlowers = new Image();
    grassFlowers.src = "/terrain/grass_yellow_flowers.png";
    this.grassFlowersTile = grassFlowers;
    const grassRocks = new Image();
    grassRocks.src = "/terrain/grass_small_rocks.png";
    this.grassRocksTile = grassRocks;
    const darkGrass = new Image();
    darkGrass.src = "/terrain/dark_shadow_grass.png";
    this.darkGrassTile = darkGrass;
    const lava = new Image();
    lava.src = "/terrain/lava.png";
    this.lavaTile = lava;
    const volcanicCracked = new Image();
    volcanicCracked.src = "/terrain/volcanic_rock_cracked.png";
    this.volcanicCrackedTile = volcanicCracked;

    // Preload props
    if (this.currentMap.props) {
      for (const p of this.currentMap.props) {
        const img = new Image();
        img.src = p.asset;
        p.image = img;
      }
    }
  }

  // collision: player feet (a small box at the sprite base) vs building bodies
  private blocked(px: number, py: number): boolean {
    const r = 6;        // half-width of the player's foot box
    const footY = 6;    // feet are a bit below sprite center
    const fx = px;
    const fy = py + footY;
    for (const b of this.currentMap.buildings) {
      if (
        fx + r > b.x &&
        fx - r < b.x + b.w &&
        fy + r > b.y &&
        fy - r < b.y + b.h
      ) {
        return true;
      }
    }
    // water/lava terrain blocks the player
    const terrain = this.currentMap.terrainRects;
    if (terrain) {
      for (const t of terrain) {
        if (t.type !== "water" && t.type !== "lava") continue;
        if (
          fx + r > t.x &&
          fx - r < t.x + t.w &&
          fy + r > t.y &&
          fy - r < t.y + t.h
        ) {
          return true;
        }
      }
    }
    // props with collision (trees, etc.)
    if (this.currentMap.props) {
      for (const p of this.currentMap.props) {
        if (p.collision === false) continue; // skip non-blocking props
        // collision box is bottom half of prop (trunk area)
        const cx = p.x + p.w * 0.25;
        const cy = p.y + p.h * 0.6;
        const cw = p.w * 0.5;
        const ch = p.h * 0.35;
        if (
          fx + r > cx &&
          fx - r < cx + cw &&
          fy + r > cy &&
          fy - r < cy + ch
        ) {
          return true;
        }
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
    if (this.transitionState !== "none") {
      this.updateTransition(dt);
      return;
    }
    const dir = this.input.getMoveDir();
    let mx = dir.x, my = dir.y;
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
    this.waterAnimTime += dt;
    // bounds + edge-exit detection
    const W = this.currentMap.worldW;
    const H = this.currentMap.worldH;
    const ex = this.currentMap.exits;
    if (ex.left && this.px <= 14) {
      this.transitionTo(ex.left, "left");
      return;
    }
    if (ex.right && this.px >= W - 14) {
      this.transitionTo(ex.right, "right");
      return;
    }
    if (ex.up && this.py <= 40) {
      this.transitionTo(ex.up, "up");
      return;
    }
    if (ex.down && this.py >= H - 14) {
      this.transitionTo(ex.down, "down");
      return;
    }
    // no exit on that edge → hard clamp
    this.px = clamp(this.px, 14, W - 14);
    this.py = clamp(this.py, 40, H - 14);

    // camera follows player, clamped to world edges
    this.camX = clamp(this.px - this.viewW / 2, 0, Math.max(0, this.currentMap.worldW - this.viewW));
    this.camY = clamp(this.py - this.viewH / 2, 0, Math.max(0, this.currentMap.worldH - this.viewH));

    // wanderer AI — pick a new direction periodically, stroll, pause, repeat
    for (const n of this.currentMap.npcs) {
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
          nx > 14 && nx < this.currentMap.worldW - 14 &&
          ny > 44 && ny < this.currentMap.worldH - 18 &&
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
    for (const n of this.currentMap.npcs) {
      const d = Math.hypot(n.x - this.px, n.y - this.py);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (best !== this.nearby) {
      this.nearby = best;
      this.cb.onNearby(best);
    }

    // interact via E / Space (edge-triggered)
    const pressed = this.input.pressed("e", " ") || this.input.virtualInteract;
    if (pressed && !this.prevInteract && this.nearby) {
      this.cb.onInteract(this.nearby);
    }
    this.prevInteract = pressed;

    // overworld enemy AI
    this.updateEnemies(dt);
  }

  private updateEnemies(dt: number) {
    const enemies = this.currentMap.enemies;
    if (!enemies || enemies.length === 0) return;

    for (const e of enemies) {
      // Skip defeated enemies (handle respawn timer)
      if (e.defeated) {
        if (e.respawnTimer > 0) {
          e.respawnCooldown -= dt;
          if (e.respawnCooldown <= 0) {
            e.defeated = false;
            e.x = e.patrol.cx;
            e.y = e.patrol.cy;
            e.aggro = false;
          }
        }
        continue;
      }

      const dx = this.px - e.x;
      const dy = this.py - e.y;
      const distToPlayer = Math.hypot(dx, dy);

      // Check encounter (touch range)
      if (distToPlayer < e.touchRange) {
        e.aggro = false;
        if (this.cb.onEncounter) {
          this.cb.onEncounter(e);
        }
        return; // stop processing this frame
      }

      // Check aggro
      if (distToPlayer < e.aggroRange) {
        e.aggro = true;
      } else if (distToPlayer > e.aggroRange * 1.5) {
        e.aggro = false; // de-aggro if player moves far enough away
      }

      if (e.aggro) {
        // Chase player
        const speed = e.patrol.speed * 1.5;
        const len = distToPlayer || 1;
        e.vx = (dx / len) * speed;
        e.vy = (dy / len) * speed;
      } else {
        // Patrol: wander near home
        e.animTime -= dt;
        if (e.animTime <= 0) {
          const ang = Math.random() * Math.PI * 2;
          e.vx = Math.cos(ang) * e.patrol.speed;
          e.vy = Math.sin(ang) * e.patrol.speed;
          e.animTime = 1.5 + Math.random() * 2.5;
        }
        // Keep within patrol radius
        const homeDx = e.x - e.patrol.cx;
        const homeDy = e.y - e.patrol.cy;
        const homeDist = Math.hypot(homeDx, homeDy);
        if (homeDist > e.patrol.radius) {
          // Pull back toward home
          e.vx = -(homeDx / homeDist) * e.patrol.speed;
          e.vy = -(homeDy / homeDist) * e.patrol.speed;
        }
      }

      // Move
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // Clamp to world bounds
      e.x = Math.max(20, Math.min(this.currentMap.worldW - 20, e.x));
      e.y = Math.max(20, Math.min(this.currentMap.worldH - 20, e.y));
    }
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
      ctx.fillRect(0, 0, this.currentMap.worldW, this.currentMap.worldH);
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
        for (const p of this.currentMap.plazas) {
          ctx.fillRect(p.x, p.y, p.w, p.h);
        }
      } else {
        ctx.fillStyle = "#9a8f7a";
        for (const p of this.currentMap.plazas) {
          ctx.fillRect(p.x, p.y, p.w, p.h);
        }
      }
    } else {
      ctx.fillStyle = "#9a8f7a";
      for (const p of this.currentMap.plazas) {
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }
    }

    // painted terrain rects (brick roads + water + dirt + grass variants) — drawn over grass/plaza
    const terrain = this.currentMap.terrainRects;
    if (terrain && terrain.length) {
      for (const t of terrain) {
        let pattern: CanvasPattern | string | undefined;
        switch (t.type) {
          case "brick":
            if (!this.roadPattern && this.roadTile?.complete && this.roadTile.naturalWidth > 0) {
              this.roadPattern = ctx.createPattern(this.roadTile, "repeat") ?? undefined;
            }
            pattern = this.roadPattern ?? "#9a8f7a";
            break;
          case "water":
            if (!this.waterPattern && this.waterTile?.complete && this.waterTile.naturalWidth > 0) {
              this.waterPattern = ctx.createPattern(this.waterTile, "repeat") ?? undefined;
            }
            pattern = this.waterPattern ?? "#3a6a9a";
            break;
          case "dirt":
            if (!this.dirtPattern && this.dirtTile?.complete && this.dirtTile.naturalWidth > 0) {
              this.dirtPattern = ctx.createPattern(this.dirtTile, "repeat") ?? undefined;
            }
            pattern = this.dirtPattern ?? "#8a7040";
            break;
          case "grass_tufts":
            if (!this.grassTuftsPattern && this.grassTuftsTile?.complete && this.grassTuftsTile.naturalWidth > 0) {
              this.grassTuftsPattern = ctx.createPattern(this.grassTuftsTile, "repeat") ?? undefined;
            }
            pattern = this.grassTuftsPattern ?? "#4a8a3a";
            break;
          case "grass_flowers":
            if (!this.grassFlowersPattern && this.grassFlowersTile?.complete && this.grassFlowersTile.naturalWidth > 0) {
              this.grassFlowersPattern = ctx.createPattern(this.grassFlowersTile, "repeat") ?? undefined;
            }
            pattern = this.grassFlowersPattern ?? "#5a9a3a";
            break;
          case "grass_rocks":
            if (!this.grassRocksPattern && this.grassRocksTile?.complete && this.grassRocksTile.naturalWidth > 0) {
              this.grassRocksPattern = ctx.createPattern(this.grassRocksTile, "repeat") ?? undefined;
            }
            pattern = this.grassRocksPattern ?? "#5a7a4a";
            break;
          case "dark_grass":
            if (!this.darkGrassPattern && this.darkGrassTile?.complete && this.darkGrassTile.naturalWidth > 0) {
              this.darkGrassPattern = ctx.createPattern(this.darkGrassTile, "repeat") ?? undefined;
            }
            pattern = this.darkGrassPattern ?? "#2a4a2a";
            break;
          case "lava":
            if (!this.lavaPattern && this.lavaTile?.complete && this.lavaTile.naturalWidth > 0) {
              this.lavaPattern = ctx.createPattern(this.lavaTile, "repeat") ?? undefined;
            }
            pattern = this.lavaPattern ?? "#8a1a0a";
            break;
          case "volcanic_cracked":
            if (!this.volcanicCrackedPattern && this.volcanicCrackedTile?.complete && this.volcanicCrackedTile.naturalWidth > 0) {
              this.volcanicCrackedPattern = ctx.createPattern(this.volcanicCrackedTile, "repeat") ?? undefined;
            }
            pattern = this.volcanicCrackedPattern ?? "#3a2222";
            break;
        }
        if (pattern) {
          if (t.type === "water" && this.waterPattern) {
            // Animated water: shift pattern offset for wave effect
            const waveX = Math.sin(this.waterAnimTime * 0.8) * 6;
            const waveY = Math.cos(this.waterAnimTime * 0.6) * 4;
            ctx.save();
            ctx.fillStyle = this.waterPattern;
            ctx.translate(waveX, waveY);
            ctx.fillRect(t.x - waveX, t.y - waveY, t.w, t.h);
            ctx.restore();
            // Subtle shimmer overlay
            ctx.save();
            ctx.globalAlpha = 0.06 + 0.03 * Math.sin(this.waterAnimTime * 2.5);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(t.x, t.y, t.w, t.h);
            ctx.restore();
          } else if (t.type === "lava" && this.lavaPattern) {
            // Animated lava: faster, chaotic bubble shift
            const lavaX = Math.sin(this.waterAnimTime * 1.4) * 4 + Math.sin(this.waterAnimTime * 3.2) * 2;
            const lavaY = Math.cos(this.waterAnimTime * 1.1) * 3 + Math.cos(this.waterAnimTime * 2.6) * 2;
            ctx.save();
            ctx.fillStyle = this.lavaPattern;
            ctx.translate(lavaX, lavaY);
            ctx.fillRect(t.x - lavaX, t.y - lavaY, t.w, t.h);
            ctx.restore();
            // Orange glow pulse
            ctx.save();
            ctx.globalAlpha = 0.05 + 0.04 * Math.sin(this.waterAnimTime * 3.0);
            ctx.fillStyle = "#ff6a1a";
            ctx.fillRect(t.x, t.y, t.w, t.h);
            ctx.restore();
          } else {
            ctx.fillStyle = pattern;
            ctx.fillRect(t.x, t.y, t.w, t.h);
          }
        }
      }
    }

    // buildings + entities + props + enemies interleaved by Y for depth sorting
    const draws: { y: number; fn: () => void }[] = [];
    for (const b of this.currentMap.buildings) {
      draws.push({ y: b.y + b.h, fn: () => this.drawBuilding(b) });
    }
    // props (trees, lake, etc.)
    if (this.currentMap.props) {
      for (const p of this.currentMap.props) {
        if (p.image?.complete && p.image.naturalWidth > 0) {
          draws.push({ y: p.y + p.h, fn: () => {
            ctx.drawImage(p.image!, p.x, p.y, p.w, p.h);
          }});
        }
      }
    }
    // overworld enemies
    if (this.currentMap.enemies) {
      for (const e of this.currentMap.enemies) {
        if (e.defeated) continue;
        draws.push({ y: e.y, fn: () => this.drawOverworldEnemy(e) });
      }
    }
    for (const n of this.currentMap.npcs) {
      draws.push({ y: n.y, fn: () => this.drawNpc(n) });
    }
    draws.push({ y: this.py, fn: () => this.drawPlayer() });
    draws.sort((a, b) => a.y - b.y);
    for (const d of draws) d.fn();

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

    // floating arrow sign near left road exit (only when a left exit exists)
    if (this.currentMap.exits.left && this.currentMapId === "town" && this.px < 100 && this.py > 380 && this.py < 540) {
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

    // east-exit arrow (West Village → Town) — only on the west_village map
    if (this.currentMapId === "west_village" && this.px > this.currentMap.worldW - 100 && this.py > 340 && this.py < 540) {
      const t = performance.now() / 1000;
      const bounce = Math.sin(t * 3) * 3;
      const W = this.currentMap.worldW;
      const ax = W - 55;
      const ay = 430 + bounce;
      // arrow pointing right
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#ffd24a";
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 14, ay - 8);
      ctx.lineTo(ax - 14, ay - 3);
      ctx.lineTo(ax - 28, ay - 3);
      ctx.lineTo(ax - 28, ay + 3);
      ctx.lineTo(ax - 14, ay + 3);
      ctx.lineTo(ax - 14, ay + 8);
      ctx.closePath();
      ctx.fill();
      // text
      ctx.globalAlpha = 0.9;
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd24a";
      ctx.fillText("TOWN", ax - 14, ay + 16);
      ctx.textAlign = "left";
      ctx.restore();
    }

    ctx.restore();

    // minimap (screen-space, bottom-right corner)
    this.drawMinimap();

    // transition fade overlay (screen-space, drawn after camera restore + minimap)
    if (this.transitionState !== "none") {
      const FADE = 0.3;
      const t = Math.min(1, this.transitionTimer / FADE);
      const alpha = this.transitionState === "fade-out" ? t : 1 - t;
      this.ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      this.ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
  }

  private drawMinimap() {
    const ctx = this.ctx;
    const mapW = 120;
    const W = this.currentMap.worldW;
    const H = this.currentMap.worldH;
    const mapH = Math.round(mapW * (H / W));
    const pad = 6;
    const mx = this.viewW - mapW - pad;
    const my = this.viewH - mapH - pad;
    const sx = mapW / W;
    const sy = mapH / H;

    // background
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(mx - 2, my - 2, mapW + 4, mapH + 4);
    ctx.globalAlpha = 1;

    // buildings
    for (const b of this.currentMap.buildings) {
      ctx.fillStyle = "#4a4f5a";
      ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
    }

    // road/plaza
    ctx.fillStyle = "#5a5548";
    for (const p of this.currentMap.plazas) {
      ctx.fillRect(mx + p.x * sx, my + p.y * sy, p.w * sx, p.h * sy);
    }

    // key NPCs (non-wanderers only)
    for (const n of this.currentMap.npcs) {
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

  private drawOverworldEnemy(e: import("./maps/types").OverworldEnemy) {
    const ctx = this.ctx;
    const size = 18;

    // Body — simple pixel monster shape
    const color = e.monsterKind === "fire_elemental" ? "#ff6a1a" : "#ff3a3a";
    const darkColor = e.monsterKind === "fire_elemental" ? "#cc4a00" : "#aa1a1a";

    // Shadow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + size * 0.4, size * 0.5, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Body (bobbing)
    const bob = Math.sin(performance.now() * 0.004 + e.x) * 2;
    ctx.fillStyle = darkColor;
    ctx.fillRect(e.x - size * 0.4, e.y - size * 0.7 + bob, size * 0.8, size * 0.7);
    ctx.fillStyle = color;
    ctx.fillRect(e.x - size * 0.35, e.y - size * 0.65 + bob, size * 0.7, size * 0.55);

    // Eyes (white dots)
    ctx.fillStyle = "#fff";
    ctx.fillRect(e.x - 4, e.y - size * 0.5 + bob, 3, 3);
    ctx.fillRect(e.x + 2, e.y - size * 0.5 + bob, 3, 3);

    // Aggro indicator (red !)
    if (e.aggro) {
      ctx.fillStyle = "#ff0000";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "center";
      ctx.fillText("!", e.x, e.y - size - 2 + bob);
    }

    // Glow effect for fire elemental
    if (e.monsterKind === "fire_elemental") {
      ctx.globalAlpha = 0.15 + 0.1 * Math.sin(performance.now() * 0.005);
      ctx.fillStyle = "#ff8a2a";
      ctx.beginPath();
      ctx.arc(e.x, e.y - size * 0.3 + bob, size * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
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
