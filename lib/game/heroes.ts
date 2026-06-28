export type HeroId = "knight" | "mage" | "priest" | "tank" | "archer";

export type AttackKind = "melee" | "ranged";

export type SkillKind =
  // original
  | "spin" | "meteor" | "heal" | "taunt" | "multishot"
  // new
  | "charge" | "warcry" | "swordstorm"  // knight
  | "frostnova" | "blink"      // mage
  | "smite" | "sanctuary"      // priest
  | "groundslam" | "berserk"   // tank
  | "rapidfire" | "snipe";     // archer

export type SkillTargetType =
  | "directional"   // line/dash skill aimed in a direction
  | "aoe_target"    // circle placed at aim position (distance from player)
  | "blink"         // teleport to aimed position
  | "self_aoe"      // circle centered on player
  | "self_buff";    // no targeting, buff/shield on self

export type SkillKey = "1" | "2" | "3";

// Skill upgrade system types
export interface SkillUpgradeBonuses {
  dmgMult?: number;     // override/add to skill damage multiplier
  range?: number;       // override range
  radius?: number;      // override radius
  cooldown?: number;    // override cooldown
  duration?: number;    // override duration
  extraHits?: number;   // extra projectiles/hits
}

export interface SkillUpgrade {
  level: 2;
  cost: { sp: number; gold: number };
  desc: string;
  bonuses: SkillUpgradeBonuses;
}

export interface SkillBranch {
  id: string;
  name: string;
  desc: string;
  bonuses: SkillUpgradeBonuses;
  special?: string;  // behavior flag checked in skills.ts
}

export const RESPEC_COST = 500; // gold to respec one skill's branch

export interface SkillDef {
  key: SkillKey;
  name: string;
  desc: string;
  cooldown: number; // seconds
  kind: SkillKind;
  target: SkillTargetType;
  range?: number;    // directional/blink/aoe_target: max distance from player (px)
  radius?: number;   // aoe_target/self_aoe: effect radius (px)
  color?: string;    // indicator tint color
  upgrade: SkillUpgrade;                // level 2
  branches: [SkillBranch, SkillBranch]; // level 3 choices
}

export interface HeroDef {
  id: HeroId;
  name: string;
  desc: string;
  attackKind: AttackKind;
  projectile?: "fireball" | "arrow" | "bolt";
  baseHp: number;
  baseDmg: number;
  speed: number; // px per second
  attackCooldown: number; // seconds
  attackRange: number; // px (melee reach or projectile spawn)
  skills: [SkillDef, SkillDef, SkillDef]; // Q, E, R
  color: string; // accent for UI
}

export const HEROES: Record<HeroId, HeroDef> = {
  knight: {
    id: "knight",
    name: "Knight",
    desc: "Balanced melee fighter. Charges, spins, and rallies.",
    attackKind: "melee",
    baseHp: 120,
    baseDmg: 18,
    speed: 90,
    attackCooldown: 0.45,
    attackRange: 26,
    color: "#c0c8d8",
    skills: [
      {
        key: "1", name: "Charge", desc: "Dash forward, damaging all in your path.", cooldown: 5, kind: "charge", target: "directional", range: 70, color: "#c0c8d8",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "Longer dash, more damage", bonuses: { range: 90, dmgMult: 1.7 } },
        branches: [
          { id: "battering_ram", name: "Battering Ram", desc: "Knocks back enemies 40px + stuns 1s", bonuses: { dmgMult: 1.8 }, special: "knockback_stun" },
          { id: "shadow_rush", name: "Shadow Rush", desc: "2 charges before cooldown, reduced dmg per hit", bonuses: { dmgMult: 1.3 }, special: "double_charge" },
        ],
      },
      {
        key: "2", name: "Sword Storm", desc: "Summon 5 flying swords that home on foes.", cooldown: 6, kind: "swordstorm", target: "self_buff", color: "#c0c8d8",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "7 swords, longer lifetime", bonuses: { extraHits: 2, duration: 4 } },
        branches: [
          { id: "blade_vortex", name: "Blade Vortex", desc: "Swords orbit player instead of homing", bonuses: { dmgMult: 1.3 }, special: "orbit" },
          { id: "soul_blades", name: "Soul Blades", desc: "Swords pierce infinitely, no hit limit", bonuses: { dmgMult: 0.9 }, special: "infinite_pierce" },
        ],
      },
      {
        key: "3", name: "War Cry", desc: "+damage & boost lifesteal for a few seconds.", cooldown: 14, kind: "warcry", target: "self_aoe", radius: 40, color: "#ffd24a",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "Longer duration, more damage buff", bonuses: { duration: 8, dmgMult: 1.8 } },
        branches: [
          { id: "bloodlust", name: "Bloodlust", desc: "30% lifesteal during buff", bonuses: { duration: 8 }, special: "bloodlust" },
          { id: "rallying_cry", name: "Rallying Cry", desc: "+30% speed during buff, enemies feared 2s", bonuses: { duration: 7 }, special: "rally_fear" },
        ],
      },
    ],
  },
  mage: {
    id: "mage",
    name: "Mage",
    desc: "Glass cannon. Frost, blink, and a devastating meteor.",
    attackKind: "ranged",
    projectile: "fireball",
    baseHp: 70,
    baseDmg: 26,
    speed: 85,
    attackCooldown: 0.45,
    attackRange: 14,
    color: "#3a4fb0",
    skills: [
      {
        key: "1", name: "Frost Nova", desc: "Freeze & damage nearby foes.", cooldown: 7, kind: "frostnova", target: "self_aoe", radius: 120, color: "#7ad7ff",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "Larger radius, longer freeze", bonuses: { radius: 150, duration: 3.5 } },
        branches: [
          { id: "absolute_zero", name: "Absolute Zero", desc: "Enemies shatter for AOE dmg when frozen expires", bonuses: { radius: 160, dmgMult: 1.5 }, special: "shatter" },
          { id: "permafrost", name: "Permafrost", desc: "Leaves slowing ground for 4s after nova", bonuses: { radius: 140 }, special: "permafrost_pool" },
        ],
      },
      {
        key: "2", name: "Meteor", desc: "Big AoE blast at your aim point.", cooldown: 8, kind: "meteor", target: "aoe_target", range: 90, radius: 70, color: "#ff6a1a",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "Larger blast, leaves fire pool", bonuses: { radius: 85, dmgMult: 2.8 } },
        branches: [
          { id: "apocalypse", name: "Apocalypse", desc: "3 smaller meteors scattered around target", bonuses: { dmgMult: 2.0 }, special: "multi_meteor" },
          { id: "supernova", name: "Supernova", desc: "Massive 120px explosion, huge dmg", bonuses: { radius: 120, dmgMult: 3.5 }, special: "supernova" },
        ],
      },
      {
        key: "3", name: "Blink", desc: "Teleport toward your cursor.", cooldown: 3, kind: "blink", target: "blink", range: 90, color: "#b388ff",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "Longer range, longer invuln", bonuses: { range: 120, duration: 0.4 } },
        branches: [
          { id: "phase_shift", name: "Phase Shift", desc: "Leave damaging clone at origin", bonuses: { range: 120 }, special: "phase_clone" },
          { id: "warp_strike", name: "Warp Strike", desc: "Deal AOE dmg at destination", bonuses: { range: 110, dmgMult: 1.5 }, special: "warp_aoe" },
        ],
      },
    ],
  },
  priest: {
    id: "priest",
    name: "Priest",
    desc: "Sturdy melee. Smites foes and heals himself.",
    attackKind: "melee",
    baseHp: 100,
    baseDmg: 14,
    speed: 85,
    attackCooldown: 0.5,
    attackRange: 24,
    color: "#f2f2f2",
    skills: [
      {
        key: "1", name: "Smite", desc: "Holy bolt that pierces enemies.", cooldown: 4, kind: "smite", target: "directional", range: 80, color: "#ffd24a",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "Stronger bolt and strike", bonuses: { dmgMult: 2.5 } },
        branches: [
          { id: "holy_chain", name: "Holy Chain", desc: "Bolt bounces to 2 nearby enemies", bonuses: { dmgMult: 2.0 }, special: "chain_bolt" },
          { id: "divine_execute", name: "Divine Execute", desc: "Strike deals 4x dmg to enemies below 30% HP", bonuses: { dmgMult: 2.8 }, special: "execute" },
        ],
      },
      {
        key: "2", name: "Divine Heal", desc: "Restore a chunk of HP.", cooldown: 9, kind: "heal", target: "self_aoe", radius: 80, color: "#5fff8f",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "Heals 50% HP, stronger HoT", bonuses: { dmgMult: 1.0, duration: 5 } },
        branches: [
          { id: "divine_wrath", name: "Divine Wrath", desc: "Heal burst also stuns nearby enemies 1.5s", bonuses: { radius: 100 }, special: "heal_stun" },
          { id: "renewal", name: "Renewal", desc: "HoT heals 12%/s for 6s, reduced burst to 30%", bonuses: { duration: 6 }, special: "strong_hot" },
        ],
      },
      {
        key: "3", name: "Sanctuary", desc: "Healing zone + brief invulnerability.", cooldown: 16, kind: "sanctuary", target: "self_aoe", radius: 46, color: "#ffd24a",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "Larger zone, longer duration", bonuses: { radius: 60, duration: 7 } },
        branches: [
          { id: "holy_fortress", name: "Holy Fortress", desc: "Zone also damages enemies inside", bonuses: { radius: 65, dmgMult: 0.5 }, special: "dmg_zone" },
          { id: "sacred_ground", name: "Sacred Ground", desc: "Zone grants 50% damage reduction instead of heal", bonuses: { radius: 70, duration: 6 }, special: "dmg_reduction" },
        ],
      },
    ],
  },
  tank: {
    id: "tank",
    name: "Tank",
    desc: "Massive HP bruiser. Lower HP = more damage & enemy miss chance.",
    attackKind: "melee",
    baseHp: 200,
    baseDmg: 12,
    speed: 65,
    attackCooldown: 0.6,
    attackRange: 28,
    color: "#8a8f99",
    skills: [
      {
        key: "1", name: "Ground Slam", desc: "Knockback shockwave around you.", cooldown: 6, kind: "groundslam", target: "self_aoe", radius: 80, color: "#8a8f99",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "Larger radius, more knockback", bonuses: { radius: 100, dmgMult: 1.5 } },
        branches: [
          { id: "earthquake", name: "Earthquake", desc: "3 aftershock waves every 0.5s", bonuses: { radius: 100 }, special: "aftershock" },
          { id: "fissure", name: "Fissure", desc: "Creates a line of damaging terrain in aim direction", bonuses: { dmgMult: 1.8, range: 120 }, special: "fissure_line" },
        ],
      },
      {
        key: "2", name: "Bulwark", desc: "Temp shield + pull aggro.", cooldown: 6, kind: "taunt", target: "self_buff", color: "#9aa3b5",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "Longer shield, brief invuln extended", bonuses: { duration: 5, dmgMult: 0 } },
        branches: [
          { id: "thorns", name: "Thorns", desc: "Reflect 30% damage back to attackers while shielded", bonuses: { duration: 5 }, special: "thorns" },
          { id: "fortress", name: "Fortress", desc: "Shield absorbs 50% max HP as extra HP", bonuses: { duration: 4 }, special: "absorb_shield" },
        ],
      },
      {
        key: "3", name: "Berserk", desc: "Rage: big damage & speed boost.", cooldown: 7, kind: "berserk", target: "self_aoe", radius: 100, color: "#ff3a1a",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "Stronger buff, larger shockwave", bonuses: { radius: 120, dmgMult: 2.2, duration: 7 } },
        branches: [
          { id: "rampage", name: "Rampage", desc: "Each kill extends berserk by 2s", bonuses: { dmgMult: 2.2 }, special: "kill_extend" },
          { id: "unstoppable", name: "Unstoppable", desc: "Immune to slow/snare during berserk + 3x speed", bonuses: { duration: 6 }, special: "cc_immune" },
        ],
      },
    ],
  },
  archer: {
    id: "archer",
    name: "Archer",
    desc: "Fast ranged DPS. Spreads, sprays, and snipes.",
    attackKind: "ranged",
    projectile: "arrow",
    baseHp: 75,
    baseDmg: 16,
    speed: 110,
    attackCooldown: 0.35,
    attackRange: 14,
    color: "#3f8f5a",
    skills: [
      {
        key: "1", name: "Multishot", desc: "Fire a fan of 5 arrows.", cooldown: 5, kind: "multishot", target: "directional", range: 80, color: "#ffd24a",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "7 arrows per volley, wider spread", bonuses: { extraHits: 2, dmgMult: 1.3 } },
        branches: [
          { id: "rain_of_arrows", name: "Rain of Arrows", desc: "Arrows rain in target area as AOE", bonuses: { radius: 80, dmgMult: 1.1 }, special: "arrow_rain" },
          { id: "explosive_shot", name: "Explosive Shot", desc: "Each arrow explodes on hit for small AOE", bonuses: { dmgMult: 1.0, radius: 20 }, special: "explosive" },
        ],
      },
      {
        key: "2", name: "Rapid Fire", desc: "Greatly boost fire rate briefly.", cooldown: 10, kind: "rapidfire", target: "self_buff", color: "#3f8f5a",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "Longer duration, even faster", bonuses: { duration: 5 } },
        branches: [
          { id: "bullet_time", name: "Bullet Time", desc: "Also grants 40% dodge chance during rapid fire", bonuses: { duration: 5 }, special: "dodge_buff" },
          { id: "overdrive", name: "Overdrive", desc: "Attack speed 5x but drains 3% HP/s", bonuses: { duration: 4 }, special: "overdrive" },
        ],
      },
      {
        key: "3", name: "Snipe", desc: "Charged shot for huge damage.", cooldown: 8, kind: "snipe", target: "directional", range: 200, color: "#ff5a5a",
        upgrade: { level: 2, cost: { sp: 1, gold: 100 }, desc: "More damage, longer dodge", bonuses: { dmgMult: 5.0, duration: 4 } },
        branches: [
          { id: "headshot", name: "Headshot", desc: "Guaranteed crit, double crit damage", bonuses: { dmgMult: 6.0 }, special: "guaranteed_crit" },
          { id: "piercing_round", name: "Piercing Round", desc: "Hits all enemies in line, each takes full damage", bonuses: { dmgMult: 4.5 }, special: "full_pierce" },
        ],
      },
    ],
  },
};

export const HERO_IDS: HeroId[] = ["knight", "mage", "priest", "tank", "archer"];

// Level scaling
export function hpForLevel(def: HeroDef, level: number): number {
  return Math.round(def.baseHp * (1 + 0.12 * (level - 1)));
}
export function dmgForLevel(def: HeroDef, level: number): number {
  return Math.round(def.baseDmg * (1 + 0.1 * (level - 1)));
}
export function xpToNext(level: number): number {
  return Math.round(50 * Math.pow(1.4, level - 1));
}
