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
      { key: "1", name: "Charge",     desc: "Dash forward, damaging all in your path.", cooldown: 5, kind: "charge", target: "directional", range: 70, color: "#c0c8d8" },
      { key: "2", name: "Sword Storm", desc: "Summon 5 flying swords that home on foes.", cooldown: 6, kind: "swordstorm", target: "self_buff", color: "#c0c8d8" },
      { key: "3", name: "War Cry",     desc: "+damage & boost lifesteal for a few seconds.", cooldown: 14, kind: "warcry", target: "self_aoe", radius: 40, color: "#ffd24a" },
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
      { key: "1", name: "Frost Nova", desc: "Freeze & damage nearby foes.",      cooldown: 7, kind: "frostnova", target: "self_aoe", radius: 120, color: "#7ad7ff" },
      { key: "2", name: "Meteor",     desc: "Big AoE blast at your aim point.",  cooldown: 8, kind: "meteor", target: "aoe_target", range: 90, radius: 70, color: "#ff6a1a" },
      { key: "3", name: "Blink",      desc: "Teleport toward your cursor.",      cooldown: 3, kind: "blink", target: "blink", range: 90, color: "#b388ff" },
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
      { key: "1", name: "Smite",      desc: "Holy bolt that pierces enemies.",   cooldown: 4, kind: "smite", target: "directional", range: 80, color: "#ffd24a" },
      { key: "2", name: "Divine Heal",desc: "Restore a chunk of HP.",            cooldown: 9, kind: "heal", target: "self_aoe", radius: 80, color: "#5fff8f" },
      { key: "3", name: "Sanctuary",  desc: "Healing zone + brief invulnerability.", cooldown: 16, kind: "sanctuary", target: "self_aoe", radius: 46, color: "#ffd24a" },
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
      { key: "1", name: "Ground Slam", desc: "Knockback shockwave around you.",      cooldown: 6, kind: "groundslam", target: "self_aoe", radius: 80, color: "#8a8f99" },
      { key: "2", name: "Bulwark",     desc: "Temp shield + pull aggro.",            cooldown: 6, kind: "taunt", target: "self_buff", color: "#9aa3b5" },
      { key: "3", name: "Berserk",     desc: "Rage: big damage & speed boost.",      cooldown: 7, kind: "berserk", target: "self_aoe", radius: 100, color: "#ff3a1a" },
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
      { key: "1", name: "Multishot", desc: "Fire a fan of 5 arrows.",           cooldown: 5, kind: "multishot", target: "directional", range: 80, color: "#ffd24a" },
      { key: "2", name: "Rapid Fire",desc: "Greatly boost fire rate briefly.",  cooldown: 10, kind: "rapidfire", target: "self_buff", color: "#3f8f5a" },
      { key: "3", name: "Snipe",     desc: "Charged shot for huge damage.",      cooldown: 8, kind: "snipe", target: "directional", range: 200, color: "#ff5a5a" },
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
