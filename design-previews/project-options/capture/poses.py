"""
Cuts this round's Caw poses for the preview (README, Caw): each Backlot cut
take, downloaded from its takeId's media URL into the folder given first,
defringed and framed into caw/ (the folder given second).

    python3 -I capture/poses.py <takes folder> caw

The takes folder holds working-1/2.png, asking-a-1/2.png, asking-b-1/2.png,
hero-1/2.png (the cut takes the README names), and the builder's hero-b.png
and lead-b.png from the first round.
"""
import os, sys, colorsys
from collections import deque
from PIL import Image, ImageFilter
CROW = (31, 31, 28)  # the source still's crow ink: the median of its opaque pixels darker than 30% value
TAKES, OUT = sys.argv[1], os.path.abspath(sys.argv[2])
os.chdir(TAKES)

def largest(im):
    """Keep only the largest shape (alpha >= 128, 8-connected) and what touches it softly."""
    w, h = im.size; a = im.getchannel("A"); ap = a.load()
    seen = bytearray(w * h); best = []
    for y in range(h):
        for x in range(w):
            if ap[x, y] >= 128 and not seen[y * w + x]:
                comp = []; q = deque([(x, y)]); seen[y * w + x] = 1
                while q:
                    cx, cy = q.popleft(); comp.append((cx, cy))
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = cx + dx, cy + dy
                            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and ap[nx, ny] >= 128:
                                seen[ny * w + nx] = 1; q.append((nx, ny))
                if len(comp) > len(best): best = comp
    keep = Image.new("L", (w, h), 0); kp = keep.load()
    for x, y in best: kp[x, y] = 255
    keep = keep.filter(ImageFilter.MaxFilter(5))  # its soft rim stays with it
    out = im.copy(); out.putalpha(Image.composite(a, Image.new("L", (w, h), 0), keep))
    return out

def defringe(im):
    """Erode the alpha edge 1px, clear the faint halo, and pull the rim's colour toward crow ink."""
    im = im.convert("RGBA")
    a = im.getchannel("A").filter(ImageFilter.MinFilter(3))
    a = a.point(lambda v: 0 if v < 32 else v)
    inner = a.point(lambda v: 255 if v == 255 else 0).filter(ImageFilter.MinFilter(5))
    px = im.load(); ap = a.load(); ip = inner.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            al = ap[x, y]
            if al == 0:
                px[x, y] = (0, 0, 0, 0); continue
            r, g, b, _ = px[x, y]
            if ip[x, y] == 255:
                px[x, y] = (r, g, b, al); continue
            k = 0.35 + 0.65 * (1 - al / 255)  # the rim: more ink the fainter it is
            px[x, y] = (round(r + (CROW[0] - r) * k), round(g + (CROW[1] - g) * k), round(b + (CROW[2] - b) * k), al)
    return im

def mass(im):
    return im.getchannel("A").point(lambda v: 255 if v >= 128 else 0).getbbox()

def seat(f, name, full):
    im = defringe(largest(Image.open(f).convert("RGBA")))
    l, t, r, b = mass(im)
    if full:  # a full figure: its head and shoulders are its top 62%, as the builder's seats
        b = t + round((b - t) * 0.62)
        sub = im.crop((0, t, im.width, b)); sl, st, sr, sb = mass(sub); l, r = sl, sr
    w, h = r - l, b - t
    # The idle take's framing: crown 4% below the top edge, shoulders at the foot, 2px of 80 clear at the sides.
    side = max(round(h / 0.96), round(w / (1 - 2 * 2 / 80)))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    cx = (l + r) / 2
    canvas.paste(im.crop((l, t, r, b)), (round(side / 2 - (cx - l)), round(side * 0.04)))
    canvas.resize((80, 80), Image.LANCZOS).save(f"{OUT}/{name}.png", optimize=True)

def hero(f, name):
    im = defringe(largest(Image.open(f).convert("RGBA")))
    l, t, r, b = mass(im)
    fig = im.crop((l, t, r, b))
    hh = 240; ww = round(fig.width * (hh - 8) / fig.height) + 8  # 2× for 120px tall, 2px clear at 1× all round
    canvas = Image.new("RGBA", (ww, hh), (0, 0, 0, 0))
    canvas.paste(fig.resize((ww - 8, hh - 8), Image.LANCZOS), (4, 4))
    canvas.save(f"{OUT}/{name}.png", optimize=True)

def hero_b_cut(f, name):
    """hero-b with its grey ground ellipse cut: low-saturation mid-grey pixels in the figure's foot band cleared."""
    im = Image.open(f).convert("RGBA"); px = im.load(); w, h = im.size
    l, t, r, b = mass(im); band = b - round((b - t) * 0.12)
    for y in range(band, h):
        for x in range(w):
            rr, gg, bb, al = px[x, y]
            if al == 0: continue
            _, s, v = colorsys.rgb_to_hsv(rr / 255, gg / 255, bb / 255)
            if s < 0.12 and 0.3 < v: px[x, y] = (0, 0, 0, 0)
    im = defringe(largest(im)); im.save(f"{OUT}/{name}.png", optimize=True)

def lead(f, name):
    """lead-b with the beak 2 device pixels inside the right edge: 4px of its 112 (1px at 28px, 2 device px at 2×)."""
    im = Image.open(f).convert("RGBA"); l, t, r, b = mass(im)
    fig = im.crop((l, t, r, b)); room = 112 - 4 - l
    k = room / fig.width
    fig = fig.resize((room, round(fig.height * k)), Image.LANCZOS)
    canvas = Image.new("RGBA", (112, 112), (0, 0, 0, 0))
    canvas.paste(fig, (l, round(56 - fig.height / 2)))
    defringe(canvas).save(f"{OUT}/{name}.png", optimize=True)

# The kept idle seat, defringed like every cut.


def seat_from_figure(f, name, share):
    """A full figure's seat: its top `share` (head and shoulders), a square as tall as that, centred on the head
    (the mass of the figure's top fifth), crown 4% below the top edge, shoulders at the foot; past the square's
    sides it is cut, as the idle take's framing cuts the wings."""
    im = defringe(largest(Image.open(f).convert("RGBA")))
    l, t, r, b = mass(im)
    region_b = t + round((b - t) * share)
    head = im.crop((l, t, r, t + round((b - t) * 0.2))); hl, _, hr, _ = mass(head)
    cx = l + (hl + hr) / 2
    side = round((region_b - t) / 0.96)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    left = round(cx - side / 2)
    canvas.paste(im.crop((left, t, left + side, region_b)), (0, round(side * 0.04)))
    canvas.resize((80, 80), Image.LANCZOS).save(f"{OUT}/{name}.png", optimize=True)

seat_from_figure("asking-a-1.png", "seat-asking-a-1", 0.62)
seat_from_figure("asking-a-2.png", "seat-asking-a-2", 0.62)
seat_from_figure("asking-b-1.png", "seat-asking-b-1", 0.5)
seat_from_figure("asking-b-2.png", "seat-asking-b-2", 0.5)
seat("working-1.png", "seat-working-1", False)
seat("working-2.png", "seat-working-2", False)
hero("hero-1.png", "hero-1")
hero("hero-2.png", "hero-2")
hero_b_cut("hero-b.png", "hero-b-cut")
lead("lead-b.png", "lead")
