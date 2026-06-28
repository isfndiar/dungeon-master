/**
 * Shared types and context interface for engine sub-modules.
 * Modules (bossSpells, skills, etc.) receive a GameContext to interact
 * with engine state without importing the Engine class directly.
 */

import type { SpriteDef } from "./sprites";
import type { BossKind, BossSpell, MonsterKind } from "./monsters";
import type { Input } from "./input";
import type { HeroDef, HeroId, SkillKind } from "./heroes";

// ---- Entity types ----

export interface Projectile {
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
  homing?: boolean;
  homingTurn?: number;
  hitSet2?: Set<Enemy>;
  hitsLeft?: number;
  tint?: string;
  wallPass?: boolean;
}

export interface HazardAoE {
  x: number; y: number;
  radius: number;
  telegraph: number;
  telegraphMax: number;
  dmg: number;
  color: string;
  exploded: boolean;
  fade: number;
  kind: "meteor" | "bounceSlam" | "eruption";
  knockback?: number;
  leavePool?: boolean;
  poolColor?: string;
}

export interface HazardBeam {
  x1: number; y1: number;
  x2: number; y2: number;
  telegraph: number;
  telegraphMax: number;
  active: number;
  activeMax: number;
  dmgTick: number;
  dmg: number;
  color: string;
  sweep?: number;
  sweepAngle?: number;
  baseAngle?: number;
}

export interface HazardPool {
  x: number; y: number;
  radius: number;
  time: number;
  timeMax: number;
  dmgPerSec: number;
  slow: number;
  slowTime: number;
  snare: boolean;
  snareTime: number;
  color: string;
  kind: "slime" | "lava" | "web" | "ink";
  tickAcc: number;
  spawnTelegraph: number;
}

export interface Enemy {
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
  frozen: number;
  phase: 1 | 2 | 3;
  spellPool: BossSpell[];
  castLock: number;
  atkAnim: number;
  castAnim: number;
  bossState: "shielded" | "broken";
  shield: number;
  shieldMax: number;
  breakTimer: number;
  phaseFlash: number;
  taunted: number;
}

export interface FloatText { x: number; y: number; text: string; life: number; color: string; }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; }
export interface NovaWave {
  x: number; y: number;
  radius: number;
  maxRadius: number;
  speed: number;
  dmg: number;
  frozenDur: number;
  duration: number;
  time: number;
  hitSet: Set<Enemy>;
}

// ---- Context passed to sub-modules ----

export interface GameContext {
  // Player state (read)
  px: number;
  py: number;
  aimX: number;
  aimY: number;
  phpMax: number;
  php: number;
  heroId: HeroId;
  hero: HeroDef;
  input: Input;

  // Mutable arrays (push to)
  projectiles: Projectile[];
  hazards: HazardAoE[];
  beams: HazardBeam[];
  pools: HazardPool[];
  particles: Particle[];
  floats: FloatText[];
  enemies: Enemy[];
  playerNovaWaves: NovaWave[];

  // Engine methods exposed to modules
  float(text: string, x: number, y: number, color: string): void;
  spawnRing(x: number, y: number, color: string, r: number): void;
  spawnMini(kind: MonsterKind, x: number, y: number, hp: number, dmg: number, size: number): void;
  damageEnemy(e: Enemy, dmg: number): void;
  fireProjectile(dx: number, dy: number, dmg: number, kind: "fireball" | "arrow" | "bolt"): void;
  firePiercing(dx: number, dy: number, dmg: number, kind: "fireball" | "arrow" | "bolt", wallPass?: boolean): void;
  avoidObstacle(nx: number, ny: number, fromX: number, fromY: number, r: number): { x: number; y: number };
  inObstacle(x: number, y: number, r: number): boolean;
  trail(ax: number, ay: number, bx: number, by: number, color: string): void;
}

// ---- Skill context extends with writable player state ----

export interface SkillContext extends GameContext {
  // Writable player state for skills
  setPx(x: number): void;
  setPy(y: number): void;
  setPhp(hp: number): void;
  setInvuln(t: number): void;
  setDmgBuff(time: number, mult: number): void;
  setSpeedBuff(time: number, mult: number): void;
  setRapidFire(t: number): void;
  setShield(t: number): void;
  setDodgeTimer(t: number): void;
  setHealOverTime(time: number, dps: number): void;
  setHealZone(x: number, y: number, time: number): void;
  setDivineHealTime(t: number): void;
  setLifeStealBuff(time: number, frac: number): void;
  setDoubleVolley(time: number, dmg: number): void;
  setSmiteMark(e: Enemy | null): void;
  getSmiteMark(): Enemy | null;
  curDmg(): number;
  bonusCdr: number;
  // Skill upgrade info
  skillLevel: number;        // 1, 2, or 3
  skillBranch: string | null; // branch ID if level 3
}

// ---- Constants ----

export const FIELD = { x: 16, y: 16, w: 448, h: 238 };

// ---- Utility functions ----

export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}
