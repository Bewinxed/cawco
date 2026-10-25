"""Set a cleaned 512px take as Caw's still, by day and by night (README.md, Caw).

Drawn at 0.9 of its size so a raised wing or a prop clears the canvas's
edges, its centre of mass on the image's vertical axis and its feet on the
stills' one ground line (232 of 256), then scaled to 256px. By night the same
drawing stands on the paper rim dark-ready.png carries, (243, 239, 229): the
drawing's alpha above 32, dilated by a 10px disc on the 512 canvas, which
draws the same rim as the kept stills (over one pixel at his 64px box):
start's take set through it lands on start.png's box, 15,48 to 228,233.

    python3 -I still.py clean.png caw/<pose>.png caw/<pose>-night.png
"""

import sys

import numpy as np
from PIL import Image

SIZE, OUT, SCALE, GROUND, RIM = 512, 256, 0.9, 461, 10
PAPER = (243, 239, 229)


def place(take: Image.Image) -> Image.Image:
    side = round(SIZE * SCALE)
    small = take.resize((side, side), Image.LANCZOS)
    a = np.array(small)[..., 3].astype(float)
    cx = (a.sum(0) * np.arange(side)).sum() / a.sum()
    bottom = np.nonzero(a.max(1) > 0)[0].max()
    canvas = Image.new("RGBA", (SIZE, SIZE))
    canvas.alpha_composite(small, (round(SIZE / 2 - cx), GROUND - int(bottom)))
    return canvas


def rimmed(day: Image.Image) -> Image.Image:
    solid = np.array(day)[..., 3] > 32
    disk = [
        (dy, dx)
        for dy in range(-RIM, RIM + 1)
        for dx in range(-RIM, RIM + 1)
        if dx * dx + dy * dy <= RIM * RIM
    ]
    grown = np.zeros_like(solid)
    padded = np.pad(solid, RIM)
    for dy, dx in disk:
        grown |= padded[RIM + dy : RIM + dy + SIZE, RIM + dx : RIM + dx + SIZE]
    paper = np.zeros((SIZE, SIZE, 4), np.uint8)
    paper[grown] = (*PAPER, 255)
    night = Image.fromarray(paper)
    night.alpha_composite(day)
    return night


def main() -> None:
    _, src, day_out, night_out = sys.argv
    day = place(Image.open(src).convert("RGBA"))
    night = rimmed(day)
    for img, out in ((day, day_out), (night, night_out)):
        img.resize((OUT, OUT), Image.LANCZOS).save(out, optimize=True)
    bb = day.getbbox()
    print(f"{day_out}: bbox at 512 {bb}, margins L T R B {bb[0]} {bb[1]} {SIZE - bb[2]} {SIZE - bb[3]}")


main()
