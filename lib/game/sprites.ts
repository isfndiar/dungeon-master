// Pixel-grid sprites: each sprite is rows of single-char keys mapped to colors.
// "." = transparent. Sprites are drawn once to an offscreen canvas and cached.

export type SpriteDef = {
  palette: Record<string, string>;
  rows: string[];
};

const cache = new Map<string, HTMLCanvasElement>();

export function buildSprite(key: string, def: SpriteDef): HTMLCanvasElement {
  const existing = cache.get(key);
  if (existing) return existing;
  const h = def.rows.length;
  const w = def.rows[0]?.length ?? 0;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    const row = def.rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (!ch || ch === ".") continue;
      const color = def.palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  cache.set(key, c);
  return c;
}

// ===================== Frame animation =====================
// Frames are baked procedurally from a base sprite: the bottom rows are the
// "legs", split into left/right halves that step independently, while the
// whole body bobs. No external sprite-sheets required.

export type AnimType = "idle" | "walk";

// per-frame offsets
const WALK_BODY = [0, -1, -1, -1, 0, -1, -1, -1]; // body bob (up while a foot lifts)
const WALK_LEFT = [0, -1, -2, -1, 0, 0, 0, 0];    // left foot lift over first half
const WALK_RIGHT = [0, 0, 0, 0, 0, -1, -2, -1];   // right foot lift over second half
const IDLE_BODY = [0, 0, -1, 0];                  // gentle breathing

const LEG_ROWS = 3; // number of bottom rows treated as legs

const animCache = new Map<string, HTMLCanvasElement[]>();

function bakeFrames(key: string, def: SpriteDef, type: AnimType): HTMLCanvasElement[] {
  const cacheKey = key + ":" + type;
  const existing = animCache.get(cacheKey);
  if (existing) return existing;

  const base = buildSprite(key, def);
  const w = base.width;
  const h = base.height;
  const legTop = Math.max(0, h - LEG_ROWS);
  const midX = Math.floor(w / 2);
  const PAD = 2; // headroom so upward bob doesn't clip

  const count = type === "walk" ? WALK_BODY.length : IDLE_BODY.length;
  const frames: HTMLCanvasElement[] = [];

  for (let i = 0; i < count; i++) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h + PAD;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    if (type === "walk") {
      const bob = WALK_BODY[i];
      const lL = WALK_LEFT[i];
      const rL = WALK_RIGHT[i];
      // body (rows 0..legTop)
      ctx.drawImage(base, 0, 0, w, legTop, 0, PAD + bob, w, legTop);
      // left leg half
      ctx.drawImage(base, 0, legTop, midX, h - legTop, 0, PAD + legTop + lL, midX, h - legTop);
      // right leg half
      ctx.drawImage(base, midX, legTop, w - midX, h - legTop, midX, PAD + legTop + rL, w - midX, h - legTop);
    } else {
      const bob = IDLE_BODY[i];
      // whole sprite bobs together
      ctx.drawImage(base, 0, 0, w, legTop, 0, PAD + bob, w, legTop);
      ctx.drawImage(base, 0, legTop, w, h - legTop, 0, PAD + legTop, w, h - legTop);
    }
    frames.push(c);
  }
  animCache.set(cacheKey, frames);
  return frames;
}

export function frameCount(type: AnimType): number {
  return type === "walk" ? WALK_BODY.length : IDLE_BODY.length;
}

// Draw an animated sprite. `frame` is an integer frame index (will be wrapped).
export function drawAnim(
  ctx: CanvasRenderingContext2D,
  key: string,
  def: SpriteDef,
  type: AnimType,
  x: number,
  y: number,
  size: number,
  frame: number,
  flip = false
) {
  const frames = bakeFrames(key, def, type);
  const f = frames[((frame % frames.length) + frames.length) % frames.length];
  // frame canvases have PAD extra height on top; scale to preserve pixel size
  const scale = size / f.width;
  const drawH = f.height * scale;
  const PAD = 2;
  const oy = y - PAD * scale; // shift up so the body sits where the base would
  ctx.save();
  if (flip) {
    ctx.translate(x + size, oy);
    ctx.scale(-1, 1);
    ctx.drawImage(f, 0, 0, size, drawH);
  } else {
    ctx.drawImage(f, x, oy, size, drawH);
  }
  ctx.restore();
}

// ---- Shared palettes ----
const skin = "#e8b894";
const skinD = "#c98e6a";

// ============ HEROES (16x16) ============

// Top-down RPG style: hair on top, face, costumed torso, little legs.
// 16x16, centered. Distinct costume per hero. Weapons drawn by attack anim.
export const heroSprites: Record<string, SpriteDef> = {
  // Knight — steel-blue plate armor, red hair, silver pauldrons
  knight: {
    palette: {
      h: "#a8480f", // hair (auburn)
      i: "#7a3308", // hair shadow
      s: skin,
      d: skinD,
      e: "#3a2a22", // eyes
      a: "#aeb7c8", // armor light
      b: "#7d8699", // armor mid
      c: "#5b6276", // armor dark
      t: "#3a4f8a", // tabard blue
      o: "#4a3a2a", // boots
    },
    rows: [
      "....hhhhhh......",
      "...hhiiiihh.....",
      "...hsssssh......",
      "...sseesess.....",
      "...sssddsss.....",
      "....ssddss......",
      "...aabttbaa.....",
      "..acbtttbca.....",
      "..acbtttbca.....",
      "..acbtttbca.....",
      "..acbbbbbca.....",
      "...cbtttbc......",
      "...cbttttc......",
      "....cc.cc.......",
      "....oo.oo.......",
      "....oo.oo.......",
    ],
  },
  // Mage — purple robe, pointy hat, white-blond hair
  mage: {
    palette: {
      p: "#6a3fb0", // hat / robe purple
      q: "#4a2880", // robe dark
      m: "#8a5fd0", // robe mid highlight
      g: "#ffd24a", // hat star / trim
      s: skin,
      d: skinD,
      e: "#3a2a22",
      h: "#e8d8a0", // blond hair
      o: "#3a2a4a", // boots
    },
    rows: [
      ".......p........",
      "......ppp.......",
      ".....pppgp......",
      "....pppppp......",
      "...hhsssshh.....",
      "...hseesesh.....",
      "....ssddss......",
      "...pqmppqmp.....",
      "..pqmpgpqmp.....",
      "..pqmppppmp.....",
      "..pqmppppmp.....",
      "..pqmppppmp.....",
      "...pqmppmp......",
      "...pqpppqp......",
      "....oo.oo.......",
      "....oo.oo.......",
    ],
  },
  // Priest — white & gold robe, hooded, gold trim
  priest: {
    palette: {
      a: "#f2f2ec", // white robe
      b: "#d2d2c8", // robe shadow
      g: "#e8c24a", // gold trim
      y: "#fff4c0", // gold light
      s: skin,
      d: skinD,
      e: "#3a2a22",
      o: "#9a8a5a", // sandals
    },
    rows: [
      "....aaaaaa......",
      "...aaaaaaaa.....",
      "...assssssa.....",
      "...aseesesa.....",
      "....ssddss......",
      "...gaaaaaag.....",
      "..agabaabaga....",
      "..abaggggaba....",
      "..abagyyagba....",
      "..abaggggaba....",
      "..abaaaaaaba....",
      "...gaaaaaag.....",
      "...abaaaaba.....",
      "....ba..ab......",
      "....oo..oo......",
      "....oo..oo......",
    ],
  },
  // Tank — heavy bronze armor, horned helm, broad shoulders
  tank: {
    palette: {
      a: "#b98a4a", // bronze light
      b: "#8a6432", // bronze mid
      c: "#5f4420", // bronze dark
      n: "#e8c878", // horn / trim
      s: skin,
      d: skinD,
      e: "#3a2a22",
      o: "#3a2a1a", // boots
    },
    rows: [
      "...n.aaaa.n.....",
      "...nnaaaann.....",
      "...caaaaaac.....",
      "...cseesesc.....",
      "....ssddss......",
      ".aacabbbbcaa....",
      "aacaabbbbaacaa..",
      "aacaabnnbaacaa..",
      "aacaabbbbaacaa..",
      ".aacabbbbcaa....",
      "...cabbbbac.....",
      "...cabbbbac.....",
      "...cabbbbac.....",
      "....cc..cc......",
      "....oo..oo......",
      "....oo..oo......",
    ],
  },
  // Archer — green hood & cloak, leather, brown hair
  archer: {
    palette: {
      h: "#2f6a3a", // hood green
      j: "#21502c", // hood dark
      g: "#4f9a5f", // hood light
      s: skin,
      d: skinD,
      e: "#3a2a22",
      l: "#7a5a32", // leather
      m: "#5a4222", // leather dark
      y: "#caa24a", // quiver/buckle
      o: "#3a2a1a", // boots
    },
    rows: [
      "....ghhhhg......",
      "...ghhhhhhg.....",
      "...hhssssh......",
      "...hseeseh......",
      "....ssddsj......",
      "...hjlllljh.....",
      "..hjlmllmljh....",
      "..jlmllllmlj....",
      "..jlmllyllml....",
      "..jlmllllmlj....",
      "...jllllllj.....",
      "...jlmllmlj.....",
      "....jl..lj......",
      "....jl..lj......",
      "....oo..oo......",
      "....oo..oo......",
    ],
  },
};

// ============ MONSTERS (16x16) ============

export const monsterSprites: Record<string, SpriteDef> = {
  slime: {
    palette: { a: "#5fd35f", b: "#3a9a3a", e: "#163316", w: "#bfffbf" },
    rows: [
      "................",
      "................",
      "................",
      "................",
      "....aaaaaa......",
      "...aawaawaa.....",
      "..aaaaaaaaaa....",
      "..aaeaaaeaaa....",
      "..aaaaaaaaaa....",
      "..aaaaaaaaaa....",
      "..baaaaaaaab....",
      "..bbaaaaaabb....",
      "...bbbbbbbb.....",
      "................",
      "................",
      "................",
    ],
  },
  wolf: {
    palette: { a: "#7a7a82", b: "#55555c", e: "#ffd24a", w: "#fff", t: "#3a3a40" },
    rows: [
      "................",
      "..a.........a...",
      ".aaa.......aaa..",
      ".aaaa.....aaaa..",
      ".aaaaaaaaaaaaa..",
      "aaeaaaaaaaaaeaa.",
      "aaaaaaaaaaaaaaa.",
      "aawaaaaaaaaawaa.",
      ".aaaaaaaaaaaaa..",
      ".baaaaaaaaaaab..",
      ".b.b.b...b.b.b..",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  bat: {
    palette: { a: "#5a3a6a", b: "#3a2447", e: "#ff5a5a", w: "#fff" },
    rows: [
      "................",
      "................",
      "................",
      "..b.........b...",
      ".bbb.aaaa.bbb...",
      "bbbbaaaaaabbbb..",
      "bbbaaeaaeaaabbb.",
      ".b.aaaaaaaa.b...",
      "...aawaawaa.....",
      "....aaaaaa......",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  spider: {
    palette: { a: "#3a2a2a", b: "#1a1010", e: "#ff3030", w: "#aa3030" },
    rows: [
      "................",
      "b..b....b..b....",
      ".b.b....b.b.....",
      "..bb....bb......",
      "...aaaaaa.......",
      "..aaeaaeaa......",
      "..aaaaaaaa......",
      "..aawwwwaa......",
      "...aaaaaa.......",
      "..bb....bb......",
      ".b.b....b.b.....",
      "b..b....b..b....",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  skeleton: {
    palette: { a: "#e8e8d8", b: "#b0b0a0", e: "#000", r: "#c0392b" },
    rows: [
      ".....aaaa.......",
      "....aaaaaa......",
      "....aeaaea......",
      "....aaaaaa......",
      ".....a..a.......",
      "...a.aaaa.a.....",
      "..aa.aaaa.aa....",
      "..a.aaaaaa.a....",
      "....aaaaaa......",
      ".....aaaa.......",
      ".....a..a.......",
      "....aa..aa......",
      "....a....a......",
      "...aa....aa.....",
      "................",
      "................",
    ],
  },
  ghost: {
    palette: { a: "#cfe8ff", b: "#9ec4e8", e: "#3a4fb0" },
    rows: [
      "................",
      ".....aaaa.......",
      "....aaaaaa......",
      "...aaaaaaaa.....",
      "...aaeaaeaa.....",
      "...aaaaaaaa.....",
      "...aaaaaaaa.....",
      "...aaaaaaaa.....",
      "...aaaaaaaa.....",
      "...aaaaaaaa.....",
      "...abaabaaba....",
      "...a.aa.aa.a....",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  imp: {
    palette: { a: "#d6452f", b: "#9a2f1f", e: "#ffd24a", h: "#5a1a10" },
    rows: [
      "...h......h.....",
      "..hh......hh....",
      "...aaaaaaaa.....",
      "..aaaaaaaaaa....",
      "..aaeaaaaeaa....",
      "..aaaaaaaaaa....",
      "..aabaaaabaa....",
      "..aaaaaaaaaa....",
      "...aaaaaaaa.....",
      "..baaaaaaaab....",
      "..b.aaaaaa.b....",
      "....b....b......",
      "...bb....bb.....",
      "................",
      "................",
      "................",
    ],
  },
  golem: {
    palette: { a: "#8a7a6a", b: "#5a4a3a", e: "#ff8a3a", w: "#c9b8a8" },
    rows: [
      "....aaaaaa......",
      "...awaaaawa.....",
      "...aaeaaeaa.....",
      "...aaaaaaaa.....",
      "..baaaaaaaab....",
      "..baaaaaaaab....",
      "baaaaaaaaaaaab..",
      "baaaaaaaaaaaab..",
      "baaaaaaaaaaaab..",
      "..baaaaaaaab....",
      "..baaaaaaaab....",
      "..baab..baab....",
      "..baab..baab....",
      "..bbbb..bbbb....",
      "................",
      "................",
    ],
  },
};

// ============ BOSSES (24x24) ============

export const bossSprites: Record<string, SpriteDef> = {
  giant_slime: {
    palette: { a: "#4fc34f", b: "#2a8a2a", e: "#0a2a0a", w: "#cfffcf", c: "#ffd24a" },
    rows: [
      "........................",
      "........................",
      "........................",
      ".........cccccc.........",
      "......aaaaaaaaaaaa......",
      ".....aaaaaaaaaaaaaa.....",
      "....aaaawaaaaaawaaaa....",
      "...aaaaaaaaaaaaaaaaaa...",
      "...aaaaeaaaaaaaeaaaaa...",
      "..aaaaaaaaaaaaaaaaaaaa..",
      "..aaaaaaaaaaaaaaaaaaaa..",
      "..aaaaaaawwwwwaaaaaaaa..",
      "..aaaaaaaaaaaaaaaaaaaa..",
      "..aaaaaaaaaaaaaaaaaaaa..",
      "..baaaaaaaaaaaaaaaaaab..",
      "..bbaaaaaaaaaaaaaaaabb..",
      "...bbaaaaaaaaaaaaaabb...",
      "....bbbbbbbbbbbbbbbb....",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
    ],
  },
  spider_queen: {
    palette: { a: "#4a2a4a", b: "#2a141a", e: "#ff3030", w: "#aa3030", p: "#ff5fa0" },
    rows: [
      "b...b........b...b......",
      ".b..b........b..b.......",
      "..b.b........b.b........",
      "...bb........bb.........",
      "......aaaaaaaa..........",
      ".....aaaaaaaaaa.........",
      "....aaeaaaaaeaaa........",
      "....aaaaaaaaaaaa........",
      "....aapaaaapaaa.........",
      "....aaaaaaaaaaa.........",
      "....aaawwwwaaaa.........",
      ".....aaaaaaaaa..........",
      "......aaaaaaa...........",
      "...bb........bb.........",
      "..b.b........b.b........",
      ".b..b........b..b.......",
      "b...b........b...b......",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
    ],
  },
  lich: {
    palette: { a: "#e8e8d8", b: "#6a4a8a", e: "#3affe8", r: "#9a2fc9", g: "#ffd24a" },
    rows: [
      ".........gggg...........",
      "........gaaaag..........",
      ".......gaaaaaag.........",
      ".......aaeaaeaa.........",
      ".......aaaaaaaa.........",
      "........aaaaaa..........",
      ".......raaaaaar.........",
      "......rraaaaaarr........",
      ".....rrraaaaaarrr.......",
      "....rrraaaaaaaarrr......",
      "....rraaaaaaaaaaarr.....",
      "....raaaaaaaaaaaaar.....",
      "....raaaaaaaaaaaaar.....",
      "....rraaaaaaaaaaarr.....",
      ".....rraaaaaaaarr.......",
      "......rraaaaaarr........",
      ".......raaaaaar.........",
      ".......r.r..r.r........",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
    ],
  },
  lava_golem: {
    palette: { a: "#5a3a2a", b: "#2a1810", e: "#ffea3a", w: "#ff6a1a", l: "#ff3a1a" },
    rows: [
      ".....aaaaaaaaaa.........",
      "....alaaaaaaaala........",
      "....aaeaaaaaeaaa........",
      "....aaaaaaaaaaaa........",
      "...alaaaaaaaaaala.......",
      "..aaaalaaaaalaaaaa......",
      ".aaaaaaaaaaaaaaaaaa.....",
      ".aalaaaaaaaaaaaalaa.....",
      ".aaaaaaaaaaaaaaaaaa.....",
      ".aaaalwwwwwwwlaaaaa.....",
      ".aaaaaaaaaaaaaaaaaa.....",
      ".aalaaaaaaaaaaaalaa.....",
      ".aaaaaaaaaaaaaaaaaa.....",
      "..aaalaaaaaalaaaaa......",
      "...aaaaa..aaaaaa........",
      "...aaaaa..aaaaaa........",
      "...allaa..aallaa........",
      "...bbbbb..bbbbbb........",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
    ],
  },
};

// Projectile sprites (small)
export const fxSprites: Record<string, SpriteDef> = {
  fireball: {
    palette: { a: "#ff6a1a", b: "#ffd24a", c: "#ff3a1a" },
    rows: ["..b..", ".bab.", "baaab", ".bab.", "..c.."],
  },
  arrow: {
    palette: { w: "#6a4a2a", y: "#c9a227", g: "#e8e8d8" },
    rows: ["....g", "...gw", "yyyww", "...gw", "....g"],
  },
  bolt: {
    palette: { a: "#b388ff", b: "#7ad7ff" },
    rows: ["..b..", ".bab.", "baaab", ".bab.", "..b.."],
  },
  heal: {
    palette: { g: "#5fff8f", w: "#dfffe8" },
    rows: ["..g..", "..g..", "ggwgg", "..g..", "..g.."],
  },
};

// ============ NPCs (16x16) ============
export const npcSprites: Record<string, SpriteDef> = {
  king: {
    palette: {
      g: "#ffd24a", // crown gold
      r: "#b8324a", // robe red
      d: "#8a2236", // robe dark
      s: skin, k: skinD,
      w: "#f2f2f2", // beard
      e: "#222",
    },
    rows: [
      "....g.g.g.......",
      "....ggggg.......",
      "....sssss.......",
      "...sekekes......",
      "...sssssss......",
      "...swwwwws......",
      "....wwwww.......",
      "...rrrrrrr......",
      "..rrdrrrdrr.....",
      "..rrrrrrrrr.....",
      "..rrrrrrrrr.....",
      "..rrrrrrrrr.....",
      "...rrrrrrr......",
      "...rr...rr......",
      "...kk...kk......",
      "...ee...ee......",
    ],
  },
  blacksmith: {
    palette: {
      a: "#6a4a2a", // apron brown
      b: "#3a2818",
      s: skin, k: skinD,
      h: "#5a3a1a", // hair
      m: "#9aa3b5", // hammer head
      w: "#7a5a3a", // hammer handle
      e: "#222",
    },
    rows: [
      "....hhhh........",
      "...hhhhhh.......",
      "...sekekes......",
      "...sssssss......",
      "....sssss....m..",
      "...baaaab...mm..",
      "..baaaaaab..w...",
      "..baaaaaab.w....",
      "..baaaaaab......",
      "..baaaaaab......",
      "..baaaaaab......",
      "...baaaab.......",
      "...bb..bb.......",
      "...kk..kk.......",
      "...ee..ee.......",
      "................",
    ],
  },
  guard: {
    palette: {
      a: "#8a8f99", // armor
      b: "#5a5f69",
      s: skin, k: skinD,
      h: "#c0c8d8", // helmet
      p: "#3a4fb0", // tabard blue
      w: "#9a7b4a", // spear
      m: "#cdd2da",
      e: "#222",
    },
    rows: [
      "....hhhh....w...",
      "...hhhhhh...w...",
      "...hseesh..mw...",
      "...hsssh...w....",
      "....sss....w...",
      "...bappab..w...",
      "..bapppab..w...",
      "..bapppab..w...",
      "..bapppab..w...",
      "..baaaaab..w...",
      "...baaab...w...",
      "...bb.bb...w...",
      "...kk.kk........",
      "...ee.ee........",
      "................",
      "................",
    ],
  },
  captain: {
    palette: {
      a: "#caa23a", // gilded armor
      b: "#8a6a1a",
      s: skin, k: skinD,
      h: "#6a3a1a", // hair
      p: "#7a1f2a", // red cape
      r: "#ff5a5a", // plume
      e: "#222",
    },
    rows: [
      ".....rr.........",
      "....rrrr........",
      "...sekekes......",
      "...sssssss......",
      "....sssss.......",
      "..ppaaaapp......",
      ".ppaaaaaapp.....",
      ".ppaaaaaapp.....",
      ".ppaaaaaapp.....",
      "..paaaaaap......",
      "..baaaaaab......",
      "...baaab........",
      "...bb.bb........",
      "...kk.kk........",
      "...ee.ee........",
      "................",
    ],
  },
  villager_a: {
    palette: {
      a: "#5fa86a", // green tunic
      b: "#3a7a44",
      s: skin, k: skinD,
      h: "#caa24a", // blond hair
      e: "#222",
    },
    rows: [
      "....hhhh........",
      "...hhhhhh.......",
      "...seekes.......",
      "...sssss........",
      "....sss.........",
      "...baaaab.......",
      "..baaaaaab......",
      "..baaaaaab......",
      "..baaaaaab......",
      "..baaaaaab......",
      "...baaab........",
      "...bb.bb........",
      "...kk.kk........",
      "...ee.ee........",
      "................",
      "................",
    ],
  },
  villager_b: {
    palette: {
      a: "#b86a8a", // pink dress
      b: "#8a4a64",
      s: skin, k: skinD,
      h: "#5a3a1a", // brown hair
      e: "#222",
    },
    rows: [
      "...hhhhhh.......",
      "..hhhhhhhh......",
      "..hseeksh.......",
      "...sssss........",
      "....sss.........",
      "...baaaab.......",
      "..baaaaaab......",
      "..baaaaaab......",
      "..baaaaaaab.....",
      "..baaaaaaab.....",
      "..baaaaaaab.....",
      "..baaaaaaab.....",
      "...kk..kk.......",
      "...ee..ee.......",
      "................",
      "................",
    ],
  },
  merchant: {
    palette: {
      a: "#7a5aa0", // purple coat
      b: "#4a345f",
      s: skin, k: skinD,
      h: "#3a2a1a", // dark hair/hat
      g: "#ffd24a", // gold trim
      e: "#222",
    },
    rows: [
      "..hhhhhhhh......",
      "..hhhhhhhh......",
      "...sekkes.......",
      "...sssss........",
      "....sss.........",
      "...gaaaag.......",
      "..baaaaaab......",
      "..baggggab......",
      "..baaaaaab......",
      "..baaaaaab......",
      "..baaaaaab......",
      "...baaab........",
      "...bb.bb........",
      "...kk.kk........",
      "...ee.ee........",
      "................",
    ],
  },
};

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  key: string,
  def: SpriteDef,
  x: number,
  y: number,
  size: number,
  flip = false
) {
  const sprite = buildSprite(key, def);
  ctx.save();
  if (flip) {
    ctx.translate(x + size, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, 0, size, size);
  } else {
    ctx.drawImage(sprite, x, y, size, size);
  }
  ctx.restore();
}
