/**
 * `bun scripts/bare-glyphs.ts`: writes packages/icons/src/bare.ts, the Solar
 * icons CawCo draws without their containers (DESIGN.md, The Bare Glyph
 * Rule). The owner: "do not use system-provided symbols, just the same solar
 * icon witout its container". So each is that very Solar icon, with only its
 * circle or rounded square taken away:
 *
 * - the glyph is Solar's own, read from the icon's line-duotone cut (the
 *   same drawing as its bold-duotone cut, as centre lines), with the
 *   container dropped: the one shape that encloses every other, 16.5 units
 *   or more each way;
 * - a closed shape the bold-duotone cut fills is filled (a plug's head, a
 *   play triangle, a pen's body), as Solar drew it there; the rest stays a
 *   stroke;
 * - in full ink, as the glyph stands inside its container in the bold cut;
 * - scaled up from the size it had inside the container to fill the icon's
 *   box (its longer side 17.5 units of the 24, with its strokes, as Solar's
 *   own bare `add` is), centred, its stroke kept at Solar's 1.5 at that size.
 *
 * Geometry is read off a browser's SVG engine (getBBox, isPointInFill), so
 * it is what Solar's paths draw, curves and all. Run it after a Solar
 * update; `--check` fails when bare.ts is stale.
 */
import { join } from "node:path";
import { chromium } from "playwright-core";
import { formatText, formattedAlike } from "./fmt.ts";

const ROOT = join(import.meta.dir, "..");
const SOLAR = join(
  ROOT,
  "apps/dashboard/node_modules/@iconify-json/solar/icons.json"
);
const OUT = join(ROOT, "packages/icons/src/bare.ts");

/** Each icon by its Solar name, without its cut's suffix, and what it needs beyond the rule. */
const ICONS: Record<string, { extra?: string }> = {
  "add-circle": {},
  "branching-paths-down": {},
  "branching-paths-up": {},
  "check-circle": {},
  "check-read": {},
  // On the review page only: whether its face is the clock or a container is the owner's pick.
  "clock-circle": {},
  "checklist-minimalistic": {},
  "close-circle": {},
  "close-square": {},
  "cloud-cross": {},
  "code-square": {},
  "danger-circle": {},
  dollar: {},
  "graph-up": {},
  "info-circle": {},
  "key-minimalistic-square-2": {},
  "minus-circle": {},
  "pause-circle": {},
  "pen-new-square": {},
  // Its line cut runs the cable round as the ring; the bold cut's cable is a
  // straight stub from the head to the disc's edge, kept here.
  "plug-circle": { extra: '<path d="M12 15V21.25"/>' },
  "play-circle": {},
  "question-circle": {},
  // On the review page only, as the clock is: a server unit's chassis, or a container.
  "server-square": {},
  "record-circle": {},
  "refresh-circle": {},
  sort: {},
  "square-double-alt-arrow-up": {},
  "square-top-down": {},
  "square-transfer-horizontal": {},
  "stop-circle": {},
  "text-square": {},
};

/** The glyph's longer side, strokes included, in the 24-unit box: Solar's bare `add` spans 3.25 to 20.75. */
const FILL = 17.5;
/** Solar's stroke, in the 24-unit box. */
const STROKE = 1.5;

interface Set {
  aliases?: Record<string, { parent: string }>;
  icons: Record<string, { body: string }>;
}
const set = (await Bun.file(SOLAR).json()) as Set;
const body = (name: string): string => {
  const icon = set.icons[name] ?? set.icons[set.aliases?.[name]?.parent ?? ""];
  if (!icon) {
    throw new Error(`Solar has no ${name}`);
  }
  return icon.body;
};

/**
 * The extraction, run in the page (plain JS: it is the page's, not this
 * script's). Each call draws its icon's two cuts in an SVG of its own.
 */
const IN_PAGE = `
const SHAPES = "path, circle, rect, ellipse, line, polyline";
const CLOSED = /z\\s*$/i;
const shapes = (root) => [...root.querySelectorAll(SHAPES)];
const encloses = (box, all) =>
  box.width >= 16.5 && box.height >= 16.5 &&
  all.every((other) => {
    const o = other.getBBox();
    return o.x >= box.x - 0.3 && o.y >= box.y - 0.3 &&
      o.x + o.width <= box.x + box.width + 0.3 &&
      o.y + o.height <= box.y + box.height + 0.3;
  });
const dropContainer = (cut) => {
  const all = shapes(cut);
  for (const shape of all.filter((s) => encloses(s.getBBox(), all))) shape.remove();
};
// A closed shape the bold cut fills, away from its outline, is filled.
const filledInBold = (svg, shape, boldCut) => {
  const closed = shape.tagName !== "path" || CLOSED.test(shape.getAttribute("d") || "");
  if (!closed) return false;
  const box = shape.getBBox();
  const probe = shape.cloneNode();
  probe.setAttribute("stroke-width", "2.5");
  probe.setAttribute("stroke", "black");
  shape.parentNode.append(probe);
  const point = svg.createSVGPoint();
  let filled = false;
  for (let i = 1; i < 12 && !filled; i += 1) {
    for (let j = 1; j < 12 && !filled; j += 1) {
      point.x = box.x + (box.width * i) / 12;
      point.y = box.y + (box.height * j) / 12;
      filled = shape.isPointInFill(point) && !probe.isPointInStroke(point) &&
        shapes(boldCut).some((b) => b.isPointInFill(point));
    }
  }
  probe.remove();
  return filled;
};
window.bareGlyph = ({ line, bold, extra, fill, stroke }) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "240");
  svg.setAttribute("height", "240");
  document.body.append(svg);
  svg.innerHTML = '<g data-cut="line">' + line + '</g><g data-cut="bold">' + bold + "</g>";
  const lineCut = svg.querySelector('[data-cut="line"]');
  const boldCut = svg.querySelector('[data-cut="bold"]');
  dropContainer(lineCut);
  dropContainer(boldCut);
  lineCut.firstElementChild.insertAdjacentHTML("beforeend", extra);
  for (const shape of shapes(lineCut)) {
    if (filledInBold(svg, shape, boldCut)) shape.setAttribute("fill", "currentColor");
  }
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const shape of shapes(lineCut)) {
    const b = shape.getBBox();
    x0 = Math.min(x0, b.x - stroke / 2);
    y0 = Math.min(y0, b.y - stroke / 2);
    x1 = Math.max(x1, b.x + b.width + stroke / 2);
    y1 = Math.max(y1, b.y + b.height + stroke / 2);
  }
  for (const el of lineCut.querySelectorAll("[opacity]")) el.removeAttribute("opacity");
  for (const el of lineCut.querySelectorAll("[stroke-width]")) el.removeAttribute("stroke-width");
  for (const el of lineCut.querySelectorAll("[clip-path]")) el.removeAttribute("clip-path");
  for (const el of lineCut.querySelectorAll("defs")) el.remove();
  const scale = fill / Math.max(x1 - x0, y1 - y0);
  const round = (n) => Number(n.toFixed(4));
  const dx = round(12 - ((x0 + x1) / 2) * scale);
  const dy = round(12 - ((y0 + y1) / 2) * scale);
  const made = '<g transform="matrix(' + round(scale) + " 0 0 " + round(scale) + " " + dx + " " + dy +
    ')" stroke-width="' + round(stroke / scale) + '">' + lineCut.innerHTML + "</g>";
  svg.remove();
  return made;
};
`;

interface Page {
  bareGlyph: (icon: {
    bold: string;
    extra: string;
    fill: number;
    line: string;
    stroke: number;
  }) => string;
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.addScriptTag({ content: IN_PAGE });
const made = await Promise.all(
  Object.entries(ICONS).map(
    async ([name, { extra = "" }]) =>
      [
        name,
        await page.evaluate(
          (icon) => (window as unknown as Page).bareGlyph(icon),
          {
            line: body(`${name}-line-duotone`),
            bold: body(`${name}-bold-duotone`),
            extra,
            fill: FILL,
            stroke: STROKE,
          }
        ),
      ] as const
  )
);
const bodies = Object.fromEntries(made);
await browser.close();

const source = `/**
 * Generated by scripts/bare-glyphs.ts: do not edit. Each is that Solar icon
 * without its container (DESIGN.md, The Bare Glyph Rule): its glyph from the
 * line-duotone cut, filled where the bold-duotone cut fills it, in full ink,
 * scaled to fill the 24-unit box with Solar's 1.5 stroke. unplugin-icons serves
 * them as the \`bare\` collection (\`~icons/bare/<solar name>\`): the
 * dashboard's vite.config.ts, its optimizer build and core's decision-host.ts;
 * the site's vite.config.ts reads them too.
 */
export const BARE_ICONS: Record<string, string> = {
${Object.entries(bodies)
  .map(
    ([name, inner]) =>
      `  ${JSON.stringify(name)}:\n    ${JSON.stringify(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${inner}</svg>`)},`
  )
  .join("\n")}
};
`;

if (process.argv.includes("--check")) {
  const current = await Bun.file(OUT).text();
  if (!(await formattedAlike(OUT, current, source))) {
    console.error(
      "packages/icons/src/bare.ts is stale: run `bun scripts/bare-glyphs.ts`"
    );
    process.exit(1);
  }
  console.log("bare glyphs: packages/icons/src/bare.ts is current");
} else {
  await Bun.write(OUT, await formatText(OUT, source));
  console.log(
    `wrote ${Object.keys(bodies).length} bare glyphs to packages/icons/src/bare.ts`
  );
}
