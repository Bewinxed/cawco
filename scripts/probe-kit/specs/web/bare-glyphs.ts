/**
 * Every icon stands bare (DESIGN.md, The Bare Glyph Rule): no Solar icon is
 * drawn in the circle or rounded square it ships in, and no tile is drawn
 * round a session's sprite. On the benches (no hub), at 1440 in Chromium:
 *
 * - the step-ink bench (a thinking step's glyph in each ink) and the
 *   delegate-tray bench (`?case=4`: the tray, its chips, the transcript's
 *   delegate heads) draw none of the contained icons the barrel takes bare:
 *   no rendered SVG holds the body of a Solar icon that `bare.ts` names and
 *   the barrel no longer imports from Solar (packages/icons/src/index.ts);
 * - the step-ink bench's done step draws `check-circle` without its circle
 *   (`~icons/bare/check-circle`, bare.ts's body);
 * - every session mark on the delegate-tray bench (`[data-slot="mark"]`:
 *   the tray's chips, the heads' rail cells) has no fill of its own, and its
 *   sprite is drawn in the mark's hue (`--mark-ink`);
 * - nothing reaches the page's error reporter.
 *
 *   bun scripts/probe-kit/run.ts web bare-glyphs
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one bench at a time, on its own page
import { join } from "node:path";
import type { Page } from "playwright-core";
import { BARE_ICONS } from "../../../../packages/icons/src/bare.ts";
import { type Kit, open, type Spec, settle } from "../../kit";

const ROOT = join(import.meta.dir, "../../../..");
const SVG_OPEN = /^<svg[^>]*>/;
const SVG_CLOSE = /<\/svg>$/;
const BENCHES = [
  { path: "/motion/step-ink", ready: "main [data-ink]" },
  {
    path: "/motion/delegate-tray?case=4",
    ready: '[data-slot="tr"][role="log"]',
  },
];

/** The contained Solar icons the barrel takes bare: named in bare.ts, no longer imported from Solar. */
async function containedBodies(): Promise<Map<string, string>> {
  const barrel = await Bun.file(
    join(ROOT, "packages/icons/src/index.ts")
  ).text();
  const solar = (await Bun.file(
    join(ROOT, "apps/dashboard/node_modules/@iconify-json/solar/icons.json")
  ).json()) as { icons: Record<string, { body: string }> };
  const bodies = new Map<string, string>();
  for (const name of Object.keys(BARE_ICONS)) {
    if (barrel.includes(`~icons/solar/${name}-`)) {
      continue;
    }
    for (const cut of ["bold-duotone", "linear", "line-duotone"]) {
      const icon = solar.icons[`${name}-${cut}`];
      if (icon) {
        bodies.set(`${name}-${cut}`, icon.body);
      }
    }
  }
  return bodies;
}

/** The inner markup of `body`, as the browser serialises it. */
const serialised = (page: Page, body: string) =>
  page.evaluate((markup) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML = markup;
    return svg.innerHTML;
  }, body);

const drawn = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("svg")].map((svg) => svg.innerHTML)
  );

async function noContained(
  kit: Kit,
  page: Page,
  bench: string,
  bodies: Map<string, string>
) {
  const svgs = await drawn(page);
  const found: string[] = [];
  for (const [name, body] of bodies) {
    const markup = await serialised(page, body);
    if (svgs.some((svg) => svg.includes(markup))) {
      found.push(name);
    }
  }
  kit.check(
    `${bench}: no Solar icon is drawn in its container (${bodies.size} contained cuts looked for in ${svgs.length} SVGs)`,
    svgs.length > 0 && found.length === 0,
    found.join(", ") || "none drawn"
  );
}

async function marks(kit: Kit, page: Page) {
  const read = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-slot="mark"]')]
      .filter((mark) => mark.style.getPropertyValue("--mark-ink"))
      .map((mark) => {
        const style = getComputedStyle(mark);
        const sprite = mark.querySelector("svg");
        const probe = document.createElement("span");
        probe.style.color = mark.style.getPropertyValue("--mark-ink");
        mark.append(probe);
        const hue = getComputedStyle(probe).color;
        probe.remove();
        return {
          fill: style.backgroundColor,
          image: style.backgroundImage,
          sprite: sprite ? getComputedStyle(sprite).color : null,
          hue,
        };
      })
  );
  kit.check(
    `delegate-tray: every session mark is its sprite alone, no fill of its own, drawn in the mark's hue (${read.length} marks)`,
    read.length > 0 &&
      read.every(
        (mark) =>
          (mark.fill === "rgba(0, 0, 0, 0)" || mark.fill === "transparent") &&
          mark.image === "none" &&
          mark.sprite === mark.hue
      ),
    JSON.stringify(read.slice(0, 4))
  );
}

const run = async (kit: Kit) => {
  const base = await kit.bench();
  const bodies = await containedBodies();
  for (const bench of BENCHES) {
    const page = await kit.page("desk");
    const thrown: string[] = [];
    page.on("pageerror", (error) => thrown.push(error.message.slice(0, 300)));
    await open(page, `${base}${bench.path}`, bench.ready, 120_000);
    await settle(page, 600);
    const name = bench.path.split("/").at(-1)?.split("?")[0] ?? bench.path;
    await noContained(kit, page, name, bodies);
    if (name === "step-ink") {
      const bare = await serialised(
        page,
        (BARE_ICONS["check-circle"] as string)
          .replace(SVG_OPEN, "")
          .replace(SVG_CLOSE, "")
      );
      const done = await page
        .locator('[data-ink="done"] svg')
        .first()
        .evaluate((svg) => svg.innerHTML);
      kit.check(
        "step-ink: the done step draws check-circle without its circle",
        bare.length > 0 && done.includes(bare),
        done.slice(0, 160)
      );
    } else {
      await marks(kit, page);
    }
    kit.check(
      `${name}: nothing reaches the page's error reporter`,
      thrown.length === 0,
      thrown.join(" | ")
    );
    await page.close();
  }
};

const spec: Spec = { name: "bare-glyphs", run };
export default spec;
