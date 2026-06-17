// Procedural pixel-character generator.
// Builds a unique 16x16 top-down humanoid from a seed: random skin, hair,
// hairstyle, costume colors, headgear and accents — with auto-shading and
// left/right symmetry so it reads like a hand-drawn pixel sprite.
// Output is a SpriteDef (palette + rows) compatible with the anim system.

import { SpriteDef } from "./sprites";

const W = 16;
const H = 16;

// -------- seeded RNG (mulberry32) --------
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// -------- color helpers --------
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + v * amt)));
  return "#" + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
}

// -------- palettes to draw from --------
const SKINS = ["#f1c9a0", "#e8b894", "#d49a6a", "#b87a48", "#8a5a36", "#6a4226"];
const HAIRS = [
  "#2a1c12", "#4a3018", "#6a4a22", "#8a5a2a", "#caa24a", "#e8d8a0",
  "#a83828", "#c0c0c8", "#3a3a44", "#5a3a6a",
];
const CLOTHS = [
  "#3a4f8a", "#7a1f2a", "#2f6a3a", "#6a3fb0", "#b8863a", "#3a8a8a",
  "#8a3a6a", "#4a4a55", "#a85030", "#2a5a8a", "#5a7a3a", "#7a4a2a",
];
const TRIMS = ["#ffd24a", "#e8e8ec", "#caa24a", "#3a2a1a", "#7ad7ff", "#ff6a6a"];

// Bias preferences per NPC role/archetype.
export interface GenOptions {
  hair?: string;
  cloth?: string;
  trim?: string;
  headgear?: Headgear;
  beard?: boolean;
}

type Headgear = "none" | "crown" | "helmet" | "hood" | "hat";

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// -------- generator --------
export function generateCharacter(seed: string | number, opts: GenOptions = {}): SpriteDef {
  const rng = makeRng(typeof seed === "string" ? hashStr(seed) : seed >>> 0);

  const skin = pick(rng, SKINS);
  const hair = opts.hair ?? pick(rng, HAIRS);
  const cloth = opts.cloth ?? pick(rng, CLOTHS);
  const trim = opts.trim ?? pick(rng, TRIMS);

  const headgear: Headgear =
    opts.headgear ?? pick(rng, ["none", "none", "hood", "hat", "helmet"] as Headgear[]);
  const beard = opts.beard ?? rng() < 0.22;
  const longHair = headgear === "none" && rng() < 0.35;
  const spiky = headgear === "none" && !longHair && rng() < 0.3;

  // palette
  const palette: Record<string, string> = {
    s: skin,
    k: shade(skin, -0.22),     // skin shadow
    e: "#2a2018",              // eyes
    h: hair,
    j: shade(hair, -0.3),      // hair shadow
    a: cloth,                  // cloth main
    b: shade(cloth, -0.28),    // cloth shadow / outline
    c: shade(cloth, 0.22),     // cloth highlight
    t: trim,
    u: shade(trim, -0.3),      // trim shadow
    o: "#2a1f16",              // boots
    g: shade("#2a1f16", 0.3),  // boot light
  };

  // grid
  const g: string[][] = Array.from({ length: H }, () => Array(W).fill("."));
  const set = (x: number, y: number, ch: string) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    g[y][x] = ch;
  };
  // mirror around the vertical center (x and 15-x)
  const mir = (x: number, y: number, ch: string) => {
    set(x, y, ch);
    set(W - 1 - x, y, ch);
  };

  // ---- FACE (rows 3-5, cols 5..10) ----
  for (let y = 3; y <= 5; y++) {
    for (let x = 5; x <= 7; x++) mir(x, y, "s");
  }
  // chin shadow
  mir(5, 5, "k");
  mir(6, 5, "k");
  // eyes
  mir(6, 4, "e");

  // ---- HAIR ----
  if (headgear === "none" || headgear === "hood") {
    // top fringe rows 1-2
    for (let x = 4; x <= 7; x++) { mir(x, 1, "h"); mir(x, 2, "h"); }
    mir(7, 0, "h");
    if (spiky) { mir(5, 0, "h"); mir(4, 0, "h"); }
    // side frame on row3
    mir(4, 3, "h"); mir(5, 3, "h");
    // shadow accents
    mir(4, 2, "j");
    if (longHair) {
      for (let y = 3; y <= 8; y++) { mir(4, y, "h"); }
      for (let y = 5; y <= 8; y++) { mir(3, y, "j"); }
    }
  }

  if (beard) {
    mir(5, 6, "h"); mir(6, 6, "h"); mir(7, 6, "h");
    mir(6, 7, "j");
  }

  // ---- TORSO (rows 6-13) ----
  for (let y = 6; y <= 13; y++) {
    for (let x = 4; x <= 7; x++) mir(x, y, "a");
  }
  // shoulders slightly narrower at top
  mir(4, 6, ".");
  mir(4, 13, "b");
  // side outline (shadow)
  for (let y = 7; y <= 13; y++) mir(4, y, "b");
  // center highlight stripe
  for (let y = 7; y <= 12; y++) set(7, y, "c");
  for (let y = 7; y <= 12; y++) set(8, y, "c");
  // bottom hem shadow
  for (let x = 4; x <= 7; x++) mir(x, 13, "b");

  // ---- costume detailing (random pattern) ----
  const pattern = Math.floor(rng() * 4);
  if (pattern === 0) {
    // belt
    for (let x = 4; x <= 7; x++) mir(x, 11, "t");
    set(7, 11, "u"); set(8, 11, "u");
  } else if (pattern === 1) {
    // vest opening + trim collar
    for (let y = 7; y <= 12; y++) { set(7, y, "t"); set(8, y, "t"); }
    mir(5, 6, "t");
  } else if (pattern === 2) {
    // sash across chest
    mir(4, 8, "t"); mir(5, 9, "t"); mir(6, 10, "t");
  } else {
    // shoulder pads / epaulets
    mir(4, 7, "t"); mir(5, 6, "t");
  }

  // ---- HEADGEAR ----
  if (headgear === "crown") {
    for (let x = 4; x <= 7; x++) mir(x, 1, "t");
    mir(4, 0, "t"); mir(6, 0, "t"); set(7, 0, "t"); // points
    mir(5, 1, "u");
  } else if (headgear === "helmet") {
    for (let x = 4; x <= 7; x++) { mir(x, 1, "a"); mir(x, 2, "a"); }
    mir(7, 0, "a");
    mir(4, 3, "b"); mir(5, 3, "a"); // cheek guards
    set(7, 2, "c");
  } else if (headgear === "hat") {
    // wide-brim / cap
    for (let x = 3; x <= 7; x++) mir(x, 2, "a");
    for (let x = 4; x <= 7; x++) mir(x, 1, "a");
    mir(7, 0, "a");
    for (let x = 3; x <= 7; x++) mir(x, 2, "b"); // brim shadow line under
    mir(5, 1, "t");
  } else if (headgear === "hood") {
    // hood frames the face in cloth
    for (let x = 4; x <= 7; x++) mir(x, 1, "a");
    mir(4, 2, "a"); mir(4, 3, "a"); mir(4, 4, "b");
    mir(3, 3, "b");
    set(7, 0, "a");
  }

  // ---- LEGS / BOOTS (rows 14-15) ----
  mir(5, 14, "o"); mir(6, 14, "o");
  mir(5, 15, "o"); mir(6, 15, "o");
  mir(6, 14, "g"); // tiny highlight

  const rows = g.map((r) => r.join(""));
  return { palette, rows };
}
