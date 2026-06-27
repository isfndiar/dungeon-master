const HERO_SPRITES = [
  ...["knight", "mage", "priest", "tank", "archer"].flatMap((id) => [
    `/sprites/${id}_front.png`,
    `/sprites/${id}_back.png`,
    `/sprites/${id}_side.png`,
  ]),
  "/custom/idle_6f/elf_mage_idle_6f_4dir_sheet.png",
  "/custom/walk_6f/elf_mage_walk_6f_4dir_sheet.png",
  "/custom/attack_6f/elf_mage_attack_6f_4dir_sheet.png",
  "/custom/fireball_6f/fireball_right_6f_sheet.png",
  "/sprites/paladin/idle_6f_4dir/paladin_idle_6f_4dir_sheet.png",
  "/sprites/paladin/walk_6f_4dir/paladin_walk_6f_4dir_sheet.png",
  "/sprites/paladin/attack_6f_4dir/paladin_attack_6f_4dir_sheet.png",
  "/sprites/frost_knight/idle_6f_4dir/frost_knight_idle_6f_4dir_sheet.png",
  "/sprites/frost_knight/walk_6f_4dir/frost_knight_walk_6f_4dir_sheet.png",
  "/sprites/frost_knight/attack_4f_4dir/frost_knight_attack_4f_4dir_sheet.png",
  "/sprites/elf_archer/archer-idle/final/idle-6f-3dir-spritesheet.png",
  "/sprites/elf_archer/archer-walk/final/walk-spritesheet.png",
  "/sprites/elf_archer/archer-attack-6f/final/attack-current-3dir-spritesheet.png",
  "/sprites/elf_archer/arrow-projectile/arrow-projectile-3dir-strip.png",
  "/sprites/hammer_guardian/idle-4f/final/idle-4f-4dir-spritesheet.png",
  "/sprites/hammer_guardian/walk-4f/final/walk-4f-4dir-spritesheet.png",
  "/sprites/hammer_guardian/attack-4f/final/attack-4f-4dir-spritesheet.png",
];

const TERRAIN = [
  "/terrain/grass-tile.png",
  "/terrain/gray-brick-road-tile.png",
  "/terrain/water-tile.png",
];

const BUILDINGS = [
  "/sprites/building/noble-manor-royal.png",
  "/sprites/building/noble-manor-forest.png",
  "/sprites/building/noble-manor-renaissance.png",
  "/sprites/building/castle_keyed.png",
  "/sprites/building/noble-manor-gothic.png",
  "/sprites/building/dungeon-cave-entrance.png",
];

const NPCs = [
  "/sprites/villager/blachsmith_keyed.png",
  "/sprites/villager/merchant_keyed.png",
  "/sprites/king/king_keyed.png",
  "/sprites/nobleman/nobleman_keyed.png",
  "/sprites/villager/villager_01_keyed.png",
  "/sprites/villager/villager_02_keyed.png",
  "/sprites/villager/villager_03_keyed.png",
  "/sprites/villager/villager_04_keyed.png",
  "/sprites/villager/villager_05_keyed.png",
  "/sprites/villager/villager_06_keyed.png",
  "/sprites/villager/villager_07_keyed.png",
  "/sprites/villager/villager_08_keyed.png",
  "/sprites/villager/villager_09_keyed.png",
  "/sprites/villager/villager_10_keyed.png",
  "/sprites/villager/villager_11_keyed.png",
];

const VILLAGER_HOMES = [
  "/sprites/building/villager-home/villager-home-1_keyed.png",
  "/sprites/building/villager-home/villager-home-2_keyed.png",
  "/sprites/building/villager-home/villager-home-3_keyed.png",
];

const ALL_ASSETS = [...HERO_SPRITES, ...TERRAIN, ...BUILDINGS, ...NPCs, ...VILLAGER_HOMES];

export function preloadAssets(onProgress: (pct: number) => void): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  return new Promise((resolve) => {
    let loaded = 0;
    const total = ALL_ASSETS.length;
    const done = () => {
      loaded++;
      onProgress(Math.round((loaded / total) * 100));
      if (loaded >= total) resolve();
    };
    for (const src of ALL_ASSETS) {
      const img = new Image();
      img.onload = done;
      img.onerror = done;
      img.src = src;
    }
    // safety: resolve after 8s no matter what
    setTimeout(resolve, 8000);
  });
}
