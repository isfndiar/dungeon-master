import { Input } from "./input";
import {
  HEROES, HeroId, HeroDef, hpForLevel, dmgForLevel, SkillDef, SkillKind,
} from "./heroes";
import {
  MONSTERS, BOSSES, MonsterDef, BossDef, BossKind, MonsterKind, BossSpellKind, BossSpell, SpellTier,
} from "./monsters";
import { DUNGEONS, DungeonId, DungeonDef, GameMode, MODE_DEF, modeDifficulty } from "./dungeons";
import {
  heroSprites, monsterSprites, bossSprites, fxSprites, drawSprite, drawAnim, SpriteDef,
} from "./sprites";
import {
  generateMap, DungeonMap, RoomNode, Dir, DIRS, OPPOSITE, DELTA,
} from "./map";
import { pickTemplate } from "./rooms";
import type { RoomRect } from "./rooms";
import { Item, rollItem, rollRarity, ItemStats } from "./items";
import {
  preloadHeroSprites, drawHeroDir, facingFromVec, Facing,
  drawMageFireball, drawElfArrow,
} from "./spriteLoader";

export const VIEW_W = 480;
export const VIEW_H = 270;
const RENDER_SCALE = 2;

// boss shield-break tunables
const SHIELD_FRAC = 0.4;       // shield value = 40% of max HP per restore
const BREAK_WINDOW = 5;        // seconds boss stays broken (vulnerable)
const BREAK_DMG_AMP = 1.5;     // HP damage multiplier during break window

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
  kind: "fireball" | "arrow" | "bolt" | "sword" | "tentacle";
  life: number;
  radius: number;
  pierce?: boolean;
  hitSet?: Set<Enemy>;
  big?: boolean;
  homing?: boolean;        // sword storm: homes on nearest enemy
  homingTurn?: number;     // max turn rate (rad/sec)
  hitSet2?: Set<Enemy>;    // swords can hit a few enemies each
  hitsLeft?: number;       // remaining hits for a homing sword
  tint?: string;           // optional color tint for boss spells
}

interface HazardAoE {
  x: number; y: number;        // ground target
  radius: number;              // explosion radius
  telegraph: number;           // warning countdown (s)
  telegraphMax: number;        // initial telegraph duration (for fall anim)
  dmg: number;
  color: string;
  exploded: boolean;
  fade: number;                // post-explosion fade timer
  kind: "meteor" | "bounceSlam" | "eruption";
  knockback?: number;          // px to push player on hit
  leavePool?: boolean;         // eruption tier 3 leaves pool at center
  poolColor?: string;
}

interface HazardBeam {
  x1: number; y1: number;      // boss pos (locked at cast)
  x2: number; y2: number;      // target pos (locked, except sweep rotates)
  telegraph: number;           // warning countdown
  telegraphMax: number;
  active: number;              // beam active time remaining
  activeMax: number;
  dmgTick: number;             // tick accumulator (0.25s ticks)
  dmg: number;
  color: string;
  sweep?: number;              // sweep angular velocity (rad/s) for tier 3
  sweepAngle?: number;         // current sweep angle offset
  baseAngle?: number;          // initial angle from boss to target
}

interface HazardPool {
  x: number; y: number;
  radius: number;
  time: number;                // remaining lifetime
  timeMax: number;
  dmgPerSec: number;
  slow: number;                // 0..1 movement slow fraction
  slowTime: number;            // debuff duration applied on overlap
  snare: boolean;              // full root
  snareTime: number;           // snare debuff duration
  color: string;
  kind: "slime" | "lava" | "web" | "ink";
  tickAcc: number;             // dmg tick accumulator
  spawnTelegraph: number;      // pre-activate warning (0 = active)
}

interface Enemy {
  x: number; y: number;
  hp: number; maxHp: number;
  dmg: number; speed: number;
  ranged: boolean; projectile?: "bolt" | "fireball" | "tentacle";
  atkTimer: number; atkCooldown: number;
  size: number;
  sprite: SpriteDef; spriteKey: string;
  gold: number; xp: number;
  isBoss: boolean;
  hitFlash: number;
  faceLeft: boolean;
  bob: number;
  frozen: number; // seconds remaining of frozen/slow
  phase: 1 | 2 | 3;            // current boss phase
  spellPool: BossSpell[];      // cached spells for current phase
  castLock: number;            // boss immobile while > 0
  atkAnim: number;             // 0..1 basic-attack swing progress (1=just started)
  castAnim: number;            // 0..1 spell cast windup progress (1=just started)
  // shield-break system (boss only)
  bossState: "shielded" | "broken";
  shield: number;              // current shield value (blocks HP damage)
  shieldMax: number;           // shield value on each restore
  breakTimer: number;          // countdown of break window while broken
  phaseFlash: number;          // 0..1 visual flash on break/phase change
  taunted: number;             // seconds remaining: forced to move toward player (berserk wave)
}

interface FloatText { x: number; y: number; text: string; life: number; color: string; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; }
interface NovaWave {
  x: number; y: number;
  radius: number;          // current expanding radius
  maxRadius: number;       // max reach
  speed: number;           // expansion px/s
  dmg: number;
  frozenDur: number;       // freeze duration applied on hit
  duration: number;        // total lifetime
  time: number;            // elapsed
  hitSet: Set<Enemy>;      // enemies already hit (avoid multi-hit)
}

export interface RaidResult {
  win: boolean;
  goldGained: number;
  xpGained: number;
  monstersKilled: number;
  loot: Item[];
  wave?: number; // for endless mode
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
  bossShield?: number; bossShieldMax?: number;
  bossPhase?: 1 | 2 | 3; bossBroken?: boolean; bossBreakTimer?: number;
  goldGained: number; xpGained: number;
  monstersKilled: number;
  isEndless?: boolean;
  wave?: number;
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
  private mode: GameMode = "normal";
  private difficulty: number = 1;   // cached mode-adjusted difficulty multiplier

  // player state
  private px = VIEW_W / 2;
  private py = VIEW_H / 2;
  private phpMax: number;
  private php: number;
  private pdmg: number;
  private atkTimer = 0;
  private skillTimers = [0, 0, 0]; // Q, E, R cooldown remaining
  private smiteMark: Enemy | null = null; // priest smite: enemy hit, enables re-cast blink
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
  private healOverTimeDps = 0; // heal per second while active
  private divineHealTime = 0; // divine heal burst visual timer
  private walkBob = 0;
  private animTime = 0;   // drives walk/idle frame index
  private moving = false; // moved this frame
  // debuffs from boss pool hazards
  private playerSlow = 0;        // seconds remaining of movement slow
  private playerSlowMult = 1;    // multiplier while active (0.5 = half speed)
  private playerSnare = 0;       // seconds remaining of root
  private hazardTick = 0; // accumulator for static room-hazard damage
  // buffs
  private dmgBuff = 0;      // seconds remaining of damage buff
  private dmgBuffMult = 1;  // multiplier while active
  private speedBuff = 0;    // seconds remaining of speed buff
  private speedBuffMult = 1;
  private rapidFire = 0;    // seconds remaining of attack-speed buff
  private healZoneTime = 0; // sanctuary remaining
  private healZoneX = 0; private healZoneY = 0;
  // knight lifesteal: heals a % of max HP on kill. War Cry boosts it.
  private lifeStealFrac = 0;       // fraction of max HP healed per kill
  private lifeStealBuff = 0;       // seconds remaining of lifesteal boost
  private lifeStealBuffFrac = 0;   // boosted fraction while active

  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private floats: FloatText[] = [];
  private particles: Particle[] = [];
  private hazards: HazardAoE[] = [];
  private beams: HazardBeam[] = [];
  private pools: HazardPool[] = [];
  private playerNovaWaves: NovaWave[] = [];   // mage frost nova expanding waves
  private bossSpellTimer = 999;   // boss spell cooldown accumulator

  private phase: Phase = "intro";
  private map!: DungeonMap;
  private curRoom!: RoomNode;        // room player is currently in
  private roomsCleared = 0;          // count of cleared combat rooms
  private transition = 0;            // door transition fade timer (>0 = transitioning)
  private clearedTimer = 0;
  private introTimer = 1.2;

  // endless mode
  private isEndless = false;
  private wave = 0;              // current wave number
  private waveSpawned = false;   // enemies spawned for current wave
  private waveClearTimer = 0;    // pause after clearing wave before next

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
    bonus?: ItemStats,
    mode: GameMode = "normal"
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    // setTransform (absolute) instead of scale (cumulative): idempotent across
    // React StrictMode double-mount which reuses the same canvas + context and
    // would otherwise stack scale() calls → over-zoomed view on first entry.
    this.ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    this.input = new Input(canvas);
    this.hero = HEROES[heroId];
    this.heroId = heroId;
    this.heroLevel = heroLevel;
    this.dungeon = DUNGEONS[dungeonId];
    this.mode = mode;
    this.difficulty = modeDifficulty(this.dungeon, mode);
    this.cb = cb;
    preloadHeroSprites();

    this.phpMax = hpForLevel(this.hero, heroLevel) + (bonus?.hp ?? 0);
    this.php = this.phpMax;
    this.pdmg = dmgForLevel(this.hero, heroLevel) + (bonus?.dmg ?? 0);
    this.bonusCdr = Math.min(bonus?.cdr ?? 0, 0.6);
    this.bonusSpeed = bonus?.speed ?? 0;
    this.bonusCrit = Math.min(bonus?.crit ?? 0, 0.75);

    // knight: base 5% lifesteal on kill
    if (heroId === "knight") this.lifeStealFrac = 0.05;

    // endless mode: skip map generation, use wave-based arena
    this.isEndless = !!this.dungeon.endless;
    if (!this.isEndless) {
      const total = this.dungeon.rooms + 2;
      this.map = generateMap(total);
      this.curRoom = this.map.rooms.find((r) => r.id === this.map.startId)!;
    } else {
      // dummy map + room for endless (no doors, open arena)
      this.map = {
        startId: 0,
        bossId: 0,
        gridW: 1, gridH: 1,
        maxDepth: 0,
        rooms: [{
          id: 0, gx: 0, gy: 0,
          doors: { n: false, s: false, w: false, e: false },
          neighbors: {},
          depth: 0, isStart: true, isBoss: false,
          cleared: false, visited: true,
        }],
      };
      this.curRoom = this.map.rooms[0];
    }
  }

  setScale(scale: number) {
    this.input.setScale(scale);
  }

  start() {
    this.running = true;
    this.last = performance.now();
    this.px = VIEW_W / 2;
    this.py = VIEW_H / 2;
    if (!this.isEndless) this.enterRoom(this.curRoom, null);
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
    // assign a hand-designed interior template once (template dungeons only)
    if (
      this.dungeon.useTemplates &&
      !room.isStart && !room.isBoss &&
      room.obstacles === undefined
    ) {
      const openDoors = DIRS.filter((d) => room.doors[d]);
      const tpl = pickTemplate(Math.random, openDoors);
      room.obstacles = tpl ? tpl.obstacles.map((r) => ({ ...r })) : [];
      room.hazards = tpl ? tpl.hazards.map((r) => ({ ...r })) : [];
    }
    this.enemies = [];
    this.projectiles = [];
    this.hazards = [];
    this.beams = [];
    this.pools = [];
    this.playerSlow = 0;
    this.playerSnare = 0;

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
      if (dist(x, y, this.px, this.py) > 90 && !this.inObstacle(x, y, 10)) break;
    }
    return { x, y };
  }

  private spawnMonster(kind: MonsterKind) {
    const def: MonsterDef = MONSTERS[kind];
    const d = this.difficulty;
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
      phase: 1, spellPool: [], castLock: 0, atkAnim: 0, castAnim: 0, bossState: "shielded", shield: 0, shieldMax: 0, breakTimer: 0, phaseFlash: 0, taunted: 0,
    });
  }

  private spawnBoss() {
    const def: BossDef = BOSSES[this.dungeon.boss];
    const d = this.difficulty;
    const pool = def.spells.filter((s) => s.tier === 1);
    const maxHp = Math.round(def.hp * d);
    const shieldMax = Math.round(maxHp * SHIELD_FRAC);
    this.enemies.push({
      x: VIEW_W / 2, y: FIELD.y + 40,
      hp: maxHp, maxHp,
      dmg: Math.round(def.dmg * d), speed: def.speed,
      ranged: def.ranged, projectile: def.projectile,
      atkTimer: 1, atkCooldown: def.attackCooldown,
      size: def.size,
      sprite: bossSprites[def.kind], spriteKey: "b_" + def.kind,
      gold: def.gold, xp: def.xp,
      isBoss: true, hitFlash: 0, faceLeft: false, bob: 0, frozen: 0,
      phase: 1, spellPool: pool, castLock: 0, atkAnim: 0, castAnim: 0,
      bossState: "shielded", shield: shieldMax, shieldMax, breakTimer: 0, phaseFlash: 0, taunted: 0,
    });
    this.bossSpellTimer = this.pickBossCooldown(pool);
  }

  private pickBossCooldown(pool: BossSpell[]): number {
    if (pool.length === 0) return 999;
    // use min cooldown of pool for first cast timing
    return Math.min(...pool.map((s) => s.cooldown));
  }

  private spawnEndlessWave() {
    this.wave++;
    this.waveSpawned = true;
    const diff = (1 + this.wave * 0.12) * MODE_DEF[this.mode].mult;
    const count = 3 + Math.floor(this.wave * 1.1);

    // every 10th wave: boss + reduced minions
    if (this.wave % 10 === 0) {
      const bosses = this.dungeon.bosses;
      if (bosses && bosses.length > 0) {
        const bossKind = bosses[Math.floor(Math.random() * bosses.length)];
        const def: BossDef = BOSSES[bossKind];
        const bossHp = Math.round(def.hp * diff * 1.5);
        const pool = def.spells.filter((s) => s.tier === 1);
        const shieldMax = Math.round(bossHp * SHIELD_FRAC);
        this.enemies.push({
          x: VIEW_W / 2, y: FIELD.y + 40,
          hp: bossHp, maxHp: bossHp,
          dmg: Math.round(def.dmg * diff), speed: def.speed,
          ranged: def.ranged, projectile: def.projectile,
          atkTimer: 1, atkCooldown: def.attackCooldown,
          size: def.size,
          sprite: bossSprites[def.kind], spriteKey: "b_" + def.kind,
          gold: Math.round(def.gold * diff), xp: Math.round(def.xp * diff),
          isBoss: true, hitFlash: 0, faceLeft: false, bob: 0, frozen: 0,
          phase: 1, spellPool: pool, castLock: 0, atkAnim: 0, castAnim: 0,
          bossState: "shielded", shield: shieldMax, shieldMax, breakTimer: 0, phaseFlash: 0, taunted: 0,
        });
        this.bossSpellTimer = this.pickBossCooldown(pool);
        this.float("BOSS WAVE!", VIEW_W / 2, VIEW_H / 2 - 30, "#ff3a1a");
      }
      // fewer minions alongside boss
      const minionCount = Math.floor(count * 0.4);
      for (let i = 0; i < minionCount; i++) {
        this.spawnEndlessMonster(diff);
      }
    } else {
      for (let i = 0; i < count; i++) {
        this.spawnEndlessMonster(diff);
      }
    }
    this.float("WAVE " + this.wave, VIEW_W / 2, VIEW_H / 2 - 10, "#c0c8d8");
  }

  private spawnEndlessMonster(diff: number) {
    const pool = this.dungeon.monsters;
    const kind = pool[Math.floor(Math.random() * pool.length)];
    const def: MonsterDef = MONSTERS[kind];
    const p = this.edgePos();
    this.enemies.push({
      x: p.x, y: p.y,
      hp: Math.round(def.hp * diff), maxHp: Math.round(def.hp * diff),
      dmg: Math.round(def.dmg * diff), speed: def.speed,
      ranged: def.ranged, projectile: def.projectile,
      atkTimer: rand(0, def.attackCooldown), atkCooldown: def.attackCooldown,
      size: def.size,
      sprite: monsterSprites[kind], spriteKey: "m_" + kind,
      gold: Math.round(def.gold * diff), xp: Math.round(def.xp * diff),
      isBoss: false, hitFlash: 0, faceLeft: false, bob: rand(0, Math.PI * 2), frozen: 0,
      phase: 1, spellPool: [], castLock: 0, atkAnim: 0, castAnim: 0, bossState: "shielded", shield: 0, shieldMax: 0, breakTimer: 0, phaseFlash: 0, taunted: 0,
    });
  }

  // summon a mini-monster (boss spell add). Reduced gold/xp, no spell pool.
  private spawnMini(kind: MonsterKind, x: number, y: number, hp: number, dmg: number, size: number) {
    const def: MonsterDef = MONSTERS[kind];
    this.enemies.push({
      x: clamp(x, FIELD.x + 8, FIELD.x + FIELD.w - 8),
      y: clamp(y, FIELD.y + 8, FIELD.y + FIELD.h - 8),
      hp, maxHp: hp,
      dmg, speed: def.speed * 1.2,
      ranged: def.ranged, projectile: def.projectile,
      atkTimer: rand(0, def.attackCooldown), atkCooldown: def.attackCooldown,
      size,
      sprite: monsterSprites[kind], spriteKey: "m_" + kind,
      gold: Math.round(def.gold * 0.3), xp: Math.round(def.xp * 0.3),
      isBoss: false, hitFlash: 0, faceLeft: false, bob: rand(0, Math.PI * 2), frozen: 0,
      phase: 1, spellPool: [], castLock: 0, atkAnim: 0, castAnim: 0, bossState: "shielded", shield: 0, shieldMax: 0, breakTimer: 0, phaseFlash: 0, taunted: 0,
    });
  }
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
      if (this.introTimer <= 0) {
        this.phase = "playing";
        if (this.isEndless) this.spawnEndlessWave();
      }
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
    if (!this.isEndless) this.updateRoomHazards(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.updateNovaWaves(dt);
    this.updateFx(dt);

    // newly cleared this frame?
    if (!this.curRoom.cleared && this.enemies.length === 0) {
      if (this.isEndless) {
        // endless: wave cleared, start pause before next wave
        this.waveClearTimer = 5;
        this.waveSpawned = false;
        this.goldGained += 10 + this.wave * 2;
        this.xpGained += 5 + this.wave;
        this.float("WAVE " + this.wave + " CLEAR", VIEW_W / 2, VIEW_H / 2 - 20, "#ffd24a");
        this.curRoom.cleared = true;
      } else {
        this.curRoom.cleared = true;
        this.roomsCleared++;
        if (this.curRoom.isBoss) {
          this.endRaid(true);
          return;
        }
        this.clearedTimer = 0;
      }
    }
    if (!this.curRoom.cleared) this.clearedTimer = 0;
    else if (!this.isEndless) this.clearedTimer += dt;

    // endless wave timer: after pause, spawn next wave
    if (this.isEndless && this.curRoom.cleared && !this.waveSpawned) {
      this.waveClearTimer -= dt;
      if (this.waveClearTimer <= 0) {
        this.curRoom.cleared = false;
        this.spawnEndlessWave();
      }
    }

    // door transitions (only when room cleared and not mid-transition)
    if (!this.isEndless && this.curRoom.cleared && this.transition <= 0) {
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

  // Drain HP while the player stands in a static room hazard (every 0.5s).
  private updateRoomHazards(dt: number) {
    const hz = this.curRoom.hazards;
    if (!hz || !hz.length) { this.hazardTick = 0; return; }
    const pr = 6;
    let inside = false;
    for (const h of hz) {
      if (this.px + pr > h.x && this.px - pr < h.x + h.w && this.py + pr > h.y && this.py - pr < h.y + h.h) {
        inside = true;
        break;
      }
    }
    if (!inside) { this.hazardTick = 0; return; }
    this.hazardTick += dt;
    if (this.hazardTick >= 0.5) {
      this.hazardTick = 0;
      // scales with dungeon difficulty so it stays relevant in higher modes
      this.damagePlayer(Math.round(10 * this.difficulty));
    }
  }

  // True if a point (with half-extent r) overlaps any obstacle in the room.
  private inObstacle(x: number, y: number, r: number): boolean {
    const obs = this.curRoom.obstacles;
    if (!obs || !obs.length) return false;
    for (const o of obs) {
      if (x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h) {
        return true;
      }
    }
    return false;
  }

  // Pull a desired position out of an obstacle by trying the original, then
  // axis-only fallbacks, then the current point. Used by teleports/knockback
  // so the player/enemy never lands embedded inside a solid block.
  private avoidObstacle(nx: number, ny: number, fromX: number, fromY: number, r: number): { x: number; y: number } {
    if (!this.inObstacle(nx, ny, r)) return { x: nx, y: ny };
    // try keeping each axis independently (slide-in)
    if (!this.inObstacle(nx, fromY, r)) return { x: nx, y: fromY };
    if (!this.inObstacle(fromX, ny, r)) return { x: fromX, y: ny };
    // give up: stay at origin
    return { x: fromX, y: fromY };
  }

  // Keep player inside the room. When the room is cleared, the player may
  // step slightly into an open doorway (which triggers the transition).
  private clampToRoom() {
    // endless: open arena, no walls
    if (this.isEndless) {
      this.px = clamp(this.px, FIELD.x + 8, FIELD.x + FIELD.w - 8);
      this.py = clamp(this.py, FIELD.y + 8, FIELD.y + FIELD.h - 8);
      return;
    }
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
    // debuff: snare = full root, slow = reduced multiplier
    let debuffMult = 1;
    if (this.playerSnare > 0) debuffMult = 0;
    else if (this.playerSlow > 0) debuffMult = this.playerSlowMult;
    const moveSpeed = (this.hero.speed + this.bonusSpeed) * (this.speedBuff > 0 ? this.speedBuffMult : 1) * debuffMult;
    this.moving = len > 0 && debuffMult > 0;
    this.animTime += dt;
    if (len > 0 && debuffMult > 0) {
      mx /= len; my /= len;
      const pr = 7;
      const nx = this.px + mx * moveSpeed * dt;
      if (!this.inObstacle(nx, this.py, pr)) this.px = nx;
      const ny = this.py + my * moveSpeed * dt;
      if (!this.inObstacle(this.px, ny, pr)) this.py = ny;
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
    if (this.lifeStealBuff > 0) this.lifeStealBuff -= dt;
    if (this.playerSlow > 0) this.playerSlow -= dt;
    if (this.playerSnare > 0) this.playerSnare -= dt;
    if (this.healOverTime > 0) {
      this.healOverTime -= dt;
      this.php = Math.min(this.phpMax, this.php + this.healOverTimeDps * dt);
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
    let dmg = this.pdmg * (this.dmgBuff > 0 ? this.dmgBuffMult : 1);
    if (this.heroId === "tank") {
      const missingRatio = 1 - this.php / this.phpMax;
      dmg *= 1 + missingRatio * 0.8;
    }
    return dmg;
  }

  private doBasicAttack() {
    // lock aim + start swing animation
    this.atkAimX = this.aimX;
    this.atkAimY = this.aimY;
    this.atkAnim = 1;
    this.atkAnimDur = this.hero.id === "priest"
      ? 0.42
      : this.hero.id === "knight"
        ? 0.42
        : this.hero.attackKind === "ranged" ? 0.18 : 0.22;
    if (this.hero.attackKind === "ranged") {
      this.fireProjectile(this.aimX, this.aimY, this.curDmg(), this.hero.projectile!);
    } else {
      this.meleeArc(this.hero.attackRange, this.curDmg());
      if (this.hero.id !== "priest" && this.hero.id !== "knight") this.spawnSlash();
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
        {
          const resolved = this.avoidObstacle(tx, ty, this.px, this.py, 7);
          this.px = resolved.x;
          this.py = resolved.y;
        }
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
        // boost lifesteal for the duration
        this.lifeStealBuff = 6;
        this.lifeStealBuffFrac = 0.20; // +20% max HP per kill while active
        this.spawnRing(this.px, this.py, "#ff5a5a", 40);
        this.float("WAR CRY!", this.px, this.py - 18, "#ffd24a");
        break;
      }
      case "swordstorm": {
        // summon 5 flying swords that home on the nearest enemies
        const count = 5;
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2;
          const ox = Math.cos(ang) * 18;
          const oy = Math.sin(ang) * 18;
          this.projectiles.push({
            x: this.px + ox,
            y: this.py + oy,
            vx: Math.cos(ang) * 160,
            vy: Math.sin(ang) * 160,
            dmg: dmg * 1.1,
            from: "player",
            kind: "sword",
            life: 3,
            radius: 7,
            homing: true,
            homingTurn: 6,            // rad/sec steering
            hitSet2: new Set<Enemy>(),
            hitsLeft: 3,              // each sword hits up to 3 enemies
          });
        }
        this.spawnRing(this.px, this.py, "#c0c8d8", 22);
        this.float("SWORD STORM", this.px, this.py - 18, "#c0c8d8");
        break;
      }
      // ---- Mage ----
      case "frostnova": {
        // expanding wave sweeps outward, freezing and damaging enemies as it passes
        const novaMaxRadius = 120;
        const novaSpeed = 260;   // px/s expansion speed
        const novaDuration = novaMaxRadius / novaSpeed;
        this.playerNovaWaves.push({
          x: this.px, y: this.py,
          radius: 0, maxRadius: novaMaxRadius,
          speed: novaSpeed,
          dmg: dmg * 1.2,
          frozenDur: 2.5,
          duration: novaDuration,
          time: 0,
          hitSet: new Set(),
        });
        this.float("FROST NOVA", this.px, this.py - 18, "#7ad7ff");
        break;
      }
      case "meteor": {
        const tx = this.input.mouseX, ty = this.input.mouseY;
        const hitR = 70;
        // damage all enemies in expanded radius
        for (const e of this.enemies) {
          if (dist(e.x, e.y, tx, ty) < hitR + e.size * 0.4) this.damageEnemy(e, dmg * 2.4);
        }
        // big explosion ring + fire ring + dense particles + shockwave
        this.spawnRing(tx, ty, "#ff6a1a", hitR);
        this.spawnRing(tx, ty, "#ffd24a", hitR * 0.6);
        for (let i = 0; i < 40; i++) {
          const ang = rand(0, Math.PI * 2);
          const spd = rand(40, 120);
          this.particles.push({ x: tx, y: ty, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: rand(0.4, 0.7), color: i % 3 === 0 ? "#ffd24a" : i % 3 === 1 ? "#ff6a1a" : "#ff3a1a" });
        }
        // fireball burst upward (cosmetic)
        for (let i = 0; i < 6; i++) {
          this.particles.push({ x: tx + rand(-20, 20), y: ty, vx: rand(-15, 15), vy: rand(-100, -50), life: 0.6, color: "#ff8a2a" });
        }
        break;
      }
      case "blink": {
        const tx = clamp(this.input.mouseX, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        const ty = clamp(this.input.mouseY, FIELD.y + 8, FIELD.y + FIELD.h - 8);
        this.spawnRing(this.px, this.py, "#b388ff", 18);
        {
          const resolved = this.avoidObstacle(tx, ty, this.px, this.py, 7);
          this.px = resolved.x;
          this.py = resolved.y;
        }
        this.spawnRing(this.px, this.py, "#b388ff", 18);
        this.invuln = Math.max(this.invuln, 0.2);
        break;
      }
      // ---- Priest ----
      case "smite": {
        if (this.smiteMark && this.enemies.includes(this.smiteMark)) {
          // re-cast: blink behind the marked enemy + strike
          const e = this.smiteMark;
          const behind = e.faceLeft ? 1 : -1;
          const bx = clamp(e.x + behind * 28, FIELD.x + 8, FIELD.x + FIELD.w - 8);
          const by = clamp(e.y + 8, FIELD.y + 8, FIELD.y + FIELD.h - 8);
          this.spawnRing(this.px, this.py, "#ffd24a", 18);
          this.px = bx; this.py = by;
          this.spawnRing(this.px, this.py, "#ffd24a", 18);
          this.damageEnemy(e, dmg * 2.2);
          this.invuln = Math.max(this.invuln, 0.15);
          this.smiteMark = null;
          this.float("SMITE!", this.px, this.py - 18, "#ffd24a");
        } else {
          // first cast: piercing holy bolt — marks first enemy hit
          this.firePiercing(this.aimX, this.aimY, dmg * 1.8, "bolt");
          this.smiteMark = null; // will be set on hit
        }
        break;
      }
      case "heal": {
        // divine heal: burst heal + AoE holy light + heal over time
        const healAmt = Math.round(this.phpMax * 0.4);
        this.php = Math.min(this.phpMax, this.php + healAmt);
        this.healOverTime = 4;
        this.healOverTimeDps = Math.round(this.phpMax * 0.08);
        this.divineHealTime = 0.8;
        // AoE holy light burst damages nearby enemies
        for (const e of this.enemies) {
          if (dist(e.x, e.y, this.px, this.py) < 80 + e.size * 0.4) {
            this.damageEnemy(e, dmg * 0.8);
          }
        }
        this.float("+" + healAmt, this.px, this.py - 18, "#5fff8f");
        this.spawnRing(this.px, this.py, "#ffd24a", 80);
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
        const slamRadius = 80;
        for (const e of this.enemies) {
          const d = dist(e.x, e.y, this.px, this.py);
          if (d < slamRadius + e.size * 0.4) {
            this.damageEnemy(e, dmg * 1.3);
            const a = Math.atan2(e.y - this.py, e.x - this.px);
            e.x = clamp(e.x + Math.cos(a) * 45, FIELD.x + 6, FIELD.x + FIELD.w - 6);
            e.y = clamp(e.y + Math.sin(a) * 45, FIELD.y + 6, FIELD.y + FIELD.h - 6);
          }
        }
        this.spawnRing(this.px, this.py, "#8a8f99", slamRadius);
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
        // shockwave: AoE damage + taunt enemies to approach player for 5s
        for (const e of this.enemies) {
          if (dist(e.x, e.y, this.px, this.py) < 100 + e.size * 0.4) {
            this.damageEnemy(e, dmg * 1.2);
            e.taunted = 5;
          }
        }
        this.spawnRing(this.px, this.py, "#ff3a1a", 100);
        this.float("BERSERK!", this.px, this.py - 18, "#ff3a1a");
        break;
      }
      // ---- Archer ----
      case "multishot": {
        // arrow rain: arrows rain down in a targeted area
        const tx = this.input.mouseX, ty = this.input.mouseY;
        const rainR = 60;
        const count = 12;
        for (let i = 0; i < count; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(0, rainR);
          const ax = tx + Math.cos(ang) * off;
          const ay = ty + Math.sin(ang) * off;
          const delay = rand(0, 0.4);
          // schedule delayed arrows via hazards (reuse meteor telegraph visual)
          this.hazards.push({
            x: ax, y: ay, radius: 8,
            telegraph: 0.3 + delay, telegraphMax: 0.3 + delay,
            dmg: Math.round(dmg * 0.6),
            color: "#8abf5a",
            exploded: false, fade: 0, kind: "meteor",
          });
        }
        this.float("ARROW RAIN", tx, ty - 14, "#8abf5a");
        break;
      }
      case "rapidfire": {
        this.rapidFire = 4;
        this.float("RAPID FIRE", this.px, this.py - 18, "#3f8f5a");
        this.spawnRing(this.px, this.py, "#3f8f5a", 24);
        break;
      }
      case "snipe": {
        // snipe burst: piercing shot + AoE explosion at impact point
        this.firePiercing(this.aimX, this.aimY, dmg * 3, "arrow");
        const tx = this.input.mouseX, ty = this.input.mouseY;
        this.hazards.push({
          x: tx, y: ty, radius: 50,
          telegraph: 0.35, telegraphMax: 0.35,
          dmg: Math.round(dmg * 2),
          color: "#3f8f5a",
          exploded: false, fade: 0, kind: "meteor",
        });
        this.float("SNIPE", tx, ty - 14, "#3f8f5a");
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
      const frozenSlow = e.frozen > 0 ? 0.25 : 1; // frozen enemies crawl
      // taunt timer tick (berserk wave pull)
      if (e.taunted > 0) e.taunted -= dt;
      // phase 3 boss = enraged: moves & basic-attacks faster
      const enrage = e.isBoss && e.phase === 3 ? 1.5 : 1;
      const taunt = e.taunted > 0 ? 1.3 : 1;   // taunted enemies move faster toward player
      const slow = frozenSlow * enrage * taunt;
      const dx = this.px - e.x, dy = this.py - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.faceLeft = dx < 0;
      // boss immobile during castLock or while broken (stunned, vulnerable)
      const locked = e.isBoss && (e.castLock > 0 || e.bossState === "broken");

      const desired = e.ranged && e.taunted <= 0 ? 110 : 0;
      if (e.ranged && e.taunted <= 0) {
        // keep distance
        if (!locked) {
          let ex = 0, ey = 0;
          if (d < desired - 10) { ex = -(dx / d) * e.speed * slow * dt; ey = -(dy / d) * e.speed * slow * dt; }
          else if (d > desired + 10) { ex = (dx / d) * e.speed * slow * dt; ey = (dy / d) * e.speed * slow * dt; }
          const mr = e.size * 0.3;
          if (!this.inObstacle(e.x + ex, e.y, mr)) e.x += ex;
          if (!this.inObstacle(e.x, e.y + ey, mr)) e.y += ey;
        }
        e.atkTimer -= dt * enrage;
        if (e.atkTimer <= 0 && d < 220 && e.frozen <= 0 && !locked) {
          this.enemyFire(e);
          e.atkTimer = e.atkCooldown;
          e.atkAnim = 1;
        }
      } else {
        // chase
        if (!locked) {
          const ex = (dx / d) * e.speed * slow * dt;
          const ey = (dy / d) * e.speed * slow * dt;
          const mr = e.size * 0.3;
          if (!this.inObstacle(e.x + ex, e.y, mr)) e.x += ex;
          if (!this.inObstacle(e.x, e.y + ey, mr)) e.y += ey;
        }
        // contact damage (bosses have extended reach — tentacle/arm swipe)
        e.atkTimer -= dt * enrage;
        const reach = e.isBoss ? e.size * 0.65 + 15 : e.size * 0.4 + 10;
        if (d < reach && e.atkTimer <= 0 && !locked) {
          this.damagePlayer(e.dmg);
          e.atkTimer = e.atkCooldown;
          e.atkAnim = 1;
        }
      }
      // tick attack animation (0.3s swing)
      if (e.atkAnim > 0) e.atkAnim = Math.max(0, e.atkAnim - dt / 0.25);
      // tick spell cast windup animation (0.3s — snappy telegraph)
      if (e.castAnim > 0) e.castAnim = Math.max(0, e.castAnim - dt / 0.3);
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
          const ar = a.size * 0.3, br = b.size * 0.3;
          const ax = a.x - (dx / d) * push, ay = a.y - (dy / d) * push;
          const bx = b.x + (dx / d) * push, by = b.y + (dy / d) * push;
          if (!this.inObstacle(ax, ay, ar)) { a.x = ax; a.y = ay; }
          if (!this.inObstacle(bx, by, br)) { b.x = bx; b.y = by; }
        }
      }
    }

    // boss shield-break system: break window + spell casting (only when shielded)
    const boss = this.enemies.find((e) => e.isBoss);
    if (boss && this.phase === "playing") {
      if (boss.phaseFlash > 0) boss.phaseFlash -= dt;

      if (boss.bossState === "broken") {
        // vulnerability window — boss is stunned, no spells. Frozen pauses the timer.
        if (boss.frozen <= 0) {
          boss.breakTimer -= dt;
          if (boss.breakTimer <= 0) this.endBreak(boss);
        }
      } else if (boss.spellPool.length > 0) {
        // phase 3 = enraged: spells tick faster and cast more often
        const enraged = boss.phase === 3;
        const timeScale = enraged ? 1.6 : 1;   // spell timer drains 60% faster
        const cdScale = enraged ? 0.6 : 1;     // next-cast cooldown shortened
        // shielded — normal spell behaviour
        if (boss.castLock > 0 && boss.frozen <= 0) boss.castLock -= dt * timeScale;
        if (boss.castLock <= 0 && boss.frozen <= 0) {
          this.bossSpellTimer -= dt * timeScale;
          if (this.bossSpellTimer <= 0) {
            const pick = boss.spellPool[Math.floor(Math.random() * boss.spellPool.length)];
            boss.castAnim = 1;   // trigger spell cast windup animation
            this.castBossSpell(boss, pick);
            this.bossSpellTimer = pick.cooldown * cdScale;
          }
        }
      }
    }
  }

  private bossKindOf(boss: Enemy): BossKind {
    return boss.spriteKey.replace("b_", "") as BossKind;
  }

  // ---- spell building blocks (reused by many boss spells) ----

  // fan/cone of bolts aimed toward the player
  private spawnCone(boss: Enemy, count: number, spreadRad: number, speed: number, dmgMult: number, tint: string, kind: "bolt" | "fireball" = "bolt") {
    const base = Math.atan2(this.py - boss.y, this.px - boss.x);
    for (let i = 0; i < count; i++) {
      const ang = base + (count > 1 ? (i - (count - 1) / 2) * (spreadRad / (count - 1)) : 0);
      this.projectiles.push({
        x: boss.x, y: boss.y,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        dmg: Math.round(boss.dmg * dmgMult),
        from: "enemy", kind, life: 2.5, radius: 4, tint,
      });
    }
  }

  // full 360° ring of bolts
  private spawnBoltRing(boss: Enemy, count: number, speed: number, dmgMult: number, tint: string, jitter = 0, kind: "bolt" | "fireball" = "bolt") {
    const base = rand(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const ang = base + (i / count) * Math.PI * 2 + (jitter ? rand(-jitter, jitter) : 0);
      this.projectiles.push({
        x: boss.x, y: boss.y,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        dmg: Math.round(boss.dmg * dmgMult),
        from: "enemy", kind, life: 2.6, radius: 4, tint,
      });
    }
  }

  // a persistent ground pool at a position
  private spawnPoolAt(x: number, y: number, radius: number, time: number, dmgPerSec: number, slow: number, slowTime: number, snare: boolean, snareTime: number, color: string, kind: "slime" | "lava" | "web" | "ink", telegraph: number) {
    this.pools.push({
      x: clamp(x, FIELD.x + 16, FIELD.x + FIELD.w - 16),
      y: clamp(y, FIELD.y + 16, FIELD.y + FIELD.h - 16),
      radius, time, timeMax: time, dmgPerSec,
      slow, slowTime, snare, snareTime,
      color, kind, tickAcc: 0, spawnTelegraph: telegraph,
    });
  }

  // a telegraphed explosion AoE
  private spawnExplosion(x: number, y: number, radius: number, telegraph: number, dmgMult: number, color: string, boss: Enemy, knockback = 0, leavePool = false, poolColor = "#ff6a2a") {
    this.hazards.push({
      x: clamp(x, FIELD.x + 16, FIELD.x + FIELD.w - 16),
      y: clamp(y, FIELD.y + 16, FIELD.y + FIELD.h - 16),
      radius, telegraph, telegraphMax: telegraph,
      dmg: Math.round(boss.dmg * dmgMult),
      color, exploded: false, fade: 0, kind: "eruption",
      knockback, leavePool, poolColor,
    });
  }

  // a line of pools forming a wall, perpendicular to boss→player, offset ahead of player
  private spawnWall(boss: Enemy, segs: number, gap: number, radius: number, time: number, dmgPerSec: number, slow: number, slowTime: number, snare: boolean, snareTime: number, color: string, kind: "slime" | "lava" | "web" | "ink") {
    const toPlayer = Math.atan2(this.py - boss.y, this.px - boss.x);
    const perp = toPlayer + Math.PI / 2;
    for (let i = 0; i < segs; i++) {
      const off = (i - (segs - 1) / 2) * gap;
      const x = this.px + Math.cos(perp) * off;
      const y = this.py + Math.sin(perp) * off;
      this.spawnPoolAt(x, y, radius, time, dmgPerSec, slow, slowTime, snare, snareTime, color, kind, 0.4);
    }
  }

  private castBossSpell(boss: Enemy, spell: BossSpell) {
    const t = spell.tier;
    switch (spell.kind) {
      // ----- lava family -----
      case "meteor": {
        const count = t === 1 ? 4 : t === 2 ? 6 : 8;
        const teleBase = t === 3 ? 0.25 : 0.35;
        for (let i = 0; i < count; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(20, 80);
          const tx = clamp(this.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
          const ty = clamp(this.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
          const tele = teleBase + i * 0.2;
          this.hazards.push({
            x: tx, y: ty, radius: 50,
            telegraph: tele, telegraphMax: tele,
            dmg: Math.round(boss.dmg * 1.2),
            color: "#ff6a2a",
            exploded: false, fade: 0, kind: "meteor",
          });
        }
        this.float("METEOR STORM!", boss.x, boss.y - 30, "#ff6a2a");
        break;
      }
      // ----- slime family (Stage B) -----
      case "split": {
        const count = t === 1 ? 2 : t === 2 ? 4 : 6;
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2 + rand(-0.2, 0.2);
          const off = 30 + rand(0, 20);
          this.spawnMini("slime", boss.x + Math.cos(ang) * off, boss.y + Math.sin(ang) * off,
            Math.round(boss.maxHp * 0.08), Math.round(boss.dmg * 0.4), 14);
        }
        this.spawnRing(boss.x, boss.y, "#5fcc5f", 40);
        this.float("SPLIT!", boss.x, boss.y - 30, "#5fcc5f");
        break;
      }
      case "slimePool": {
        const count = t === 1 ? 1 : t === 2 ? 3 : 5;
        for (let i = 0; i < count; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(30, 90);
          const tx = clamp(boss.x + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
          const ty = clamp(boss.y + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
          this.pools.push({
            x: tx, y: ty, radius: 28,
            time: 5, timeMax: 5,
            dmgPerSec: Math.round(boss.dmg * 0.4),
            slow: 0.5, slowTime: 2, snare: false, snareTime: 0,
            color: "#5fcc5f", kind: "slime",
            tickAcc: 0, spawnTelegraph: 0.25,
          });
        }
        this.float("SLIME POOL!", boss.x, boss.y - 30, "#5fcc5f");
        break;
      }
      case "bounceSlam": {
        const slams = t === 1 ? 1 : t === 2 ? 2 : 1;
        const radius = t === 3 ? 80 : 50;
        const knock = t === 2 ? 45 : t === 3 ? 60 : 0;
        for (let i = 0; i < slams; i++) {
          // staggered slams target player pos at cast time + offset
          const off = i === 0 ? 0 : 50;
          const ang = rand(0, Math.PI * 2);
          const tx = clamp(this.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
          const ty = clamp(this.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
          const tele = 0.4 + i * 0.25;
          this.hazards.push({
            x: tx, y: ty, radius,
            telegraph: tele, telegraphMax: tele,
            dmg: Math.round(boss.dmg * 1.0),
            color: "#5fcc5f",
            exploded: false, fade: 0, kind: "bounceSlam",
            knockback: knock,
          });
        }
        boss.castLock = 0.4 + slams * 0.25;
        this.float("BOUNCE SLAM!", boss.x, boss.y - 30, "#5fcc5f");
        break;
      }
      // ----- spider family (Stage C) -----
      case "webBarrage": {
        const count = t === 1 ? 6 : t === 2 ? 12 : 18;
        const baseAng = Math.atan2(this.py - boss.y, this.px - boss.x);
        for (let i = 0; i < count; i++) {
          let ang: number;
          if (t === 1) {
            // 60° fan toward player
            ang = baseAng + (i - (count - 1) / 2) * (Math.PI / 3 / (count - 1));
          } else {
            // 360° ring (tier 2) or radial burst (tier 3)
            ang = (i / count) * Math.PI * 2 + (t === 3 ? rand(-0.1, 0.1) : 0);
          }
          const speed = t === 3 ? 200 : 180;
          this.projectiles.push({
            x: boss.x, y: boss.y,
            vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
            dmg: Math.round(boss.dmg * 0.6),
            from: "enemy", kind: "bolt", life: 2.5, radius: 4,
            tint: "#dfe3e8",
          });
        }
        this.float("WEB BARRAGE!", boss.x, boss.y - 30, "#dfe3e8");
        break;
      }
      case "webTrap": {
        const count = t === 1 ? 1 : t === 2 ? 3 : 5;
        for (let i = 0; i < count; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(20, 80);
          const tx = clamp(this.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
          const ty = clamp(this.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
          this.pools.push({
            x: tx, y: ty, radius: 24,
            time: 4, timeMax: 4,
            dmgPerSec: 0,
            slow: 0, slowTime: 0, snare: true, snareTime: 1.5,
            color: "#e8e8f0", kind: "web",
            tickAcc: 0, spawnTelegraph: 0.3,
          });
        }
        this.float("WEB TRAP!", boss.x, boss.y - 30, "#e8e8f0");
        break;
      }
      case "summonSpiderlings": {
        const count = t === 1 ? 2 : t === 2 ? 4 : 6;
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2;
          const off = 40;
          this.spawnMini("spider", boss.x + Math.cos(ang) * off, boss.y + Math.sin(ang) * off,
            Math.round(boss.maxHp * 0.06), Math.round(boss.dmg * 0.5), 14);
        }
        // tier 3: haste buff to all enemies
        if (t === 3) {
          for (const e of this.enemies) {
            if (!e.isBoss) e.speed *= 1.4;
          }
          this.float("HASTE!", boss.x, boss.y - 30, "#ffd24a");
        }
        this.spawnRing(boss.x, boss.y, "#dfe3e8", 40);
        this.float("SUMMON!", boss.x, boss.y - 45, "#dfe3e8");
        break;
      }
      // ----- lich family (Stage D) -----
      case "deathBeam": {
        const beamCount = t === 1 ? 1 : t === 2 ? 2 : 1;
        const sweep = t === 3 ? 1.2 : 0;
        const tele = 0.5, active = 0.3;
        for (let i = 0; i < beamCount; i++) {
          let tx: number, ty: number;
          if (i === 0) {
            tx = this.px; ty = this.py;
          } else {
            const ang = Math.atan2(this.py - boss.y, this.px - boss.x) + rand(-0.8, 0.8);
            const len = dist(boss.x, boss.y, this.px, this.py);
            tx = boss.x + Math.cos(ang) * len;
            ty = boss.y + Math.sin(ang) * len;
          }
          const baseAng = Math.atan2(ty - boss.y, tx - boss.x);
          this.beams.push({
            x1: boss.x, y1: boss.y, x2: tx, y2: ty,
            telegraph: tele, telegraphMax: tele,
            active: 0, activeMax: active,
            dmgTick: 0, dmg: Math.round(boss.dmg * 1.5),
            color: "#a06cff",
            sweep, sweepAngle: 0, baseAngle: baseAng,
          });
        }
        boss.castLock = tele + active;
        this.float("DEATH BEAM!", boss.x, boss.y - 30, "#a06cff");
        break;
      }
      case "boneRing": {
        const count = t === 1 ? 8 : t === 2 ? 16 : 24;
        // tier 3: spiral — fire in rotating offset batches over time via staggered life
        const baseAng = rand(0, Math.PI * 2);
        for (let i = 0; i < count; i++) {
          const ang = baseAng + (i / count) * Math.PI * 2 + (t === 3 ? Math.sin(i * 0.5) * 0.3 : 0);
          this.projectiles.push({
            x: boss.x, y: boss.y,
            vx: Math.cos(ang) * 200, vy: Math.sin(ang) * 200,
            dmg: Math.round(boss.dmg * 0.7),
            from: "enemy", kind: "bolt", life: 2.5, radius: 4,
            tint: "#c8b8e8",
          });
        }
        this.float("BONE RING!", boss.x, boss.y - 30, "#c8b8e8");
        break;
      }
      case "raiseDead": {
        const skel = t === 1 ? 2 : t === 2 ? 3 : 4;
        const ghosts = t === 1 ? 0 : t === 2 ? 1 : 2;
        for (let i = 0; i < skel; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(30, 60);
          this.spawnMini("skeleton", boss.x + Math.cos(ang) * off, boss.y + Math.sin(ang) * off,
            Math.round(boss.maxHp * 0.1), Math.round(boss.dmg * 0.5), 16);
        }
        for (let i = 0; i < ghosts; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(30, 60);
          this.spawnMini("ghost", boss.x + Math.cos(ang) * off, boss.y + Math.sin(ang) * off,
            Math.round(boss.maxHp * 0.08), Math.round(boss.dmg * 0.4), 16);
        }
        this.spawnRing(boss.x, boss.y, "#a06cff", 40);
        this.float("RAISE DEAD!", boss.x, boss.y - 30, "#a06cff");
        break;
      }
      // ----- lava pools/eruption (Stage E) -----
      case "lavaPool": {
        const count = t === 1 ? 1 : t === 2 ? 3 : 5;
        for (let i = 0; i < count; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(30, 100);
          const tx = clamp(this.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
          const ty = clamp(this.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
          this.pools.push({
            x: tx, y: ty, radius: 32,
            time: 6, timeMax: 6,
            dmgPerSec: Math.round(boss.dmg * 0.6),
            slow: 0.3, slowTime: 1, snare: false, snareTime: 0,
            color: "#ff6a2a", kind: "lava",
            tickAcc: 0, spawnTelegraph: 0.3,
          });
        }
        this.float("LAVA POOL!", boss.x, boss.y - 30, "#ff6a2a");
        break;
      }
      case "eruption": {
        const radius = t === 1 ? 60 : t === 2 ? 90 : 120;
        const knock = t === 1 ? 0 : t === 2 ? 45 : 60;
        const leavePool = t === 3;
        const tele = 0.4;
        this.hazards.push({
          x: boss.x, y: boss.y, radius,
          telegraph: tele, telegraphMax: tele,
          dmg: Math.round(boss.dmg * 1.3),
          color: "#ff3a2a",
          exploded: false, fade: 0, kind: "eruption",
          knockback: knock,
          leavePool,
          poolColor: "#ff6a2a",
        });
        boss.castLock = 0.5;
        this.float("ERUPTION!", boss.x, boss.y - 30, "#ff3a2a");
        break;
      }

      // ========== GIANT SLIME — phase 2 ==========
      case "acidSpray": {
        // wide cone of acid bolts toward player
        this.spawnCone(boss, 7, Math.PI * 0.55, 170, 0.55, "#9be04a");
        boss.castLock = 0.3;
        this.float("ACID SPRAY!", boss.x, boss.y - 30, "#9be04a");
        break;
      }
      case "slimeWall": {
        // line of slow pools cutting across the player's lane
        this.spawnWall(boss, 5, 30, 24, 5, Math.round(boss.dmg * 0.4), 0.5, 1.5, false, 0, "#5fcc5f", "slime");
        this.float("SLIME WALL!", boss.x, boss.y - 30, "#5fcc5f");
        break;
      }
      case "doubleSlam": {
        // two telegraphed slams: on player + ahead of player
        this.spawnExplosion(this.px, this.py, 52, 0.45, 1.0, "#5fcc5f", boss, 40);
        const a = Math.atan2(this.py - boss.y, this.px - boss.x);
        this.spawnExplosion(this.px + Math.cos(a) * 60, this.py + Math.sin(a) * 60, 52, 0.7, 1.0, "#5fcc5f", boss, 40);
        boss.castLock = 0.9;
        this.float("DOUBLE SLAM!", boss.x, boss.y - 30, "#5fcc5f");
        break;
      }

      // ========== GIANT SLIME — phase 3 ==========
      case "toxicFlood": {
        // arena flooded with many toxic pools
        for (let i = 0; i < 6; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(30, 110);
          this.spawnPoolAt(this.px + Math.cos(ang) * off, this.py + Math.sin(ang) * off,
            30, 6, Math.round(boss.dmg * 0.5), 0.4, 1.2, false, 0, "#7ad04a", "slime", 0.3);
        }
        this.float("TOXIC FLOOD!", boss.x, boss.y - 30, "#7ad04a");
        break;
      }
      case "megaSplit": {
        // few large, tankier slimes
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * Math.PI * 2 + rand(-0.2, 0.2);
          this.spawnMini("slime", boss.x + Math.cos(ang) * 36, boss.y + Math.sin(ang) * 36,
            Math.round(boss.maxHp * 0.16), Math.round(boss.dmg * 0.6), 22);
        }
        this.spawnRing(boss.x, boss.y, "#5fcc5f", 48);
        this.float("MEGA SPLIT!", boss.x, boss.y - 30, "#5fcc5f");
        break;
      }
      case "groundPound": {
        // huge slam centered on the boss with knockback + lingering pool
        this.spawnExplosion(boss.x, boss.y, 120, 0.6, 1.3, "#5fcc5f", boss, 70, true, "#7ad04a");
        boss.castLock = 0.8;
        this.float("GROUND POUND!", boss.x, boss.y - 30, "#5fcc5f");
        break;
      }

      // ========== SPIDER QUEEN — phase 2 ==========
      case "venomSpit": {
        // tight cone of venom + leaves a small pool where it lands near player
        this.spawnCone(boss, 5, Math.PI * 0.35, 200, 0.6, "#b06ad0");
        this.spawnPoolAt(this.px, this.py, 22, 4, Math.round(boss.dmg * 0.4), 0.3, 1, false, 0, "#b06ad0", "slime", 0.4);
        boss.castLock = 0.3;
        this.float("VENOM SPIT!", boss.x, boss.y - 30, "#b06ad0");
        break;
      }
      case "webWall": {
        // wall of snaring web across player's lane
        this.spawnWall(boss, 5, 28, 22, 4, 0, 0, 0, true, 1.2, "#e8e8f0", "web");
        this.float("WEB WALL!", boss.x, boss.y - 30, "#e8e8f0");
        break;
      }
      case "leapStrike": {
        // boss leaps to player and slams (telegraph at player pos)
        this.spawnExplosion(this.px, this.py, 60, 0.7, 1.2, "#dfe3e8", boss, 55);
        boss.castLock = 0.8;
        this.float("LEAP STRIKE!", boss.x, boss.y - 30, "#dfe3e8");
        break;
      }

      // ========== SPIDER QUEEN — phase 3 ==========
      case "spiderRain": {
        // egg-sacs rain down as telegraphed AoEs that hatch nothing (pure damage)
        for (let i = 0; i < 7; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(20, 100);
          this.spawnExplosion(this.px + Math.cos(ang) * off, this.py + Math.sin(ang) * off,
            34, 0.4 + i * 0.15, 0.9, "#dfe3e8", boss);
        }
        this.float("SPIDER RAIN!", boss.x, boss.y - 30, "#dfe3e8");
        break;
      }
      case "broodSwarm": {
        // big summon + haste to all minions
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          this.spawnMini("spider", boss.x + Math.cos(ang) * 42, boss.y + Math.sin(ang) * 42,
            Math.round(boss.maxHp * 0.06), Math.round(boss.dmg * 0.5), 14);
        }
        for (const e of this.enemies) if (!e.isBoss) e.speed *= 1.4;
        this.spawnRing(boss.x, boss.y, "#dfe3e8", 46);
        this.float("BROOD SWARM!", boss.x, boss.y - 30, "#dfe3e8");
        break;
      }
      case "silkPrison": {
        // large snare zone on player + bolt ring outward (forces dodge while rooted threat)
        this.spawnPoolAt(this.px, this.py, 40, 4, 0, 0, 0, true, 1.6, "#e8e8f0", "web", 0.5);
        this.spawnBoltRing(boss, 12, 170, 0.5, "#dfe3e8");
        this.float("SILK PRISON!", boss.x, boss.y - 30, "#e8e8f0");
        break;
      }

      // ========== LICH — phase 2 ==========
      case "soulLance": {
        // twin beams at player + offset angle
        const tele = 0.5, active = 0.3;
        for (let i = 0; i < 2; i++) {
          const angOff = i === 0 ? 0 : rand(-0.6, 0.6);
          const baseAng = Math.atan2(this.py - boss.y, this.px - boss.x) + angOff;
          const len = dist(boss.x, boss.y, this.px, this.py) + 40;
          this.beams.push({
            x1: boss.x, y1: boss.y,
            x2: boss.x + Math.cos(baseAng) * len, y2: boss.y + Math.sin(baseAng) * len,
            telegraph: tele, telegraphMax: tele, active: 0, activeMax: active,
            dmgTick: 0, dmg: Math.round(boss.dmg * 1.4), color: "#b06cff",
            sweep: 0, sweepAngle: 0, baseAngle: baseAng,
          });
        }
        boss.castLock = tele + active;
        this.float("SOUL LANCE!", boss.x, boss.y - 30, "#b06cff");
        break;
      }
      case "boneSpear": {
        // fast piercing cone of bone shards
        this.spawnCone(boss, 5, Math.PI * 0.25, 240, 0.7, "#c8b8e8");
        boss.castLock = 0.3;
        this.float("BONE SPEAR!", boss.x, boss.y - 30, "#c8b8e8");
        break;
      }
      case "curseZone": {
        // dark pools that damage + slow around the player
        for (let i = 0; i < 3; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(30, 80);
          this.spawnPoolAt(this.px + Math.cos(ang) * off, this.py + Math.sin(ang) * off,
            28, 5, Math.round(boss.dmg * 0.5), 0.4, 1.2, false, 0, "#8a5ad0", "slime", 0.4);
        }
        this.float("CURSE ZONE!", boss.x, boss.y - 30, "#8a5ad0");
        break;
      }

      // ========== LICH — phase 3 ==========
      case "deathNova": {
        // expanding bolt ring + explosion on boss
        this.spawnBoltRing(boss, 20, 190, 0.6, "#b06cff");
        this.spawnExplosion(boss.x, boss.y, 90, 0.4, 1.0, "#8a5ad0", boss, 50);
        boss.castLock = 0.4;
        this.float("DEATH NOVA!", boss.x, boss.y - 30, "#b06cff");
        break;
      }
      case "boneStorm": {
        // dense double ring of bones
        this.spawnBoltRing(boss, 24, 170, 0.6, "#c8b8e8");
        this.spawnBoltRing(boss, 24, 230, 0.6, "#c8b8e8", 0.1);
        this.float("BONE STORM!", boss.x, boss.y - 30, "#c8b8e8");
        break;
      }
      case "undeadArmy": {
        // large summon: skeletons + ghosts
        for (let i = 0; i < 4; i++) {
          const ang = rand(0, Math.PI * 2), off = rand(30, 60);
          this.spawnMini("skeleton", boss.x + Math.cos(ang) * off, boss.y + Math.sin(ang) * off,
            Math.round(boss.maxHp * 0.1), Math.round(boss.dmg * 0.5), 16);
        }
        for (let i = 0; i < 2; i++) {
          const ang = rand(0, Math.PI * 2), off = rand(30, 60);
          this.spawnMini("ghost", boss.x + Math.cos(ang) * off, boss.y + Math.sin(ang) * off,
            Math.round(boss.maxHp * 0.08), Math.round(boss.dmg * 0.4), 16);
        }
        this.spawnRing(boss.x, boss.y, "#b06cff", 48);
        this.float("UNDEAD ARMY!", boss.x, boss.y - 30, "#b06cff");
        break;
      }

      // ========== LAVA GOLEM — phase 2 ==========
      case "fireWall": {
        // wall of lava across player's lane
        this.spawnWall(boss, 5, 30, 26, 5, Math.round(boss.dmg * 0.6), 0.3, 1, false, 0, "#ff6a2a", "lava");
        this.float("FIRE WALL!", boss.x, boss.y - 30, "#ff6a2a");
        break;
      }
      case "magmaWave": {
        // wide cone of fireballs
        this.spawnCone(boss, 7, Math.PI * 0.5, 180, 0.6, "#ff8a2a", "fireball");
        boss.castLock = 0.3;
        this.float("MAGMA WAVE!", boss.x, boss.y - 30, "#ff8a2a");
        break;
      }
      case "emberBurst": {
        // ring of fireballs outward
        this.spawnBoltRing(boss, 14, 180, 0.6, "#ff8a2a", 0, "fireball");
        this.float("EMBER BURST!", boss.x, boss.y - 30, "#ff8a2a");
        break;
      }

      // ========== LAVA GOLEM — phase 3 ==========
      case "volcano": {
        // 10 meteors raining across the arena
        for (let i = 0; i < 10; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(20, 110);
          const tx = clamp(this.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
          const ty = clamp(this.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
          const tele = 0.3 + i * 0.12;
          this.hazards.push({
            x: tx, y: ty, radius: 46,
            telegraph: tele, telegraphMax: tele,
            dmg: Math.round(boss.dmg * 1.1), color: "#ff6a2a",
            exploded: false, fade: 0, kind: "meteor",
          });
        }
        this.float("VOLCANO!", boss.x, boss.y - 30, "#ff6a2a");
        break;
      }
      case "lavaTsunami": {
        // multiple lava walls sweeping — fill much of the arena with lava lanes
        for (let row = 0; row < 3; row++) {
          for (let i = 0; i < 4; i++) {
            const x = FIELD.x + 40 + i * (FIELD.w / 4);
            const y = FIELD.y + 50 + row * (FIELD.h / 3);
            this.spawnPoolAt(x, y, 30, 5, Math.round(boss.dmg * 0.6), 0.3, 1, false, 0, "#ff6a2a", "lava", 0.4 + row * 0.3);
          }
        }
        this.float("LAVA TSUNAMI!", boss.x, boss.y - 30, "#ff3a2a");
        break;
      }
      case "infernoNova": {
        // massive explosion on boss + leaves big lava pool
        this.spawnExplosion(boss.x, boss.y, 130, 0.6, 1.4, "#ff3a2a", boss, 65, true, "#ff6a2a");
        this.spawnBoltRing(boss, 12, 160, 0.5, "#ff8a2a", 0, "fireball");
        boss.castLock = 0.8;
        this.float("INFERNO NOVA!", boss.x, boss.y - 30, "#ff3a2a");
        break;
      }

      // ----- octopus family (Stage ?) -----
      case "inkBlast": {
        // telegraphed AoE explosions near player, ink-colored
        const count = t === 1 ? 3 : t === 2 ? 5 : 7;
        for (let i = 0; i < count; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(20, 70);
          const tx = clamp(this.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
          const ty = clamp(this.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
          const tele = 0.4 + i * 0.15;
          this.spawnExplosion(tx, ty, 45, tele, 1.0, "#2a4a6a", boss, 0, true, "#1a2a4a");
        }
        this.float("INK BLAST!", boss.x, boss.y - 30, "#2a4a6a");
        break;
      }
      case "tentacleSlam": {
        // line of ink pools forming a wall perpendicular to boss→player
        const segs = t === 1 ? 4 : t === 2 ? 6 : 8;
        this.spawnWall(boss, segs, 24, 22, 4, Math.round(boss.dmg * 0.3), 0.4, 1.5, false, 0, "#2a4a6a", "ink");
        this.float("TENTACLE SLAM!", boss.x, boss.y - 30, "#6a3a8a");
        break;
      }
      case "bubbleRing": {
        // ring of bolts around boss, bubble-tinted
        const count = t === 1 ? 10 : t === 2 ? 14 : 18;
        const speed = t === 3 ? 180 : 140;
        this.spawnBoltRing(boss, count, speed, 0.7, "#5ac8ff", 0.15, "bolt");
        this.float("BUBBLE RING!", boss.x, boss.y - 30, "#5ac8ff");
        break;
      }
      case "inkCloud": {
        const count = t === 1 ? 4 : t === 2 ? 7 : 10;
        for (let i = 0; i < count; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(20, 100);
          const tx = clamp(this.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
          const ty = clamp(this.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
          this.spawnPoolAt(tx, ty, 26, 5, Math.round(boss.dmg * 0.35), 0.5, 2, false, 0, "#2a4a6a", "ink", 0.4);
        }
        this.float("INK CLOUD!", boss.x, boss.y - 30, "#2a4a6a");
        break;
      }
      case "whirlpool": {
        const count = t === 1 ? 3 : t === 2 ? 5 : 7;
        const spread = t === 1 ? 40 : 60;
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2;
          const tx = clamp(this.px + Math.cos(ang) * spread, FIELD.x + 20, FIELD.x + FIELD.w - 20);
          const ty = clamp(this.py + Math.sin(ang) * spread, FIELD.y + 20, FIELD.y + FIELD.h - 20);
          this.spawnPoolAt(tx, ty, 24, 4, Math.round(boss.dmg * 0.25), 0.3, 1, true, 1.5, "#1a3a5a", "ink", 0.5);
        }
        this.float("WHIRLPOOL!", boss.x, boss.y - 30, "#1a3a5a");
        break;
      }
      case "tentacleSweep": {
        const count = t === 1 ? 6 : t === 2 ? 9 : 12;
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2 + rand(-0.2, 0.2);
          const off = rand(30, 80);
          const tx = clamp(boss.x + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
          const ty = clamp(boss.y + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
          const tele = 0.3 + i * 0.1;
          this.spawnExplosion(tx, ty, 40, tele, 0.9, "#6a3a8a", boss, 0, true, "#2a4a6a");
        }
        this.float("TENTACLE SWEEP!", boss.x, boss.y - 30, "#6a3a8a");
        break;
      }
      case "deepCrush": {
        const radius = t === 1 ? 100 : t === 2 ? 130 : 160;
        this.spawnExplosion(boss.x, boss.y, radius, 0.6, 1.5, "#2a4a6a", boss, 20, true, "#1a2a4a");
        const count = t === 1 ? 4 : 6;
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2;
          const tx = clamp(boss.x + Math.cos(ang) * 70, FIELD.x + 20, FIELD.x + FIELD.w - 20);
          const ty = clamp(boss.y + Math.sin(ang) * 70, FIELD.y + 20, FIELD.y + FIELD.h - 20);
          this.spawnExplosion(tx, ty, 35, 0.8, 0.8, "#6a3a8a", boss);
        }
        this.spawnRing(boss.x, boss.y, "#2a4a6a", radius);
        this.float("DEEP CRUSH!", boss.x, boss.y - 30, "#2a4a6a");
        break;
      }
      case "krakensGrasp": {
        const count = t === 1 ? 2 : t === 2 ? 3 : 4;
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
          const off = 40 + rand(0, 20);
          this.spawnMini("anglerfish",
            boss.x + Math.cos(ang) * off,
            boss.y + Math.sin(ang) * off,
            Math.round(boss.maxHp * 0.06), Math.round(boss.dmg * 0.4), 14);
        }
        this.spawnRing(boss.x, boss.y, "#2a4a6a", 50);
        this.float("KRAKEN'S GRASP!", boss.x, boss.y - 30, "#2a4a6a");
        break;
      }
      case "abyssalSurge": {
        const count = t === 1 ? 8 : t === 2 ? 12 : 16;
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2;
          const off = rand(40, 100);
          const tx = clamp(boss.x + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
          const ty = clamp(boss.y + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
          this.spawnExplosion(tx, ty, 30, 0.2 + i * 0.08, 0.7, "#1a3a5a", boss, 0, true, "#2a4a6a");
        }
        this.spawnExplosion(boss.x, boss.y, 60, 0.5, 1.2, "#2a4a6a", boss, 15, true, "#1a2a4a");
        this.spawnRing(boss.x, boss.y, "#5ac8ff", 100);
        this.float("ABYSSAL SURGE!", boss.x, boss.y - 30, "#5ac8ff");
        break;
      }
    }
  }

  private updateHazards(dt: number) {
    // AoE hazards (meteor, bounceSlam, eruption)
    for (const h of this.hazards) {
      if (!h.exploded) {
        h.telegraph -= dt;
        if (h.telegraph <= 0) {
          h.exploded = true;
          h.fade = 0.4;
          this.explodeAoE(h);
        }
      } else {
        h.fade -= dt;
      }
    }
    this.hazards = this.hazards.filter((h) => !h.exploded || h.fade > 0);

    // beams (Stage D)
    this.updateBeams(dt);

    // pools (Stage E)
    this.updatePools(dt);
  }

  private updateBeams(dt: number) {
    for (const b of this.beams) {
      // sweep: rotate endpoint around boss for tier 3
      if (b.sweep && b.sweep !== 0 && b.baseAngle !== undefined) {
        const activePhase = b.telegraph <= 0;
        if (activePhase) b.sweepAngle = (b.sweepAngle || 0) + b.sweep * dt;
        const ang = b.baseAngle + (b.sweepAngle || 0);
        const len = dist(b.x1, b.y1, b.x2, b.y2);
        b.x2 = b.x1 + Math.cos(ang) * len;
        b.y2 = b.y1 + Math.sin(ang) * len;
      }
      if (b.telegraph > 0) {
        b.telegraph -= dt;
        if (b.telegraph <= 0) {
          b.active = b.activeMax;
        }
      } else if (b.active > 0) {
        b.active -= dt;
        // dmg tick every 0.25s along segment
        b.dmgTick += dt;
        if (b.dmgTick >= 0.25) {
          b.dmgTick = 0;
          if (this.distToSegment(this.px, this.py, b.x1, b.y1, b.x2, b.y2) < 14) {
            this.damagePlayer(Math.round(b.dmg * 0.25));
          }
        }
      }
    }
    this.beams = this.beams.filter((b) => b.telegraph > 0 || b.active > 0);
  }

  private updatePools(dt: number) {
    for (const p of this.pools) {
      // pre-activate telegraph
      if (p.spawnTelegraph > 0) {
        p.spawnTelegraph -= dt;
        continue;
      }
      p.time -= dt;
      // dmg tick every 0.5s if player inside
      p.tickAcc += dt;
      if (p.tickAcc >= 0.5) {
        p.tickAcc = 0;
        if (dist(this.px, this.py, p.x, p.y) < p.radius) {
          this.damagePlayer(Math.round(p.dmgPerSec * 0.5));
        }
      }
      // apply debuff each frame while overlapping (refreshes timer)
      if (dist(this.px, this.py, p.x, p.y) < p.radius) {
        if (p.snare) {
          this.playerSnare = Math.max(this.playerSnare, p.snareTime);
        } else if (p.slow > 0) {
          this.playerSlow = Math.max(this.playerSlow, p.slowTime);
          this.playerSlowMult = 1 - p.slow;
        }
      }
      // bubbling particles
      if (Math.random() < 0.3) {
        const ang = rand(0, Math.PI * 2);
        const r = rand(0, p.radius * 0.8);
        this.particles.push({
          x: p.x + Math.cos(ang) * r, y: p.y + Math.sin(ang) * r,
          vx: rand(-10, 10), vy: rand(-30, -10),
          life: 0.5, color: p.color,
        });
      }
    }
    this.pools = this.pools.filter((p) => p.time > 0);
  }

  private updateNovaWaves(dt: number) {
    for (const w of this.playerNovaWaves) {
      w.time += dt;
      w.radius += w.speed * dt;
      // check enemies in the expanding ring shell (±8px band)
      const inner = w.radius - 8;
      for (const e of this.enemies) {
        if (w.hitSet.has(e)) continue;
        const d = dist(e.x, e.y, w.x, w.y);
        if (d >= inner && d <= w.radius + e.size * 0.4) {
          this.damageEnemy(e, w.dmg);
          e.frozen = Math.max(e.frozen, w.frozenDur);
          w.hitSet.add(e);
        }
      }
    }
    this.playerNovaWaves = this.playerNovaWaves.filter((w) => w.time < w.duration);
  }

  private explodeAoE(h: HazardAoE) {
    this.spawnRing(h.x, h.y, h.color, h.radius);
    for (let i = 0; i < 16; i++) {
      this.particles.push({
        x: h.x, y: h.y,
        vx: rand(-90, 90), vy: rand(-90, 90),
        life: 0.6, color: i % 2 === 0 ? h.color : "#ffd24a",
      });
    }
    if (dist(this.px, this.py, h.x, h.y) < h.radius) {
      this.damagePlayer(h.dmg);
      // knockback (bounceSlam, eruption tier 2+)
      if (h.knockback && h.knockback > 0) {
        const dx = this.px - h.x, dy = this.py - h.y;
        const d = Math.hypot(dx, dy) || 1;
        {
          const kx = clamp(this.px + (dx / d) * h.knockback, FIELD.x + 8, FIELD.x + FIELD.w - 8);
          const ky = clamp(this.py + (dy / d) * h.knockback, FIELD.y + 8, FIELD.y + FIELD.h - 8);
          const resolved = this.avoidObstacle(kx, ky, this.px, this.py, 7);
          this.px = resolved.x;
          this.py = resolved.y;
        }
      }
    }
    // eruption tier 3 leaves a lava pool at center
    if (h.leavePool) {
      this.pools.push({
        x: h.x, y: h.y, radius: 30,
        time: 5, timeMax: 5,
        dmgPerSec: Math.round(h.dmg * 0.4),
        slow: 0.3, slowTime: 1, snare: false, snareTime: 0,
        color: h.poolColor || "#ff6a2a", kind: "lava",
        tickAcc: 0, spawnTelegraph: 0,
      });
    }
  }

  private drawHazards(ctx: CanvasRenderingContext2D) {
    for (const h of this.hazards) {
      if (!h.exploded) {
        const t = h.telegraph / h.telegraphMax;   // 1 → 0 as it counts down
        const pulse = 0.4 + 0.3 * Math.sin(performance.now() / 80);
        // ground telegraph circle
        ctx.save();
        ctx.globalAlpha = 0.18 * pulse;
        ctx.fillStyle = h.color;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.7 * pulse;
        ctx.strokeStyle = h.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        // crosshair
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(h.x - 6, h.y); ctx.lineTo(h.x + 6, h.y);
        ctx.moveTo(h.x, h.y - 6); ctx.lineTo(h.x, h.y + 6);
        ctx.stroke();
        // falling meteor: descends from y - 100 to y over telegraph (only meteor kind)
        if (h.kind === "meteor") {
          const fallY = h.y - 100 * t;
          ctx.globalAlpha = 1;
          ctx.fillStyle = h.color;
          ctx.beginPath();
          ctx.arc(h.x, fallY, 5 + (1 - t) * 2, 0, Math.PI * 2);
          ctx.fill();
          // trailing glow
          ctx.globalAlpha = 0.4 * t;
          ctx.fillStyle = "#ffd24a";
          ctx.fillRect(h.x - 1, fallY, 2, h.y - fallY);
        }
        ctx.restore();
      } else {
        // explosion fade: expanding filled circle, white flash first 0.1s
        const k = 1 - h.fade / 0.4;   // 0 → 1 as it fades out
        const r = h.radius * (1 + k * 0.5);
        ctx.save();
        const grad = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, r);
        grad.addColorStop(0, h.fade > 0.3 ? "#ffffff" : "#ffd24a");
        grad.addColorStop(0.5, h.color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = h.fade / 0.4;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    // beams + pools (Stage D/E)
    this.drawBeams(ctx);
    this.drawPools(ctx);
  }

  private drawBeams(ctx: CanvasRenderingContext2D) {
    const now = performance.now();
    for (const b of this.beams) {
      ctx.save();
      if (b.telegraph > 0) {
        // telegraph: thin dashed line, pulsing
        const pulse = 0.5 + 0.3 * Math.sin(now / 60);
        ctx.globalAlpha = 0.7 * pulse;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (b.active > 0) {
        // active beam: thick gradient line + glow
        const k = b.active / b.activeMax;  // 1 → 0
        ctx.globalAlpha = k;
        // outer glow
        ctx.shadowBlur = 12;
        ctx.shadowColor = b.color;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();
        // core white-hot
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawPools(ctx: CanvasRenderingContext2D) {
    const now = performance.now();
    for (const p of this.pools) {
      ctx.save();
      if (p.spawnTelegraph > 0) {
        // pre-activate telegraph: dashed outline only
        const pulse = 0.5 + 0.3 * Math.sin(now / 60);
        ctx.globalAlpha = 0.6 * pulse;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // active pool: bubbling translucent fill + wavy edge
        const k = p.time / p.timeMax;   // 1 → 0 fade
        const wobble = Math.sin(now / 150) * 2;
        ctx.globalAlpha = 0.35 * k;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + wobble, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.7 * k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        // web kind: add crosshatch web pattern
        if (p.kind === "web") {
          ctx.globalAlpha = 0.5 * k;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + Math.cos(a) * p.radius, p.y + Math.sin(a) * p.radius);
          }
          ctx.stroke();
          // concentric rings
          for (let r = p.radius * 0.4; r < p.radius; r += p.radius * 0.3) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        if (p.kind === "ink") {
          // dark ink blotches
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = "#1a2a4a";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 0.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = "#2a4a6a";
          ctx.beginPath();
          ctx.arc(p.x + 4, p.y - 3, p.radius * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        // lava kind: bright core glow + ember flecks
        if (p.kind === "lava") {
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
          grad.addColorStop(0, "rgba(255,210,74,0.6)");
          grad.addColorStop(0.6, "rgba(255,106,42,0.3)");
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalAlpha = k;
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  private drawNovaWaves(ctx: CanvasRenderingContext2D) {
    const now = performance.now();
    for (const w of this.playerNovaWaves) {
      const k = 1 - w.time / w.duration;   // 1 → 0 fade
      const pulse = 0.4 + 0.3 * Math.sin(now / 50);
      ctx.save();
      // outer expanding ring (frost blue)
      ctx.globalAlpha = 0.7 * k * pulse;
      ctx.strokeStyle = "#7ad7ff";
      ctx.lineWidth = 2 + 2 * k;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
      ctx.stroke();
      // inner glow fill
      const grad = ctx.createRadialGradient(w.x, w.y, w.radius * 0.6, w.x, w.y, w.radius);
      grad.addColorStop(0, "rgba(122,215,255,0)");
      grad.addColorStop(0.7, "rgba(122,215,255,0)");
      grad.addColorStop(1, `rgba(122,215,255,${0.25 * k * pulse})`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
      ctx.fill();
      // frost shards along the ring edge
      ctx.globalAlpha = 0.6 * k;
      ctx.fillStyle = "#c8f0ff";
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + w.time * 2;
        const sx = w.x + Math.cos(a) * w.radius;
        const sy = w.y + Math.sin(a) * w.radius;
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      }
      ctx.restore();
    }
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      // homing swords steer toward the nearest living enemy
      if (p.homing) {
        let best: Enemy | null = null;
        let bestD = Infinity;
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) {
          const desired = Math.atan2(best.y - p.y, best.x - p.x);
          const cur = Math.atan2(p.vy, p.vx);
          let diff = desired - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const turn = Math.max(-p.homingTurn! * dt, Math.min(p.homingTurn! * dt, diff));
          const ang = cur + turn;
          const sp = Math.hypot(p.vx, p.vy) || 220;
          p.vx = Math.cos(ang) * sp;
          p.vy = Math.sin(ang) * sp;
        }
        // trail sparkle
        if (Math.random() < 0.6) {
          this.particles.push({ x: p.x, y: p.y, vx: rand(-15, 15), vy: rand(-15, 15), life: 0.25, color: "#c0c8d8" });
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.from === "player") {
        for (const e of this.enemies) {
          if (dist(p.x, p.y, e.x, e.y) < e.size * 0.4 + p.radius) {
            if (p.kind === "sword") {
              // homing sword: hit a limited set of enemies, then fade
              if (p.hitSet2!.has(e)) continue;
              p.hitSet2!.add(e);
              this.damageEnemy(e, p.dmg);
              this.spawnHit(p.x, p.y, "#c0c8d8");
              p.hitsLeft!--;
              if (p.hitsLeft! <= 0) { p.life = 0; break; }
            } else if (p.pierce) {
              if (p.hitSet!.has(e)) continue;
              p.hitSet!.add(e);
              this.damageEnemy(e, p.dmg);
              this.spawnHit(p.x, p.y, "#ffd24a");
              // priest smite: mark first enemy hit + reset cooldown for re-cast
              if (this.heroId === "priest" && p.kind === "bolt" && !this.smiteMark) {
                this.smiteMark = e;
                this.skillTimers[0] = 0;
              }
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
      // walls + obstacles
      if (p.x < FIELD.x || p.x > FIELD.x + FIELD.w || p.y < FIELD.y || p.y > FIELD.y + FIELD.h) {
        p.life = 0;
      } else if (this.inObstacle(p.x, p.y, p.radius)) {
        p.life = 0;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  private damageEnemy(e: Enemy, dmg: number) {
    const crit = this.bonusCrit > 0 && Math.random() < this.bonusCrit;
    let d = Math.round(dmg * rand(0.9, 1.1) * (crit ? 2 : 1));

    // boss shield-break routing
    if (e.isBoss) {
      if (e.bossState === "shielded") {
        // all damage chips the shield; HP is locked. Overflow is discarded.
        e.shield -= d;
        e.hitFlash = 0.12;
        this.float("\u25c6" + d, e.x, e.y - e.size * 0.4, "#6ad7ff");
        if (e.shield <= 0) {
          e.shield = 0;
          this.breakShield(e);
        }
        return;
      }
      // broken: amplified HP damage during the vulnerability window
      d = Math.round(d * BREAK_DMG_AMP);
      e.hp -= d;
      e.hitFlash = 0.12;
      this.float(d + "!", e.x, e.y - e.size * 0.4, "#ff8a3a");
      if (e.hp <= 0) {
        this.killEnemy(e);
        return;
      }
      this.checkBossPhaseCross(e);
      return;
    }

    e.hp -= d;
    e.hitFlash = 0.12;
    if (crit) this.float(d + "!", e.x, e.y - e.size * 0.4, "#ffce3a");
    else this.float("" + d, e.x, e.y - e.size * 0.4, "#fff");
    if (e.hp <= 0) {
      this.killEnemy(e);
    }
  }

  // shield depleted → enter broken state (stunned, vulnerable, no spells)
  private breakShield(boss: Enemy) {
    boss.bossState = "broken";
    boss.breakTimer = BREAK_WINDOW;
    boss.castLock = 0;
    boss.castAnim = 0;
    boss.phaseFlash = 0.6;
    this.bossSpellTimer = 999;   // stop casting while broken
    this.float("SHIELD BREAK!", boss.x, boss.y - 42, "#6ad7ff");
    this.spawnRing(boss.x, boss.y, "#6ad7ff", 72);
  }

  // break window ended (timer or phase cross) → restore shield, resume
  private endBreak(boss: Enemy) {
    boss.bossState = "shielded";
    boss.shield = boss.shieldMax;
    boss.breakTimer = 0;
    this.bossSpellTimer = this.pickBossCooldown(boss.spellPool);
    this.float("SHIELD UP", boss.x, boss.y - 42, "#6ad7ff");
    this.spawnRing(boss.x, boss.y, "#6ad7ff", 56);
  }

  // during break window, HP can cross a phase threshold (66% / 33%)
  private checkBossPhaseCross(boss: Enemy) {
    const ratio = boss.hp / boss.maxHp;
    const newPhase: 1 | 2 | 3 = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (newPhase !== boss.phase) {
      boss.phase = newPhase;
      const def = BOSSES[this.bossKindOf(boss)];
      boss.spellPool = def.spells.filter((s) => s.tier === newPhase);
      this.float(newPhase === 3 ? "ENRAGED!" : "PHASE " + newPhase + "!", boss.x, boss.y - 56, "#ff3a1a");
      this.spawnRing(boss.x, boss.y, "#ff3a1a", 64);
      boss.phaseFlash = 0.8;
      // phase advance ends the break window immediately and restores shield
      this.endBreak(boss);
    }
  }

  private killEnemy(e: Enemy) {
    if (this.smiteMark === e) this.smiteMark = null;
    this.monstersKilled++;
    this.goldGained += e.gold;
    this.xpGained += e.xp;
    this.spawnDeath(e.x, e.y);
    this.float("+" + e.gold + "g", e.x, e.y - 8, "#ffd24a");
    // knight lifesteal: heal a fraction of max HP on kill (boosted by War Cry)
    if (this.heroId === "knight") {
      const frac = this.lifeStealFrac + (this.lifeStealBuff > 0 ? this.lifeStealBuffFrac : 0);
      if (frac > 0) {
        const heal = Math.round(this.phpMax * frac);
        this.php = Math.min(this.phpMax, this.php + heal);
        this.float("+" + heal, this.px, this.py - 16, "#5fff8f");
      }
    }
    // tank berserk lifesteal: heal 12% max HP on kill while berserk is active
    if (this.heroId === "tank" && this.dmgBuff > 0 && this.dmgBuffMult >= 2) {
      const heal = Math.round(this.phpMax * 0.12);
      this.php = Math.min(this.phpMax, this.php + heal);
      this.float("+" + heal, this.px, this.py - 16, "#5fff8f");
    }
    this.maybeDropLoot(e);
    this.enemies = this.enemies.filter((x) => x !== e);
  }

  private maybeDropLoot(e: Enemy) {
    // item level scales with dungeon difficulty + depth (or wave for endless)
    const depth = this.isEndless ? this.wave : this.curRoom.depth;
    const ilvl = Math.max(1, Math.round(this.difficulty * 4 + depth));
    const luck = MODE_DEF[this.mode].luck;
    if (e.isBoss) {
      // boss always drops 2 items with luck bias (bosses lean rare+ on top of mode luck)
      const n = 2;
      for (let i = 0; i < n; i++) {
        const rarity = rollRarity(0.6 + luck);
        const it = rollItem({ ilvl: ilvl + 3, rarity, heroForWeapon: this.heroId });
        this.loot.push(it);
        this.float(it.name, e.x, e.y - 14 - i * 10, "#ffce3a");
      }
      return;
    }
    // regular monsters: ~18% drop chance
    if (Math.random() < 0.18) {
      const rarity = rollRarity(luck);
      const it = rollItem({ ilvl, rarity, heroForWeapon: this.heroId });
      this.loot.push(it);
      this.float("LOOT!", e.x, e.y - 14, "#5fd35f");
    }
  }

  private damagePlayer(dmg: number) {
    if (this.invuln > 0) return;
    if (this.heroId === "tank") {
      // tank passive: 25% flat damage reduction
      dmg = Math.round(dmg * 0.75);
      // miss chance scales with missing HP (up to 50% at 0 HP)
      const missingRatio = 1 - this.php / this.phpMax;
      if (Math.random() < missingRatio * 0.5) {
        this.float("MISS", this.px, this.py - 16, "#7ab8ff");
        this.invuln = 0.2;
        return;
      }
    }
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
    this.hazards = [];
    this.beams = [];
    this.pools = [];
    this.playerSlow = 0;
    this.playerSnare = 0;
    // endless mode: always keep all loot (earned per wave, not per dungeon)
    const keepLoot = this.isEndless
      ? this.loot
      : win ? this.loot : this.loot.slice(0, Math.floor(this.loot.length / 2));
    const result: RaidResult = {
      win,
      goldGained: this.goldGained,
      xpGained: win ? this.xpGained : Math.round(this.xpGained * 0.4),
      monstersKilled: this.monstersKilled,
      loot: keepLoot,
      wave: this.isEndless ? this.wave : undefined,
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

    // carve out + draw doors (skip for endless)
    if (!this.isEndless) this.drawDoors();
    if (!this.isEndless) this.drawRoomTerrain();

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

    // divine heal burst visual: pillar of light descending onto priest
    if (this.divineHealTime > 0) {
      this.divineHealTime -= 1 / 60;
      const k = Math.max(0, this.divineHealTime / 0.8);
      ctx.save();
      // pillar of light from top of screen to player
      const px = Math.round(this.px), py = Math.round(this.py);
      const pillarW = 18 + (1 - k) * 12;
      const grad = ctx.createLinearGradient(px, 0, px, py);
      grad.addColorStop(0, `rgba(255,240,180,${0.3 * k})`);
      grad.addColorStop(0.6, `rgba(255,210,74,${0.5 * k})`);
      grad.addColorStop(1, `rgba(122,255,143,${0.7 * k})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(px - pillarW * 0.4, 0);
      ctx.lineTo(px + pillarW * 0.4, 0);
      ctx.lineTo(px + pillarW, py);
      ctx.lineTo(px - pillarW, py);
      ctx.closePath();
      ctx.fill();
      // expanding golden ring at player position
      const ringR = 30 + (1 - k) * 60;
      ctx.globalAlpha = 0.6 * k;
      ctx.strokeStyle = "#ffd24a";
      ctx.lineWidth = 2 + k * 2;
      ctx.beginPath();
      ctx.arc(px, py, ringR, 0, Math.PI * 2);
      ctx.stroke();
      // inner glow
      const glow = ctx.createRadialGradient(px, py, 0, px, py, 40);
      glow.addColorStop(0, `rgba(255,210,74,${0.5 * k})`);
      glow.addColorStop(0.5, `rgba(122,255,143,${0.3 * k})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, 40, 0, Math.PI * 2);
      ctx.fill();
      // light particles rising from player
      if (k > 0.3) {
        for (let i = 0; i < 3; i++) {
          this.particles.push({
            x: px + rand(-20, 20), y: py + rand(-10, 10),
            vx: rand(-10, 10), vy: rand(-50, -25),
            life: 0.4, color: i % 2 === 0 ? "#ffd24a" : "#5fff8f",
          });
        }
      }
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
      const size = p.big ? 16 : 10;
      if (p.big) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#fff";
        ctx.fillRect(-size / 2, -1, size, 2);
        ctx.globalAlpha = 1;
      }
      ctx.rotate(angle);
      const isCustomArrow = p.kind === "arrow" && p.from === "player" && this.hero.id === "archer";
      if (isCustomArrow) {
        drawElfArrow(ctx, p.vx, p.vy, size * 2.5);
      } else {
        const customFireball = p.from === "player" && this.hero.id === "mage" && p.kind === "fireball"
          ? drawMageFireball(ctx, size * 3, this.animTime)
          : false;
        if (p.kind === "sword") {
          this.drawSword(ctx);
        } else if (!customFireball) {
          drawSprite(ctx, "fx_" + p.kind, def, -size / 2, -size / 2, size);
          // boss spell tint overlay (web barrage = white)
          if (p.tint) {
            ctx.globalCompositeOperation = "source-atop";
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = p.tint;
            ctx.fillRect(-size / 2, -size / 2, size, size);
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1;
          }
        }
      }
      ctx.restore();
    }

    // boss spell hazards (telegraphs + explosions)
    this.drawHazards(ctx);
    this.drawNovaWaves(ctx);

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
      if (this.isEndless) {
        this.banner("RAID ENDLESS", "Survive as long as you can\u2014boss every 10 waves");
      } else {
        this.banner(this.dungeon.name, "Clear rooms, find the boss \u2620");
      }
    } else if (this.isEndless) {
      // endless: wave clear banner already handled by float text
    } else if (this.curRoom.isBoss && !this.curRoom.cleared) {
      // brief boss warning handled by boss bar; no banner spam
    } else if (this.curRoom.cleared && this.clearedTimer < 1.4 && !this.curRoom.isStart) {
      this.banner("Room Cleared!", "Doors open \u2014 pick a path");
    }
  }

  private drawRoomTerrain() {
    const ctx = this.ctx;
    // NOTE: curRoom.obstacles/hazards are static template rects, distinct from
    // this.hazards (dynamic boss AoE) elsewhere in the engine.
    const obstacles = this.curRoom.obstacles;
    const hazards = this.curRoom.hazards;
    // hazards first (under obstacles), pulsing translucent danger zones
    if (hazards && hazards.length) {
      const pulse = 0.22 + Math.sin(performance.now() / 260) * 0.08;
      for (const h of hazards) {
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = "#ff3a3a";
        ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.restore();
        ctx.strokeStyle = "#ff6a6a";
        ctx.lineWidth = 1;
        ctx.strokeRect(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1);
      }
    }
    // obstacles: solid blocks in the wall color with a lighter top edge
    if (obstacles && obstacles.length) {
      for (const o of obstacles) {
        ctx.fillStyle = this.dungeon.wall;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = shade(this.dungeon.wall, 0.18);
        ctx.fillRect(o.x, o.y, o.w, 4);
        ctx.strokeStyle = shade(this.dungeon.wall, -0.2);
        ctx.lineWidth = 1;
        ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
      }
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
    if (this.atkAnim > 0 && behind && this.hero.id !== "priest" && this.hero.id !== "knight") this.drawAttackFx();

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
    if (this.atkAnim > 0 && !behind && this.hero.id !== "priest" && this.hero.id !== "knight") this.drawAttackFx();
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

    // tank: only the bash square, no arc trail
    if (this.hero.id === "tank") {
      const tx = Math.cos(ang) * (reach - 4);
      const ty = Math.sin(ang) * (reach - 4);
      const s = 6 * (0.5 + t * 0.5);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = col;
      ctx.fillRect(tx - s / 2, ty - s / 2, s, s);
      ctx.restore();
      return;
    }

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
    ctx.restore();
  }

  private drawSword(ctx: CanvasRenderingContext2D) {
    // ctx is already translated to sword position and rotated to facing angle.
    // Draw a long fantasy blade pointing right (+x), origin at center of hilt.
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // blade body — long tapered rectangle
    ctx.fillStyle = "#dfe6f5";
    ctx.beginPath();
    ctx.moveTo(14, 0);      // tip
    ctx.lineTo(0, 2.5);     // top base
    ctx.lineTo(-4, 1.5);    // top guard
    ctx.lineTo(-4, -1.5);   // bottom guard
    ctx.lineTo(0, -2.5);    // bottom base
    ctx.closePath();
    ctx.fill();

    // blade core highlight
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(2, 0.8);
    ctx.lineTo(-2, 0.5);
    ctx.lineTo(-2, -0.5);
    ctx.lineTo(2, -0.8);
    ctx.closePath();
    ctx.fill();

    // guard
    ctx.fillStyle = "#c0c8d8";
    ctx.fillRect(-5, -3.5, 2, 7);

    // handle
    ctx.fillStyle = "#4a3a2a";
    ctx.fillRect(-5, -1.5, -5, 3);

    // pommel
    ctx.fillStyle = "#c0c8d8";
    ctx.beginPath();
    ctx.arc(-10, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    // faint glow aura
    ctx.strokeStyle = "rgba(223,230,245,0.25)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4, 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(0, -2.5);
    ctx.lineTo(-4, -1.5);
    ctx.stroke();

    ctx.restore();
  }

  private drawEnemy(e: Enemy) {
    const ctx = this.ctx;
    const bob = Math.sin(e.bob) * 1.2;
    this.drawShadow(e.x, e.y + e.size * 0.42, e.size);
    if (e.isBoss) {
      this.drawBoss(e, bob);
    } else if (e.hitFlash > 0) {
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
    // smite mark indicator: golden diamond pulsing above enemy
    if (this.smiteMark === e) {
      ctx.save();
      const mx = Math.round(e.x), my = Math.round(e.y - e.size / 2 - 10);
      const pulse = 0.6 + 0.3 * Math.sin(performance.now() / 120);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "#ffd24a";
      ctx.translate(mx, my);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    // taunt indicator: red ring below enemy + tether to player
    if (e.taunted > 0) {
      const ctx = this.ctx;
      ctx.save();
      const k = Math.min(1, e.taunted / 5);
      ctx.globalAlpha = 0.4 + 0.2 * Math.sin(performance.now() / 100);
      ctx.strokeStyle = "#ff3a1a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(Math.round(e.x), Math.round(e.y + e.size * 0.35), e.size * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      // tether line to player
      ctx.globalAlpha = 0.2 * k;
      ctx.strokeStyle = "#ff5a3a";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(this.px, this.py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
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

  // Boss render with per-kind attack + spell-cast animations.
  // atkAnim: 1→0 over 0.3s (basic attack swing). castAnim: 1→0 over 0.5s (spell windup).
  private drawBoss(e: Enemy, bob: number) {
    const ctx = this.ctx;
    const kind = e.spriteKey.replace("b_", "") as BossKind;
    const cx = e.x, cy = e.y + bob;
    const size = e.size;
    // animation deltas
    let sx = 1, sy = 1, ox = 0, oy = 0;
    if (e.castAnim > 0) {
      const k = e.castAnim; // 1 → 0
      if (kind === "giant_slime") {
        // squash down to charge, then pop
        sy = 1 - 0.3 * k; sx = 1 + 0.3 * k; oy = 4 * k;
      } else if (kind === "spider_queen") {
        // rear back, legs splay
        sy = 1 + 0.15 * k; sx = 1 + 0.2 * k; oy = -4 * k;
      } else if (kind === "lich") {
        // lean back, charge staff
        oy = -2 * k; sx = 1 + 0.05 * k;
      } else if (kind === "lava_golem") {
        // grow, glow core
        sx = 1 + 0.12 * k; sy = 1 + 0.12 * k;
      } else if (kind === "octopus") {
        // pulse outward
        sx = 1 + 0.1 * k; sy = 1 + 0.1 * k; oy = -2 * k;
      }
    }
    if (e.atkAnim > 0) {
      const k = e.atkAnim;
      if (kind === "giant_slime") {
        oy -= 3 * Math.sin(k * Math.PI);
      } else if (kind === "spider_queen") {
        // lunge toward player
        const dir = e.faceLeft ? -1 : 1;
        ox += dir * 4 * Math.sin(k * Math.PI);
      } else if (kind === "lich") {
        const dir = e.faceLeft ? -1 : 1;
        ox += dir * 3 * Math.sin(k * Math.PI);
      } else if (kind === "lava_golem") {
        oy -= 3 * Math.sin(k * Math.PI);
      } else if (kind === "octopus") {
        // tentacle recoil
        sy -= 0.08 * Math.sin(k * Math.PI);
      }
    }
    const broken = e.bossState === "broken";
    if (broken) {
      // stagger shake while stunned
      ox += Math.sin(performance.now() / 40) * 2;
      oy += 1;
    }
    ctx.save();
    ctx.translate(cx + ox, cy + oy);
    ctx.scale(sx, sy);
    ctx.translate(-cx, -cy);
    drawSprite(ctx, e.spriteKey, e.sprite,
      Math.round(cx - size / 2), Math.round(cy - size / 2), size, e.faceLeft);
    // octopus: draw tentacle swipe arc during basic attack
    if (kind === "octopus" && e.atkAnim > 0) {
      const k = e.atkAnim; // 1 → 0 over 0.25s
      const swing = (1 - k) * Math.PI * 0.6; // arc from 0 to ~108 degrees
      const dir = e.faceLeft ? -1 : 1;
      const reach = size * 0.7;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(dir, 1);
      // tentacle arm (thick curved line)
      ctx.globalAlpha = 0.6 + 0.4 * k;
      ctx.strokeStyle = "#6a3a8a";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const tipX = Math.cos(swing) * reach;
      const tipY = Math.sin(swing) * reach - 4;
      const cpX = Math.cos(swing * 0.5) * reach * 0.6;
      const cpY = Math.sin(swing * 0.5) * reach * 0.6 - 8;
      ctx.quadraticCurveTo(cpX, cpY, tipX, tipY);
      ctx.stroke();
      // tentacle tip (bright)
      ctx.globalAlpha = 0.8 * k;
      ctx.fillStyle = "#8a5aba";
      ctx.beginPath();
      ctx.arc(tipX, tipY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (e.phaseFlash > 0) {
      // bright flash on break / phase change
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = Math.min(1, e.phaseFlash);
      ctx.fillStyle = e.bossState === "broken" ? "#6ad7ff" : "#ff5a5a";
      ctx.fillRect(Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    } else if (e.hitFlash > 0) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    } else if (broken) {
      // washed-out grey while vulnerable
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#3a3a44";
      ctx.fillRect(Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    } else if (e.frozen > 0) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "rgba(122,215,255,1)";
      ctx.fillRect(Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    } else if (e.phase === 3) {
      // enraged: pulsing red overlay
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = 0.22 + 0.12 * Math.sin(performance.now() / 150);
      ctx.fillStyle = "#ff2a2a";
      ctx.fillRect(Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // enraged aura ring (phase 3, when active)
    if (e.phase === 3 && e.bossState === "shielded") {
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(performance.now() / 120);
      ctx.strokeStyle = "#ff3a2a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // shield bubble around boss while shielded
    if (e.bossState === "shielded" && e.shieldMax > 0) {
      this.drawShieldBubble(e, cx, cy, size);
    }
    // "stars" stun indicator while broken
    if (broken) {
      ctx.save();
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = performance.now() / 200 + (i / n) * Math.PI * 2;
        const sxp = cx + Math.cos(a) * size * 0.35;
        const syp = cy - size * 0.55 + Math.sin(a) * 3;
        ctx.fillStyle = "#ffd24a";
        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.fillText("\u2726", sxp, syp);
      }
      ctx.restore();
    }
    // per-boss cast FX overlay (drawn untransformed so glows don't clip)
    this.drawBossCastFx(e, kind, cx, cy, size);
  }

  // translucent shield bubble; alpha + thickness scale with remaining shield
  private drawShieldBubble(e: Enemy, cx: number, cy: number, size: number) {
    const ctx = this.ctx;
    const frac = Math.max(0, e.shield / e.shieldMax);
    if (frac <= 0) return;
    const r = size * 0.7;
    const pulse = 0.5 + 0.2 * Math.sin(performance.now() / 220);
    ctx.save();
    // fill
    const grad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
    grad.addColorStop(0, "rgba(106,215,255,0)");
    grad.addColorStop(1, `rgba(106,215,255,${0.18 * frac * pulse})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // ring (thickness scales with shield)
    ctx.globalAlpha = 0.5 + 0.4 * frac;
    ctx.strokeStyle = "#6ad7ff";
    ctx.lineWidth = 1 + 1.5 * frac;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // spell cast windup visual per boss kind
  private drawBossCastFx(e: Enemy, kind: BossKind, cx: number, cy: number, size: number) {
    if (e.castAnim <= 0) return;
    const ctx = this.ctx;
    const k = e.castAnim; // 1 → 0
    ctx.save();
    if (kind === "giant_slime") {
      // green charge glow building up at body center
      const r = size * 0.5 * (1 - k * 0.4);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, "rgba(95,204,95," + (0.6 * k) + ")");
      grad.addColorStop(1, "rgba(95,204,95,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "spider_queen") {
      // white web orb at mouth pulsing
      const r = 4 + (1 - k) * 4;
      ctx.globalAlpha = k;
      ctx.fillStyle = "#dfe3e8";
      ctx.beginPath();
      ctx.arc(cx, cy - size * 0.3, r, 0, Math.PI * 2);
      ctx.fill();
      // silk strands
      ctx.strokeStyle = "rgba(232,232,240," + k + ")";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - size * 0.3);
        ctx.lineTo(cx + Math.cos(a) * r * 2, cy - size * 0.3 + Math.sin(a) * r * 2);
        ctx.stroke();
      }
    } else if (kind === "lich") {
      // purple staff orb above head, growing + swirling
      const r = 5 + (1 - k) * 5;
      const ox = e.faceLeft ? -size * 0.3 : size * 0.3;
      const oy = -size * 0.45;
      ctx.globalAlpha = k;
      const grad = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r * 2);
      grad.addColorStop(0, "rgba(255,255,255," + k + ")");
      grad.addColorStop(0.4, "rgba(160,108,255," + (0.8 * k) + ")");
      grad.addColorStop(1, "rgba(160,108,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, r * 2, 0, Math.PI * 2);
      ctx.fill();
      // orbiting sparks
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + performance.now() / 200;
        ctx.fillStyle = "#c8b8e8";
        ctx.beginPath();
        ctx.arc(cx + ox + Math.cos(a) * r * 1.4, cy + oy + Math.sin(a) * r * 1.4, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === "lava_golem") {
      // red-hot core glow building inside body
      const r = size * 0.35 * (1 - k * 0.3);
      ctx.globalCompositeOperation = "source-atop";
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, "rgba(255,210,74," + (0.8 * k) + ")");
      grad.addColorStop(0.5, "rgba(255,58,42," + (0.6 * k) + ")");
      grad.addColorStop(1, "rgba(255,58,42,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      // ember particles rising
      if (Math.random() < 0.5) {
        this.particles.push({
          x: cx + rand(-size * 0.3, size * 0.3),
          y: cy + rand(-size * 0.2, size * 0.2),
          vx: rand(-15, 15), vy: rand(-40, -20),
          life: 0.4, color: "#ff6a2a",
        });
      }
    } else if (kind === "octopus") {
      // pulsing dark aura
      const pulse = 0.15 + Math.sin(performance.now() / 300) * 0.05;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "#2a4a6a";
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
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
    const totalRooms = this.isEndless ? 0 : this.map.rooms.length;
    const clearedCount = this.isEndless ? this.wave : this.map.rooms.filter((r) => r.cleared && !r.isStart).length;
    const bossName = this.isEndless
      ? (boss ? BOSSES[boss.spriteKey.replace("b_", "") as BossKind]?.name : undefined)
      : (boss ? this.bossName() : undefined);
    const hud: HudState = {
      phase: this.phase,
      heroName: this.hero.name,
      hp: Math.max(0, Math.round(this.php)),
      maxHp: this.phpMax,
      skills,
      roomsCleared: clearedCount,
      totalRooms: this.isEndless ? 0 : totalRooms - 1,
      bossFound: this.isEndless ? (boss != null) : this.map.rooms.some((r) => r.isBoss && r.visited),
      enemiesLeft: this.enemies.length,
      dungeonName: this.dungeon.name,
      minimap: this.isEndless ? { rooms: [], minX: 0, minY: 0, gridW: 0, gridH: 0 } : this.buildMinimap(),
      bossName,
      bossHp: boss ? Math.max(0, Math.round(boss.hp)) : undefined,
      bossMax: boss ? boss.maxHp : undefined,
      bossShield: boss ? Math.max(0, Math.round(boss.shield)) : undefined,
      bossShieldMax: boss ? boss.shieldMax : undefined,
      bossPhase: boss ? boss.phase : undefined,
      bossBroken: boss ? boss.bossState === "broken" : undefined,
      bossBreakTimer: boss && boss.bossState === "broken" ? Math.max(0, boss.breakTimer) : undefined,
      goldGained: this.goldGained,
      xpGained: this.xpGained,
      monstersKilled: this.monstersKilled,
      isEndless: this.isEndless,
      wave: this.isEndless ? this.wave : undefined,
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
