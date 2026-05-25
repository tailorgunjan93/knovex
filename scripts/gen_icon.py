"""
Generate Knovex app icons using only Python stdlib (no Pillow required).

Produces:
  desktop/assets/icon.png      512x512  — main app icon (electron-builder → .ico)
  desktop/assets/tray-icon.png  32x32   — system tray icon

Design:
  - Warm near-black rounded-square background  (#0C0B0E)
  - Copper gradient K letterform              (top #E4AE58 → bottom #986428)
  - Matches the download page brand aesthetic
"""

import math, struct, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ─── PNG encoder (pure stdlib) ────────────────────────────────────────────────

def _chunk(tag: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

def encode_png(pixels: list[bytearray], w: int, h: int) -> bytes:
    """pixels: list of h rows, each row is w*4 bytes (RGBA)."""
    raw = b''.join(b'\x00' + bytes(row) for row in pixels)
    return (
        b'\x89PNG\r\n\x1a\n'
        + _chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
        + _chunk(b'IDAT', zlib.compress(raw, 6))
        + _chunk(b'IEND', b'')
    )

# ─── Geometry helpers ─────────────────────────────────────────────────────────

def _in_rrect(x: int, y: int, w: int, h: int, r: int) -> bool:
    if not (0 <= x < w and 0 <= y < h):
        return False
    in_corner = (x < r or x >= w - r) and (y < r or y >= h - r)
    if not in_corner:
        return True
    cx = r if x < r else w - r
    cy = r if y < r else h - r
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def _dist_seg(px, py, ax, ay, bx, by) -> float:
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    if l2 < 1e-9:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)

# ─── Render one icon ──────────────────────────────────────────────────────────

def render(size: int, corner_r: int, padding: float, arm_hw: float) -> list[bytearray]:
    """
    Render an RGBA icon.
    padding  – fraction of size left as margin inside rounded rect
    arm_hw   – arm half-width as fraction of size
    """
    S = size
    P = int(S * padding)

    # K geometry (all in pixels, centred)
    bar_w  = int(S * 0.148)   # vertical bar width
    bar_x1 = (S - bar_w) // 2 - int(S * 0.07)
    bar_x2 = bar_x1 + bar_w
    bar_y1 = P
    bar_y2 = S - P
    jy_u   = bar_y1 + (bar_y2 - bar_y1) * 46 // 100   # upper junction
    jy_l   = bar_y1 + (bar_y2 - bar_y1) * 54 // 100   # lower junction
    arm_x  = S - P - int(S * 0.02)                    # arm tip x
    hw     = max(1, int(S * arm_hw))                   # arm half-width
    aa     = max(1.0, S * 0.004)                       # anti-alias radius

    # Background colour
    BG = (12, 11, 14)
    # Copper gradient: top → bottom
    CT = (228, 174,  88)   # bright copper top
    CB = (150,  98,  38)   # dark copper bottom

    def copper(y):
        t = max(0.0, min(1.0, (y - bar_y1) / max(1, bar_y2 - bar_y1)))
        return tuple(int(CT[i] + (CB[i] - CT[i]) * t) for i in range(3))

    def k_alpha(x, y):
        if bar_x1 <= x <= bar_x2 and bar_y1 <= y <= bar_y2:
            return 1.0
        du = _dist_seg(x, y, bar_x2, jy_u, arm_x, bar_y1)
        dl = _dist_seg(x, y, bar_x2, jy_l, arm_x, bar_y2)
        au = max(0.0, min(1.0, (hw + aa - du) / (2 * aa)))
        al = max(0.0, min(1.0, (hw + aa - dl) / (2 * aa)))
        return max(au, al)

    rows = []
    for y in range(S):
        row = bytearray(S * 4)
        for x in range(S):
            i = x * 4
            if not _in_rrect(x, y, S, S, corner_r):
                # transparent outside rounded corners
                continue
            a = k_alpha(x, y)
            if a <= 0.0:
                row[i:i+4] = bytes([*BG, 255])
            elif a >= 1.0:
                row[i:i+4] = bytes([*copper(y), 255])
            else:
                c = copper(y)
                r = int(BG[0] + (c[0] - BG[0]) * a)
                g = int(BG[1] + (c[1] - BG[1]) * a)
                b = int(BG[2] + (c[2] - BG[2]) * a)
                row[i:i+4] = bytes([r, g, b, 255])
        rows.append(row)
    return rows

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    assets = ROOT / 'desktop' / 'assets'
    assets.mkdir(parents=True, exist_ok=True)

    # 512×512 main icon  (corner_r=90, padding=17%, arm_hw=7.4%)
    print('Rendering 512×512 icon…')
    rows512 = render(512, corner_r=90, padding=0.172, arm_hw=0.074)
    icon_path = assets / 'icon.png'
    icon_path.write_bytes(encode_png(rows512, 512, 512))
    print(f'  saved: {icon_path}  ({icon_path.stat().st_size:,} bytes)')

    # 32×32 tray icon  (no rounded corners, slight padding)
    print('Rendering 32×32 tray icon…')
    rows32 = render(32, corner_r=6, padding=0.06, arm_hw=0.08)
    tray_path = assets / 'tray-icon.png'
    tray_path.write_bytes(encode_png(rows32, 32, 32))
    print(f'  saved: {tray_path}  ({tray_path.stat().st_size:,} bytes)')

    print('Done.')

if __name__ == '__main__':
    main()
