export type MonsterKind =
  | "slime" | "wolf" | "bat" | "spider"
  | "skeleton" | "ghost" | "imp" | "golem";

export type BossKind = "giant_slime" | "spider_queen" | "lich" | "lava_golem";

export type BossSpellKind =
  // ----- giant slime -----
  | "split" | "slimePool" | "bounceSlam"            // phase 1
  | "acidSpray" | "slimeWall" | "doubleSlam"        // phase 2
  | "toxicFlood" | "megaSplit" | "groundPound"      // phase 3
  // ----- spider queen -----
  | "webBarrage" | "webTrap" | "summonSpiderlings"  // phase 1
  | "venomSpit" | "webWall" | "leapStrike"          // phase 2
  | "spiderRain" | "broodSwarm" | "silkPrison"      // phase 3
  // ----- lich -----
  | "deathBeam" | "boneRing" | "raiseDead"          // phase 1
  | "soulLance" | "boneSpear" | "curseZone"         // phase 2
  | "deathNova" | "boneStorm" | "undeadArmy"        // phase 3
  // ----- lava golem -----
  | "meteor" | "lavaPool" | "eruption"              // phase 1
  | "fireWall" | "magmaWave" | "emberBurst"         // phase 2
  | "volcano" | "lavaTsunami" | "infernoNova";      // phase 3

export type SpellTier = 1 | 2 | 3;

export interface BossSpell {
  kind: BossSpellKind;
  cooldown: number; // seconds between casts in this phase
  tier: SpellTier;  // phase power level (1/2/3)
}

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  hp: number;
  dmg: number;
  speed: number;
  ranged: boolean;
  projectile?: "bolt" | "fireball";
  attackCooldown: number;
  gold: number;
  xp: number;
  size: number; // draw size px
}

export interface BossDef {
  kind: BossKind;
  name: string;
  hp: number;
  dmg: number;
  speed: number;
  ranged: boolean;
  projectile?: "bolt" | "fireball";
  attackCooldown: number;
  gold: number;
  xp: number;
  size: number;
  spells: BossSpell[]; // 9 entries: 3 per phase, tagged tier 1/2/3
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  slime:   { kind: "slime",   name: "Slime",   hp: 30,  dmg: 6,  speed: 35, ranged: false, attackCooldown: 1.0, gold: 4,  xp: 6,  size: 18 },
  wolf:    { kind: "wolf",    name: "Wolf",    hp: 40,  dmg: 9,  speed: 80, ranged: false, attackCooldown: 0.8, gold: 6,  xp: 9,  size: 20 },
  bat:     { kind: "bat",     name: "Bat",     hp: 22,  dmg: 5,  speed: 95, ranged: false, attackCooldown: 0.7, gold: 5,  xp: 7,  size: 16 },
  spider:  { kind: "spider",  name: "Spider",  hp: 45,  dmg: 8,  speed: 60, ranged: false, attackCooldown: 0.9, gold: 7,  xp: 10, size: 18 },
  skeleton:{ kind: "skeleton",name: "Skeleton",hp: 50,  dmg: 10, speed: 50, ranged: false, attackCooldown: 0.9, gold: 8,  xp: 11, size: 20 },
  ghost:   { kind: "ghost",   name: "Ghost",   hp: 38,  dmg: 9,  speed: 55, ranged: true,  projectile: "bolt", attackCooldown: 1.6, gold: 9, xp: 12, size: 18 },
  imp:     { kind: "imp",     name: "Imp",     hp: 42,  dmg: 11, speed: 65, ranged: true,  projectile: "fireball", attackCooldown: 1.7, gold: 11, xp: 14, size: 18 },
  golem:   { kind: "golem",   name: "Golem",   hp: 110, dmg: 16, speed: 35, ranged: false, attackCooldown: 1.2, gold: 16, xp: 20, size: 24 },
};

// 9 spells per boss: 3 phases x 3 spells. Cooldown shrinks at higher tier.
export const BOSSES: Record<BossKind, BossDef> = {
  giant_slime: {
    kind: "giant_slime", name: "Giant Slime", hp: 420, dmg: 14, speed: 30,
    ranged: false, attackCooldown: 1.0, gold: 80, xp: 120, size: 56,
    spells: [
      // phase 1
      { kind: "split",       cooldown: 5,  tier: 1 },
      { kind: "slimePool",   cooldown: 4,  tier: 1 },
      { kind: "bounceSlam",  cooldown: 4,  tier: 1 },
      // phase 2
      { kind: "acidSpray",   cooldown: 4,  tier: 2 },
      { kind: "slimeWall",   cooldown: 4,  tier: 2 },
      { kind: "doubleSlam",  cooldown: 4,  tier: 2 },
      // phase 3
      { kind: "toxicFlood",  cooldown: 3,  tier: 3 },
      { kind: "megaSplit",   cooldown: 4,  tier: 3 },
      { kind: "groundPound", cooldown: 3,  tier: 3 },
    ],
  },
  spider_queen: {
    kind: "spider_queen", name: "Spider Queen", hp: 560, dmg: 16, speed: 45,
    ranged: true, projectile: "bolt", attackCooldown: 1.3, gold: 110, xp: 170, size: 56,
    spells: [
      { kind: "webBarrage",         cooldown: 4,  tier: 1 },
      { kind: "webTrap",            cooldown: 5,  tier: 1 },
      { kind: "summonSpiderlings",  cooldown: 6,  tier: 1 },
      { kind: "venomSpit",          cooldown: 4,  tier: 2 },
      { kind: "webWall",            cooldown: 4,  tier: 2 },
      { kind: "leapStrike",         cooldown: 4,  tier: 2 },
      { kind: "spiderRain",         cooldown: 3,  tier: 3 },
      { kind: "broodSwarm",         cooldown: 4,  tier: 3 },
      { kind: "silkPrison",         cooldown: 3,  tier: 3 },
    ],
  },
  lich: {
    kind: "lich", name: "Lich", hp: 680, dmg: 18, speed: 40,
    ranged: true, projectile: "bolt", attackCooldown: 1.1, gold: 150, xp: 230, size: 56,
    spells: [
      { kind: "deathBeam",   cooldown: 5,  tier: 1 },
      { kind: "boneRing",    cooldown: 4,  tier: 1 },
      { kind: "raiseDead",   cooldown: 6,  tier: 1 },
      { kind: "soulLance",   cooldown: 4,  tier: 2 },
      { kind: "boneSpear",   cooldown: 4,  tier: 2 },
      { kind: "curseZone",   cooldown: 4,  tier: 2 },
      { kind: "deathNova",   cooldown: 3,  tier: 3 },
      { kind: "boneStorm",   cooldown: 3,  tier: 3 },
      { kind: "undeadArmy",  cooldown: 5,  tier: 3 },
    ],
  },
  lava_golem: {
    kind: "lava_golem", name: "Lava Golem", hp: 900, dmg: 22, speed: 30,
    ranged: false, attackCooldown: 1.4, gold: 210, xp: 320, size: 56,
    spells: [
      { kind: "meteor",       cooldown: 6,  tier: 1 },
      { kind: "lavaPool",     cooldown: 5,  tier: 1 },
      { kind: "eruption",     cooldown: 5,  tier: 1 },
      { kind: "fireWall",     cooldown: 4,  tier: 2 },
      { kind: "magmaWave",    cooldown: 4,  tier: 2 },
      { kind: "emberBurst",   cooldown: 4,  tier: 2 },
      { kind: "volcano",      cooldown: 4,  tier: 3 },
      { kind: "lavaTsunami",  cooldown: 4,  tier: 3 },
      { kind: "infernoNova",  cooldown: 3,  tier: 3 },
    ],
  },
};
