import { HeroId } from "./heroes";

// ---------------- Slots ----------------
export type EquipSlot = "weapon" | "helmet" | "armor" | "boots" | "ring";
export const EQUIP_SLOTS: EquipSlot[] = ["weapon", "helmet", "armor", "boots", "ring"];

export const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: "Weapon",
  helmet: "Helmet",
  armor: "Armor",
  boots: "Boots",
  ring: "Ring",
};

// ---------------- Stats ----------------
// Flat additive stats applied on top of the hero's base/level stats.
export interface ItemStats {
  dmg?: number;      // flat damage
  hp?: number;       // flat max HP
  speed?: number;    // flat move speed (px/s)
  cdr?: number;      // cooldown reduction, fraction 0..0.5 (skills + attack)
  crit?: number;     // crit chance, fraction 0..0.5 (x2 damage)
}

export type StatKey = keyof ItemStats;

export const STAT_LABEL: Record<StatKey, string> = {
  dmg: "DMG",
  hp: "HP",
  speed: "SPD",
  cdr: "CDR",
  crit: "CRIT",
};

// Whether a stat is shown as a percentage.
export const STAT_PCT: Record<StatKey, boolean> = {
  dmg: false, hp: false, speed: false, cdr: true, crit: true,
};

// ---------------- Rarity ----------------
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#b8b8c0",
  uncommon: "#5fd35f",
  rare: "#5aa9ff",
  epic: "#b388ff",
  legendary: "#ffce3a",
};

// Multiplier applied to rolled stat magnitude per rarity.
const RARITY_MULT: Record<Rarity, number> = {
  common: 1, uncommon: 1.4, rare: 1.9, epic: 2.6, legendary: 3.6,
};

// How many stats an item of a rarity carries (primary + bonuses).
const RARITY_STAT_COUNT: Record<Rarity, number> = {
  common: 1, uncommon: 1, rare: 2, epic: 3, legendary: 3,
};

// ---------------- Item ----------------
export interface Item {
  id: string;
  slot: EquipSlot;
  rarity: Rarity;
  name: string;
  stats: ItemStats;
  hero: HeroId | "any"; // weapons are hero-specific; others "any"
  ilvl: number;         // for sorting / power feel
}

// Primary stat each slot focuses on.
const SLOT_PRIMARY: Record<EquipSlot, StatKey> = {
  weapon: "dmg",
  helmet: "hp",
  armor: "hp",
  boots: "speed",
  ring: "cdr",
};

// Base roll range per stat (before rarity multiplier), at item level 1.
const STAT_BASE: Record<StatKey, [number, number]> = {
  dmg: [2, 5],
  hp: [12, 25],
  speed: [4, 9],
  cdr: [0.03, 0.06],
  crit: [0.03, 0.06],
};

// Pool of secondary stats that can appear on a slot.
const SLOT_SECONDARY: Record<EquipSlot, StatKey[]> = {
  weapon: ["crit", "cdr", "hp"],
  helmet: ["dmg", "cdr", "crit"],
  armor: ["dmg", "speed", "crit"],
  boots: ["hp", "crit", "cdr"],
  ring: ["crit", "dmg", "hp", "speed"],
};

// Hero-specific weapon names.
const WEAPON_NAMES: Record<HeroId, string[]> = {
  knight: ["Blade", "Longsword", "Claymore", "Greatsword"],
  mage: ["Wand", "Staff", "Scepter", "Rod"],
  priest: ["Mace", "Cudgel", "Censer", "Crook"],
  tank: ["Hammer", "Maul", "Bulwark", "Crusher"],
  archer: ["Bow", "Longbow", "Recurve", "Warbow"],
};

const ARMOR_NAMES: Record<Exclude<EquipSlot, "weapon">, string[]> = {
  helmet: ["Cap", "Helm", "Hood", "Crown"],
  armor: ["Tunic", "Mail", "Plate", "Aegis"],
  boots: ["Shoes", "Greaves", "Treads", "Sabatons"],
  ring: ["Band", "Ring", "Loop", "Signet"],
};

const RARITY_PREFIX: Record<Rarity, string[]> = {
  common: ["Worn", "Plain", "Cracked"],
  uncommon: ["Sturdy", "Fine", "Keen"],
  rare: ["Gleaming", "Vicious", "Runed"],
  epic: ["Ancient", "Dread", "Radiant"],
  legendary: ["Godforged", "Eternal", "Mythic"],
};

let itemSeq = 0;
function uid(): string {
  itemSeq++;
  return "i_" + Date.now().toString(36) + "_" + itemSeq.toString(36) + "_" + ((Math.random() * 1e6) | 0).toString(36);
}

function pick<T>(arr: T[]): T {
  return arr[(Math.random() * arr.length) | 0];
}

function rollStat(stat: StatKey, ilvl: number, mult: number): number {
  const [lo, hi] = STAT_BASE[stat];
  const scale = 1 + (ilvl - 1) * 0.12;
  let v = (lo + Math.random() * (hi - lo)) * scale * mult;
  if (stat === "cdr" || stat === "crit") {
    v = Math.min(v, stat === "cdr" ? 0.5 : 0.6);
    return Math.round(v * 100) / 100; // 2 decimals fraction
  }
  return Math.max(1, Math.round(v));
}

/**
 * Roll a random item.
 * @param ilvl item level (scales magnitude); pass dungeon depth/difficulty based value
 * @param rarity optional forced rarity, otherwise weighted random
 * @param heroForWeapon which hero a weapon should belong to (required if slot=weapon)
 */
export function rollItem(opts: {
  ilvl: number;
  slot?: EquipSlot;
  rarity?: Rarity;
  heroForWeapon: HeroId;
}): Item {
  const slot = opts.slot ?? pick(EQUIP_SLOTS);
  const rarity = opts.rarity ?? rollRarity();
  const mult = RARITY_MULT[rarity];
  const ilvl = Math.max(1, Math.round(opts.ilvl));

  const stats: ItemStats = {};
  const primary = SLOT_PRIMARY[slot];
  stats[primary] = rollStat(primary, ilvl, mult);

  const count = RARITY_STAT_COUNT[rarity];
  const pool = SLOT_SECONDARY[slot].slice();
  for (let i = 1; i < count; i++) {
    if (!pool.length) break;
    const idx = (Math.random() * pool.length) | 0;
    const s = pool.splice(idx, 1)[0];
    const cur = stats[s] ?? 0;
    stats[s] = (cur as number) + rollStat(s, ilvl, mult * 0.6);
  }

  const hero: HeroId | "any" = slot === "weapon" ? opts.heroForWeapon : "any";
  const baseName =
    slot === "weapon"
      ? pick(WEAPON_NAMES[opts.heroForWeapon])
      : pick(ARMOR_NAMES[slot]);
  const name = `${pick(RARITY_PREFIX[rarity])} ${baseName}`;

  return { id: uid(), slot, rarity, name, stats, hero, ilvl };
}

// Weighted rarity roll; deeper/bossier callers can bias via luck.
export function rollRarity(luck = 0): Rarity {
  // base weights — epic & legendary are deliberately rare
  const w: Record<Rarity, number> = {
    common: 60,
    uncommon: 26,
    rare: 10,
    epic: 3,
    legendary: 0.3,
  };
  // luck shifts weight toward higher tiers.
  // epic/legendary scale gently so high tiers stay scarce even with big luck.
  w.common = Math.max(5, w.common - luck * 30);
  w.uncommon += luck * 9;
  w.rare += luck * 13;
  w.epic += Math.max(0, luck) * 3;
  w.legendary += Math.max(0, luck) * 1.0;

  const total = RARITIES.reduce((s, r) => s + w[r], 0);
  let roll = Math.random() * total;
  for (const r of RARITIES) {
    roll -= w[r];
    if (roll <= 0) return r;
  }
  return "common";
}

// Sum the stat lines of an item into a readable list.
export function itemStatLines(item: Item): { key: StatKey; value: number }[] {
  return (Object.keys(item.stats) as StatKey[])
    .filter((k) => item.stats[k] !== undefined)
    .map((k) => ({ key: k, value: item.stats[k]! }));
}

export function formatStat(key: StatKey, value: number): string {
  if (STAT_PCT[key]) return `+${Math.round(value * 100)}% ${STAT_LABEL[key]}`;
  return `+${value} ${STAT_LABEL[key]}`;
}

// Sum equipped item stats into a single ItemStats bundle.
export function sumStats(items: (Item | null | undefined)[]): Required<ItemStats> {
  const out: Required<ItemStats> = { dmg: 0, hp: 0, speed: 0, cdr: 0, crit: 0 };
  for (const it of items) {
    if (!it) continue;
    const s = it.stats;
    out.dmg += s.dmg ?? 0;
    out.hp += s.hp ?? 0;
    out.speed += s.speed ?? 0;
    out.cdr += s.cdr ?? 0;
    out.crit += s.crit ?? 0;
  }
  // clamp the fraction stats to sane caps
  out.cdr = Math.min(out.cdr, 0.6);
  out.crit = Math.min(out.crit, 0.75);
  return out;
}

// A rough "power score" to sort items.
export function itemPower(item: Item): number {
  const s = item.stats;
  return (
    (s.dmg ?? 0) * 3 +
    (s.hp ?? 0) * 0.5 +
    (s.speed ?? 0) * 2 +
    (s.cdr ?? 0) * 200 +
    (s.crit ?? 0) * 200
  );
}
