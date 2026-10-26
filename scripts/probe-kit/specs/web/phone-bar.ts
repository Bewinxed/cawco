/**
 * The phone's top bar keeps every control whole on the screen. On the real
 * Shell, on a bench page, in Chromium and WebKit at 390 and 320 wide, touch:
 *
 * 1. Every control in the bar (`header[data-slot="top"]`: the sidebar
 *    toggle, Caw's head, and the glass he stands on), ring included, lies
 *    within `[0, innerWidth]`. A control's extent is its border box grown by
 *    what it draws outside it, read from computed styles: its focus ring as
 *    the keyboard shows it (`outline-width` + `outline-offset`, focused with
 *    `focusVisible`), its drop shadows (`box-shadow` offset, blur and
 *    spread, on it and on its `::before`), and Caw's rim
 *    (`[data-slot="rim"]`, the svg the arcs are drawn in, each arc at its
 *    stroke's outer edge when arcs stand).
 *
 *    One exception, by design: Caw's glass is a tab tucked into the
 *    screen's trailing edge (DESIGN.md, Top bar: "flush with it …, square
 *    on that side, which draws no hairline"), so its glass's shadow
 *    (`[data-slot="tools"]::before`) runs on past that edge and is cut
 *    there, and only there. Its box itself still ends at `innerWidth`.
 * 2. The overflow sweep totals 0 (journeys/scan.ts: nothing spills past
 *    the screen or its box, no control covers text).
 *
 *   bun scripts/probe-kit/run.ts web phone-bar
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one engine and one width at a time, each on its own page
import type { Page } from "playwright-core";
import { HouseRules } from "../../house-rules";
import { scan } from "../../journeys/scan";
import { type Engine, type Kit, open, type Spec, settle } from "../../kit";

const ENGINES: Engine[] = ["chromium", "webkit"];
const WIDTHS = [390, 320] as const;
/** A bench page: the real Shell around it, no hub. */
const BENCH = "/motion/step-ink";
const CAW = "header[data-slot='top'] button[data-needs-caw]";

interface Reach {
  /** Its extent, ring and shadows included. */
  left: number;
  name: string;
  right: number;
  /** What grew it past its border box. */
  why: string[];
}

interface BarRead {
  /** Caw's glass: its border box, its hairline on each side, its corners. */
  glass: {
    left: number;
    right: number;
    borderStart: string;
    borderEnd: string;
    radii: string[];
  } | null;
  innerWidth: number;
  reaches: Reach[];
  /** Controls whose focus could not be shown as the keyboard shows it. */
  unfocused: string[];
}

/** Every control of the bar and how far it draws, read in the page. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, so every helper it uses lives inside it
function readBar(): BarRead {
  const px = (value: string) => Number.parseFloat(value) || 0;
  const r = (n: number) => Math.round(n * 10) / 10;
  /** A shadow list's farthest reach past the box on the left and the right. */
  const shadowReach = (value: string) => {
    let left = 0;
    let right = 0;
    if (value === "none") {
      return { left, right };
    }
    // Each shadow's colour aside, its lengths: x, y, blur, spread.
    // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
    for (const one of value.split(/,(?![^(]*\))/u)) {
      if (one.includes("inset")) {
        continue;
      }
      const lengths = (
        one
          .replace(/(rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)/gu, "")
          .match(/-?[\d.]+px/gu) ?? []
      ).map(px);
      const [x = 0, , blur = 0, spread = 0] = lengths;
      left = Math.max(left, blur + spread - x);
      right = Math.max(right, blur + spread + x);
    }
    return { left, right };
  };
  const shown = (el: Element) => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      box.width > 0 &&
      box.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  };
  const nameOf = (el: Element) =>
    el.getAttribute("aria-label") ??
    el.getAttribute("data-slot") ??
    el.tagName.toLowerCase();

  const bar = document.querySelector("header[data-slot='top']");
  const reaches: Reach[] = [];
  const unfocused: string[] = [];
  const controls = bar
    ? [
        ...bar.querySelectorAll<HTMLElement>(
          "button, a[href], [role='button'], [data-slot='tools']"
        ),
      ].filter(shown)
    : [];
  for (const el of controls) {
    const box = el.getBoundingClientRect();
    let { left, right } = box;
    const why: string[] = [];
    const grow = (by: { left: number; right: number }, what: string) => {
      if (by.left > 0 || by.right > 0) {
        why.push(`${what} ${by.left}/${by.right}px`);
      }
      left = Math.min(left, box.left - by.left);
      right = Math.max(right, box.right + by.right);
    };
    grow(shadowReach(getComputedStyle(el).boxShadow), "shadow");
    const glassShadow = shadowReach(getComputedStyle(el, "::before").boxShadow);
    if (el.matches("[data-slot='tools']")) {
      // The flush tab's shadow is cut at the trailing edge by design: its
      // leading reach counts, its trailing one is named, not counted.
      grow({ left: glassShadow.left, right: 0 }, "glass shadow");
      why.push(
        `glass shadow past the trailing edge, cut by design ${glassShadow.right}px`
      );
    } else {
      grow(glassShadow, "::before shadow");
    }
    if (el.matches("button, a[href], [role='button']")) {
      // Its focus ring, as the keyboard shows it.
      el.focus({ focusVisible: true } as FocusOptions);
      if (el.matches(":focus-visible")) {
        const style = getComputedStyle(el);
        if (style.outlineStyle !== "none") {
          const out = px(style.outlineWidth) + px(style.outlineOffset);
          grow({ left: out, right: out }, "focus ring");
        }
      } else {
        unfocused.push(nameOf(el));
      }
      el.blur();
    }
    // Caw's rim: the svg his arcs are drawn in, each arc at its stroke's edge.
    for (const rim of el.querySelectorAll<SVGSVGElement>(
      "svg[data-slot='rim']"
    )) {
      if (!shown(rim)) {
        continue;
      }
      const at = rim.getBoundingClientRect();
      why.push(`rim ${r(at.left)}–${r(at.right)}`);
      grow({ left: box.left - at.left, right: at.right - box.right }, "rim");
      const scale = at.width / (rim.viewBox.baseVal.width || at.width);
      for (const arc of rim.querySelectorAll("path")) {
        const half = (px(getComputedStyle(arc).strokeWidth) * scale) / 2;
        const drawn = arc.getBoundingClientRect();
        grow(
          {
            left: box.left - (drawn.left - half),
            right: drawn.right + half - box.right,
          },
          "arc"
        );
      }
    }
    reaches.push({ name: nameOf(el), left, right, why });
  }
  const tools = bar?.querySelector<HTMLElement>("[data-slot='tools']");
  const glassStyle = tools ? getComputedStyle(tools, "::before") : null;
  const glassBox = tools?.getBoundingClientRect();
  return {
    innerWidth: window.innerWidth,
    reaches,
    unfocused,
    glass:
      glassStyle && glassBox
        ? {
            left: glassBox.left,
            right: glassBox.right,
            borderStart: glassStyle.borderLeftWidth,
            borderEnd: glassStyle.borderRightWidth,
            radii: [
              glassStyle.borderTopLeftRadius,
              glassStyle.borderTopRightRadius,
              glassStyle.borderBottomRightRadius,
              glassStyle.borderBottomLeftRadius,
            ],
          }
        : null,
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

async function leg(kit: Kit, bench: string, engine: Engine, width: number) {
  const page: Page = await kit.page("phone", { engine });
  await page.setViewportSize({ width, height: 844 });
  await open(page, `${bench}${BENCH}`, CAW);
  await settle(page);
  const read = await page.evaluate(readBar);
  const at = `${engine} ${width}px`;
  const out = read.reaches.filter(
    (one) => one.left < -0.5 || one.right > read.innerWidth + 0.5
  );
  kit.check(
    `${at}: every top-bar control, its focus ring, shadows and Caw's rim included, lies within [0, ${read.innerWidth}] (${read.reaches.length} controls)`,
    read.reaches.length >= 3 &&
      read.unfocused.length === 0 &&
      read.reaches.some((one) => one.why.some((w) => w.startsWith("rim"))) &&
      out.length === 0,
    `\n${read.reaches
      .map(
        (one) =>
          `    ${out.includes(one) ? "OUT " : "ok  "}${one.name}: ${r1(one.left)}–${r1(one.right)} (${one.why.join(", ") || "its box"})`
      )
      .join(
        "\n"
      )}${read.unfocused.length > 0 ? `\n    no focus ring shown: ${read.unfocused.join(", ")}` : ""}`
  );
  const { glass } = read;
  kit.check(
    `${at}: Caw's glass, the one exception, is the flush tab DESIGN.md draws: its box ends at the trailing edge, square there with no hairline`,
    !!glass &&
      Math.abs(read.innerWidth - glass.right) < 0.5 &&
      px(glass.borderEnd) === 0 &&
      px(glass.borderStart) > 0 &&
      px(glass.radii[1] ?? "") === 0 &&
      px(glass.radii[2] ?? "") === 0,
    JSON.stringify(glass)
  );
  const toggle = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.cssText =
      "position:absolute;display:block;inline-size:var(--c-bar-phone-edge)";
    document.body.append(probe);
    const edge = probe.getBoundingClientRect().width;
    probe.remove();
    const glyph = document
      .querySelector("header[data-slot='top'] [data-slot='burger'] svg")
      ?.getBoundingClientRect();
    const bar = document
      .querySelector("header[data-slot='top']")
      ?.getBoundingClientRect();
    const box = document
      .querySelector("header[data-slot='top'] [data-slot='burger']")
      ?.getBoundingClientRect();
    const sizeOf = (name: string) => {
      probe.style.cssText = `position:absolute;display:block;block-size:var(${name})`;
      document.body.append(probe);
      const size = probe.getBoundingClientRect().height;
      probe.remove();
      return size;
    };
    // The tabs' centre line: they stand on the bar's floor.
    const line =
      (bar?.top ?? 0) + sizeOf("--c-top-bar-h") - sizeOf("--c-tab-row-h") / 2;
    return {
      edge,
      glyphLeft: glyph?.left ?? null,
      glyphMid: glyph ? (glyph.top + glyph.bottom) / 2 : null,
      line,
      box:
        box && bar
          ? {
              top: box.top - bar.top,
              bottom: box.bottom - bar.top,
              bar: bar.height,
            }
          : null,
    };
  });
  kit.check(
    `${at}: the sidebar toggle's glyph still stands --c-bar-phone-edge (${toggle.edge}px) in from the leading edge (${toggle.glyphLeft})`,
    toggle.glyphLeft !== null && Math.abs(toggle.glyphLeft - toggle.edge) < 0.5
  );
  kit.check(
    `${at}: the sidebar toggle's glyph centres on the tabs' centre line (${toggle.glyphMid} at ${toggle.line}) and its 44px box stays inside its bar (${JSON.stringify(toggle.box)})`,
    toggle.glyphMid !== null &&
      Math.abs(toggle.glyphMid - toggle.line) < 0.5 &&
      !!toggle.box &&
      toggle.box.top >= -0.5 &&
      toggle.box.bottom <= toggle.box.bar + 0.5 &&
      toggle.box.bottom - toggle.box.top >= 44 - 0.5
  );
  const house = new HouseRules(kit, at);
  await settle(page);
  await house.at(page, "the bar at rest");
  house.report();
  const found = await page.evaluate(scan);
  kit.check(
    `${at}: the overflow sweep totals 0 (${found.length})`,
    found.length === 0,
    found.length > 0 ? `\n    ${found.join("\n    ")}` : ""
  );
  await page.context().close();
}

const px = (value: string) => Number.parseFloat(value) || 0;

const spec: Spec = {
  group: "iPhone Safari",
  name: "phone-bar",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    for (const engine of ENGINES) {
      for (const width of WIDTHS) {
        await leg(kit, bench, engine, width);
      }
    }
  },
};

export default spec;
