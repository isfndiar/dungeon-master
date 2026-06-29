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
import { Item, rollItem, rollRarity, ItemStats, StatKey, rollConsumable } from "./items";
import {
  preloadHeroSprites, drawHeroDir, facingFromVec, Facing,
  drawMageFireball, drawElfArrow,
} from "./spriteLoader";
import { castBossSpell, bossKindOf } from "./bossSpells";
import { executeSkill } from "./skills";
import type { GameContext, SkillContext } from "./types";
import { FIELD, rand, clamp, dist } from "./types";

export const VIEW_W = 480;
export const VIEW_H = 270;
const RENDER_SCALE = 2;

// boss shield-break tunables
const SHIELD_FRAC = 0.4;       // shield value = 40% of max HP per restore
const BREAK_WINDOW = 5;        // seconds boss stays broken (vulnerable)
const BREAK_DMG_AMP = 1.5;     // HP damage multiplier during break window

// Play field inset (walls border)
const WALL = 16;

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
  wallPass?: boolean;      // passes through obstacles (snipe)
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
  kind: string;
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
  quickSlots: ({ name: string; rarity: string; consumableType?: string; stackCount: number } | null)[];
  buffs: { stat: string; timer: number; pct: number }[];
  luckBuff: number;
}

export class Engine {
  private ctx: CanvasRenderingContext2D;
  readonly input: Input;
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
  private doubleVolleyTimer = 0; // delayed second volley countdown
  private doubleVolleyDmg = 0;  // cached damage for delayed volley
  private dodgeTimer = 0;      // seconds remaining of dodge (auto-miss incoming hits)
  private healZoneTime = 0; // sanctuary remaining
  private healZoneX = 0; private healZoneY = 0;
  // knight lifesteal: heals a % of max HP on kill. War Cry boosts it.
  private lifeStealFrac = 0;       // fraction of max HP healed per kill
  private lifeStealBuff = 0;       // seconds remaining of lifesteal boost
  private lifeStealBuffFrac = 0;   // boosted fraction while active

  // quick slots + consumable buff system
  private quickSlots: (Item | null)[] = [null, null, null, null];
  private consumableCooldown = 0;
  private playerBuffs: Partial<Record<StatKey, { mult: number; timer: number }>> = {};
  private playerHealTimer = 0;
  private playerHealRate = 0;
  private playerLuckBuff = 0;
  private playerLuckTimer = 0;

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

  // encounter mode (overworld enemy → single room battle)
  private isEncounter = false;
  private encounterKind: string | null = null;

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
  private skillLevels: [number, number, number] = [1, 1, 1];
  private skillBranches: [string | null, string | null, string | null] = [null, null, null];

  private cb: EngineCallbacks;

  constructor(
    canvas: HTMLCanvasElement,
    heroId: HeroId,
    heroLevel: number,
    dungeonId: DungeonId,
    cb: EngineCallbacks,
    bonus?: ItemStats,
    mode: GameMode = "normal",
    quickSlots?: (Item | null)[],
    skillLevels?: [number, number, number],
    skillBranches?: [string | null, string | null, string | null],
    encounterKind?: string | null,
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
    this.skillLevels = skillLevels ?? [1, 1, 1];
    this.skillBranches = skillBranches ?? [null, null, null];
    this.isEncounter = !!encounterKind;
    this.encounterKind = encounterKind ?? null;
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
    this.isEndless = !!this.dungeon.endless && !this.isEncounter;
    if (this.isEncounter) {
      // encounter mode: single room arena, spawn enemies immediately
      this.map = {
        startId: 0, bossId: 0, gridW: 1, gridH: 1, maxDepth: 0,
        rooms: [{
          id: 0, gx: 0, gy: 0,
          doors: { n: false, s: false, w: false, e: false },
          neighbors: {},
          visited: true, cleared: false, isStart: true, isBoss: false, depth: 0,
        }],
      };
      this.curRoom = this.map.rooms[0];
    } else if (!this.isEndless) {
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

    // load quick slots from save
    if (quickSlots) {
      this.quickSlots = quickSlots.map(s => s ? { ...s } : null);
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
    if (this.isEncounter) {
      this.spawnEncounterEnemies();
    } else if (!this.isEndless) {
      this.enterRoom(this.curRoom, null);
    }
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

  private spawnEncounterEnemies() {
    const diff = this.difficulty;
    const count = 4 + Math.floor(Math.random() * 5); // 4-8 enemies
    const kind = this.encounterKind as MonsterKind;
    const def: MonsterDef = MONSTERS[kind];
    if (!def) return;
    for (let i = 0; i < count; i++) {
      // Spread enemies across the arena
      const angle = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
      const dist = rand(60, 120);
      const x = clamp(FIELD.x + FIELD.w / 2 + Math.cos(angle) * dist, FIELD.x + 20, FIELD.x + FIELD.w - 20);
      const y = clamp(FIELD.y + FIELD.h / 2 + Math.sin(angle) * dist, FIELD.y + 20, FIELD.y + FIELD.h - 20);
      this.enemies.push({
        x, y,
        hp: Math.round(def.hp * diff), maxHp: Math.round(def.hp * diff),
        dmg: Math.round(def.dmg * diff), speed: def.speed,
        ranged: def.ranged, projectile: def.projectile,
        atkTimer: rand(0.5, def.attackCooldown), atkCooldown: def.attackCooldown,
        size: def.size,
        sprite: monsterSprites[kind], spriteKey: "m_" + kind,
        gold: Math.round(def.gold * diff), xp: Math.round(def.xp * diff),
        isBoss: false, hitFlash: 0, faceLeft: false, bob: rand(0, Math.PI * 2), frozen: 0,
        phase: 1, spellPool: [], castLock: 0, atkAnim: 0, castAnim: 0, bossState: "shielded", shield: 0, shieldMax: 0, breakTimer: 0, phaseFlash: 0, taunted: 0,
      });
    }
    this.float("ENCOUNTER!", VIEW_W / 2, VIEW_H / 2 - 20, "#ff5a5a");
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
      if (this.isEncounter) {
        // encounter mode: all enemies dead = instant win
        this.curRoom.cleared = true;
        this.float("VICTORY!", VIEW_W / 2, VIEW_H / 2 - 20, "#ffd24a");
        this.phase = "win";
        this.endRaid(true);
        return;
      } else if (this.isEndless) {
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
        // consumable drop on room clear
        if (Math.random() < 0.2) {
          const drop = rollConsumable(MODE_DEF[this.mode].luck);
          const emptySlot = this.quickSlots.findIndex(s => s === null);
          if (emptySlot >= 0) {
            const existingIdx = this.quickSlots.findIndex(s => s?.name === drop.name && (s.stackCount ?? 1) < (s.maxStack ?? 10));
            if (existingIdx >= 0) {
              this.quickSlots[existingIdx]!.stackCount = (this.quickSlots[existingIdx]!.stackCount ?? 1) + 1;
            } else {
              this.quickSlots[emptySlot] = drop;
            }
          }
          this.float(`+${drop.name}`, this.px, this.py - 20, "#fd0");
        }
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
      // check for revive scroll in quick slots
      const reviveIdx = this.quickSlots.findIndex(s => s?.effect?.type === "revive");
      if (reviveIdx >= 0) {
        const scroll = this.quickSlots[reviveIdx]!;
        this.php = Math.round(this.phpMax * scroll.effect!.value);
        scroll.stackCount = (scroll.stackCount ?? 1) - 1;
        if (scroll.stackCount <= 0) this.quickSlots[reviveIdx] = null;
        this.float("REVIVE!", this.px, this.py - 10, "#fd0");
        this.invuln = 1;
      } else {
        this.endRaid(false);
      }
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
    if (this.input.virtualAimActive) {
      const len = Math.hypot(this.input.virtualAimX, this.input.virtualAimY);
      if (len > 0.1) {
        this.aimX = this.input.virtualAimX / len;
        this.aimY = this.input.virtualAimY / len;
        this.faceLeft = this.aimX < 0;
        this.facing = facingFromVec(this.aimX, this.aimY, this.facing);
      }
      return;
    }
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
    const dir = this.input.getMoveDir();
    let mx = dir.x, my = dir.y;
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
    // delayed second volley (archer multishot)
    if (this.doubleVolleyTimer > 0) {
      this.doubleVolleyTimer -= dt;
      if (this.doubleVolleyTimer <= 0) {
        const base = Math.atan2(this.aimY, this.aimX);
        for (let i = -2; i <= 2; i++) {
          const a = base + i * 0.18;
          this.fireProjectile(Math.cos(a), Math.sin(a), this.doubleVolleyDmg * 1.2, "arrow");
        }
      }
    }
    if (this.dodgeTimer > 0) this.dodgeTimer -= dt;
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

    // consumable cooldown + buff timers
    if (this.consumableCooldown > 0) this.consumableCooldown -= dt;
    for (const key of Object.keys(this.playerBuffs) as StatKey[]) {
      const b = this.playerBuffs[key]!;
      b.timer -= dt;
      if (b.timer <= 0) delete this.playerBuffs[key];
    }
    if (this.playerHealTimer > 0) {
      this.playerHealTimer -= dt;
      this.php = Math.min(this.phpMax, this.php + this.playerHealRate * this.phpMax * dt);
    }
    if (this.playerLuckTimer > 0) {
      this.playerLuckTimer -= dt;
      if (this.playerLuckTimer <= 0) this.playerLuckBuff = 0;
    }

    // basic attack (rapid fire + CDR shorten cooldown)
    const cdrMult = 1 - this.bonusCdr;
    const atkCd = this.hero.attackCooldown * (this.rapidFire > 0 ? 0.35 : 1) * cdrMult;
    if (this.input.isAttackDown() && this.atkTimer <= 0 && this.phase === "playing") {
      this.doBasicAttack();
      this.atkTimer = atkCd;
    }
    // skills on 1 / 2 / 3
    for (let i = 0; i < 3; i++) {
      if ((this.input.isSkillDown(i) || this.input.consumeSkill(i)) && this.skillTimers[i] <= 0 && this.phase === "playing") {
        // If skill was aimed via mobile joystick, override aim direction
        const skillAim = this.input.consumeSkillAim(i);
        const prevAimX = this.aimX;
        const prevAimY = this.aimY;
        if (skillAim) {
          this.aimX = skillAim.aimX;
          this.aimY = skillAim.aimY;
          this.faceLeft = this.aimX < 0;
        }
        this.doSkill(this.hero.skills[i].kind, !!skillAim, i);
        this.skillTimers[i] = this.hero.skills[i].cooldown * cdrMult;
        // Restore aim if it was overridden
        if (skillAim) {
          this.aimX = prevAimX;
          this.aimY = prevAimY;
        }
      }
    }
    // quick slots
    if (this.phase === "playing") {
      if (this.input.isQuickSlotDown(0)) this.useQuickSlot(0);
      if (this.input.isQuickSlotDown(1)) this.useQuickSlot(1);
      if (this.input.isQuickSlotDown(2)) this.useQuickSlot(2);
      if (this.input.isQuickSlotDown(3)) this.useQuickSlot(3);
    }
  }

  private curDmg(): number {
    let dmg = this.pdmg * (this.dmgBuff > 0 ? this.dmgBuffMult : 1);
    if (this.heroId === "tank") {
      const missingRatio = 1 - this.php / this.phpMax;
      dmg *= 1 + missingRatio * 0.8;
    }
    // consumable buff multiplier
    if (this.playerBuffs.dmg) dmg *= this.playerBuffs.dmg.mult;
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

  private doSkill(k: SkillKind, mobileAim = false, skillIndex = 0) {
    executeSkill(this.getSkillContext(skillIndex), k, mobileAim);
  }

  private getGameContext(): GameContext {
    return {
      px: this.px, py: this.py,
      aimX: this.aimX, aimY: this.aimY,
      phpMax: this.phpMax, php: this.php,
      heroId: this.heroId, hero: this.hero,
      input: this.input,
      projectiles: this.projectiles,
      hazards: this.hazards,
      beams: this.beams,
      pools: this.pools,
      particles: this.particles,
      floats: this.floats,
      enemies: this.enemies,
      playerNovaWaves: this.playerNovaWaves,
      float: (t, x, y, c) => this.float(t, x, y, c),
      spawnRing: (x, y, c, r) => this.spawnRing(x, y, c, r),
      spawnMini: (kind, x, y, hp, dmg, size) => this.spawnMini(kind, x, y, hp, dmg, size),
      damageEnemy: (e, dmg) => this.damageEnemy(e as any, dmg),
      fireProjectile: (dx, dy, dmg, kind) => this.fireProjectile(dx, dy, dmg, kind),
      firePiercing: (dx, dy, dmg, kind, wp) => this.firePiercing(dx, dy, dmg, kind, wp),
      avoidObstacle: (nx, ny, fx, fy, r) => this.avoidObstacle(nx, ny, fx, fy, r),
      inObstacle: (x, y, r) => this.inObstacle(x, y, r),
      trail: (ax, ay, bx, by, c) => this.trail(ax, ay, bx, by, c),
    };
  }

  private getSkillContext(skillIndex = 0): SkillContext {
    // Get skill level and branch from save data passed at construction
    const skillLevel = this.skillLevels?.[skillIndex] ?? 1;
    const skillBranch = this.skillBranches?.[skillIndex] ?? null;
    return {
      ...this.getGameContext(),
      bonusCdr: this.bonusCdr,
      skillLevel,
      skillBranch,
      setPx: (x) => { this.px = x; },
      setPy: (y) => { this.py = y; },
      setPhp: (hp) => { this.php = hp; },
      setInvuln: (t) => { this.invuln = Math.max(this.invuln, t); },
      setDmgBuff: (time, mult) => { this.dmgBuff = time; this.dmgBuffMult = mult; },
      setSpeedBuff: (time, mult) => { this.speedBuff = time; this.speedBuffMult = mult; },
      setRapidFire: (t) => { this.rapidFire = t; },
      setShield: (t) => { this.shield = t; },
      setDodgeTimer: (t) => { this.dodgeTimer = t; },
      setHealOverTime: (time, dps) => { this.healOverTime = time; this.healOverTimeDps = dps; },
      setHealZone: (x, y, time) => { this.healZoneX = x; this.healZoneY = y; this.healZoneTime = time; },
      setDivineHealTime: (t) => { this.divineHealTime = t; },
      setLifeStealBuff: (time, frac) => { this.lifeStealBuff = time; this.lifeStealBuffFrac = frac; },
      setDoubleVolley: (time, dmg) => { this.doubleVolleyTimer = time; this.doubleVolleyDmg = dmg; },
      setSmiteMark: (e) => { this.smiteMark = e as any; },
      getSmiteMark: () => this.smiteMark as any,
      curDmg: () => this.curDmg(),
    };
  }

  private fireProjectile(dx: number, dy: number, dmg: number, kind: "fireball" | "arrow" | "bolt") {
    const speed = kind === "arrow" ? 320 : 240;
    this.projectiles.push({
      x: this.px + dx * 12, y: this.py + dy * 12,
      vx: dx * speed, vy: dy * speed,
      dmg, from: "player", kind, life: 1.6, radius: 4,
    });
  }

  private firePiercing(dx: number, dy: number, dmg: number, kind: "fireball" | "arrow" | "bolt", wallPass = false) {
    this.projectiles.push({
      x: this.px + dx * 12, y: this.py + dy * 12,
      vx: dx * 380, vy: dy * 380,
      dmg, from: "player", kind, life: 1.4, radius: 6,
      pierce: true, hitSet: new Set<Enemy>(), big: true, wallPass,
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
            this.doCastBossSpell(boss, pick);
            this.bossSpellTimer = pick.cooldown * cdScale;
          }
        }
      }
    }
  }

  private doCastBossSpell(boss: Enemy, spell: BossSpell) {
    castBossSpell(this.getGameContext(), boss as any, spell);
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
    // damage enemies in radius
    for (const e of this.enemies) {
      if (dist(e.x, e.y, h.x, h.y) < h.radius + e.size * 0.4) {
        this.damageEnemy(e, h.dmg);
      }
    }
    // damage player
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
      } else if (!p.wallPass && this.inObstacle(p.x, p.y, p.radius)) {
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
      const def = BOSSES[bossKindOf(boss as any)];
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
    // boss consumable drop
    if (e.isBoss) {
      const bossR = Math.random();
      if (bossR < 0.4) {
        const drop = rollConsumable(MODE_DEF[this.mode].luck + 2);
        const existingIdx = this.quickSlots.findIndex(s => s?.name === drop.name && (s.stackCount ?? 1) < (s.maxStack ?? 10));
        if (existingIdx >= 0) {
          this.quickSlots[existingIdx]!.stackCount = (this.quickSlots[existingIdx]!.stackCount ?? 1) + 1;
        } else {
          const emptySlot = this.quickSlots.findIndex(s => s === null);
          if (emptySlot >= 0) this.quickSlots[emptySlot] = drop;
        }
        this.float(`+${drop.name}`, this.px, this.py - 20, "#f8f");
      } else if (bossR < 0.5) {
        const drop = rollConsumable(MODE_DEF[this.mode].luck + 5);
        const existingIdx = this.quickSlots.findIndex(s => s?.name === drop.name && (s.stackCount ?? 1) < (s.maxStack ?? 10));
        if (existingIdx >= 0) {
          this.quickSlots[existingIdx]!.stackCount = (this.quickSlots[existingIdx]!.stackCount ?? 1) + 1;
        } else {
          const emptySlot = this.quickSlots.findIndex(s => s === null);
          if (emptySlot >= 0) this.quickSlots[emptySlot] = drop;
        }
        this.float(`+${drop.name}`, this.px, this.py - 20, "#f8f");
      }
    }
    this.enemies = this.enemies.filter((x) => x !== e);
  }

  private maybeDropLoot(e: Enemy) {
    // item level scales with dungeon difficulty + depth (or wave for endless)
    const depth = this.isEndless ? this.wave : this.curRoom.depth;
    const ilvl = Math.max(1, Math.round(this.difficulty * 4 + depth));
    const luck = MODE_DEF[this.mode].luck + this.playerLuckBuff;
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
    // dodge: auto-miss all incoming hits
    if (this.dodgeTimer > 0) {
      this.float("DODGE", this.px, this.py - 16, "#7ab8ff");
      this.invuln = 0.15;
      return;
    }
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

  private endRaid(win: boolean, reason?: "escape" | "teleport") {
    if (this.ended) return;
    this.ended = true;
    this.phase = win ? "win" : "lose";
    this.hazards = [];
    this.beams = [];
    this.pools = [];
    this.playerSlow = 0;
    this.playerSnare = 0;
    // endless mode: always keep all loot (earned per wave, not per dungeon)
    let keepLoot: Item[];
    if (reason === "escape" || reason === "teleport") {
      keepLoot = [];
    } else if (this.isEndless) {
      keepLoot = this.loot;
    } else {
      keepLoot = win ? this.loot : this.loot.slice(0, Math.floor(this.loot.length / 2));
    }
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

  private useQuickSlot(index: number) {
    if (index < 0 || index > 3) return;
    const item = this.quickSlots[index];
    if (!item || !item.effect || this.consumableCooldown > 0) return;

    const eff = item.effect;
    this.consumableCooldown = eff.type === "heal" || eff.type === "healOverTime" ? 1 : 3;

    switch (eff.type) {
      case "heal":
        this.php = Math.min(this.phpMax, this.php + eff.value);
        this.float(`+${eff.value} HP`, this.px, this.py - 10, "#4f4");
        break;
      case "healOverTime":
        this.playerHealTimer = eff.duration!;
        this.playerHealRate = eff.value;
        break;
      case "buff":
        this.playerBuffs[eff.stat!] = { mult: 1 + eff.value, timer: eff.duration! };
        break;
      case "escape":
        this.endRaid(false, "escape");
        break;
      case "revive":
        break;
      case "lootBoost":
        this.playerLuckBuff = eff.value;
        this.playerLuckTimer = eff.duration!;
        break;
      case "reveal":
        for (const r of this.map.rooms) r.visited = true;
        break;
      case "teleport":
        this.endRaid(false, "teleport");
        break;
    }

    item.stackCount = (item.stackCount ?? 1) - 1;
    if (item.stackCount <= 0) this.quickSlots[index] = null;
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

    // aim arrow (when virtual aim is active)
    if (this.input.virtualAimActive) {
      const len = Math.hypot(this.input.virtualAimX, this.input.virtualAimY);
      if (len > 0.1) {
        const ax = this.input.virtualAimX / len;
        const ay = this.input.virtualAimY / len;
        const dist = 20;
        const tipX = this.px + ax * dist;
        const tipY = this.py + ay * dist;
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = "#ffd24a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.px + ax * 8, this.py + ay * 8);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        // arrowhead
        const ang = Math.atan2(ay, ax);
        ctx.fillStyle = "#ffd24a";
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(ang - 0.4) * 5, tipY - Math.sin(ang - 0.4) * 5);
        ctx.lineTo(tipX - Math.cos(ang + 0.4) * 5, tipY - Math.sin(ang + 0.4) * 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // Skill targeting indicator (mobile: shows where skill will land)
    this.drawSkillTargetIndicator();
  }

  private drawSkillTargetIndicator() {
    const ctx = this.ctx;
    // Check if any skill is being aimed
    let aimIdx = -1;
    for (let i = 0; i < 3; i++) {
      if (this.input.virtualSkillAim[i]?.active) {
        aimIdx = i;
        break;
      }
    }
    if (aimIdx < 0) return;

    const sa = this.input.virtualSkillAim[aimIdx];
    const len = Math.hypot(sa.aimX, sa.aimY);
    if (len < 0.1) return; // no direction yet

    const dirX = sa.aimX / len;
    const dirY = sa.aimY / len;
    const skill = this.hero.skills[aimIdx];
    if (!skill) return;

    const color = skill.color || "#ffd24a";
    const range = skill.range || 60;
    const radius = skill.radius || 40;

    ctx.save();

    switch (skill.target) {
      case "directional": {
        const tx = clamp(this.px + dirX * range, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        const ty = clamp(this.py + dirY * range, FIELD.y + 8, FIELD.y + FIELD.h - 8);
        this.drawDirIndicator(ctx, tx, ty, color, 10);
        break;
      }
      case "aoe_target": {
        const tx = clamp(this.px + dirX * range, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        const ty = clamp(this.py + dirY * range, FIELD.y + 8, FIELD.y + FIELD.h - 8);
        this.drawAoeCircleIndicator(ctx, tx, ty, radius, color);
        break;
      }
      case "blink": {
        const tx = clamp(this.px + dirX * range, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        const ty = clamp(this.py + dirY * range, FIELD.y + 8, FIELD.y + FIELD.h - 8);
        this.drawBlinkIndicator(ctx, tx, ty);
        break;
      }
      case "self_aoe": {
        this.drawSelfAoeIndicator(ctx, radius, color);
        break;
      }
      case "self_buff": {
        this.drawDirArrow(ctx, dirX, dirY, 25, color);
        break;
      }
    }

    ctx.restore();
  }

  private drawDirIndicator(ctx: CanvasRenderingContext2D, tx: number, ty: number, color: string, width: number) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    // Dashed line from player to target
    ctx.globalAlpha = 0.4 + pulse * 0.2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(this.px, this.py);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    // Target crosshair
    ctx.globalAlpha = 0.6 + pulse * 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tx, ty, width, 0, Math.PI * 2);
    ctx.stroke();
    // Cross
    ctx.beginPath();
    ctx.moveTo(tx - width * 0.5, ty);
    ctx.lineTo(tx + width * 0.5, ty);
    ctx.moveTo(tx, ty - width * 0.5);
    ctx.lineTo(tx, ty + width * 0.5);
    ctx.stroke();
  }

  private drawAoeCircleIndicator(ctx: CanvasRenderingContext2D, tx: number, ty: number, radius: number, color: string) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);
    // Dashed line from player to center
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(this.px, this.py);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    // AOE circle fill
    ctx.globalAlpha = 0.08 + pulse * 0.06;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(tx, ty, radius, 0, Math.PI * 2);
    ctx.fill();
    // AOE circle stroke
    ctx.globalAlpha = 0.5 + pulse * 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, ty, radius, 0, Math.PI * 2);
    ctx.stroke();
    // Inner crosshair
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx - 6, ty);
    ctx.lineTo(tx + 6, ty);
    ctx.moveTo(tx, ty - 6);
    ctx.lineTo(tx, ty + 6);
    ctx.stroke();
  }

  private drawBlinkIndicator(ctx: CanvasRenderingContext2D, tx: number, ty: number) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.008);
    // Dashed trail from player to destination
    ctx.globalAlpha = 0.3 + pulse * 0.15;
    ctx.strokeStyle = "#b388ff";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(this.px, this.py);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    // Destination ghost circle (player silhouette)
    ctx.globalAlpha = 0.3 + pulse * 0.2;
    ctx.strokeStyle = "#b388ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, ty, 8, 0, Math.PI * 2);
    ctx.stroke();
    // Outer ring pulsing
    ctx.globalAlpha = 0.2 + pulse * 0.15;
    ctx.beginPath();
    ctx.arc(tx, ty, 14, 0, Math.PI * 2);
    ctx.stroke();
    // Fill dot at destination
    ctx.globalAlpha = 0.5 + pulse * 0.3;
    ctx.fillStyle = "#b388ff";
    ctx.beginPath();
    ctx.arc(tx, ty, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSelfAoeIndicator(ctx: CanvasRenderingContext2D, radius: number, color: string) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);
    // Circle around player
    ctx.globalAlpha = 0.06 + pulse * 0.04;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(this.px, this.py, radius, 0, Math.PI * 2);
    ctx.fill();
    // Stroke
    ctx.globalAlpha = 0.4 + pulse * 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(this.px, this.py, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawDirArrow(ctx: CanvasRenderingContext2D, dirX: number, dirY: number, length: number, color: string) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    const tipX = this.px + dirX * length;
    const tipY = this.py + dirY * length;
    ctx.globalAlpha = 0.6 + pulse * 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.px + dirX * 10, this.py + dirY * 10);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    // Arrowhead
    const ang = Math.atan2(dirY, dirX);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(ang - 0.5) * 6, tipY - Math.sin(ang - 0.5) * 6);
    ctx.lineTo(tipX - Math.cos(ang + 0.5) * 6, tipY - Math.sin(ang + 0.5) * 6);
    ctx.closePath();
    ctx.fill();
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
      kind: s.kind,
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
      quickSlots: this.quickSlots.map(s => s ? { name: s.name, rarity: s.rarity, consumableType: s.consumableType, stackCount: s.stackCount ?? 1 } : null),
      buffs: Object.entries(this.playerBuffs).map(([stat, b]) => ({ stat, timer: b!.timer, pct: Math.round((b!.mult - 1) * 100) })),
      luckBuff: this.playerLuckTimer > 0 ? this.playerLuckBuff : 0,
    };
    this.cb.onHud(hud);
  }

  private bossName(): string {
    return BOSSES[this.dungeon.boss].name;
  }
}

// ---------- helpers ----------
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(Math.round(r + r * amt), 0, 255);
  g = clamp(Math.round(g + g * amt), 0, 255);
  b = clamp(Math.round(b + b * amt), 0, 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
