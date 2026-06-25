"use client";

import { EquipSlot, Rarity, RARITY_COLOR } from "@/lib/game/items";

// Pixel-art item icons drawn on a 16x16 grid, tinted by rarity.
// Each icon is a list of [x, y, shade] cells where shade picks a palette entry.
// shade: 0 = main (rarity color), 1 = dark edge, 2 = light highlight, 3 = accent/metal

type Cell = [number, number, number];

// helper to build a filled rectangle of cells
function rect(x0: number, y0: number, x1: number, y1: number, shade: number): Cell[] {
  const out: Cell[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y, shade]);
  return out;
}

// ---- per-slot pixel maps (16x16) ----

const WEAPON: Cell[] = [
  // sword: blade diagonal bottom-left → top-right, hilt at lower-left
  ...rect(10, 2, 11, 2, 2),
  ...rect(9, 3, 11, 4, 0),
  ...rect(8, 4, 10, 5, 0),
  ...rect(7, 5, 9, 6, 0),
  ...rect(6, 6, 8, 7, 0),
  ...rect(5, 7, 7, 8, 0),
  ...rect(11, 3, 11, 4, 2),  // blade highlight
  ...rect(10, 4, 10, 5, 2),
  // crossguard
  ...rect(3, 8, 8, 9, 3),
  // grip
  ...rect(4, 9, 5, 12, 1),
  // pommel
  ...rect(3, 12, 6, 13, 3),
];

const HELMET: Cell[] = [
  // dome
  ...rect(5, 3, 10, 3, 0),
  ...rect(4, 4, 11, 4, 0),
  ...rect(3, 5, 12, 8, 0),
  ...rect(5, 3, 6, 5, 2),   // highlight
  // brim
  ...rect(2, 9, 13, 10, 3),
  // visor slit
  ...rect(5, 6, 10, 7, 1),
  // plume top
  ...rect(7, 1, 8, 2, 3),
];

const ARMOR: Cell[] = [
  // shoulders
  ...rect(2, 4, 4, 6, 3),
  ...rect(11, 4, 13, 6, 3),
  // chest
  ...rect(4, 4, 11, 5, 0),
  ...rect(3, 6, 12, 12, 0),
  ...rect(4, 6, 5, 11, 2),  // left highlight
  // neckline
  ...rect(6, 4, 9, 5, 1),
  // belt
  ...rect(3, 11, 12, 12, 3),
  // center seam
  ...rect(7, 6, 8, 11, 1),
];

const BOOTS: Cell[] = [
  // pair of boots
  // left boot
  ...rect(3, 3, 5, 10, 0),
  ...rect(3, 10, 8, 12, 0),
  ...rect(3, 3, 3, 10, 2),
  ...rect(3, 12, 8, 12, 3),  // sole
  // right boot
  ...rect(10, 3, 12, 10, 0),
  ...rect(8, 10, 13, 12, 0),
  ...rect(10, 3, 10, 10, 2),
  ...rect(8, 12, 13, 12, 3), // sole
];

const RING: Cell[] = [
  // band
  ...rect(5, 6, 10, 6, 3),
  ...rect(4, 7, 4, 11, 3),
  ...rect(11, 7, 11, 11, 3),
  ...rect(5, 12, 10, 12, 3),
  ...rect(5, 7, 5, 11, 2),
  // gem
  ...rect(6, 3, 9, 3, 0),
  ...rect(5, 4, 10, 5, 0),
  ...rect(6, 6, 9, 6, 0),
  ...rect(7, 4, 7, 4, 2),  // gem sparkle
];

const SLOT_MAP: Record<EquipSlot, Cell[]> = {
  weapon: WEAPON,
  helmet: HELMET,
  armor: ARMOR,
  boots: BOOTS,
  ring: RING,
};

// darken / lighten a hex color by a factor
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (factor < 0) {
    r = Math.round(r * (1 + factor));
    g = Math.round(g * (1 + factor));
    b = Math.round(b * (1 + factor));
  } else {
    r = Math.round(r + (255 - r) * factor);
    g = Math.round(g + (255 - g) * factor);
    b = Math.round(b + (255 - b) * factor);
  }
  return `rgb(${r},${g},${b})`;
}

export function ItemIcon({
  slot,
  rarity,
  size = 28,
}: {
  slot: EquipSlot;
  rarity: Rarity;
  size?: number;
}) {
  const base = RARITY_COLOR[rarity];
  const palette = [
    base,                 // 0 main
    shade(base, -0.5),    // 1 dark edge
    shade(base, 0.45),    // 2 light highlight
    "#7a6a52",            // 3 metal/accent (neutral)
  ];
  const cells = SLOT_MAP[slot];
  const px = size / 16;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      style={{ flexShrink: 0, imageRendering: "pixelated" }}
      aria-label={`${rarity} ${slot}`}
    >
      {/* subtle dark backdrop plate */}
      <rect x={0} y={0} width={16} height={16} fill="rgba(0,0,0,0.18)" />
      {cells.map(([x, y, s], i) => (
        <rect key={i} x={x} y={y} width={1.02} height={1.02} fill={palette[s]} />
      ))}
    </svg>
  );
}
