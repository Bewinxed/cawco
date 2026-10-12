/**
 * A hanging card's shadow, drawn once as a nine-slice picture instead of on
 * every paint (the cards on the top bar's glass, HangCard `glass`:
 * `.glass-card`).
 *
 * WebKit blurs a box-shadow's whole shape each time it paints the box:
 * Safari's layer backing stores are IOSurface contexts, which WebKit counts
 * as accelerated, and only an unaccelerated context takes its tiled shadow
 * ("canUseShadowBlur: renderingMode() == RenderingMode::Unaccelerated",
 * WebKit GraphicsContextCG.cpp), so CG's own shadow blurs the card; the Skia
 * port does the same (GraphicsContextSkia `drawOutsetShadow`). The panel is
 * painted into a fresh layer on every open, so `--shadow-overlay-hung`'s
 * 48px blur over the whole card was most of the frame its slide started on
 * (Playwright WebKit 26.6, 390×844 at 3x: 75–80 ms; without the shadow,
 * 25–30 ms).
 *
 * So the token's shadows are drawn here on a canvas, once per scheme,
 * device ratio and corner shape, round a card just big enough that every
 * edge has a stretch where nothing changes along it; and the card takes
 * that picture as its border-image, outset past its box: corners as drawn,
 * edges stretched along that stretch. Painting it is copying a picture.
 * The canvas draws with the same Gaussian as CSS (both take a standard
 * deviation of half the blur radius), each shadow out to its blur radius
 * from its shape, where CSS ends it. A border-image is painted over its
 * box's background, so the card's surface is an element of its own over
 * the picture (`.hung-surface`, HangCard), as a box's background lies over
 * its box-shadow. Against the box-shadow it replaces, in Playwright WebKit at
 * 3x, 51 pixels round the corners differ by more than 4 of 255 levels, none
 * by more than 9.
 *
 * The card's top is cut at its anchor's foot (`kit-hang`), so the picture
 * starts at the card's top edge and has nothing above it. A card shorter
 * than its top and bottom runs together (120px for the hung token: a 12px
 * corner, a 48px blur, 18px down) has no stretch along its sides, and the
 * border-image draws its slices that much smaller (CSS Backgrounds,
 * border-image-width: all of them scale down until they fit): the shadow
 * is drawn up to that much tighter round it, under a surface that is the
 * card's own box whatever its height.
 */

/** One shadow of a box-shadow list, as computed: px. */
interface Cast {
  blur: number;
  color: string;
  spread: number;
  x: number;
  y: number;
}

/** A card's corner radii, px: top-left, top-right, bottom-right, bottom-left. */
export type Corners = [number, number, number, number];

/** The commas between a list's items, not those inside a color's parentheses. */
const ITEMS = /,(?![^(]*\))/;
/** A computed shadow: its color (a function or a word), then its lengths. */
const CAST = /^\s*((?:[a-z-]+\([^)]*\))|#[\da-f]+|[a-z]+)\s+(.+)$/i;
/** The gaps between a shadow's lengths. */
const SPACES = /\s+/;

/** A computed `box-shadow` (color first, as engines serialize it), its outer shadows. */
function casts(computed: string): Cast[] {
  if (computed === "none") {
    return [];
  }
  return computed.split(ITEMS).flatMap((item) => {
    const m = CAST.exec(item);
    if (!m || m[2].includes("inset")) {
      return [];
    }
    const [x = 0, y = 0, blur = 0, spread = 0] = m[2]
      .trim()
      .split(SPACES)
      .map((n) => Number.parseFloat(n));
    return [{ color: m[1], x, y, blur, spread }];
  });
}

/** How far above the canvas, px, the card that casts each shadow is drawn. */
const ABOVE = 10_000;

/** The style element the picture's rule lives in, and its picture's URL. */
let sheet: HTMLStyleElement | undefined;
let shown: string | undefined;
/** What the picture now standing was drawn for. */
let drawnFor = "";

/**
 * Draws `token`'s shadows round a card with `corners`, at the window's
 * device ratio and in the page's scheme now, and lays them round every
 * `selector` card. Called again with the same look, it does nothing.
 */
export async function hangShadow(
  selector: string,
  token: string,
  corners: Corners
): Promise<void> {
  // The token as the page's scheme resolves it, read off an element that is
  // never drawn.
  const probe = document.createElement("i");
  probe.hidden = true;
  probe.style.boxShadow = `var(${token})`;
  document.body.append(probe);
  const list = casts(getComputedStyle(probe).boxShadow);
  probe.remove();
  const ratio = devicePixelRatio;
  const look = JSON.stringify([selector, list, corners, ratio]);
  if (look === drawnFor) {
    return;
  }
  drawnFor = look;

  const radius = Math.max(...corners);
  // Out past each edge, and in from it over the run where the corner still
  // shapes the shadow: past that run the shadow is the same all along the edge.
  const out = (side: (c: Cast) => number) =>
    Math.ceil(Math.max(0, ...list.map((c) => c.blur + c.spread + side(c))));
  const outRight = out((c) => c.x);
  const outLeft = out((c) => -c.x);
  const outBottom = out((c) => c.y);
  // A shadow offset down by y reaches y further in from the top than from
  // the bottom; its corners are the card's grown by its spread, so its
  // spread moves its edge and its corner's end alike.
  const inner = (side: (c: Cast) => number) =>
    Math.ceil(radius + Math.max(0, ...list.map((c) => c.blur + side(c))));
  // Slices, CSS px: the top starts at the card's top edge (cut there).
  const top = inner((c) => c.y);
  const right = outRight + inner((c) => -c.x);
  const bottom = outBottom + inner((c) => -c.y);
  const left = outLeft + inner((c) => c.x);
  /** The constant middle each slice stretches. */
  const middle = 2;
  const width = left + middle + right;
  const height = top + middle + bottom;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("hung shadow: no 2d context");
  }
  ctx.scale(ratio, ratio);
  const card = (grow: number, dy: number) => {
    ctx.beginPath();
    ctx.roundRect(
      outLeft - grow,
      dy - grow,
      width - outLeft - outRight + 2 * grow,
      height - outBottom + 2 * grow,
      corners.map((r) => Math.max(0, r + grow))
    );
  };
  // Each shadow cast by a copy of the card (grown by its spread) drawn
  // above the canvas, so only its shadow lands on it.
  for (const cast of list) {
    ctx.save();
    // A canvas's shadow ignores its transform: its blur and offset are in
    // the canvas's own pixels.
    ctx.shadowColor = cast.color;
    ctx.shadowBlur = cast.blur * ratio;
    ctx.shadowOffsetX = cast.x * ratio;
    ctx.shadowOffsetY = (cast.y + ABOVE) * ratio;
    ctx.fillStyle = "#000";
    card(cast.spread, -ABOVE);
    ctx.fill();
    ctx.restore();
  }
  // Not cut out of the card: its surface (`.hung-surface`) covers what lies
  // under it, at the card's own box, so a short card's scaled slices leave
  // no gap between its edge and its shadow.

  const blob = await new Promise<Blob>((done, fail) =>
    canvas.toBlob((b) =>
      b ? done(b) : fail(new Error("hung shadow: no picture"))
    )
  );
  if (look !== drawnFor) {
    return;
  }
  const url = URL.createObjectURL(blob);
  // Decoded before any card paints it, so no paint waits on it.
  const picture = new Image();
  picture.src = url;
  await picture.decode();
  if (look !== drawnFor) {
    URL.revokeObjectURL(url);
    return;
  }
  const px = (n: number) => Math.round(n * ratio);
  sheet ??= document.head.appendChild(document.createElement("style"));
  // On the card itself: its border is 0 wide, so the picture takes no room;
  // it is drawn its own widths wide and out past the box by its outset.
  sheet.textContent = `${selector} {
  border-style: solid;
  border-image: url("${url}") ${px(top)} ${px(right)} ${px(bottom)} ${px(left)} / ${top}px ${right}px ${bottom}px ${left}px / 0 ${outRight}px ${outBottom}px ${outLeft}px stretch;
}`;
  if (shown) {
    URL.revokeObjectURL(shown);
  }
  shown = url;
}
