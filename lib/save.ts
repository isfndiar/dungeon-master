import { HeroId, HERO_IDS } from "./game/heroes";
import { DungeonId } from "./game/dungeons";
import { Item, EquipSlot, EQUIP_SLOTS, ItemStats, sumStats } from "./game/items";

export interface HeroProgress {
  level: number;
  xp: number;
  // equipped item id per slot (null = empty)
  equipped: Record<EquipSlot, string | null>;
}

export interface SaveData {
  version: number;
  gold: number;
  heroes: Record<HeroId, HeroProgress>;
  cleared: DungeonId[];
  inventory: Item[]; // shared item pool
  selectedHero: HeroId; // hero used to walk the town & default for raids
}

const KEY = "dungeon-hunter-save-v2";
const VERSION = 2;

function emptyEquip(): Record<EquipSlot, string | null> {
  const e = {} as Record<EquipSlot, string | null>;
  for (const s of EQUIP_SLOTS) e[s] = null;
  return e;
}

export function defaultSave(): SaveData {
  const heroes = {} as Record<HeroId, HeroProgress>;
  for (const id of HERO_IDS) heroes[id] = { level: 1, xp: 0, equipped: emptyEquip() };
  return { version: VERSION, gold: 0, heroes, cleared: [], inventory: [], selectedHero: "knight" };
}

export function loadSave(): SaveData {
  if (typeof window === "undefined") return defaultSave();
  try {
    // try current key; also migrate from v1
    let raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const old = window.localStorage.getItem("dungeon-hunter-save-v1");
      if (old) raw = old; // migrate progress, ignore version mismatch below
    }
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData> & { heroes?: any };
    if (!parsed || !parsed.heroes) return defaultSave();

    const base = defaultSave();
    const heroes = { ...base.heroes };
    for (const id of HERO_IDS) {
      const h = parsed.heroes[id];
      if (h && typeof h.level === "number" && typeof h.xp === "number") {
        const equipped = emptyEquip();
        if (h.equipped && typeof h.equipped === "object") {
          for (const s of EQUIP_SLOTS) {
            const v = h.equipped[s];
            if (typeof v === "string") equipped[s] = v;
          }
        }
        heroes[id] = { level: h.level, xp: h.xp, equipped };
      }
    }

    const inventory: Item[] = Array.isArray(parsed.inventory)
      ? (parsed.inventory as Item[]).filter(isValidItem)
      : [];

    const selectedHero: HeroId =
      typeof parsed.selectedHero === "string" && HERO_IDS.includes(parsed.selectedHero as HeroId)
        ? (parsed.selectedHero as HeroId)
        : "knight";

    return {
      version: VERSION,
      gold: typeof parsed.gold === "number" ? parsed.gold : 0,
      heroes,
      cleared: Array.isArray(parsed.cleared) ? (parsed.cleared as DungeonId[]) : [],
      inventory,
      selectedHero,
    };
  } catch {
    return defaultSave();
  }
}

function isValidItem(it: any): it is Item {
  return (
    it &&
    typeof it.id === "string" &&
    typeof it.slot === "string" &&
    typeof it.rarity === "string" &&
    typeof it.name === "string" &&
    it.stats && typeof it.stats === "object"
  );
}

export function writeSave(data: SaveData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

export function resetSave(): SaveData {
  const d = defaultSave();
  writeSave(d);
  return d;
}

// ---------------- equipment helpers ----------------

export function findItem(save: SaveData, id: string | null): Item | undefined {
  if (!id) return undefined;
  return save.inventory.find((it) => it.id === id);
}

// Items currently equipped by a hero, in slot order.
export function equippedItems(save: SaveData, hero: HeroId): (Item | undefined)[] {
  const h = save.heroes[hero];
  return EQUIP_SLOTS.map((s) => findItem(save, h.equipped[s]));
}

// Total bonus stats for a hero from their equipment.
export function heroBonusStats(save: SaveData, hero: HeroId): Required<ItemStats> {
  return sumStats(equippedItems(save, hero));
}

// Equip an item into its slot for a hero. Returns updated save (mutated copy ok).
export function equipItem(save: SaveData, hero: HeroId, item: Item): void {
  // weapon must match hero
  if (item.slot === "weapon" && item.hero !== "any" && item.hero !== hero) return;
  save.heroes[hero].equipped[item.slot] = item.id;
}

export function unequip(save: SaveData, hero: HeroId, slot: EquipSlot): void {
  save.heroes[hero].equipped[slot] = null;
}

// Remove an item from inventory and unequip it from any hero holding it.
export function discardItem(save: SaveData, id: string): void {
  save.inventory = save.inventory.filter((it) => it.id !== id);
  for (const hid of HERO_IDS) {
    for (const s of EQUIP_SLOTS) {
      if (save.heroes[hid].equipped[s] === id) save.heroes[hid].equipped[s] = null;
    }
  }
}
