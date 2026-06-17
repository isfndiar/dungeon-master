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

const heroImages: Record<string, HeroImages> = {};
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
): boolean {
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

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(x + size, y + bob);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, size, size);
  } else {
    ctx.drawImage(img, x, y + bob, size, size);
  }
  ctx.restore();
  return true;
}
