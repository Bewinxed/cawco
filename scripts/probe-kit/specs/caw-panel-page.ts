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
 * 1a. In every frame with a message box, the box stands over the room's
 *    foot as the thread pane's dock does, and at rest (the room at its end)
 *    the thread's last line ends above the box's shell and his seat on it:
 *    nothing stands under either. A miss counts as a spill.
 * 1b. Every phone frame's panel is the sheet under the real bar glass
 *    (joined): its top on the bar's floor line, its trailing side the
 *    screen's edge, its leading side 12px in, the glass at the screen's
 *    edge (DESIGN.md, Caw's panel).
 * 1d. Nothing repeats: the name the head shows is never the first line of
 *    a message standing in the room's view (a thread's title today is its
 *    first message's first line, hub caw.ts `titleFrom`). A miss counts as
 *    a spill.
 * 1f. A frame comparing the thread (card 1, `data-panel-whole`) holds it
 *    whole: its room doesn't scroll. A miss counts as a spill.
 * 1e. Every frame holding a blocking block draws it at the room's middle,
 *    Caw at its start edge and its words on the text column after him.
 * 3. Nothing overlaps: no two runs of words in a frame cross, an ancestor
 *    and its own words aside; words a floating surface covers aren't drawn,
 *    and a run its scroller clips is read only where it shows.
 *
 * The sweep's total is the count of spills and overlaps over every frame;
 * it prints per states file, then the first few of each with where.
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
const SCHEMES = ["light", "dark"] as const;

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

interface Sweep {
  frames: number;
  /** Phone frames whose sheet doesn't stand under the glass as DESIGN.md has it. */
  hangs: string[];
  /** Phone frames read for the hang. */
  hung: number;
  notDrawn: string[];
  overlaps: string[];
  /** Frames whose message box was read over the room's foot. */
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
    // The message box stands over the room's foot, as the thread pane's
    // dock does: at rest, the room scrolled to its end, the thread's last
    // line ends above the box's shell, so nothing stands under it.
    const row = body.querySelector<HTMLElement>("[data-panel-composer]");
    const shell = row?.querySelector<HTMLElement>('[data-slot="shell"]');
    const room = body.querySelector<HTMLElement>("[data-panel-room]");
    const column = room?.firstElementChild;
    if (row && shell && room && column) {
      out.rows += 1;
      const atEnd = room.scrollTop + room.clientHeight >= room.scrollHeight - 1;
      const last = column.lastElementChild?.getBoundingClientRect().bottom;
      // What stands over the room's foot reaches up to the box's shell or
      // his seat on it, whichever stands higher.
      const top = Math.min(
        ...[shell, ...row.querySelectorAll<HTMLElement>('[data-slot="perch"]')]
          .map((one) => one.getBoundingClientRect())
          .filter((one) => one.height > 0 && one.width > 0)
          .map((one) => one.top)
      );
      if (atEnd && last !== undefined && last > top + 1) {
        out.spills.push(
          `${where}: the thread's last line ends ${Math.round(last - top)}px under the message box or his seat on it`
        );
      }
    }
    // 1f. A frame that compares the thread (card 1) holds it whole: its
    // room doesn't scroll, so no line stands cut at its top.
    if (
      room?.dataset.panelWhole !== undefined &&
      room.scrollHeight > room.clientHeight + 1
    ) {
      out.spills.push(
        `${where}: the thread doesn't stand whole (${room.scrollHeight - room.clientHeight}px past the room)`
      );
    }
    // A phone frame: the panel is the sheet under the bar's glass, its top
    // on the bar's floor line, its trailing side the screen's edge, its
    // leading side the bar's 12px phone edge, the glass at the screen's
    // edge (DESIGN.md, Caw's panel), in the frame's own pixels (the canvas
    // may scale it).
    const screen = body.querySelector<HTMLElement>('[data-panel-form="phone"]');
    const glass = screen?.querySelector<HTMLElement>("[data-bar-group]");
    const sheet = screen?.querySelector<HTMLElement>("[data-panel]");
    if (screen && glass && sheet) {
      out.hung += 1;
      const s = screen.getBoundingClientRect();
      const scale = s.width / screen.offsetWidth || 1;
      const c = sheet.getBoundingClientRect();
      const bar = glass
        .closest("[data-panel-form] > div")
        ?.getBoundingClientRect();
      const g = glass.getBoundingClientRect();
      const off = {
        top: bar ? (c.top - bar.bottom) / scale : null,
        end: (s.right - c.right) / scale,
        start: (c.left - s.left) / scale,
        glassEnd: (s.right - g.right) / scale,
        joined: glass.dataset.joined !== undefined,
      };
      if (
        off.top === null ||
        Math.abs(off.top) > 1 ||
        Math.abs(off.end) > 1 ||
        Math.abs(off.start - 12) > 1 ||
        Math.abs(off.glassEnd) > 1 ||
        !off.joined
      ) {
        out.hangs.push(`${where}: ${JSON.stringify(off)}`);
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
          const scrolls: boolean =
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
          out.spills.push(
            `${where}: ${name(el)} runs past its box down (${name(down).slice(0, 60)}: ${Math.round(Math.max(d.top - box.top, box.bottom - d.bottom))}px)`
          );
        }
      }
      if (box.right > bodyBox.right + 1 || box.left < bodyBox.left - 1) {
        out.spills.push(`${where}: ${name(el)} runs past the frame's width`);
      }
    }
    // 1d. Nothing repeats: the head's name is no message's first line in view.
    const named = body
      .querySelector("[data-panel-name]")
      ?.textContent?.trim()
      .toLowerCase();
    if (named && room) {
      const r = room.getBoundingClientRect();
      for (const said of body.querySelectorAll("[data-panel-said] > li")) {
        const s = said.getBoundingClientRect();
        const line = said
          .querySelector("p + p")
          ?.textContent?.trim()
          .toLowerCase();
        if (
          line?.startsWith(named) &&
          s.bottom > r.top + 1 &&
          s.top < r.bottom - 1
        ) {
          out.spills.push(
            `${where}: the head's name repeats a message in view ("${named.slice(0, 32)}")`
          );
        }
      }
    }
    // 1e. A blocking block at the room's middle, Caw at its start edge, the
    // words on the text column after him.
    const block = body.querySelector<HTMLElement>("[data-blocked]");
    if (block && room) {
      // The room's content box: its column less the padding that keeps
      // the box's seat clear.
      const content = block.parentElement as HTMLElement;
      const pad = getComputedStyle(content);
      const c = content.getBoundingClientRect();
      const r = new DOMRect(
        c.left,
        c.top + Number.parseFloat(pad.paddingBlockStart),
        c.width,
        Math.min(c.height, room.clientHeight) -
          Number.parseFloat(pad.paddingBlockStart) -
          Number.parseFloat(pad.paddingBlockEnd)
      );
      const b = block.getBoundingClientRect();
      const caw = block
        .querySelector("[data-blocked-caw]")
        ?.getBoundingClientRect();
      const title = block.querySelector("h3")?.getBoundingClientRect();
      const middle = Math.abs((b.top + b.bottom) / 2 - (r.top + r.bottom) / 2);
      const fits = b.height < r.height - 2;
      if (
        !(caw && title) ||
        (fits && middle > 24) ||
        caw.left - b.left > 1 ||
        title.left < caw.right
      ) {
        out.spills.push(
          `${where}: the block isn't centred with Caw at its start (off the middle by ${Math.round(middle)}px, Caw ${caw ? Math.round(caw.left - b.left) : "absent"}px in)`
        );
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
      // Each states file at one width and scheme a load: every frame of the
      // panel draws Caw's seat live (Rive), and a file's every width and
      // scheme at once stood ~480 players in one page, where the runtime's
      // heap gave out under load ("Aborted()"); the product draws one.
      const loads = files.flatMap((file) =>
        WIDTHS.flatMap((width) =>
          SCHEMES.map((scheme) => ({ file, width, scheme }))
        )
      );
      /** What each states file's loads found, told once per file. */
      const told = new Map<
        string,
        {
          frames: number;
          overlaps: number;
          seen: Map<string, string[]>;
          spills: number;
        }
      >();
      for (const { file, width, scheme } of loads) {
        await page.goto(
          `http://127.0.0.1:${port}/@cawco/canvas?file=${encodeURIComponent(file)}&width=${width}&scheme=${scheme}`,
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
        total += sweep.spills.length + sweep.overlaps.length;
        const so = told.get(file) ?? {
          frames: 0,
          overlaps: 0,
          seen: new Map<string, string[]>(),
          spills: 0,
        };
        so.frames += sweep.frames;
        so.spills += sweep.spills.length;
        so.overlaps += sweep.overlaps.length;
        // Each finding once, with every frame it stands in.
        for (const line of [...sweep.spills, ...sweep.overlaps]) {
          const [at, what] = line.split(": ", 2);
          so.seen.set(what, [...(so.seen.get(what) ?? []), at]);
        }
        told.set(file, so);
      }
      for (const [file, so] of told) {
        console.log(
          `  ${file.split("/").at(-1)}: ${so.frames} frames, ${so.spills} spills, ${so.overlaps} overlaps`
        );
        for (const [what, at] of [...so.seen].slice(0, 8)) {
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
        `1b: every phone frame's sheet (${hung}) stands under the joined bar glass: its top on the floor line, its trailing side the screen's edge, 12px in at its leading side, the glass at the screen's edge`,
        hung > 0 && hangs.length === 0,
        hangs.slice(0, 8).join(" | ") || "all stand"
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
