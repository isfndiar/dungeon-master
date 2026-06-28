/**
 * Save data migration system.
 * 
 * Each migration transforms data from version N to N+1.
 * Migrations are run in sequence: if save is v1 and current is v4,
 * it runs: v1→v2, v2→v3, v3→v4.
 * 
 * To add a new migration:
 * 1. Create a function that transforms the data shape
 * 2. Register it in MIGRATIONS array at the correct index
 * 3. Bump CURRENT_VERSION in save.ts
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MigrationFn = (data: any) => any;

/**
 * Ordered list of migrations. Index 0 = migration from v1→v2, index 1 = v2→v3, etc.
 * Each function receives the raw parsed data at version N and returns data at version N+1.
 */
export const MIGRATIONS: MigrationFn[] = [
  // v1 → v2: Added quickSlots, consumable items
  (data) => {
    if (!data.quickSlots) {
      data.quickSlots = [null, null, null, null];
    }
    if (Array.isArray(data.inventory)) {
      for (const item of data.inventory) {
        if (!item.consumableType) item.consumableType = undefined;
        if (!item.effect) item.effect = undefined;
        if (item.stackCount === undefined) item.stackCount = undefined;
        if (item.maxStack === undefined) item.maxStack = undefined;
      }
    }
    data.version = 2;
    return data;
  },

  // v2 → v3: Added settings field + statistics tracking
  (data) => {
    if (!data.settings) {
      data.settings = {
        bgmEnabled: true,
        sfxEnabled: true,
      };
    }
    if (!data.statistics) {
      data.statistics = {
        totalRaids: 0,
        totalKills: 0,
        totalDeaths: 0,
        totalGoldEarned: 0,
        bossesDefeated: [],
        highestEndlessWave: 0,
        playTime: 0,
      };
    }
    data.version = 3;
    return data;
  },

  // v3 → v4: Added keybinds to settings
  (data) => {
    if (!data.settings) data.settings = {};
    if (!data.settings.keybinds) {
      data.settings.keybinds = {
        moveUp: "w", moveDown: "s", moveLeft: "a", moveRight: "d",
        attack: " ",
        skill1: "1", skill2: "2", skill3: "3",
        quickSlot1: "4", quickSlot2: "5", quickSlot3: "6", quickSlot4: "7",
      };
    }
    data.version = 4;
    return data;
  },

  // v4 → v5: Added skill upgrade system (skillLevels, skillBranches, skillPoints per hero)
  (data) => {
    if (data.heroes && typeof data.heroes === "object") {
      for (const key of Object.keys(data.heroes)) {
        const h = data.heroes[key];
        if (!h) continue;
        if (!Array.isArray(h.skillLevels)) h.skillLevels = [1, 1, 1];
        if (!Array.isArray(h.skillBranches)) h.skillBranches = [null, null, null];
        if (typeof h.skillPoints !== "number") {
          // Grant retroactive SP: (level - 1) points for existing progress
          h.skillPoints = Math.max(0, (h.level || 1) - 1);
        }
      }
    }
    data.version = 5;
    return data;
  },
];

/**
 * Current save version. Must equal MIGRATIONS.length + 1
 * (since migrations bring data from 1 up to this number).
 */
export const CURRENT_VERSION = MIGRATIONS.length + 1; // = 3

/**
 * Run all necessary migrations on raw parsed save data.
 * Returns data at CURRENT_VERSION, or null if data is unrecoverable.
 */
export function migrate(data: any): any | null {
  if (!data || typeof data !== "object") return null;

  // Detect version: v1 saves may not have a version field
  let version = typeof data.version === "number" ? data.version : 1;

  // Don't migrate if already current or newer
  if (version >= CURRENT_VERSION) return data;

  // Run each migration in sequence
  while (version < CURRENT_VERSION) {
    const migrationIndex = version - 1; // v1→v2 is index 0, v2→v3 is index 1, etc.
    const migrationFn = MIGRATIONS[migrationIndex];
    if (!migrationFn) {
      // Missing migration — data is from a version we can't handle
      console.warn(`[save] Missing migration for v${version}→v${version + 1}`);
      return null;
    }
    try {
      data = migrationFn(data);
      version = data.version;
    } catch (err) {
      console.error(`[save] Migration v${version}→v${version + 1} failed:`, err);
      return null;
    }
  }

  return data;
}
