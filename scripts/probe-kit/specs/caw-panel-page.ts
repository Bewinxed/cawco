/**
 * Caw's panel decision page: every option's states file
 * (apps/dashboard/src/lib/cawco/project/caw-panel/*.stories.ts) drawn on the
 * dashboard's stage (stage-host/host.ts, bundled and started in
 * apps/dashboard as held-post-row starts it), every story at 390, 680 and
 * 1440, light and dark, and read from the engine:
 *
 * 1. Every rest frame is drawn: none failed, none empty.
 * 2. Nothing spills: each run of words lies inside the box that clips it
 *    (its nearest ancestor that clips, else the frame), across always and
 *    down where nothing above it scrolls; and no element scrolls sideways
 *    (scrollWidth past clientWidth on an overflow that clips), a run cut
 *    with an ellipsis inside its own box (The Truncate Inside Rule) and a
 *    visually hidden one (sr-only) aside.
 * 1a. In every frame with a message box, its dock lies in the flow and
 *    the thread ends where the box's row begins: nothing passes under it.
 *    A miss counts as a spill.
 * 1b. Every phone frame's panel is the real HangCard, in the frame, its top
 *    on Caw's glass's foot, its trailing side the screen's edge, its
 *    leading side 12px in (DESIGN.md, Caw's panel).
 * 1c. In a frame cropped to the panel's top, every run of words ends above
 *    the fade at its cut. A miss counts as a spill.
 * 1d. The head never names the thread while your first message, which is
 *    its name (hub caw.ts `titleFrom`), stands in the room's view. A miss
 *    counts as a spill.
 * 3. Nothing overlaps: no two runs of words in a frame cross, an ancestor
 *    and its own words aside; words a floating surface covers aren't drawn.
 *
 * The sweep's total is the count of spills and overlaps over every frame;
 * it prints per states file, then the first few of each with where.
 *
 * 4. Each resize option operated with a pointer: a drag on the grip grows
 *    the panel, a long drag stops at its 720 max, a double press brings
 *    back 380 × 640; the edge changes only the width and the foot only the
 *    height; Wide panel in More makes it 560.
 *
 *   bun scripts/probe-kit/run.ts caw-panel-page
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one states file at a time.
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const APP = join(ROOT, "apps/dashboard");
const DIR = "src/lib/cawco/project/caw-panel";
const WIDTHS = [390, 680, 1440];

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

interface Sweep {
  frames: number;
  /** Phone frames whose panel doesn't hang from the glass as DESIGN.md has it. */
  hangs: string[];
  /** Phone frames read for the hang. */
  hung: number;
  notDrawn: string[];
  overlaps: string[];
  /** Frames whose message box was read as the panel's last row. */
  rows: number;
  spills: string[];
}

/** A frame the report says was drawn. */
const DRAWN = /:drawn$/;

/**
 * Every rest frame of one states file, read in the page. It is handed to
 * `page.evaluate` whole, so it holds its own helpers and literals.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one in-page sweep, serialised whole into the page
const sweepPage = (file: string): Sweep => {
  const out: Sweep = {
    frames: 0,
    hangs: [],
    hung: 0,
    notDrawn: [],
    rows: 0,
    overlaps: [],
    spills: [],
  };
  const frames = [
    ...document.querySelectorAll<HTMLElement>(
      `.cawco-frame[data-cawco-file="${file}"][data-cawco-interaction="rest"]`
    ),
  ];
  const clips = (el: Element, axis: "x" | "y") => {
    const style = getComputedStyle(el);
    const value = axis === "x" ? style.overflowX : style.overflowY;
    return value !== "visible";
  };
  const name = (el: Element) =>
    // biome-ignore lint/performance/useTopLevelRegex: serialised into the page, which has no module scope
    `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""} "${(el.textContent ?? "").trim().slice(0, 32)}"`;
  for (const frame of frames) {
    const body = frame.querySelector<HTMLElement>(".cawco-frame-body");
    const where = `${frame.dataset.cawcoStory} @${frame.dataset.cawcoWidth} ${frame.dataset.cawcoScheme}`;
    if (!body?.firstElementChild) {
      out.notDrawn.push(where);
      continue;
    }
    out.frames += 1;
    const bodyBox = body.getBoundingClientRect();
    // A phone frame: the panel is the hanging card, inside this frame, its
    // top on the glass's foot (the bar's floor line), its trailing side the
    // screen's edge, its leading side the 12px margin (DESIGN.md, Caw's
    // panel), measured in the frame's own pixels (the canvas may scale it).
    // The message box is the panel's last row (decided, pin 22): its dock in
    // the flow, and the thread's room ending where the box's row begins, so
    // nothing passes under it.
    const row = body.querySelector<HTMLElement>("[data-panel-composer]");
    const dock = row?.querySelector<HTMLElement>('[data-slot="dock"]');
    const room = body.querySelector<HTMLElement>("[data-panel-room]");
    if (row && dock && room) {
      out.rows += 1;
      const { position } = getComputedStyle(dock);
      const roomEnd = room.getBoundingClientRect().bottom;
      const rowTop = row.getBoundingClientRect().top;
      if (position !== "static" || roomEnd > rowTop + 1) {
        out.spills.push(
          `${where}: the message box isn't the last row (dock ${position}, the thread ends ${Math.round(roomEnd - rowTop)}px past the box's row)`
        );
      }
    }
    const glass = body.querySelector<HTMLElement>("[data-panel-glass]");
    const screen = body.querySelector<HTMLElement>('[data-panel-form="phone"]');
    if (glass && screen) {
      out.hung += 1;
      const card = screen.querySelector<HTMLElement>(".kit-hang");
      const s = screen.getBoundingClientRect();
      const scale = s.width / screen.offsetWidth || 1;
      if (card) {
        const c = card.getBoundingClientRect();
        const g = glass.getBoundingClientRect();
        // The glass's foot flares out by radius-lg into the card's top
        // edge: its box ends on the glass's flank and sits on the card's
        // top, and the card's neck is cut that far past the glass.
        const foot = glass.querySelector<HTMLElement>(
          "[data-panel-glass-foot]"
        );
        const f = foot?.getBoundingClientRect();
        const off = {
          top: (c.top - g.bottom) / scale,
          end: (s.right - c.right) / scale,
          start: (c.left - s.left) / scale,
          glassEnd: (s.right - g.right) / scale,
          footEnd: f ? (g.left + scale - f.right) / scale : null,
          footBottom: f ? (c.top - f.bottom) / scale : null,
          footSize: f ? f.width / scale : null,
          neckFlare: Number.parseFloat(
            card.style.getPropertyValue("--neck-flare-start")
          ),
        };
        if (
          Math.abs(off.top) > 1 ||
          Math.abs(off.end) > 1 ||
          Math.abs(off.start - 12) > 1 ||
          Math.abs(off.glassEnd) > 1 ||
          off.footEnd === null ||
          Math.abs(off.footEnd) > 1 ||
          Math.abs(off.footBottom ?? 9) > 1 ||
          Math.abs((off.footSize ?? 0) - 12) > 1 ||
          Math.abs(off.neckFlare - 12) > 1
        ) {
          out.hangs.push(`${where}: ${JSON.stringify(off)}`);
        }
      } else {
        out.hangs.push(`${where}: no hanging card in the frame`);
      }
    }
    // Runs of words: elements holding text of their own, drawn.
    const words: { box: DOMRect; el: Element }[] = [];
    for (const el of body.querySelectorAll("*")) {
      const own = [...el.childNodes].some(
        (node) =>
          node.nodeType === Node.TEXT_NODE && node.textContent?.trim() !== ""
      );
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      // Visually hidden (the kit's sr-only: a 1px clipped box) is not drawn.
      const unseen =
        box.width * box.height < 4 ||
        style.clip !== "auto" ||
        style.clipPath !== "none";
      if (
        !unseen &&
        // A run cut with an ellipsis inside its own box is the Truncate
        // Inside Rule, not a spill.
        style.textOverflow !== "ellipsis" &&
        clips(el, "x") &&
        el.scrollWidth > el.clientWidth + 1 &&
        style.display !== "inline"
      ) {
        out.spills.push(
          `${where}: ${name(el)} scrolls sideways by ${el.scrollWidth - el.clientWidth}px`
        );
      }
      if (
        !own ||
        unseen ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        el.closest("[aria-hidden='true'],[hidden]")
      ) {
        continue;
      }
      // The box that clips it across, and down unless that box scrolls.
      let across: Element = body;
      let down: Element | null = body;
      // The scroller that clips it down, if one does.
      let scroller: Element | null = null;
      for (
        let up = el.parentElement;
        up && up !== body;
        up = up.parentElement
      ) {
        if (across === body && clips(up, "x")) {
          across = up;
        }
        if (down === body && clips(up, "y")) {
          const scrolls =
            getComputedStyle(up).overflowY === "auto" ||
            getComputedStyle(up).overflowY === "scroll";
          down = scrolls ? null : up;
          scroller = scrolls ? up : null;
        }
      }
      // A run its scroller holds wholly out of view (a thread opened at its
      // latest message, its first ones above the fold) isn't drawn: it
      // crosses nothing. A run it holds partly in view is drawn only inside it: that part
      // alone is what can cross another.
      const view = scroller?.getBoundingClientRect();
      if (!view) {
        words.push({ el, box });
      } else if (box.bottom > view.top && box.top < view.bottom) {
        const top = Math.max(box.top, view.top);
        const bottom = Math.min(box.bottom, view.bottom);
        words.push({
          el,
          box: new DOMRect(box.left, top, box.width, bottom - top),
        });
      }
      const a = across.getBoundingClientRect();
      if (box.left < a.left - 1 || box.right > a.right + 1) {
        out.spills.push(
          `${where}: ${name(el)} runs ${Math.round(Math.max(a.left - box.left, box.right - a.right))}px past its box across`
        );
      }
      if (down) {
        const d = down.getBoundingClientRect();
        if (box.top < d.top - 1 || box.bottom > d.bottom + 1) {
          out.spills.push(`${where}: ${name(el)} runs past its box down`);
        }
      }
      if (box.right > bodyBox.right + 1 || box.left < bodyBox.left - 1) {
        out.spills.push(`${where}: ${name(el)} runs past the frame's width`);
      }
    }
    // 1d. The head's thread name and your first message, never both in view.
    const named = body.querySelector("[data-panel-thread]");
    const first = body.querySelector("[data-panel-said] > li");
    if (named && first && room) {
      const r = room.getBoundingClientRect();
      const f = first.getBoundingClientRect();
      if (f.bottom > r.top + 1 && f.top < r.bottom - 1) {
        out.spills.push(
          `${where}: the head names the thread while your first message, its name, is in view`
        );
      }
    }
    // 1c. A frame cropped to the panel's top (`peek`): every run of words
    // ends above the fade at its cut, so no line stands cut or faded.
    const cut = body.querySelector("[data-panel-cut]");
    if (cut) {
      const fade = cut.getBoundingClientRect().top;
      for (const { el, box } of words) {
        if (box.bottom > fade + 1) {
          out.spills.push(
            `${where}: ${name(el)} runs ${Math.round(box.bottom - fade)}px into the crop's fade`
          );
        }
      }
    }
    // A floating surface (the kit's popover recipe, a menu drawn open)
    // stands over what lies under it: words it covers aren't drawn, so
    // they cross nothing.
    const layerOf = (el: Element) => el.closest(".kit-pop");
    const covered = (el: Element, box: DOMRect, by: Element | null) => {
      if (!by || by.contains(el)) {
        return false;
      }
      const l = by.getBoundingClientRect();
      return (
        box.left >= l.left - 1 &&
        box.right <= l.right + 1 &&
        box.top >= l.top - 1 &&
        box.bottom <= l.bottom + 1
      );
    };
    for (let i = 0; i < words.length; i += 1) {
      for (let j = i + 1; j < words.length; j += 1) {
        const p = words[i];
        const q = words[j];
        if (p.el.contains(q.el) || q.el.contains(p.el)) {
          continue;
        }
        const pLayer = layerOf(p.el);
        const qLayer = layerOf(q.el);
        if (
          pLayer !== qLayer &&
          (covered(q.el, q.box, pLayer) || covered(p.el, p.box, qLayer))
        ) {
          continue;
        }
        const w =
          Math.min(p.box.right, q.box.right) - Math.max(p.box.left, q.box.left);
        const h =
          Math.min(p.box.bottom, q.box.bottom) - Math.max(p.box.top, q.box.top);
        if (w > 1 && h > 1) {
          out.overlaps.push(
            `${where}: ${name(p.el)} × ${name(q.el)} (${Math.round(w)}×${Math.round(h)})`
          );
        }
      }
    }
  }
  return out;
};

const spec: Spec = {
  name: "caw-panel-page",
  run: async (kit: Kit) => {
    const files = readdirSync(join(APP, DIR))
      .filter((one) => one.endsWith(".stories.ts"))
      .sort()
      .map((one) => `${DIR}/${one}`);
    const host = join(APP, ".cawco/stage/host.mjs");
    mkdirSync(join(APP, ".cawco/stage"), { recursive: true });
    writeFileSync(host, await buildStageHost());
    const port = await freePort();
    const stage = spawn("bun", [host], {
      cwd: APP,
      env: {
        ...process.env,
        CAWCO_STAGE: "1",
        CAWCO_STAGE_PORT: String(port),
        CAWCO_STAGE_FRAMEWORK: "svelte",
        CAWCO_STAGE_KIT: "1",
        CAWCO_STAGE_TOOLCHAIN: "vite",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let words = "";
    const hear = (chunk: Buffer) => {
      words += chunk.toString("utf8");
    };
    stage.stdout.on("data", hear);
    stage.stderr.on("data", hear);
    try {
      await until(
        "the stage's ready",
        () => words,
        (text) => text.includes('"cawco":"ready"'),
        90_000
      );
      const page = await kit.page("desk");
      const logged: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          logged.push(message.text());
        }
      });
      page.on("pageerror", (error) => logged.push(error.message));
      let total = 0;
      let frames = 0;
      let hung = 0;
      const hangs: string[] = [];
      const notDrawn: string[] = [];
      for (const file of files) {
        await page.goto(
          `http://127.0.0.1:${port}/@cawco/canvas?file=${encodeURIComponent(file)}&width=${WIDTHS.join(",")}&scheme=both`,
          { waitUntil: "load" }
        );
        await page
          .waitForFunction(
            (one) => {
              const report = (
                window as unknown as {
                  __cawcoCanvas?: {
                    report: {
                      sections: {
                        file: string;
                        frames: { interaction: string; state: string }[];
                      }[];
                    } | null;
                  };
                }
              ).__cawcoCanvas?.report;
              const section = report?.sections.find((s) => s.file === one);
              const rest =
                section?.frames.filter((f) => f.interaction === "rest") ?? [];
              return rest.length > 0 && rest.every((f) => f.state !== "unseen");
            },
            file,
            { timeout: 90_000 }
          )
          .catch((error: Error) => {
            notDrawn.push(`${file}: ${error.message.split("\n")[0]}`);
          });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(600);
        const states = await page.evaluate((one) => {
          const { report } = (
            window as unknown as {
              __cawcoCanvas: {
                report: {
                  sections: {
                    file: string;
                    frames: {
                      interaction: string;
                      state: string;
                      story: string;
                      error?: { message: string };
                    }[];
                  }[];
                };
              };
            }
          ).__cawcoCanvas;
          return (
            report.sections
              .find((s) => s.file === one)
              ?.frames.filter((f) => f.interaction === "rest")
              .map(
                (f) =>
                  `${f.story}:${f.state}${f.error ? ` ${f.error.message}` : ""}`
              ) ?? []
          );
        }, file);
        const bad = states.filter((one) => !DRAWN.test(one));
        notDrawn.push(...bad.map((one) => `${file} ${one}`));
        const sweep = await page.evaluate(sweepPage, file);
        frames += sweep.frames;
        hung += sweep.hung;
        hangs.push(...sweep.hangs.map((one) => `${file} ${one}`));
        notDrawn.push(...sweep.notDrawn.map((one) => `${file} ${one}`));
        const count = sweep.spills.length + sweep.overlaps.length;
        total += count;
        console.log(
          `  ${file.split("/").at(-1)}: ${sweep.frames} frames, ${sweep.spills.length} spills, ${sweep.overlaps.length} overlaps`
        );
        // Each finding once, with every frame it stands in.
        const seen = new Map<string, string[]>();
        for (const line of [...sweep.spills, ...sweep.overlaps]) {
          const [at, what] = line.split(": ", 2);
          seen.set(what, [...(seen.get(what) ?? []), at]);
        }
        for (const [what, at] of [...seen].slice(0, 8)) {
          console.log(`    ${what}  [${at.join(", ")}]`);
        }
      }
      kit.check(
        `1: every rest frame of ${files.length} states files drawn at ${WIDTHS.join(", ")}, light and dark (${frames} frames)`,
        notDrawn.length === 0,
        notDrawn.slice(0, 12).join(" | ") || "all drawn"
      );
      kit.check(
        `2-3: the sweep totals zero spills and overlaps over ${frames} frames`,
        total === 0,
        `total ${total}`
      );
      kit.check(
        `1b: every phone frame (${hung}) hangs the real card from Caw's glass: its top on the floor line, its trailing side the screen's edge, 12px in at its leading side, the glass's foot flaring 12px into its top edge`,
        hung > 0 && hangs.length === 0,
        hangs.slice(0, 8).join(" | ") || "all hang"
      );
      // 4. Each resize option, operated: a drag on the grip grows the panel
      // toward the page and down, a long drag stops at 720 wide, a double
      // press brings back 380 × 640; Wide panel in More makes it 560.
      // Its size, and the room under its top (the window less the panel's
      // top and the field's --space-3 inset: Resize's own bound).
      const sizeOf = () =>
        page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>(
            '.cawco-frame[data-cawco-interaction="rest"] [data-panel]'
          );
          if (!panel) {
            return { w: 0, h: 0, room: 0 };
          }
          const inset = Number.parseFloat(
            getComputedStyle(panel.parentElement as HTMLElement)
              .paddingInlineEnd
          );
          return {
            w: panel.offsetWidth,
            h: panel.offsetHeight,
            room: Math.round(
              window.innerHeight - panel.getBoundingClientRect().top - inset
            ),
          };
        });
      const openResize = async (file: string) => {
        await page.goto(
          `http://127.0.0.1:${port}/@cawco/canvas?file=${encodeURIComponent(`${DIR}/${file}`)}&width=1440&scheme=light`,
          { waitUntil: "load" }
        );
        await page.waitForSelector(
          '.cawco-frame[data-cawco-interaction="rest"] [data-panel]',
          { timeout: 60_000 }
        );
        await page.waitForTimeout(600);
      };
      const drag = async (grip: string, dx: number, dy: number) => {
        const handle = page
          .locator(
            `.cawco-frame[data-cawco-interaction="rest"] [data-panel-grip="${grip}"]`
          )
          .first();
        await handle.scrollIntoViewIfNeeded();
        const box = await handle.boundingBox();
        if (!box) {
          return false;
        }
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        for (let step = 1; step <= 8; step += 1) {
          await page.mouse.move(x + (dx * step) / 8, y + (dy * step) / 8);
        }
        await page.mouse.up();
        return true;
      };
      const resets = async (grip: string) => {
        const handle = page
          .locator(
            `.cawco-frame[data-cawco-interaction="rest"] [data-panel-grip="${grip}"]`
          )
          .first();
        await handle.dblclick();
        return sizeOf();
      };
      for (const [file, grip] of [
        ["ResizeEdges.stories.ts", "corner"],
        ["ResizeCorner.stories.ts", "corner"],
      ] as const) {
        await openResize(file);
        // The long drag first, from rest, so the grip stands where the
        // frame drew it; then back, then a drag across and down.
        const rest = await sizeOf();
        const found = await drag(grip, -600, 0);
        const widest = await sizeOf();
        const reset = await resets(grip);
        await drag(grip, -120, 90);
        const grown = await sizeOf();
        const back = await resets(grip);
        kit.check(
          `4: ${file}: a long drag on the ${grip} stops at 720 wide, a double press brings back 380 × 640, a drag grows the panel across 1:1 and down as far as the room under it`,
          found &&
            rest.w === 380 &&
            rest.h === 640 &&
            grown.w === rest.w + 120 &&
            grown.h > rest.h &&
            grown.h <= Math.max(rest.h, rest.room) &&
            widest.w === 720 &&
            widest.h === rest.h &&
            reset.w === 380 &&
            reset.h === 640 &&
            back.w === 380 &&
            back.h === 640,
          JSON.stringify({ rest, widest, reset, grown, back })
        );
      }
      await openResize("ResizeEdges.stories.ts");
      const edgeRest = await sizeOf();
      await drag("edge", -100, 0);
      const across = await sizeOf();
      await drag("foot", 0, 80);
      const down = await sizeOf();
      kit.check(
        "4: ResizeEdges.stories.ts: the leading edge changes only the width, the foot only the height",
        across.w === edgeRest.w + 100 &&
          across.h === edgeRest.h &&
          down.h > across.h &&
          down.h <= Math.max(across.h, across.room) &&
          down.w === across.w,
        JSON.stringify({ edgeRest, across, down })
      );
      await openResize("ResizeMenu.stories.ts");
      const menuRest = await sizeOf();
      await page
        .locator(
          '.cawco-frame[data-cawco-interaction="rest"] [data-panel] button[aria-label="More"]'
        )
        .first()
        .click();
      // The menu More opened, last in the page (the kit's portal); the
      // MenuOpen story's own stands open in its frame earlier on.
      await page
        .getByRole("menuitemcheckbox", { name: "Wide panel" })
        .last()
        .click();
      const wide = await sizeOf();
      kit.check(
        "4: ResizeMenu.stories.ts: Wide panel in More makes the panel 560 wide, its height kept",
        menuRest.w === 380 && wide.w === 560 && wide.h === menuRest.h,
        JSON.stringify({ menuRest, wide })
      );
      kit.check(
        "no console errors on the canvases",
        logged.length === 0,
        logged.slice(0, 5).join(" | ") || "none"
      );
    } finally {
      stage.kill("SIGTERM");
    }
  },
};
export default spec;
