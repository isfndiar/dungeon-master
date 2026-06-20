// Directional PNG sprite system (Option A).
// Loads pre-rendered hero sprites (front/back/side) from /public/sprites,
// derives a facing direction from movement/aim, and draws with a walk bob.
// Side view is mirrored for left/right. Falls back gracefully until loaded.

export type Facing = "down" | "up" | "left" | "right";

// One loaded hero: 3 source images (down=front, up=back, side=right-facing).
interface HeroImages {
  down?: HTMLImageElement;
  up?: HTMLImageElement;
  side?: HTMLImageElement;
  loaded: boolean;
}

type MageAnim = "idle" | "walk" | "attack";

interface MageImages {
  idle?: HTMLImageElement;
  walk?: HTMLImageElement;
  attack?: HTMLImageElement;
  fireball?: HTMLImageElement;
  loaded: boolean;
}

interface PaladinImages {
  idle?: HTMLImageElement;
  walk?: HTMLImageElement;
  attack?: HTMLImageElement;
  loaded: boolean;
}

interface FrostKnightImages {
  idle?: HTMLImageElement;
  walk?: HTMLImageElement;
  attack?: HTMLImageElement;
  loaded: boolean;
}

const heroImages: Record<string, HeroImages> = {};
const mageImages: MageImages = { loaded: false };
const paladinImages: PaladinImages = { loaded: false };
const frostKnightImages: FrostKnightImages = { loaded: false };
let preloadStarted = false;

const HERO_IDS = ["knight", "mage", "priest", "tank", "archer"] as const;

function loadImg(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

// Kick off loading all hero sprites once (browser only).
export function preloadHeroSprites() {
  if (preloadStarted || typeof window === "undefined") return;
  preloadStarted = true;
  for (const id of HERO_IDS) {
    const rec: HeroImages = { loaded: false };
    const down = loadImg(`/sprites/${id}_front.png`);
    const up = loadImg(`/sprites/${id}_back.png`);
    const side = loadImg(`/sprites/${id}_side.png`);
    let count = 0;
    const done = () => { if (++count >= 3) rec.loaded = true; };
    down.onload = done; down.onerror = done;
    up.onload = done; up.onerror = done;
    side.onload = done; side.onerror = done;
    rec.down = down; rec.up = up; rec.side = side;
    heroImages[id] = rec;
  }

  const mageSources: Record<MageAnim | "fireball", string> = {
    idle: "/custom/idle_6f/elf_mage_idle_6f_4dir_sheet.png",
    walk: "/custom/walk_6f/elf_mage_walk_6f_4dir_sheet.png",
    attack: "/custom/attack_6f/elf_mage_attack_6f_4dir_sheet.png",
    fireball: "/custom/fireball_6f/fireball_right_6f_sheet.png",
  };
  let mageCount = 0;
  for (const key of Object.keys(mageSources) as (MageAnim | "fireball")[]) {
    const img = loadImg(mageSources[key]);
    const done = () => { if (++mageCount >= 4) mageImages.loaded = true; };
    img.onload = done;
    img.onerror = done;
    mageImages[key] = img;
  }

  const paladinSources: Record<"idle" | "walk" | "attack", string> = {
    idle: "/sprites/paladin/idle_6f_4dir/paladin_idle_6f_4dir_sheet.png",
    walk: "/sprites/paladin/walk_6f_4dir/paladin_walk_6f_4dir_sheet.png",
    attack: "/sprites/paladin/attack_6f_4dir/paladin_attack_6f_4dir_sheet.png",
  };
  let paladinCount = 0;
  for (const key of Object.keys(paladinSources) as ("idle" | "walk" | "attack")[]) {
    const img = loadImg(paladinSources[key]);
    const done = () => { if (++paladinCount >= 3) paladinImages.loaded = true; };
    img.onload = done;
    img.onerror = done;
    paladinImages[key] = img;
  }

  const frostKnightSources: Record<"idle" | "walk" | "attack", string> = {
    idle: "/sprites/frost_knight/idle_6f_4dir/frost_knight_idle_6f_4dir_sheet.png",
    walk: "/sprites/frost_knight/walk_6f_4dir/frost_knight_walk_6f_4dir_sheet.png",
    attack: "/sprites/frost_knight/attack_4f_4dir/frost_knight_attack_4f_4dir_sheet.png",
  };
  let frostKnightCount = 0;
  for (const key of Object.keys(frostKnightSources) as ("idle" | "walk" | "attack")[]) {
    const img = loadImg(frostKnightSources[key]);
    const done = () => { if (++frostKnightCount >= 3) frostKnightImages.loaded = true; };
    img.onload = done;
    img.onerror = done;
    frostKnightImages[key] = img;
  }
}

export function heroSpritesReady(id: string): boolean {
  return !!heroImages[id]?.loaded;
}

// Derive facing from a movement/aim vector. Dominant axis wins;
// ties prefer vertical so the player reads as up/down when diagonal.
export function facingFromVec(dx: number, dy: number, prev: Facing): Facing {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return prev;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

// Draw a hero with directional sprite + walk bob.
// x,y = top-left of the size×size draw box. `walkPhase` drives a subtle bob.
// Returns true if it drew a PNG; false if not loaded yet (caller may fallback).
export function drawHeroDir(
  ctx: CanvasRenderingContext2D,
  id: string,
  facing: Facing,
  x: number,
  y: number,
  size: number,
  walkPhase: number,
  moving: boolean,
  attackProgress = 0,
): boolean {
  if (id === "mage" && drawCustomMage(
    ctx, facing, x, y, size, walkPhase, moving, attackProgress,
  )) return true;
  if (id === "priest" && drawPaladin(
    ctx, facing, x, y, size, walkPhase, moving, attackProgress,
  )) return true;
  if (id === "knight" && drawFrostKnight(
    ctx, facing, x, y, size, walkPhase, moving, attackProgress,
  )) return true;

  const rec = heroImages[id];
  if (!rec || !rec.loaded) return false;

  let img: HTMLImageElement | undefined;
  let flip = false;
  if (facing === "down") img = rec.down;
  else if (facing === "up") img = rec.up;
  else if (facing === "right") img = rec.side;
  else { img = rec.side; flip = true; } // left = mirror of side

  if (!img || !img.complete || img.naturalWidth === 0) return false;

  // walk bob: gentle 2-frame vertical hop while moving
  const bob = moving ? (Math.floor(walkPhase * 8) % 2 === 0 ? 0 : -1) : 0;
  const drawSize = size * 2;
  const drawX = x - (drawSize - size) / 2;
  const drawY = y - (drawSize - size) + bob;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(drawX + drawSize, drawY);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, drawSize, drawSize);
  } else {
    ctx.drawImage(img, drawX, drawY, drawSize, drawSize);
  }
  ctx.restore();
  return true;
}

const MAGE_CELL = 128;
const MAGE_DIR_ROW: Record<Facing, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

function drawCustomMage(
  ctx: CanvasRenderingContext2D,
  facing: Facing,
  x: number,
  y: number,
  size: number,
  animTime: number,
  moving: boolean,
  attackProgress: number,
): boolean {
  if (!mageImages.loaded) return false;

  const anim: MageAnim = attackProgress > 0 ? "attack" : moving ? "walk" : "idle";
  const img = mageImages[anim];
  if (!img || !img.complete || img.naturalWidth === 0) return false;

  const frame = attackProgress > 0
    ? Math.min(5, Math.floor((1 - attackProgress) * 6))
    : Math.floor(animTime * (moving ? 10 : 5)) % 6;
  const row = MAGE_DIR_ROW[facing];
  // The 128px cells intentionally include generous transparent margins.
  // Enlarge the cell while keeping its center/feet aligned with other heroes.
  const drawSize = size * 2;
  const drawX = x - (drawSize - size) / 2;
  const drawY = y - (drawSize - size);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    img,
    frame * MAGE_CELL, row * MAGE_CELL, MAGE_CELL, MAGE_CELL,
    drawX, drawY, drawSize, drawSize,
  );
  ctx.restore();
  return true;
}

function drawPaladin(
  ctx: CanvasRenderingContext2D,
  facing: Facing,
  x: number,
  y: number,
  size: number,
  animTime: number,
  moving: boolean,
  attackProgress: number,
): boolean {
  if (!paladinImages.loaded) return false;
  const img = attackProgress > 0
    ? paladinImages.attack
    : moving ? paladinImages.walk : paladinImages.idle;
  if (!img || !img.complete || img.naturalWidth === 0) return false;

  const frame = attackProgress > 0
    ? Math.min(5, Math.floor((1 - attackProgress) * 6))
    : Math.floor(animTime * (moving ? 10 : 5)) % 6;
  const row = MAGE_DIR_ROW[facing];
  const drawSize = size * 2;
  const drawX = x - (drawSize - size) / 2;
  const drawY = y - (drawSize - size);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    frame * MAGE_CELL, row * MAGE_CELL, MAGE_CELL, MAGE_CELL,
    drawX, drawY, drawSize, drawSize,
  );
  ctx.restore();
  return true;
}

function drawFrostKnight(
  ctx: CanvasRenderingContext2D,
  facing: Facing,
  x: number,
  y: number,
  size: number,
  animTime: number,
  moving: boolean,
  attackProgress: number,
): boolean {
  if (!frostKnightImages.loaded) return false;
  const img = attackProgress > 0
    ? frostKnightImages.attack
    : moving ? frostKnightImages.walk : frostKnightImages.idle;
  if (!img || !img.complete || img.naturalWidth === 0) return false;

  const isAttack = attackProgress > 0;
  const frame = isAttack
    ? Math.min(3, Math.floor((1 - attackProgress) * 4))
    : Math.floor(animTime * (moving ? 10 : 5)) % 6;
  const row = MAGE_DIR_ROW[facing];
  // The attack frames render the character smaller within the 128px cell than
  // idle/walk. Scale them up so the knight stays the same on-screen size.
  const scale = isAttack ? 1.3 : 1;
  const drawSize = size * 2 * scale;
  const drawX = x - (drawSize - size) / 2;
  // keep feet anchored to the same baseline as the unscaled sprite
  const drawY = y - (drawSize - size) - (size * 2) * (scale - 1) * 0.12;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    frame * MAGE_CELL, row * MAGE_CELL, MAGE_CELL, MAGE_CELL,
    drawX, drawY, drawSize, drawSize,
  );
  ctx.restore();
  return true;
}

// Draws one right-facing fireball frame. The caller controls rotation/position.
export function drawMageFireball(
  ctx: CanvasRenderingContext2D,
  size: number,
  animTime: number,
): boolean {
  const img = mageImages.fireball;
  if (!mageImages.loaded || !img || !img.complete || img.naturalWidth === 0) return false;
  const frame = Math.floor(animTime * 14) % 6;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    img,
    frame * MAGE_CELL, 0, MAGE_CELL, MAGE_CELL,
    -size / 2, -size / 2, size, size,
  );
  ctx.restore();
  return true;
}
