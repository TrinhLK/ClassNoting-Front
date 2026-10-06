#!/usr/bin/env python3
"""Render the note-pin brand glyph to PNG/ICO without external dependencies.

Usage:
    python3 scripts/generate-icons.py

Outputs (overwrites):
    extension/icons/icon16.png, icon48.png, icon128.png   (slate pin, transparent)
    app/favicon.ico                                        (white pin on indigo, 32px ICO-wrapped PNG)

The shapes mirror app/components/BrandIcon.tsx and app/icon.svg — keep them
in sync when the glyph changes.
"""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# slate-500 like the reference glyph; white + indigo-600 (#4f46e5) for favicon.
SLATE = (100, 116, 139, 255)
WHITE = (255, 255, 255, 255)
INDIGO = (79, 70, 229, 255)
TRANSPARENT = (0, 0, 0, 0)


def blank(size):
    return [[TRANSPARENT] * size for _ in range(size)]


def paint_circle(img, cx, cy, r, color):
    size = len(img)
    for y in range(max(0, int(cy - r - 2)), min(size, int(cy + r + 3))):
        for x in range(max(0, int(cx - r - 2)), min(size, int(cx + r + 3))):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if d <= r:
                img[y][x] = color


def paint_needle(img, x0, y0, x1, y1, half0, half1, color):
    """Tapered needle from width half0 at (x0,y0) to a point at (x1,y1)."""
    size = len(img)
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / length, dx / length
    for y in range(size):
        for x in range(size):
            px, py = x + 0.5 - x0, y + 0.5 - y0
            t = (px * dx + py * dy) / (length * length)
            if 0 <= t <= 1:
                half = half0 + (half1 - half0) * t
                dist = abs(px * nx + py * ny)
                if dist <= half:
                    img[y][x] = color


def draw_pin(img, color, bg=None):
    size = len(img)
    if bg is not None:
        for y in range(size):
            for x in range(size):
                img[y][x] = bg
    u = size / 64.0  # design grid is 64x64 (BrandIcon viewBox is 24; scaled below)
    # BrandIcon geometry on 24-grid: circle (12,7.5) r=4.5, needle (10.6,11.5)-(13.4,11.5)->(12,21)
    s = size / 24.0
    paint_circle(img, 12 * s, 7.5 * s, 4.5 * s, color)
    # Needle centerline is x=12 (vertical); half-width tapers 1.4 -> 0.15.
    # Matches BrandIcon path "M10.6 11.5h2.8L12 21z" (spans 10.6..13.4).
    paint_needle(img, 12 * s, 11.5 * s, 12 * s, 21 * s, 1.4 * s, 0.15 * s, color)
    # Rounded-square clip is handled by favicon SVG; PNGs keep transparency.
    _ = u


def downscale(img, target):
    size = len(img)
    out = blank(target)
    for y in range(target):
        for x in range(target):
            # Map each target pixel to its full source box (covers non-divisible sizes).
            x0 = int(x * size / target)
            x1 = max(x0 + 1, int((x + 1) * size / target))
            y0 = int(y * size / target)
            y1 = max(y0 + 1, int((y + 1) * size / target))
            rs = gs = bs = a_sum = 0
            n = 0
            for sy in range(y0, min(y1, size)):
                for sx in range(x0, min(x1, size)):
                    r, g, b, a = img[sy][sx]
                    # Un-premultiplied box average weighted by alpha.
                    rs += r * a
                    gs += g * a
                    bs += b * a
                    a_sum += a
                    n += 1
            if a_sum:
                out[y][x] = (
                    round(rs / a_sum),
                    round(gs / a_sum),
                    round(bs / a_sum),
                    round(a_sum / n),
                )
            else:
                out[y][x] = TRANSPARENT
    return out


def encode_png(img):
    size = len(img)
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("BBBB", *px) for px in row) for row in img
    )

    def chunk(ctype, data):
        c = struct.pack(">I", len(data)) + ctype + data
        return c + struct.pack(">I", zlib.crc32(ctype + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def encode_ico(png_bytes, size):
    header = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(png_bytes), 6 + 16)
    return header + entry + png_bytes


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    print("wrote", os.path.relpath(path, ROOT), len(data), "bytes")


def main():
    base = blank(256)
    draw_pin(base, SLATE)
    for size in (128, 48, 16):
        img = downscale(base, size) if size != 256 else base
        write(os.path.join(ROOT, f"extension/icons/icon{size}.png"), encode_png(img))

    fav = blank(128)
    # Indigo rounded square backdrop for legibility at 16px tab size.
    r = 28
    for y in range(128):
        for x in range(128):
            cx = min(max(x, r), 128 - r)
            cy = min(max(y, r), 128 - r)
            if math.hypot(x - cx, y - cy) <= r:
                fav[y][x] = INDIGO
    draw_pin(fav, WHITE)
    fav32 = downscale(fav, 32)
    write(os.path.join(ROOT, "app/favicon.ico"), encode_ico(encode_png(fav32), 32))


if __name__ == "__main__":
    main()
