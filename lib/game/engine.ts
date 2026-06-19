import { Input } from "./input";
import {
  HEROES, HeroId, HeroDef, hpForLevel, dmgForLevel, SkillDef, SkillKind,
} from "./heroes";
import {
  MONSTERS, BOSSES, MonsterDef, BossDef, MonsterKind,
} from "./monsters";
import { DUNGEONS, DungeonId, DungeonDef } from "./dungeons";
import {
  heroSprites, monsterSprites, bossSprites, fxSprites, drawSprite, drawAnim, SpriteDef,
} from "./sprites";
import {
  generateMap, DungeonMap, RoomNode, Dir, DIRS, OPPOSITE, DELTA,
} from "./map";
import { Item, rollItem, rollRarity, ItemStats } from "./items";
import {
  preloadHeroSprites, drawHeroDir, facingFromVec, Facing,
  drawMageFireball,
} from "./spriteLoader";

export const VIEW_W = 480;
export const VIEW_H = 270;
const RENDER_SCALE = 2;

// Play field inset (walls border)
const WALL = 16;
const FIELD = { x: WALL, y: WALL, w: VIEW_W - WALL * 2, h: VIEW_H - WALL * 2 };

// Door opening half-width (gap in the wall, centered on each side)
const DOOR_HALF = 22;

// Center point of a door opening on a given side of the field.
function doorCenter(dir: Dir): { x: number; y: number } {
  const cx = VIEW_W / 2, cy = VIEW_H / 2;
  switch (dir) {
    case "n": return { x: cx, y: WALL };
    case "s": return { x: cx, y: VIEW_H - WALL };
    case "w": return { x: WALL, y: cy };
    case "e": return { x: VIEW_W - WALL, y: cy };
  }
}

type Phase = "intro" | "playing" | "cleared" | "win" | "lose";

interface Vec { x: number; y: number; }

interface Projectile {
  x: number; y: number;
  vx: number; vy: number;
  dmg: number;
  from: "player" | "enemy";
  kind: "fireball" | "arrow" | "bolt";
  life: number;
  radius: number;
  pierce?: boolean;
  hitSet?: Set<Enemy>;
  big?: boolean;
}

interface Enemy {
  x: number; y: number;
  hp: number; maxHp: number;
  dmg: number; speed: number;
  ranged: boolean; projectile?: "bolt" | "fireball";
  atkTimer: number; atkCooldown: number;
  size: number;
  sprite: SpriteDef; spriteKey: string;
  gold: number; xp: number;
  isBoss: boolean;
  hitFlash: number;
  faceLeft: boolean;
  bob: number;
  frozen: number; // seconds remaining of frozen/slow
}

interface FloatText { x: number; y: number; text: string; life: number; color: string; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; }

export interface RaidResult {
  win: boolean;
  goldGained: number;
  xpGained: number;
  monstersKilled: number;
  loot: Item[];
}

export interface EngineCallbacks {
  onEnd: (result: RaidResult) => void;
  onHud: (hud: HudState) => void;
}

export interface SkillHud {
  key: string;
  name: string;
  ready: boolean;
  cdPct: number; // 0..1 progress to ready
  active: boolean; // buff currently active
}

export interface MiniRoom {
  gx: number; gy: number;
  visited: boolean; cleared: boolean;
  isStart: boolean; isBoss: boolean;
  current: boolean;
  doors: { n: boolean; e: boolean; s: boolean; w: boolean };
}

export interface MiniMap {
  rooms: MiniRoom[];
  minX: number; minY: number;
  gridW: number; gridH: number;
}

export interface HudState {
  phase: Phase;
  heroName: string;
  hp: number; maxHp: number;
  skills: SkillHud[];
  roomsCleared: number; totalRooms: number;
  bossFound: boolean;
  enemiesLeft: number;
  dungeonName: string;
  minimap: MiniMap;
  bossName?: string; bossHp?: number; bossMax?: number;
  goldGained: number; xpGained: number;
  monstersKilled: number;
}

export class Engine {
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  private raf = 0;
  private last = 0;
  private running = false;
  private paused = false;

  private hero: HeroDef;
  private heroLevel: number;
  private dungeon: DungeonDef;

  // player state
  private px = VIEW_W / 2;
  private py = VIEW_H / 2;
  private phpMax: number;
  private php: number;
  private pdmg: number;
  private atkTimer = 0;
  private skillTimers = [0, 0, 0]; // Q, E, R cooldown remaining
  private faceLeft = false;
  private facing: Facing = "down";
  private aimX = 1; private aimY = 0;
  // attack animation
  private atkAnim = 0;       // 0..1 progress of current swing (1=just started)
  private atkAnimDur = 0;    // duration of the swing animation
  private atkAimX = 1; private atkAimY = 0; // locked aim at swing start
  private invuln = 0;
  private shield = 0; // tank skill temp shield
  private healOverTime = 0; // priest heal remaining seconds
  private walkBob = 0;
  private animTime = 0;   // drives walk/idle frame index
  private moving = false; // moved this frame
  // buffs
  private dmgBuff = 0;      // seconds remaining of damage buff
  private dmgBuffMult = 1;  // multiplier while active
  private speedBuff = 0;    // seconds remaining of speed buff
  private speedBuffMult = 1;
  private rapidFire = 0;    // seconds remaining of attack-speed buff
  private healZoneTime = 0; // sanctuary remaining
  private healZoneX = 0; private healZoneY = 0;

  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private floats: FloatText[] = [];
  private particles: Particle[] = [];

  private phase: Phase = "intro";
  private map!: DungeonMap;
  private curRoom!: RoomNode;        // room player is currently in
  private roomsCleared = 0;          // count of cleared combat rooms
  private transition = 0;            // door transition fade timer (>0 = transitioning)
  private clearedTimer = 0;
  private introTimer = 1.2;

  private goldGained = 0;
  private xpGained = 0;
  private monstersKilled = 0;
  private ended = false;
  private loot: Item[] = [];

  // equipment-derived stats
  private heroId: HeroId;
  private bonusCdr = 0;   // cooldown reduction fraction
  private bonusSpeed = 0; // flat extra move speed
  private bonusCrit = 0;  // crit chance fraction

  private cb: EngineCallbacks;

  constructor(
    canvas: HTMLCanvasElement,
    heroId: HeroId,
    heroLevel: number,
    dungeonId: DungeonId,
    cb: EngineCallbacks,
    bonus?: ItemStats
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.scale(RENDER_SCALE, RENDER_SCALE);
    this.input = new Input(canvas);
    this.hero = HEROES[heroId];
    this.heroId = heroId;
    this.heroLevel = heroLevel;
    this.dungeon = DUNGEONS[dungeonId];
    this.cb = cb;
    preloadHeroSprites();

    this.phpMax = hpForLevel(this.hero, heroLevel) + (bonus?.hp ?? 0);
    this.php = this.phpMax;
    this.pdmg = dmgForLevel(this.hero, heroLevel) + (bonus?.dmg ?? 0);
    this.bonusCdr = Math.min(bonus?.cdr ?? 0, 0.6);
    this.bonusSpeed = bonus?.speed ?? 0;
    this.bonusCrit = Math.min(bonus?.crit ?? 0, 0.75);

    // total rooms = combat rooms + start + boss
    const total = this.dungeon.rooms + 2;
    this.map = generateMap(total);
    this.curRoom = this.map.rooms.find((r) => r.id === this.map.startId)!;
  }

  setScale(scale: number) {
    this.input.setScale(scale);
  }

  start() {
    this.running = true;
    this.last = performance.now();
    this.px = VIEW_W / 2;
    this.py = VIEW_H / 2;
    this.enterRoom(this.curRoom, null);
    this.phase = "intro";
    this.loop(this.last);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (!p) this.last = performance.now();
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.destroy();
  }

  // ---------- room navigation ----------

  // Enter a room. `fromDir` is the door of the NEW room we came through
  // (so the player appears just inside that door). null = start spawn.
  private enterRoom(room: RoomNode, fromDir: Dir | null) {
    this.curRoom = room;
    room.visited = true;
    this.enemies = [];
    this.projectiles = [];

    // place the player just inside the door they entered from
    if (fromDir) {
      const c = doorCenter(fromDir);
      const inset = 26;
      const { dx, dy } = DELTA[fromDir];
      // fromDir is the side we entered; move inward (opposite of that side)
      this.px = clamp(c.x - dx * inset, FIELD.x + 10, FIELD.x + FIELD.w - 10);
      this.py = clamp(c.y - dy * inset, FIELD.y + 10, FIELD.y + FIELD.h - 10);
    }

    // spawn enemies if room not yet cleared
    if (!room.cleared) {
      if (room.isBoss) {
        this.spawnBoss();
      } else {
        // difficulty scales with depth into the dungeon
        const count = this.dungeon.baseSpawns + Math.round(this.dungeon.spawnGrowth * room.depth * 0.6);
        for (let i = 0; i < count; i++) this.spawnMonster(this.pickMonster());
      }
    }
  }

  private pickMonster(): MonsterKind {
    const pool = this.dungeon.monsters;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private edgePos(): Vec {
    // spawn at random edge of field, away from player
    let x = 0, y = 0;
    for (let tries = 0; tries < 10; tries++) {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { x = FIELD.x + 8; y = rand(FIELD.y, FIELD.y + FIELD.h); }
      else if (side === 1) { x = FIELD.x + FIELD.w - 8; y = rand(FIELD.y, FIELD.y + FIELD.h); }
      else if (side === 2) { x = rand(FIELD.x, FIELD.x + FIELD.w); y = FIELD.y + 8; }
      else { x = rand(FIELD.x, FIELD.x + FIELD.w); y = FIELD.y + FIELD.h - 8; }
      if (dist(x, y, this.px, this.py) > 90) break;
    }
    return { x, y };
  }

  private spawnMonster(kind: MonsterKind) {
    const def: MonsterDef = MONSTERS[kind];
    const d = this.dungeon.difficulty;
    const p = this.edgePos();
    this.enemies.push({
      x: p.x, y: p.y,
      hp: Math.round(def.hp * d), maxHp: Math.round(def.hp * d),
      dmg: Math.round(def.dmg * d), speed: def.speed,
      ranged: def.ranged, projectile: def.projectile,
      atkTimer: rand(0, def.attackCooldown), atkCooldown: def.attackCooldown,
      size: def.size,
      sprite: monsterSprites[kind], spriteKey: "m_" + kind,
      gold: def.gold, xp: def.xp,
      isBoss: false, hitFlash: 0, faceLeft: false, bob: rand(0, Math.PI * 2), frozen: 0,
    });
  }

  private spawnBoss() {
    const def: BossDef = BOSSES[this.dungeon.boss];
    const d = this.dungeon.difficulty;
    this.enemies.push({
      x: VIEW_W / 2, y: FIELD.y + 40,
      hp: Math.round(def.hp * d), maxHp: Math.round(def.hp * d),
      dmg: Math.round(def.dmg * d), speed: def.speed,
      ranged: def.ranged, projectile: def.projectile,
      atkTimer: 1, atkCooldown: def.attackCooldown,
      size: def.size,
      sprite: bossSprites[def.kind], spriteKey: "b_" + def.kind,
      gold: def.gold, xp: def.xp,
      isBoss: true, hitFlash: 0, faceLeft: false, bob: 0, frozen: 0,
    });
  }

  // ---------- main loop ----------
  private loop = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05; // clamp
    if (!this.paused) {
      this.update(dt);
    }
    this.render();
    this.emitHud();
  };

  private update(dt: number) {
    if (this.phase === "intro") {
      this.introTimer -= dt;
      if (this.introTimer <= 0) this.phase = "playing";
      this.updateAimFromInput();
      return;
    }
    if (this.phase === "win" || this.phase === "lose") return;

    // door transition fade
    if (this.transition > 0) {
      this.transition -= dt;
    }

    this.updateAimFromInput();
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateFx(dt);

    // newly cleared this frame?
    if (!this.curRoom.cleared && this.enemies.length === 0) {
      this.curRoom.cleared = true;
      this.roomsCleared++;
      if (this.curRoom.isBoss) {
        this.endRaid(true);
        return;
      }
      this.clearedTimer = 0;
    }
    if (!this.curRoom.cleared) this.clearedTimer = 0;
    else this.clearedTimer += dt;

    // door transitions (only when room cleared and not mid-transition)
    if (this.curRoom.cleared && this.transition <= 0) {
      this.checkDoorTransition();
    }

    if (this.php <= 0) {
      this.endRaid(false);
    }
  }

  // If player walks into an open door, move to the connected room.
  private checkDoorTransition() {
    for (const d of DIRS) {
      if (!this.curRoom.doors[d]) continue;
      const c = doorCenter(d);
      // is player on/over the door opening?
      let onDoor = false;
      if (d === "n" && this.py <= FIELD.y + 6 && Math.abs(this.px - c.x) < DOOR_HALF) onDoor = true;
      if (d === "s" && this.py >= FIELD.y + FIELD.h - 6 && Math.abs(this.px - c.x) < DOOR_HALF) onDoor = true;
      if (d === "w" && this.px <= FIELD.x + 6 && Math.abs(this.py - c.y) < DOOR_HALF) onDoor = true;
      if (d === "e" && this.px >= FIELD.x + FIELD.w - 6 && Math.abs(this.py - c.y) < DOOR_HALF) onDoor = true;
      if (onDoor) {
        const nb = this.map.rooms.find((r) => r.id === this.curRoom.neighbors[d]);
        if (nb) {
          this.transition = 0.35;
          // we enter the neighbor through its OPPOSITE-side door
          this.enterRoom(nb, OPPOSITE[d]);
          return;
        }
      }
    }
  }

  // Keep player inside the room. When the room is cleared, the player may
  // step slightly into an open doorway (which triggers the transition).
  private clampToRoom() {
    const open = this.curRoom.cleared;
    const cN = doorCenter("n"), cS = doorCenter("s"), cW = doorCenter("w"), cE = doorCenter("e");

    // left / right walls
    if (this.px < FIELD.x + 8) {
      const atDoor = open && this.curRoom.doors.w && Math.abs(this.py - cW.y) < DOOR_HALF;
      if (!atDoor) this.px = FIELD.x + 8;
      else this.px = Math.max(this.px, FIELD.x - 6);
    }
    if (this.px > FIELD.x + FIELD.w - 8) {
      const atDoor = open && this.curRoom.doors.e && Math.abs(this.py - cE.y) < DOOR_HALF;
      if (!atDoor) this.px = FIELD.x + FIELD.w - 8;
      else this.px = Math.min(this.px, FIELD.x + FIELD.w + 6);
    }
    // top / bottom walls
    if (this.py < FIELD.y + 8) {
      const atDoor = open && this.curRoom.doors.n && Math.abs(this.px - cN.x) < DOOR_HALF;
      if (!atDoor) this.py = FIELD.y + 8;
      else this.py = Math.max(this.py, FIELD.y - 6);
    }
    if (this.py > FIELD.y + FIELD.h - 8) {
      const atDoor = open && this.curRoom.doors.s && Math.abs(this.px - cS.x) < DOOR_HALF;
      if (!atDoor) this.py = FIELD.y + FIELD.h - 8;
      else this.py = Math.min(this.py, FIELD.y + FIELD.h + 6);
    }
  }

  private updateAimFromInput() {
    const dx = this.input.mouseX - this.px;
    const dy = this.input.mouseY - this.py;
    const len = Math.hypot(dx, dy);
    if (len > 4) {
      this.aimX = dx / len;
      this.aimY = dy / len;
      this.faceLeft = this.aimX < 0;
      this.facing = facingFromVec(this.aimX, this.aimY, this.facing);
    }
  }

  private updatePlayer(dt: number) {
    let mx = 0, my = 0;
    if (this.input.pressed("a", "arrowleft")) mx -= 1;
    if (this.input.pressed("d", "arrowright")) mx += 1;
    if (this.input.pressed("w", "arrowup")) my -= 1;
    if (this.input.pressed("s", "arrowdown")) my += 1;
    const len = Math.hypot(mx, my);
    const moveSpeed = (this.hero.speed + this.bonusSpeed) * (this.speedBuff > 0 ? this.speedBuffMult : 1);
    this.moving = len > 0;
    this.animTime += dt;
    if (len > 0) {
      mx /= len; my /= len;
      this.px += mx * moveSpeed * dt;
      this.py += my * moveSpeed * dt;
      this.walkBob += dt * 10;
      if (mx !== 0 && this.input.mouseX === 0 && this.input.mouseY === 0) {
        this.faceLeft = mx < 0;
      }
    }
    // clamp to field, but allow stepping into open doors when room is cleared
    this.clampToRoom();

    // timers
    if (this.atkTimer > 0) this.atkTimer -= dt;
    if (this.atkAnim > 0) this.atkAnim = Math.max(0, this.atkAnim - dt / this.atkAnimDur);
    for (let i = 0; i < 3; i++) if (this.skillTimers[i] > 0) this.skillTimers[i] -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.shield > 0) this.shield -= dt;
    if (this.dmgBuff > 0) this.dmgBuff -= dt;
    if (this.speedBuff > 0) this.speedBuff -= dt;
    if (this.rapidFire > 0) this.rapidFire -= dt;
    if (this.healOverTime > 0) {
      this.healOverTime -= dt;
      this.php = Math.min(this.phpMax, this.php + 14 * dt);
    }
    if (this.healZoneTime > 0) {
      this.healZoneTime -= dt;
      if (dist(this.px, this.py, this.healZoneX, this.healZoneY) < 46) {
        this.php = Math.min(this.phpMax, this.php + 30 * dt);
      }
    }

    // basic attack (rapid fire + CDR shorten cooldown)
    const cdrMult = 1 - this.bonusCdr;
    const atkCd = this.hero.attackCooldown * (this.rapidFire > 0 ? 0.35 : 1) * cdrMult;
    if ((this.input.mouseDown || this.input.pressed(" ")) && this.atkTimer <= 0 && this.phase === "playing") {
      this.doBasicAttack();
      this.atkTimer = atkCd;
    }
    // skills on 1 / 2 / 3
    const keys: ("1" | "2" | "3")[] = ["1", "2", "3"];
    for (let i = 0; i < 3; i++) {
      if (this.input.pressed(keys[i]) && this.skillTimers[i] <= 0 && this.phase === "playing") {
        this.doSkill(this.hero.skills[i].kind);
        this.skillTimers[i] = this.hero.skills[i].cooldown * cdrMult;
      }
    }
  }

  private curDmg(): number {
    return this.pdmg * (this.dmgBuff > 0 ? this.dmgBuffMult : 1);
  }

  private doBasicAttack() {
    // lock aim + start swing animation
    this.atkAimX = this.aimX;
    this.atkAimY = this.aimY;
    this.atkAnim = 1;
    this.atkAnimDur = this.hero.id === "priest"
      ? 0.42
      : this.hero.attackKind === "ranged" ? 0.18 : 0.22;
    if (this.hero.attackKind === "ranged") {
      this.fireProjectile(this.aimX, this.aimY, this.curDmg(), this.hero.projectile!);
    } else {
      this.meleeArc(this.hero.attackRange, this.curDmg());
      if (this.hero.id !== "priest") this.spawnSlash();
    }
  }

  private meleeArc(reach: number, dmg: number) {
    for (const e of this.enemies) {
      const dx = e.x - this.px, dy = e.y - this.py;
      const d = Math.hypot(dx, dy);
      if (d < reach + e.size * 0.4) {
        const dot = (dx / (d || 1)) * this.aimX + (dy / (d || 1)) * this.aimY;
        if (dot > 0.1 || d < 18) this.damageEnemy(e, dmg);
      }
    }
  }

  private doSkill(k: SkillKind) {
    const dmg = this.curDmg();
    switch (k) {
      // ---- Knight ----
      case "charge": {
        // dash toward aim, damaging along the path
        const dist0 = 70;
        const tx = clamp(this.px + this.aimX * dist0, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        const ty = clamp(this.py + this.aimY * dist0, FIELD.y + 8, FIELD.y + FIELD.h - 8);
        for (const e of this.enemies) {
          if (this.distToSegment(e.x, e.y, this.px, this.py, tx, ty) < 18 + e.size * 0.4) {
            this.damageEnemy(e, dmg * 1.4);
          }
        }
        this.trail(this.px, this.py, tx, ty, "#c0c8d8");
        this.px = tx; this.py = ty;
        this.invuln = Math.max(this.invuln, 0.25);
        break;
      }
      case "spin": {
        for (const e of this.enemies) {
          if (dist(e.x, e.y, this.px, this.py) < 48 + e.size * 0.4) this.damageEnemy(e, dmg * 1.6);
        }
        this.spawnRing(this.px, this.py, "#ffd24a", 48);
        break;
      }
      case "warcry": {
        this.dmgBuff = 6; this.dmgBuffMult = 1.6;
        this.php = Math.min(this.phpMax, this.php + this.phpMax * 0.15);
        this.spawnRing(this.px, this.py, "#ff5a5a", 40);
        this.float("WAR CRY!", this.px, this.py - 18, "#ffd24a");
        break;
      }
      // ---- Mage ----
      case "frostnova": {
        for (const e of this.enemies) {
          if (dist(e.x, e.y, this.px, this.py) < 60 + e.size * 0.4) {
            this.damageEnemy(e, dmg * 1.2);
            e.frozen = 2.5;
          }
        }
        this.spawnRing(this.px, this.py, "#7ad7ff", 60);
        this.float("FROZEN", this.px, this.py - 18, "#7ad7ff");
        break;
      }
      case "meteor": {
        const tx = this.input.mouseX, ty = this.input.mouseY;
        for (const e of this.enemies) {
          if (dist(e.x, e.y, tx, ty) < 50 + e.size * 0.4) this.damageEnemy(e, dmg * 2.4);
        }
        this.spawnRing(tx, ty, "#ff6a1a", 50);
        for (let i = 0; i < 24; i++) {
          this.particles.push({ x: tx, y: ty, vx: rand(-60, 60), vy: rand(-60, 60), life: 0.5, color: "#ff6a1a" });
        }
        break;
      }
      case "blink": {
        const tx = clamp(this.input.mouseX, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        const ty = clamp(this.input.mouseY, FIELD.y + 8, FIELD.y + FIELD.h - 8);
        this.spawnRing(this.px, this.py, "#b388ff", 18);
        this.px = tx; this.py = ty;
        this.spawnRing(this.px, this.py, "#b388ff", 18);
        this.invuln = Math.max(this.invuln, 0.2);
        break;
      }
      // ---- Priest ----
      case "smite": {
        // piercing holy bolt
        this.firePiercing(this.aimX, this.aimY, dmg * 1.8, "bolt");
        break;
      }
      case "heal": {
        this.php = Math.min(this.phpMax, this.php + this.phpMax * 0.3);
        this.healOverTime = 3;
        this.float("+" + Math.round(this.phpMax * 0.3), this.px, this.py - 16, "#5fff8f");
        this.spawnRing(this.px, this.py, "#5fff8f", 30);
        break;
      }
      case "sanctuary": {
        this.healZoneTime = 5; this.healZoneX = this.px; this.healZoneY = this.py;
        this.invuln = Math.max(this.invuln, 1.5);
        this.spawnRing(this.px, this.py, "#ffd24a", 46);
        this.float("SANCTUARY", this.px, this.py - 18, "#ffd24a");
        break;
      }
      // ---- Tank ----
      case "groundslam": {
        for (const e of this.enemies) {
          const d = dist(e.x, e.y, this.px, this.py);
          if (d < 56 + e.size * 0.4) {
            this.damageEnemy(e, dmg * 1.3);
            // knockback
            const a = Math.atan2(e.y - this.py, e.x - this.px);
            e.x = clamp(e.x + Math.cos(a) * 30, FIELD.x + 6, FIELD.x + FIELD.w - 6);
            e.y = clamp(e.y + Math.sin(a) * 30, FIELD.y + 6, FIELD.y + FIELD.h - 6);
          }
        }
        this.spawnRing(this.px, this.py, "#8a8f99", 56);
        break;
      }
      case "taunt": {
        this.shield = 4; this.invuln = 0.3;
        this.spawnRing(this.px, this.py, "#9aa3b5", 36);
        this.float("SHIELD", this.px, this.py - 16, "#c0c8d8");
        break;
      }
      case "berserk": {
        this.dmgBuff = 6; this.dmgBuffMult = 2.0;
        this.speedBuff = 6; this.speedBuffMult = 1.6;
        this.spawnRing(this.px, this.py, "#ff3a1a", 40);
        this.float("BERSERK!", this.px, this.py - 18, "#ff3a1a");
        break;
      }
      // ---- Archer ----
      case "multishot": {
        const base = Math.atan2(this.aimY, this.aimX);
        for (let i = -2; i <= 2; i++) {
          const a = base + i * 0.18;
          this.fireProjectile(Math.cos(a), Math.sin(a), dmg * 0.8, "arrow");
        }
        break;
      }
      case "rapidfire": {
        this.rapidFire = 4;
        this.float("RAPID FIRE", this.px, this.py - 18, "#3f8f5a");
        this.spawnRing(this.px, this.py, "#3f8f5a", 24);
        break;
      }
      case "snipe": {
        this.firePiercing(this.aimX, this.aimY, dmg * 4, "arrow");
        break;
      }
    }
  }

  private fireProjectile(dx: number, dy: number, dmg: number, kind: "fireball" | "arrow" | "bolt") {
    const speed = kind === "arrow" ? 320 : 240;
    this.projectiles.push({
      x: this.px + dx * 12, y: this.py + dy * 12,
      vx: dx * speed, vy: dy * speed,
      dmg, from: "player", kind, life: 1.6, radius: 4,
    });
  }

  private firePiercing(dx: number, dy: number, dmg: number, kind: "fireball" | "arrow" | "bolt") {
    this.projectiles.push({
      x: this.px + dx * 12, y: this.py + dy * 12,
      vx: dx * 380, vy: dy * 380,
      dmg, from: "player", kind, life: 1.4, radius: 6,
      pierce: true, hitSet: new Set<Enemy>(), big: true,
    });
  }

  private distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  private trail(ax: number, ay: number, bx: number, by: number, color: string) {
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.particles.push({
        x: ax + (bx - ax) * t, y: ay + (by - ay) * t,
        vx: rand(-10, 10), vy: rand(-10, 10), life: 0.3, color,
      });
    }
  }

  private enemyFire(e: Enemy) {
    const dx = this.px - e.x, dy = this.py - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const kind = e.projectile || "bolt";
    this.projectiles.push({
      x: e.x, y: e.y,
      vx: (dx / len) * 150, vy: (dy / len) * 150,
      dmg: e.dmg, from: "enemy", kind, life: 3, radius: 4,
    });
  }

  // ---------- enemies ----------
  private updateEnemies(dt: number) {
    for (const e of this.enemies) {
      e.bob += dt * 6;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.frozen > 0) e.frozen -= dt;
      const slow = e.frozen > 0 ? 0.25 : 1; // frozen enemies crawl
      const dx = this.px - e.x, dy = this.py - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.faceLeft = dx < 0;

      const desired = e.ranged ? 110 : 0;
      if (e.ranged) {
        // keep distance
        if (d < desired - 10) {
          e.x -= (dx / d) * e.speed * slow * dt;
          e.y -= (dy / d) * e.speed * slow * dt;
        } else if (d > desired + 10) {
          e.x += (dx / d) * e.speed * slow * dt;
          e.y += (dy / d) * e.speed * slow * dt;
        }
        e.atkTimer -= dt;
        if (e.atkTimer <= 0 && d < 220 && e.frozen <= 0) {
          this.enemyFire(e);
          e.atkTimer = e.atkCooldown;
        }
      } else {
        // chase
        e.x += (dx / d) * e.speed * slow * dt;
        e.y += (dy / d) * e.speed * slow * dt;
        // contact damage
        e.atkTimer -= dt;
        if (d < e.size * 0.4 + 10 && e.atkTimer <= 0) {
          this.damagePlayer(e.dmg);
          e.atkTimer = e.atkCooldown;
        }
      }
      e.x = clamp(e.x, FIELD.x + 6, FIELD.x + FIELD.w - 6);
      e.y = clamp(e.y, FIELD.y + 6, FIELD.y + FIELD.h - 6);
    }
    // separate overlapping enemies a bit
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i], b = this.enemies[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = (a.size + b.size) * 0.3;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
    }
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.from === "player") {
        for (const e of this.enemies) {
          if (dist(p.x, p.y, e.x, e.y) < e.size * 0.4 + p.radius) {
            if (p.pierce) {
              if (p.hitSet!.has(e)) continue;
              p.hitSet!.add(e);
              this.damageEnemy(e, p.dmg);
              this.spawnHit(p.x, p.y, "#ffd24a");
              // pierce: keep going
            } else {
              this.damageEnemy(e, p.dmg);
              p.life = 0;
              this.spawnHit(p.x, p.y, "#ffd24a");
              break;
            }
          }
        }
      } else {
        if (dist(p.x, p.y, this.px, this.py) < 9 + p.radius) {
          this.damagePlayer(p.dmg);
          p.life = 0;
          this.spawnHit(p.x, p.y, "#ff5a5a");
        }
      }
      // walls
      if (p.x < FIELD.x || p.x > FIELD.x + FIELD.w || p.y < FIELD.y || p.y > FIELD.y + FIELD.h) {
        p.life = 0;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  private damageEnemy(e: Enemy, dmg: number) {
    const crit = this.bonusCrit > 0 && Math.random() < this.bonusCrit;
    let d = Math.round(dmg * rand(0.9, 1.1) * (crit ? 2 : 1));
    e.hp -= d;
    e.hitFlash = 0.12;
    if (crit) this.float(d + "!", e.x, e.y - e.size * 0.4, "#ffce3a");
    else this.float("" + d, e.x, e.y - e.size * 0.4, "#fff");
    if (e.hp <= 0) {
      this.killEnemy(e);
    }
  }

  private killEnemy(e: Enemy) {
    this.monstersKilled++;
    this.goldGained += e.gold;
    this.xpGained += e.xp;
    this.spawnDeath(e.x, e.y);
    this.float("+" + e.gold + "g", e.x, e.y - 8, "#ffd24a");
    this.maybeDropLoot(e);
    this.enemies = this.enemies.filter((x) => x !== e);
  }

  private maybeDropLoot(e: Enemy) {
    // item level scales with dungeon difficulty + room depth
    const ilvl = Math.max(1, Math.round(this.dungeon.difficulty * 4 + this.curRoom.depth));
    if (e.isBoss) {
      // boss always drops 2 items with luck bias
      const n = 2;
      for (let i = 0; i < n; i++) {
        const rarity = rollRarity(0.6); // bosses lean rare+
        const it = rollItem({ ilvl: ilvl + 3, rarity, heroForWeapon: this.heroId });
        this.loot.push(it);
        this.float(it.name, e.x, e.y - 14 - i * 10, "#ffce3a");
      }
      return;
    }
    // regular monsters: ~18% drop chance
    if (Math.random() < 0.18) {
      const it = rollItem({ ilvl, heroForWeapon: this.heroId });
      this.loot.push(it);
      this.float("LOOT!", e.x, e.y - 14, "#5fd35f");
    }
  }

  private damagePlayer(dmg: number) {
    if (this.invuln > 0) return;
    if (this.shield > 0) {
      this.float("BLOCK", this.px, this.py - 16, "#c0c8d8");
      this.invuln = 0.3;
      return;
    }
    const d = Math.round(dmg * rand(0.9, 1.1));
    this.php -= d;
    this.invuln = 0.35;
    this.float("-" + d, this.px, this.py - 16, "#ff5a5a");
    for (let i = 0; i < 6; i++) {
      this.particles.push({ x: this.px, y: this.py, vx: rand(-50, 50), vy: rand(-50, 50), life: 0.3, color: "#ff5a5a" });
    }
  }

  // ---------- fx ----------
  private updateFx(dt: number) {
    for (const f of this.floats) { f.life -= dt; f.y -= 14 * dt; }
    this.floats = this.floats.filter((f) => f.life > 0);
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.vx *= 0.92; p.vy *= 0.92;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
  private float(text: string, x: number, y: number, color: string) {
    this.floats.push({ text, x, y, life: 0.7, color });
  }
  private spawnHit(x: number, y: number, color: string) {
    for (let i = 0; i < 5; i++) {
      this.particles.push({ x, y, vx: rand(-40, 40), vy: rand(-40, 40), life: 0.25, color });
    }
  }
  private spawnDeath(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      this.particles.push({ x, y, vx: rand(-70, 70), vy: rand(-70, 70), life: 0.5, color: this.dungeon.accent });
    }
  }
  private spawnSlash() {
    const x = this.px + this.aimX * this.hero.attackRange * 0.7;
    const y = this.py + this.aimY * this.hero.attackRange * 0.7;
    const col = this.hero.id === "priest" ? "#ffe9a0" : "#ffffff";
    for (let i = 0; i < 7; i++) {
      this.particles.push({ x, y, vx: rand(-50, 50), vy: rand(-50, 50), life: 0.2, color: col });
    }
  }
  private spawnRing(x: number, y: number, color: string, r: number) {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.particles.push({ x, y, vx: Math.cos(a) * r * 2.2, vy: Math.sin(a) * r * 2.2, life: 0.4, color });
    }
  }

  private endRaid(win: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.phase = win ? "win" : "lose";
    const result: RaidResult = {
      win,
      goldGained: this.goldGained,
      xpGained: win ? this.xpGained : Math.round(this.xpGained * 0.4),
      monstersKilled: this.monstersKilled,
      // keep all loot on win; salvage half (rounded down) on defeat
      loot: win ? this.loot : this.loot.slice(0, Math.floor(this.loot.length / 2)),
    };
    setTimeout(() => this.cb.onEnd(result), 900);
  }

  // ---------- render ----------
  private render() {
    const ctx = this.ctx;
    // floor
    ctx.fillStyle = this.dungeon.floor;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // floor tiles
    ctx.fillStyle = shade(this.dungeon.floor, -0.06);
    for (let y = FIELD.y; y < FIELD.y + FIELD.h; y += 24) {
      for (let x = FIELD.x; x < FIELD.x + FIELD.w; x += 24) {
        if (((x + y) / 24) % 2 < 1) ctx.fillRect(x, y, 24, 24);
      }
    }
    // walls
    ctx.fillStyle = this.dungeon.wall;
    ctx.fillRect(0, 0, VIEW_W, WALL);
    ctx.fillRect(0, VIEW_H - WALL, VIEW_W, WALL);
    ctx.fillRect(0, 0, WALL, VIEW_H);
    ctx.fillRect(VIEW_W - WALL, 0, WALL, VIEW_H);
    // wall bricks
    ctx.fillStyle = shade(this.dungeon.wall, 0.1);
    for (let x = 0; x < VIEW_W; x += 16) {
      ctx.fillRect(x + 1, 1, 14, 6);
      ctx.fillRect(x + 1, VIEW_H - 15, 14, 6);
    }

    // carve out + draw doors
    this.drawDoors();

    // heal zone (sanctuary)
    if (this.healZoneTime > 0) {
      ctx.save();
      ctx.globalAlpha = 0.18 + Math.sin(performance.now() / 200) * 0.05;
      ctx.fillStyle = "#5fff8f";
      ctx.beginPath();
      ctx.arc(this.healZoneX, this.healZoneY, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#ffd24a";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // entities sorted by y
    const drawList: { y: number; fn: () => void }[] = [];
    for (const e of this.enemies) {
      drawList.push({ y: e.y, fn: () => this.drawEnemy(e) });
    }
    drawList.push({ y: this.py, fn: () => this.drawPlayer() });
    drawList.sort((a, b) => a.y - b.y);
    for (const d of drawList) d.fn();

    // projectiles
    for (const p of this.projectiles) {
      const def = fxSprites[p.kind];
      const angle = Math.atan2(p.vy, p.vx);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      const size = p.big ? 16 : 10;
      if (p.big) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#fff";
        ctx.fillRect(-size / 2, -1, size, 2);
        ctx.globalAlpha = 1;
      }
      const customFireball = p.from === "player" && this.hero.id === "mage" && p.kind === "fireball"
        ? drawMageFireball(ctx, size * 3, this.animTime)
        : false;
      if (!customFireball) drawSprite(ctx, "fx_" + p.kind, def, -size / 2, -size / 2, size);
      ctx.restore();
    }

    // particles
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, pt.life * 2);
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x) - 1, Math.round(pt.y) - 1, 2, 2);
    }
    ctx.globalAlpha = 1;

    // floats
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, f.life * 1.4);
      ctx.fillStyle = "#000";
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";

    // door transition fade
    if (this.transition > 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.transition / 0.35) * 0.7})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    // overlays
    if (this.phase === "intro") {
      this.banner(this.dungeon.name, "Clear rooms, find the boss \u2620");
    } else if (this.curRoom.isBoss && !this.curRoom.cleared) {
      // brief boss warning handled by boss bar; no banner spam
    } else if (this.curRoom.cleared && this.clearedTimer < 1.4 && !this.curRoom.isStart) {
      this.banner("Room Cleared!", "Doors open \u2014 pick a path");
    }
  }

  private drawDoors() {
    const ctx = this.ctx;
    const cleared = this.curRoom.cleared;
    for (const d of DIRS) {
      if (!this.curRoom.doors[d]) continue;
      const c = doorCenter(d);
      const nb = this.map.rooms.find((r) => r.id === this.curRoom.neighbors[d]);
      const leadsToBoss = nb?.isBoss;

      // carve the opening (floor color) through the wall
      ctx.fillStyle = this.dungeon.floor;
      if (d === "n") ctx.fillRect(c.x - DOOR_HALF, 0, DOOR_HALF * 2, WALL);
      if (d === "s") ctx.fillRect(c.x - DOOR_HALF, VIEW_H - WALL, DOOR_HALF * 2, WALL);
      if (d === "w") ctx.fillRect(0, c.y - DOOR_HALF, WALL, DOOR_HALF * 2);
      if (d === "e") ctx.fillRect(VIEW_W - WALL, c.y - DOOR_HALF, WALL, DOOR_HALF * 2);

      // door frame / state color
      const open = cleared;
      const frame = leadsToBoss ? "#ff3a3a" : open ? this.dungeon.accent : "#5a5a5a";
      ctx.fillStyle = frame;
      const t2 = 3; // frame thickness
      if (d === "n") { ctx.fillRect(c.x - DOOR_HALF, WALL - t2, DOOR_HALF * 2, t2); }
      if (d === "s") { ctx.fillRect(c.x - DOOR_HALF, VIEW_H - WALL, DOOR_HALF * 2, t2); }
      if (d === "w") { ctx.fillRect(WALL - t2, c.y - DOOR_HALF, t2, DOOR_HALF * 2); }
      if (d === "e") { ctx.fillRect(VIEW_W - WALL, c.y - DOOR_HALF, t2, DOOR_HALF * 2); }

      // locked bars if not cleared
      if (!open) {
        ctx.fillStyle = "rgba(20,20,20,0.85)";
        if (d === "n") ctx.fillRect(c.x - DOOR_HALF, 0, DOOR_HALF * 2, WALL);
        if (d === "s") ctx.fillRect(c.x - DOOR_HALF, VIEW_H - WALL, DOOR_HALF * 2, WALL);
        if (d === "w") ctx.fillRect(0, c.y - DOOR_HALF, WALL, DOOR_HALF * 2);
        if (d === "e") ctx.fillRect(VIEW_W - WALL, c.y - DOOR_HALF, WALL, DOOR_HALF * 2);
        // bars
        ctx.fillStyle = "#3a3a3a";
        if (d === "n" || d === "s") {
          const y0 = d === "n" ? 0 : VIEW_H - WALL;
          for (let i = -1; i <= 1; i++) ctx.fillRect(c.x + i * 8 - 1, y0, 2, WALL);
        } else {
          const x0 = d === "w" ? 0 : VIEW_W - WALL;
          for (let i = -1; i <= 1; i++) ctx.fillRect(x0, c.y + i * 8 - 1, WALL, 2);
        }
      } else {
        // open + pulsing arrow toward boss door
        if (leadsToBoss) {
          const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
          ctx.globalAlpha = 0.5 + pulse * 0.5;
          ctx.fillStyle = "#ff5a5a";
          ctx.fillText("☠", c.x - 3, c.y + 3);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  private drawShadow(x: number, y: number, w: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.4, w * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPlayer() {
    const ctx = this.ctx;
    const size = 18;
    this.drawShadow(this.px, this.py + size * 0.42, size);
    const flicker = this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0;
    // damage buff aura (war cry / berserk)
    if (this.dmgBuff > 0) {
      ctx.save();
      ctx.globalAlpha = 0.4 + Math.sin(performance.now() / 120) * 0.15;
      ctx.strokeStyle = this.dmgBuffMult >= 2 ? "#ff3a1a" : "#ffd24a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.px, this.py, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // rapid fire aura
    if (this.rapidFire > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#3f8f5a";
      ctx.beginPath();
      ctx.arc(this.px, this.py, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (this.shield > 0) {
      ctx.strokeStyle = "rgba(160,200,255,0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.px, this.py, 13, 0, Math.PI * 2);
      ctx.stroke();
    }

    // attack lunge: shove sprite toward aim at the start of the swing
    const lunge = this.atkAnim > 0 && this.hero.id !== "priest"
      ? Math.sin(this.atkAnim * Math.PI) * 4
      : 0;
    const drawX = this.px + this.atkAimX * lunge;
    const drawY = this.py + this.atkAimY * lunge;

    // draw weapon swing BEHIND the sprite if pointing up/left-ish
    const behind = this.atkAimY < -0.3;
    if (this.atkAnim > 0 && behind && this.hero.id !== "priest") this.drawAttackFx();

    if (!flicker) {
      const animType = this.moving ? "walk" : "idle";
      const fps = this.moving ? 12 : 3.5;
      const frame = Math.floor(this.animTime * fps);
      const drew = drawHeroDir(
        ctx, this.hero.id, this.facing,
        Math.round(drawX - size / 2), Math.round(drawY - size / 2),
        size, this.animTime, this.moving, this.atkAnim,
      );
      if (!drew) {
        drawAnim(ctx, "h_" + this.hero.id, heroSprites[this.hero.id], animType,
          Math.round(drawX - size / 2), Math.round(drawY - size / 2), size, frame, this.faceLeft);
      }
    }

    // weapon swing in front (default)
    if (this.atkAnim > 0 && !behind && this.hero.id !== "priest") this.drawAttackFx();
  }

  private drawAttackFx() {
    const ctx = this.ctx;
    const t = this.atkAnim;             // 1 -> 0 over the swing
    const ang = Math.atan2(this.atkAimY, this.atkAimX);
    const cx = this.px, cy = this.py;

    if (this.hero.attackKind === "ranged") {
      // muzzle flash burst at weapon tip
      const tipX = cx + this.atkAimX * 13;
      const tipY = cy + this.atkAimY * 13;
      const a = Math.max(0, t);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = this.hero.id === "mage" ? "#ffd24a" : "#fff6c0";
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2 + a * 4, 0, Math.PI * 2);
      ctx.fill();
      // streak line
      ctx.strokeStyle = ctx.fillStyle as string;
      ctx.globalAlpha = a * 0.6;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + this.atkAimX * 8, tipY + this.atkAimY * 8);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // MELEE: sweeping slash arc
    const reach = this.hero.attackRange;
    // weapon color per hero
    let col = "#ffffff";
    if (this.hero.id === "knight") col = "#dfe6f5";
    else if (this.hero.id === "priest") col = "#ffe9a0";
    else if (this.hero.id === "tank") col = "#cdd2da";

    // swing sweeps from -0.9rad to +0.9rad across the aim as t goes 1->0
    const sweep = 1.8;
    const cur = ang - sweep / 2 + (1 - t) * sweep;
    ctx.save();
    ctx.translate(cx, cy);

    // arc trail (fading wedge behind the blade)
    ctx.globalAlpha = 0.35 * t + 0.15;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const trailStart = ang - sweep / 2;
    ctx.arc(0, 0, reach, trailStart, cur, false);
    ctx.closePath();
    ctx.fill();

    // bright blade at the leading edge
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(cur) * 4, Math.sin(cur) * 4);
    ctx.lineTo(Math.cos(cur) * reach, Math.sin(cur) * reach);
    ctx.stroke();

    // tank gets a chunky bash square at the tip instead of thin blade
    if (this.hero.id === "tank") {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = col;
      const tx = Math.cos(ang) * (reach - 4);
      const ty = Math.sin(ang) * (reach - 4);
      const s = 6 * (0.5 + t * 0.5);
      ctx.fillRect(tx - s / 2, ty - s / 2, s, s);
    }
    ctx.restore();
  }

  private drawEnemy(e: Enemy) {
    const ctx = this.ctx;
    const bob = Math.sin(e.bob) * 1.2;
    this.drawShadow(e.x, e.y + e.size * 0.42, e.size);
    if (e.hitFlash > 0) {
      ctx.save();
      drawSprite(ctx, e.spriteKey, e.sprite,
        Math.round(e.x - e.size / 2), Math.round(e.y - e.size / 2 + bob), e.size, e.faceLeft);
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(Math.round(e.x - e.size / 2), Math.round(e.y - e.size / 2 + bob), e.size, e.size);
      ctx.restore();
    } else if (e.frozen > 0) {
      ctx.save();
      drawSprite(ctx, e.spriteKey, e.sprite,
        Math.round(e.x - e.size / 2), Math.round(e.y - e.size / 2 + bob), e.size, e.faceLeft);
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(122,215,255,0.5)";
      ctx.fillRect(Math.round(e.x - e.size / 2), Math.round(e.y - e.size / 2 + bob), e.size, e.size);
      ctx.restore();
    } else {
      drawSprite(ctx, e.spriteKey, e.sprite,
        Math.round(e.x - e.size / 2), Math.round(e.y - e.size / 2 + bob), e.size, e.faceLeft);
    }
    // hp bar for non-boss
    if (!e.isBoss && e.hp < e.maxHp) {
      const w = e.size * 0.8;
      const x = e.x - w / 2, y = e.y - e.size / 2 - 4;
      ctx.fillStyle = "#000";
      ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = "#c0392b";
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = "#5fd35f";
      ctx.fillRect(x, y, w * (e.hp / e.maxHp), 2);
    }
  }

  private banner(title: string, sub: string) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, VIEW_H / 2 - 26, VIEW_W, 52);
    ctx.textAlign = "center";
    ctx.fillStyle = this.dungeon.accent;
    ctx.font = "bold 16px monospace";
    ctx.fillText(title, VIEW_W / 2, VIEW_H / 2 - 4);
    ctx.fillStyle = "#fff";
    ctx.font = "9px monospace";
    ctx.fillText(sub, VIEW_W / 2, VIEW_H / 2 + 12);
    ctx.textAlign = "left";
  }

  private skillActive(kind: SkillKind): boolean {
    switch (kind) {
      case "warcry": return this.dmgBuff > 0 && this.dmgBuffMult < 2;
      case "berserk": return this.dmgBuff > 0 && this.dmgBuffMult >= 2;
      case "rapidfire": return this.rapidFire > 0;
      case "sanctuary": return this.healZoneTime > 0;
      case "heal": return this.healOverTime > 0;
      case "taunt": return this.shield > 0;
      default: return false;
    }
  }

  private buildMinimap(): MiniMap {
    const visibleRooms = this.map.rooms.filter((r) => r.visited);
    const minX = Math.min(...visibleRooms.map((r) => r.gx));
    const minY = Math.min(...visibleRooms.map((r) => r.gy));
    const maxX = Math.max(...visibleRooms.map((r) => r.gx));
    const maxY = Math.max(...visibleRooms.map((r) => r.gy));
    const bossKnown = this.map.rooms.some((r) => r.isBoss && r.visited);
    const rooms: MiniRoom[] = this.map.rooms
      .filter((r) => r.visited)
      .map((r) => ({
        gx: r.gx, gy: r.gy,
        visited: r.visited, cleared: r.cleared,
        isStart: r.isStart,
        // only reveal boss marker once visited (or adjacent-visited)
        isBoss: r.isBoss && bossKnown,
        current: r.id === this.curRoom.id,
        doors: { ...r.doors },
      }));
    return { rooms, minX, minY, gridW: maxX - minX + 1, gridH: maxY - minY + 1 };
  }

  private emitHud() {
    const boss = this.enemies.find((e) => e.isBoss);
    const skills: SkillHud[] = this.hero.skills.map((s, i) => ({
      key: s.key.toUpperCase(),
      name: s.name,
      ready: this.skillTimers[i] <= 0,
      cdPct: this.skillTimers[i] <= 0 ? 1 : 1 - this.skillTimers[i] / s.cooldown,
      active: this.skillActive(s.kind),
    }));
    const totalRooms = this.map.rooms.length;
    const clearedCount = this.map.rooms.filter((r) => r.cleared && !r.isStart).length;
    const hud: HudState = {
      phase: this.phase,
      heroName: this.hero.name,
      hp: Math.max(0, Math.round(this.php)),
      maxHp: this.phpMax,
      skills,
      roomsCleared: clearedCount,
      totalRooms: totalRooms - 1, // exclude start from the count
      bossFound: this.map.rooms.some((r) => r.isBoss && r.visited),
      enemiesLeft: this.enemies.length,
      dungeonName: this.dungeon.name,
      minimap: this.buildMinimap(),
      bossName: boss ? this.bossName() : undefined,
      bossHp: boss ? Math.max(0, Math.round(boss.hp)) : undefined,
      bossMax: boss ? boss.maxHp : undefined,
      goldGained: this.goldGained,
      xpGained: this.xpGained,
      monstersKilled: this.monstersKilled,
    };
    this.cb.onHud(hud);
  }

  private bossName(): string {
    return BOSSES[this.dungeon.boss].name;
  }
}

// ---------- helpers ----------
function rand(a: number, b: number) { return a + Math.random() * (b - a); }
function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }
function dist(ax: number, ay: number, bx: number, by: number) { return Math.hypot(ax - bx, ay - by); }
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(Math.round(r + r * amt), 0, 255);
  g = clamp(Math.round(g + g * amt), 0, 255);
  b = clamp(Math.round(b + b * amt), 0, 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
