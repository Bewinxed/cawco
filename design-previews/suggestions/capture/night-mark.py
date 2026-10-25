"""
Caw's night still for his 28px head mark: caw/caw-ready-night.png with its
paper rim grown to one device pixel at 28 CSS px on a 1x screen (assets/
mascot/README.md: "The dark rim is at least one device pixel wide wherever
he is drawn"). The still's own rim, the kit's, is a share of his size, and at
28px it averages 0.35px (probe-kit suggestions-preview), so his near-black
body would stand bare on the night's near-black ground.

The rim is the day drawing's silhouette grown by one device pixel in the
still's units (its side over 28), filled with the still's own rim colour (the
median of the pixels the night still draws outside the day silhouette), and
the night still drawn over it. A 2x screen's device pixel is half as wide,
so the 1x rim holds there too.

    python3 -I design-previews/suggestions/capture/night-mark.py
"""
import sys
from pathlib import Path
from statistics import median

from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent.parent / "caw"
SIZE = 28  # CSS px the head mark is drawn at

day = Image.open(HERE / "caw-ready-day.png").convert("RGBA")
night = Image.open(HERE / "caw-ready-night.png").convert("RGBA")
side = day.width
reach = round(side / SIZE)  # one device pixel at 28px, 1x, in the still's units
inside = day.getchannel("A").point(lambda a: 255 if a > 127 else 0)
grown = inside.filter(ImageFilter.MaxFilter(2 * reach + 1))

rim = [
    night.getpixel((x, y))[:3]
    for y in range(side)
    for x in range(side)
    if inside.getpixel((x, y)) == 0 and night.getpixel((x, y))[3] > 200
]
if not rim:
    sys.exit("the night still draws no rim outside the day silhouette")
paper = tuple(int(median(c[i] for c in rim)) for i in range(3))

out = Image.new("RGBA", (side, side), (*paper, 0))
out.putalpha(grown)
out.alpha_composite(night)
out.save(HERE / "caw-ready-night-mark.png", optimize=True)
print(f"rim {reach}px of {side} in {paper}, written caw-ready-night-mark.png")
