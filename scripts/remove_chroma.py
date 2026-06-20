"""
Remove chroma key (magenta/green/etc) from PNG. Output transparent RGBA.

Usage:
    python3 scripts/remove_chroma.py [input] [output] [options]

Default: paladin raw chroma -> keyed.
"""

import argparse
import math
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Requires Pillow: pip3 install Pillow")


DEFAULT_INPUT = Path("public/sprites/paladin/raw/paladin_base_chroma.png")
DEFAULT_OUTPUT = Path("public/sprites/paladin/raw/paladin_base_keyed.png")


def sample_corners(im, n=3):
    w, h = im.size
    corners = []
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        for dx in range(-n + 1, n):
            for dy in range(-n + 1, n):
                px, py = x + dx, y + dy
                if 0 <= px < w and 0 <= py < h:
                    corners.append(im.getpixel((px, py))[:3])
    return corners


def mean_color(pixels):
    if not pixels:
        return (0, 0, 0)
    r = sum(p[0] for p in pixels) // len(pixels)
    g = sum(p[1] for p in pixels) // len(pixels)
    b = sum(p[2] for p in pixels) // len(pixels)
    return (r, g, b)


def distance(c1, c2):
    return math.sqrt((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2)


def remove_chroma(input_path, output_path, chroma, threshold, dry_run=False):
    im = Image.open(input_path).convert("RGBA")
    w, h = im.size
    px = im.load()

    removed = 0
    total = w * h

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if distance((r, g, b), chroma) < threshold:
                px[x, y] = (r, g, b, 0)
                removed += 1

    if dry_run:
        print(f"  dry-run: chroma={chroma} threshold={threshold}")
        print(
            f"  total={total} px, chroma-matched={removed} ({100 * removed / total:.1f}%)"
        )
        return

    im.save(output_path, "PNG")
    print(f"  saved: {output_path}")
    print(f"  chroma px removed: {removed}/{total} ({100 * removed / total:.1f}%)")


def main():
    parser = argparse.ArgumentParser(description="Remove chroma key from PNG")
    parser.add_argument(
        "input",
        nargs="?",
        default=DEFAULT_INPUT,
        type=Path,
        help=f"Input PNG (default: {DEFAULT_INPUT})",
    )
    parser.add_argument(
        "output",
        nargs="?",
        default=DEFAULT_OUTPUT,
        type=Path,
        help=f"Output PNG (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--chroma",
        nargs=3,
        type=int,
        metavar=("R", "G", "B"),
        help="Chroma color (default: auto-detect from corners)",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=70,
        help="Color distance threshold (default: 70)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Preview match count, don't write output"
    )
    args = parser.parse_args()

    if not args.input.exists():
        sys.exit(f"Input not found: {args.input}")

    chroma = args.chroma
    if chroma is None:
        print("  auto-detecting chroma from corner pixels...")
        corners = sample_corners(Image.open(args.input).convert("RGBA"))
        chroma = mean_color(corners)
        print(f"  detected chroma: RGB{chroma}")

    print(f"  input:  {args.input}")
    print(f"  output: {args.output}")
    remove_chroma(args.input, args.output, chroma, args.threshold, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
