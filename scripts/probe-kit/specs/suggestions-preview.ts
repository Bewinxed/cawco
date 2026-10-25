/**
 * The suggestions preview (design-previews/suggestions/), served as a
 * folder and read from the engine on Chromium and WebKit, at 1440 (a desk's
 * mouse), 680 (a narrow desk window) and 390 (a phone's finger), by day and
 * at night. Every look (list, rows, chips) is Suggestions.svelte's
 * own markup (capture/capture.ts), set in Caw's first thread and the empty
 * Decisions tab beside today's StarterCards:
 *
 * 1. Each look's states render: three in each thread frame, three in each
 *    Decisions frame, one, seven and the longest in its states, every item
 *    a button with a box and its words showing; while read, three
 *    skeletons with a box each and the list `aria-busy`.
 * 2. The 44px hit area: on the phone's finger (a coarse pointer), a press
 *    22px either side of each item's centre, across and down, lands on
 *    that item, in every look and frame.
 * 3. Focus is visible: Tab onto each look's first item from the control
 *    before it, and it matches `:focus-visible` and draws the house ring
 *    (a 2px solid outline in `--focus-ring`).
 * 4. Pressed: held down under the mouse, a wide item (list, rows)
 *    takes `--surface-pressed` and a chip scales to `--press-scale`; let go
 *    over it, its words are in the composer, the caret after them.
 * 5. Long text wraps without overflow: in every look's longest set, each
 *    sentence and reason stays inside its item, its item inside its frame,
 *    and the long sentence takes more than one line exactly where it is
 *    wider on one line than the room it was given.
 * 6. The overflow sweep (journeys/scan.ts: nothing spills, no control
 *    covers text) totals zero at 1440, 680 and 390, both schemes.
 * 7. No console or page error.
 * 8. Where they stand: in Caw's thread each look meets the composer's
 *    edges (the hero is already the composer's column); in an empty panel
 *    no item draws a glyph (DESIGN.md, Empty: the mark is "the block's one
 *    glyph, so its action is words alone"); while read, each look's
 *    skeletons stand within a tenth of the real three's height in Caw's
 *    column (The Claim Of Nothing Rule); and a chip's edge holds 3:1 on the
 *    recess it stands on (DESIGN.md, Borders: `border-row-outline`).
 * 9. A press on the empty Decisions tab opens Caw's panel in that frame,
 *    the words in his composer, the caret after them.
 *
 *   bun scripts/probe-kit/run.ts suggestions-preview
 *   SUGGESTIONS_ENGINES=chromium bun scripts/probe-kit/run.ts suggestions-preview
 */
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { scan } from "../journeys/scan";
import type { Engine, Kit, Spec, View } from "../kit";
import { ROOT } from "../kit";

const DIR = join(ROOT, "design-previews", "suggestions");
const LOOKS = ["list", "rows", "chips"] as const;
const WIDTHS: { width: number; view: View }[] = [
  { width: 1440, view: "desk" },
  { width: 680, view: "narrowDesk" },
  { width: 390, view: "phone" },
];
/** How many items each captured set holds (lib/cawco/suggestions/examples.ts). */
const COUNTS: Record<string, number> = {
  three: 3,
  one: 1,
  many: 7,
  long: 3,
  decisions: 3,
};

function serve() {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = normalize(
        join(DIR, path.endsWith("/") ? `${path}index.html` : path)
      );
      if (!file.startsWith(DIR)) {
        return new Response("no", { status: 403 });
      }
      const body = Bun.file(file);
      return (await body.exists())
        ? new Response(body)
        : new Response("not found", { status: 404 });
    },
  });
}

/** The page drawn and its faces in, both frames past any run. */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => "__previewReady" in window);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))
    );
  });
}

async function scheme(page: Page, which: "light" | "dark"): Promise<void> {
  await page.click(`.scheme [data-scheme="${which}"]`);
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
}

/** Leg 1: every look's parts hold what they should, each item a button with a box and showing words. */
async function statesLeg(kit: Kit, page: Page, at: string): Promise<void> {
  const read = await page.evaluate(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, its helpers inside it
    ({ looks, counts }) => {
      const bad: string[] = [];
      let parts = 0;
      for (const look of looks) {
        const section = document.querySelector(`.variant[data-look="${look}"]`);
        for (const holder of section?.querySelectorAll<HTMLElement>(
          "[data-part-key]"
        ) ?? []) {
          parts += 1;
          const key = holder.dataset.partKey ?? "";
          const set = key.split(":")[1] ?? "";
          const list = holder.querySelector("ul");
          if (set === "loading") {
            // One item's place per skeleton row: each holds skeletons, every one with a box.
            const rows = [...(list?.children ?? [])];
            const sized = rows.filter((row) => {
              const bones = [...row.querySelectorAll('[data-slot="skeleton"]')];
              return (
                bones.length > 0 &&
                bones.every((bone) => {
                  const r = bone.getBoundingClientRect();
                  return r.width > 0 && r.height > 0;
                })
              );
            });
            if (
              rows.length !== 3 ||
              sized.length !== 3 ||
              list?.getAttribute("aria-busy") !== "true"
            ) {
              bad.push(
                `${key}: ${sized.length} of ${rows.length} skeleton rows, aria-busy ${list?.getAttribute("aria-busy")}`
              );
            }
            continue;
          }
          const items = [
            ...holder.querySelectorAll<HTMLButtonElement>(
              'button[data-slot="suggestion"]'
            ),
          ];
          const shown = items.filter((item) => {
            const r = item.getBoundingClientRect();
            const words = item.querySelector('[data-slot="suggestion-text"]');
            const w = words?.getBoundingClientRect();
            return (
              r.width > 0 &&
              r.height > 0 &&
              (words?.textContent ?? "").trim().length > 0 &&
              (w?.width ?? 0) > 0 &&
              getComputedStyle(item).visibility === "visible"
            );
          });
          if (shown.length !== counts[set] || items.length !== counts[set]) {
            bad.push(
              `${key}: ${shown.length} of ${items.length} shown, ${counts[set]} expected`
            );
          }
        }
      }
      return { bad, parts };
    },
    { looks: [...LOOKS], counts: COUNTS }
  );
  kit.check(
    `${at}: each look's states render (${read.parts} parts: thread and Decisions at desk and phone, one, seven, longest, being read)`,
    read.bad.length === 0 && read.parts === LOOKS.length * 8,
    read.bad.slice(0, 4).join(" | ")
  );
}

/** Leg 2: on a coarse pointer, a press 22px out from each item's centre, across and down, lands on it. */
async function hitLeg(kit: Kit, page: Page, at: string): Promise<void> {
  const coarse = await page.evaluate(
    () => matchMedia("(pointer: coarse)").matches
  );
  if (!coarse) {
    kit.check(`${at}: the phone's page matches a coarse pointer`, false);
    return;
  }
  const misses = await page.evaluate(
    async (looks) => {
      const out: string[] = [];
      let items = 0;
      for (const look of looks) {
        for (const item of document.querySelectorAll<HTMLElement>(
          `.variant[data-look="${look}"] button[data-slot="suggestion"]`
        )) {
          item.scrollIntoView({ block: "center", inline: "center" });
          // biome-ignore lint/performance/noAwaitInLoops: each item scrolled in and read before the next
          await new Promise((done) => requestAnimationFrame(done));
          const r = item.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const reach = 21.5;
          const points: [string, number, number][] = [
            ["above", cx, cy - Math.max(reach, r.height / 2 - 1)],
            ["below", cx, cy + Math.max(reach, r.height / 2 - 1)],
            ["before", cx - Math.max(reach, r.width / 2 - 1), cy],
            ["after", cx + Math.max(reach, r.width / 2 - 1), cy],
          ];
          items += 1;
          for (const [side, x, y] of points) {
            const hit = document.elementFromPoint(x, y);
            if (hit?.closest('[data-slot="suggestion"]') !== item) {
              out.push(
                `${look} "${item.textContent?.trim().slice(0, 24)}" ${side}: ${hit?.tagName.toLowerCase()}.${String(hit?.className).slice(0, 30)} (${Math.round(r.width)}×${Math.round(r.height)})`
              );
            }
          }
        }
      }
      return { out, items };
    },
    [...LOOKS]
  );
  kit.check(
    `${at}: every item's hit area reaches 44px across and down under a finger (${misses.items} items)`,
    misses.out.length === 0 && misses.items > 0,
    misses.out.slice(0, 4).join(" | ")
  );
  // Today's StarterCards, read the same way for the audit: noted, not held.
  const today = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '.variant[data-look="today"] .frame-phone button[data-slot="starter"]'
      ),
    ].map((item) => {
      item.scrollIntoView({ block: "center" });
      const r = item.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const above = document.elementFromPoint(cx, cy - 21.5);
      return `${Math.round(r.width)}×${Math.round(r.height)} ${above?.closest('[data-slot="starter"]') === item ? "reaches" : "misses"} 22px above its centre`;
    })
  );
  kit.note(`${at}: today's starters on the phone: ${today.join(", ")}`);
}

/** Leg 3: Tab onto each look's first item: :focus-visible and the house ring. */
async function focusLeg(kit: Kit, page: Page, at: string): Promise<void> {
  for (const look of LOOKS) {
    // The last reference link in the look's head is the control before its first item.
    // biome-ignore lint/performance/noAwaitInLoops: one focus at a time under one keyboard
    await page.evaluate((l) => {
      const links = document.querySelectorAll<HTMLElement>(
        `.variant[data-look="${l}"] .variant-head a`
      );
      links.item(links.length - 1)?.focus();
    }, look);
    await page.keyboard.press("Tab");
    const read = await page.evaluate((l) => {
      const el = document.activeElement as HTMLElement | null;
      const first = document.querySelector(
        `.variant[data-look="${l}"] button[data-slot="suggestion"]`
      );
      if (!el) {
        return { on: false, visible: false, ring: "", want: "" };
      }
      const style = getComputedStyle(el);
      const probe = document.createElement("i");
      probe.style.color = "var(--focus-ring)";
      document.body.append(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      return {
        on: el === first,
        visible: el.matches(":focus-visible"),
        ring: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
        want: `solid 2px ${want}`,
      };
    }, look);
    kit.check(
      `${at} ${look}: Tab lands on the first item, :focus-visible, the house ring`,
      read.on && read.visible && read.ring === read.want,
      `on ${read.on}, visible ${read.visible}, ring "${read.ring}", want "${read.want}"`
    );
  }
}

/** Leg 4: held down, a wide item tints and a chip scales; let go, its words are in the composer. */
async function pressLeg(kit: Kit, page: Page, at: string): Promise<void> {
  for (const look of LOOKS) {
    const item = page
      .locator(
        `.variant[data-look="${look}"] .frame-desk[data-context="thread"] button[data-slot="suggestion"]`
      )
      .first();
    // biome-ignore lint/performance/noAwaitInLoops: one press at a time under one mouse
    await item.scrollIntoViewIfNeeded();
    const box = await item.boundingBox();
    if (!box) {
      kit.check(`${at} ${look}: the first item stands`, false);
      continue;
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // The press's own transitions let go to their end, so what is read is where the press lands.
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
    );
    const held = await item.evaluate((el) => {
      for (const run of el.getAnimations()) {
        run.finish();
      }
      const style = getComputedStyle(el);
      const probe = document.createElement("i");
      probe.style.backgroundColor = "var(--surface-pressed)";
      document.body.append(probe);
      const pressed = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const scale = new DOMMatrix(
        style.transform === "none" ? undefined : style.transform
      ).a;
      const want = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--press-scale"
        )
      );
      return { fill: style.backgroundColor, pressed, scale, want };
    });
    await page.mouse.up();
    const words = await item
      .locator('[data-slot="suggestion-text"]')
      .textContent();
    const field = await page.evaluate((l) => {
      const f = document.querySelector<HTMLTextAreaElement>(
        `.variant[data-look="${l}"] .frame-desk[data-context="thread"] [data-slot="composer-field"]`
      );
      return {
        value: f?.value ?? "",
        focused: document.activeElement === f,
        caret: f ? f.selectionStart === f.value.length : false,
      };
    }, look);
    const ok =
      look === "chips"
        ? Math.abs(held.scale - held.want) < 0.005
        : held.fill === held.pressed;
    kit.check(
      `${at} ${look}: held down it ${look === "chips" ? `scales to ${held.want}` : "takes --surface-pressed"}; let go, its words are in the composer, the caret after them`,
      ok &&
        field.value === (words ?? "").trim() &&
        field.focused &&
        field.caret,
      `fill ${held.fill} (pressed ${held.pressed}), scale ${held.scale}, field "${field.value}" focused ${field.focused} caret ${field.caret}`
    );
  }
}

/** Leg 5: the longest set wraps inside its items and frames, the long sentence on more than one line. */
async function longLeg(kit: Kit, page: Page, at: string): Promise<void> {
  const read = await page.evaluate(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, its helpers inside it
    (looks) => {
      const bad: string[] = [];
      let wrapped = 0;
      const inside = (a: DOMRect, b: DOMRect) =>
        a.left >= b.left - 1 && a.right <= b.right + 1;
      for (const look of looks) {
        const holder = document.querySelector<HTMLElement>(
          `.variant[data-look="${look}"] [data-part-key="${look}:long"]`
        );
        if (!holder) {
          bad.push(`${look}: no longest set`);
          continue;
        }
        const frame = holder.getBoundingClientRect();
        for (const item of holder.querySelectorAll<HTMLElement>(
          '[data-slot="suggestion"]'
        )) {
          const r = item.getBoundingClientRect();
          if (!inside(r, frame)) {
            bad.push(
              `${look}: an item past its frame (${Math.round(r.right - frame.right)}px)`
            );
          }
          for (const run of item.querySelectorAll<HTMLElement>(
            '[data-slot="suggestion-text"], [data-slot="suggestion-reason"]'
          )) {
            const w = run.getBoundingClientRect();
            if (!inside(w, r) || run.scrollWidth > run.clientWidth + 1) {
              bad.push(
                `${look}: "${run.textContent?.slice(0, 20)}" past its item`
              );
            }
          }
        }
        // The long sentence wraps wherever it is wider than its room: its
        // width on one line (max-content) against the width it was given.
        const first = holder.querySelector<HTMLElement>(
          '[data-slot="suggestion-text"]'
        );
        if (first) {
          const given = first.getBoundingClientRect();
          const lh = Number.parseFloat(getComputedStyle(first).lineHeight);
          const was = first.style.cssText;
          first.style.inlineSize = "max-content";
          first.style.maxInlineSize = "none";
          const whole = first.getBoundingClientRect().width;
          first.style.cssText = was;
          const lines = Math.round(given.height / lh);
          if (whole > given.width + 1 ? lines > 1 : lines === 1) {
            wrapped += 1;
          } else {
            bad.push(
              `${look}: the long sentence ${Math.round(whole)}px on one line, given ${Math.round(given.width)}px, on ${lines} lines`
            );
          }
        }
      }
      return { bad, wrapped };
    },
    [...LOOKS]
  );
  kit.check(
    `${at}: the longest sentences and reasons wrap inside their items and frames, on more lines exactly where wider than their room (${read.wrapped} of ${LOOKS.length} looks)`,
    read.bad.length === 0 && read.wrapped === LOOKS.length,
    read.bad.slice(0, 4).join(" | ")
  );
}

/**
 * Leg 6: what a person reads. Each sentence and reason holds 4.5:1 on its
 * item's fill (or the fill under a bare item), its glyph stands on its
 * first line's middle within a pixel (The Mark Line Rule), and how tall
 * each look stands in Caw's thread
 * is noted, so the looks can be weighed by the room they take.
 */
async function inkLeg(kit: Kit, page: Page, at: string): Promise<void> {
  const read = await page.evaluate(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, its helpers inside it
    (looks) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const rgb = (color: string): [number, number, number, number] => {
        if (!ctx) {
          return [0, 0, 0, 0];
        }
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, b, a / 255];
      };
      const lum = ([r, g, b]: number[]) => {
        const c = [r, g, b].map((v) => {
          const s = (v ?? 0) / 255;
          return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return (
          0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0)
        );
      };
      /** The first opaque fill at or above the element. */
      const ground = (el: Element | null): string => {
        for (let up = el; up; up = up.parentElement) {
          const fill = getComputedStyle(up).backgroundColor;
          if (rgb(fill)[3] > 0.99) {
            return fill;
          }
        }
        return getComputedStyle(document.documentElement).backgroundColor;
      };
      const ratio = (ink: string, under: string) => {
        const a = lum(rgb(ink));
        const b = lum(rgb(under));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      const low: string[] = [];
      const off: string[] = [];
      const tall: string[] = [];
      let lowest = 99;
      let worst = 0;
      for (const look of ["today", ...looks]) {
        const holder = document.querySelector<HTMLElement>(
          `.variant[data-look="${look}"] .frame-desk[data-context="thread"] .hero-action > *`
        );
        tall.push(
          `${look} ${Math.round(holder?.getBoundingClientRect().height ?? 0)}px`
        );
      }
      for (const look of looks) {
        for (const run of document.querySelectorAll<HTMLElement>(
          `.variant[data-look="${look}"] :is([data-slot="suggestion-text"], [data-slot="suggestion-reason"])`
        )) {
          const r = ratio(getComputedStyle(run).color, ground(run));
          lowest = Math.min(lowest, r);
          if (r < 4.5) {
            low.push(
              `${look} "${run.textContent?.slice(0, 18)}" ${r.toFixed(2)}`
            );
          }
        }
        for (const glyph of document.querySelectorAll<SVGElement>(
          `.variant[data-look="${look}"] [data-suggestion-glyph]`
        )) {
          const words = glyph
            .closest('[data-slot="suggestion"]')
            ?.querySelector<HTMLElement>('[data-slot="suggestion-text"]');
          if (!words) {
            continue;
          }
          // The first line's x-height middle: the mark line trims the run to
          // its x-height band and pads back (1lh - 1ex) / 2 above, so that
          // middle stands half a line under the run's top, however many lines.
          const style = getComputedStyle(words);
          const lh = Number.parseFloat(style.lineHeight);
          const { top } = words.getBoundingClientRect();
          const g = glyph.getBoundingClientRect();
          const delta = Math.abs(g.top + g.height / 2 - (top + lh / 2));
          worst = Math.max(worst, delta);
          if (delta > 1) {
            off.push(`${look} ${delta.toFixed(2)}px`);
          }
        }
      }
      return { low, off, tall, lowest, worst };
    },
    [...LOOKS]
  );
  kit.check(
    `${at}: every sentence and reason holds 4.5:1 on what it stands on (lowest ${read.lowest.toFixed(2)}:1)`,
    read.low.length === 0,
    read.low.slice(0, 4).join(" | ")
  );
  kit.check(
    `${at}: each glyph stands on its first line's x-height middle within 1px (worst ${read.worst.toFixed(2)}px)`,
    read.off.length === 0,
    read.off.slice(0, 4).join(" | ")
  );
  kit.note(`${at}: three in Caw's 380px thread stand ${read.tall.join(", ")}`);
}

/** Leg 8: where each look stands, its skeleton's size, and the chip's edge. */
async function placeLeg(kit: Kit, page: Page, at: string): Promise<void> {
  const read = await page.evaluate(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, its helpers inside it
    (looks) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const lum = (color: string) => {
        if (!ctx) {
          return 0;
        }
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const c = [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)].map(
          (v) => {
            const x = v / 255;
            return x <= 0.040_45 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          }
        );
        return (
          0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0)
        );
      };
      const ratio = (a: string, b: string) => {
        const x = lum(a);
        const y = lum(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const offEdge: string[] = [];
      const glyphs: string[] = [];
      const bones: string[] = [];
      const bonesOff: string[] = [];
      let edge = 99;
      for (const look of looks) {
        const section = document.querySelector(`.variant[data-look="${look}"]`);
        for (const frame of section?.querySelectorAll<HTMLElement>(
          '.frame[data-context="thread"]'
        ) ?? []) {
          const list = frame
            .querySelector('[data-slot="suggestions"]')
            ?.getBoundingClientRect();
          const field = frame
            .querySelector(".composer")
            ?.getBoundingClientRect();
          if (
            !(list && field) ||
            Math.abs(list.left - field.left) > 1 ||
            Math.abs(list.right - field.right) > 1
          ) {
            offEdge.push(
              `${look}: [${Math.round(list?.left ?? 0)}, ${Math.round(list?.right ?? 0)}] against the composer's [${Math.round(field?.left ?? 0)}, ${Math.round(field?.right ?? 0)}]`
            );
          }
        }
        const drawn = section?.querySelectorAll(
          '.frame[data-context="panel"] [data-suggestion-glyph]'
        ).length;
        if (drawn) {
          glyphs.push(`${look}: ${drawn}`);
        }
        const real = section
          ?.querySelector(
            '.frame-desk[data-context="thread"] [data-slot="suggestions"]'
          )
          ?.getBoundingClientRect().height;
        const held = section
          ?.querySelector(
            `[data-part-key="${look}:loading"] [data-slot="suggestions"]`
          )
          ?.getBoundingClientRect().height;
        bones.push(
          `${look} ${Math.round(held ?? 0)} vs ${Math.round(real ?? 0)}px`
        );
        if (!(real && held) || Math.abs(held - real) > real / 10) {
          bonesOff.push(look);
        }
        if (look === "chips") {
          for (const chip of section?.querySelectorAll<HTMLElement>(
            '.frame[data-context="thread"] button[data-slot="suggestion"]'
          ) ?? []) {
            let under = "";
            for (
              let up = chip.closest("ul")?.parentElement ?? null;
              up && !under;
              up = up.parentElement
            ) {
              const fill = getComputedStyle(up).backgroundColor;
              if (!fill.endsWith("/ 0)") && fill !== "rgba(0, 0, 0, 0)") {
                under = fill;
              }
            }
            edge = Math.min(
              edge,
              ratio(getComputedStyle(chip).borderTopColor, under)
            );
          }
        }
      }
      return { offEdge, glyphs, bones, bonesOff, edge };
    },
    [...LOOKS]
  );
  kit.check(
    `${at}: in Caw's thread every look meets the composer's edges`,
    read.offEdge.length === 0,
    read.offEdge.slice(0, 4).join(" | ")
  );
  kit.check(
    `${at}: in the empty Decisions tab no item draws a glyph, the empty state's mark its one`,
    read.glyphs.length === 0,
    read.glyphs.join(" | ")
  );
  kit.check(
    `${at}: while read, each look's skeletons stand within a tenth of the real three (${read.bones.join(", ")})`,
    read.bonesOff.length === 0,
    read.bonesOff.join(", ")
  );
  kit.check(
    `${at}: a chip's edge holds 3:1 on the recess it stands on (lowest ${read.edge.toFixed(2)}:1)`,
    read.edge >= 3
  );
}

/** Leg 9: a press on the empty Decisions tab opens Caw's panel in that frame, the words in his composer. */
async function panelPressLeg(kit: Kit, page: Page, at: string): Promise<void> {
  for (const look of LOOKS) {
    const frame = page
      .locator(
        `.variant[data-look="${look}"] .frame-desk[data-context="panel"]`
      )
      .first();
    const item = frame.locator('button[data-slot="suggestion"]').first();
    // biome-ignore lint/performance/noAwaitInLoops: one press at a time under one mouse
    await item.click();
    const words = (
      (await item.locator('[data-slot="suggestion-text"]').textContent()) ?? ""
    ).trim();
    const read = await frame.evaluate((el) => {
      const dock = el.querySelector<HTMLElement>('[data-slot="caw-dock"]');
      const field = dock?.querySelector<HTMLTextAreaElement>(
        '[data-slot="composer-field"]'
      );
      const box = dock?.getBoundingClientRect();
      return {
        shown: Boolean(dock && !dock.hidden && box && box.height > 0),
        inside: Boolean(
          box &&
          box.left >= el.getBoundingClientRect().left - 1 &&
          box.right <= el.getBoundingClientRect().right + 1
        ),
        value: field?.value ?? "",
        focused: document.activeElement === field,
        caret: field ? field.selectionStart === field.value.length : false,
      };
    });
    kit.check(
      `${at} ${look}: a press on the empty Decisions tab opens Caw's panel in that frame, its words in his composer, the caret after them`,
      read.shown &&
        read.inside &&
        read.value === words &&
        read.focused &&
        read.caret,
      `shown ${read.shown}, inside ${read.inside}, field "${read.value}", focused ${read.focused}, caret ${read.caret}`
    );
  }
}

const spec: Spec = {
  name: "suggestions-preview",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every engine, width and scheme, each leg in turn
  async run(kit: Kit) {
    const server = serve();
    const base = `http://127.0.0.1:${server.port}/`;
    try {
      const engines = (
        process.env.SUGGESTIONS_ENGINES ?? "chromium,webkit"
      ).split(",") as Engine[];
      for (const engine of engines) {
        const errors: string[] = [];
        let spills = 0;
        for (const { width, view } of WIDTHS) {
          // biome-ignore lint/performance/noAwaitInLoops: one engine's pages one at a time
          const page = await kit.page(view, { engine, scale: 1 });
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text());
            }
          });
          page.on("pageerror", (error) => errors.push(String(error)));
          await page.goto(base);
          await ready(page);
          for (const which of ["light", "dark"] as const) {
            const at = `${engine} ${width} ${which === "light" ? "day" : "night"}`;
            // biome-ignore lint/performance/noAwaitInLoops: one scheme read at a time on one page
            await scheme(page, which);
            await statesLeg(kit, page, at);
            await longLeg(kit, page, at);
            if (view !== "narrowDesk") {
              await inkLeg(kit, page, at);
              await placeLeg(kit, page, at);
            }
            await page.evaluate(() => window.scrollTo(0, 0));
            const findings = await page.evaluate(scan);
            spills += findings.length;
            if (findings.length > 0) {
              kit.note(`${at}: ${findings.slice(0, 4).join(" | ")}`);
            }
          }
          const at = `${engine} ${width}`;
          if (view === "phone") {
            await hitLeg(kit, page, at);
          } else {
            await focusLeg(kit, page, at);
            await pressLeg(kit, page, at);
            await panelPressLeg(kit, page, at);
          }
          await page.close();
        }
        kit.check(
          `${engine}: the overflow sweep at 1440, 680 and 390, day and night, totals ${spills}`,
          spills === 0
        );
        kit.check(
          `${engine}: no console or page error`,
          errors.length === 0,
          errors.slice(0, 4).join(" | ")
        );
      }
    } finally {
      server.stop(true);
    }
  },
};

export default spec;
