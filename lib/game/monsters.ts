export type MonsterKind =
  | "slime" | "wolf" | "bat" | "spider"
  | "skeleton" | "ghost" | "imp" | "golem";

export type BossKind = "giant_slime" | "spider_queen" | "lich" | "lava_golem";

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

export const BOSSES: Record<BossKind, BossDef> = {
  giant_slime: { kind: "giant_slime", name: "Giant Slime", hp: 420,  dmg: 14, speed: 30, ranged: false, attackCooldown: 1.0, gold: 80,  xp: 120, size: 56 },
  spider_queen:{ kind: "spider_queen",name: "Spider Queen",hp: 560,  dmg: 16, speed: 45, ranged: true,  projectile: "bolt", attackCooldown: 1.3, gold: 110, xp: 170, size: 56 },
  lich:        { kind: "lich",        name: "Lich",        hp: 680,  dmg: 18, speed: 40, ranged: true,  projectile: "bolt", attackCooldown: 1.1, gold: 150, xp: 230, size: 56 },
  lava_golem:  { kind: "lava_golem",  name: "Lava Golem",  hp: 900,  dmg: 22, speed: 30, ranged: false, attackCooldown: 1.4, gold: 210, xp: 320, size: 56 },
};
