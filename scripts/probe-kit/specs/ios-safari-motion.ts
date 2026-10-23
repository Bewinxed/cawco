/**
 * Motion the dashboard took out for Playwright's WebKit 2359, read in the
 * iOS Simulator's own Mobile Safari (`com.apple.mobilesafari`) on the newest
 * iOS installed. Every reading is the engine's, taken in the page by the
 * bridge's agent (safari-bridge.ts) frame by frame, never a picture.
 *
 * Legs (`--leg <name>`, one or more; all by default):
 *
 *  - `starting-style`: WebKit bug 275184's own repro (comment 8,
 *    jsfiddle.net/ymnujoLt, its CSS, markup and script as the fiddle has
 *    them), its Add Square button tapped 20 times by touch (`axe tap`). Each
 *    new square's `@starting-style` transition is applied when the square
 *    holds CSS transitions on opacity and transform from its first frame and
 *    a frame reads it part way (opacity strictly between 0 and 1).
 *
 *  - `long-ask`: on a scratch fleet's built dashboard (reached through the
 *    bridge's front), a session whose agent asks to run a ~1,000-character
 *    Bash command (safari-long-ask's): the composer grows into the ask's
 *    card, its title, body and foot coming up out of a `--part-blur` blur.
 *    The page answers a script within a second the whole way, the card
 *    draws (its heading the command's description, the command and its
 *    `timeout` field, Approve and Deny), and every part's filter is read
 *    each frame: blurred part way at first (between 0 and the token's
 *    4px), clear at the end.
 *  - `queued-edit`: a send queued behind a running turn, lifted into the
 *    field as a person does it on a phone (a tap on the queued message, then
 *    its Edit): the page answers within a second, the edit row draws, and
 *    its label and Keep it come up with no filter and stand whole. The
 *    longest gap between frames is noted with when the field took the focus
 *    and when the keyboard's room reached the page: in iOS 27.2 Safari
 *    draws no frame from the focus the lift puts in the field until the
 *    keyboard's room arrives (focus at 810ms, the viewport down to 384px at
 *    1190ms, the next frame at 1210ms after one at 840ms), some 350-440ms in
 *    which the row comes up. So a blur put back on the row (the 4px of the
 *    ask's parts) never drew between its ends, and neither does its fade.
 *    Neither backdrop filters nor CSS motion made the gap: with every
 *    backdrop-filter off it read 427ms, with every transition and animation
 *    off 309ms.
 *  - `entrances`: the kit's popover and dropdown menu (the overlays bench,
 *    each opened by a tap) and the composer's / menu (a `/` typed into a
 *    session's field) come in by their `@starting-style` transitions: CSS
 *    transitions on the surface from its first frame, its opacity read part
 *    way, and standing whole at the end.
 *  - `caw-dock`: Caw's docked panel on a project's page, opened from his
 *    seat by a tap, comes in from its side as it fades: a read part way in
 *    both, whole at the end. By script (motion/curves `appearOnMount`): its
 *    `@starting-style` rise ran no transition in iOS 27.2 Safari, only the
 *    fade. Docked is wider than a phone, so this leg runs on an iPad
 *    (`PROBE_IPAD_UDID`, or a Mac slot of the newest iPad Pro 13-inch).
 *  - `desk-entrances`: on the iPad too, the other fades the 10-22 commits
 *    touched, each read part way and whole at the end: the
 *    opened-at record's mark (its row's `::before`, a session reached at a
 *    record by a link's `?at=`), the config rail's unsaved dot (a new
 *    hook's field typed into), the canvas's corner grip (⌘⇧D in the
 *    composer), a decision graph's card (the project's Decisions graph
 *    opened) and a card new to the Canvas view (a task filed after the
 *    view settled). The mark fades by its keyframes (`--mark-in`,
 *    `kit-fade-in`): its `@starting-style` on the `::before` ran nothing in
 *    iOS 27.2 Safari (no run, opacity 1 on the first read).
 *
 *   bun scripts/probe-kit/run.ts ios-safari-motion
 *   PROBE_SIM_UDID=<udid> bun scripts/probe-kit/run.ts ios-safari-motion --leg starting-style
 *
 * The spec takes a Mac slot (lib/mac-sim.ts) on the newest iOS runtime;
 * `PROBE_SIM_UDID` names a simulator already booted to run on instead.
 * Every leg's frames are written to the run's output (`<leg>.json`).
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one Safari, one tap at a time
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { transcriptWords } from "../../../packages/core/src/words/transcript";
import { macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { jevMock, jevOn } from "../jev-mock";
import { COMPOSER, type Kit, type KitFleet, type Spec } from "../kit";
import {
  answering,
  type SafariBridge,
  type SafariPage,
  safariBridge,
} from "../safari-bridge";

const SAFARI = "com.apple.mobilesafari";
/** What a runtime identifier carries before its name (`iOS-27-2`). */
const RUNTIME_PREFIX = /^.*SimRuntime\./;
/** A filter's blur radius, as a computed style writes it. */
const BLUR = /blur\(([\d.]+)px\)/;
/**
 * How long a freshly opened page is left before the first tap: Safari let a
 * tap 1.5 s after the agent first asked go unheard, and heard one at 2.5 s.
 */
const SETTLE_MS = 2500;
const AXE = "/opt/homebrew/bin/axe";
const LEGS = [
  "starting-style",
  "long-ask",
  "queued-edit",
  "entrances",
  "caw-dock",
  "desk-entrances",
] as const;
type Leg = (typeof LEGS)[number];
/** The legs that need more than a phone's width: they run on an iPad. */
const IPAD_LEGS = new Set<Leg>(["caw-dock", "desk-entrances"]);
/** What a name keeps of a leg's words in a file's name. */
const NON_WORD = /\W+/g;

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

/** The legs `--leg` names, or every one. */
function legs(): Set<Leg> {
  const named: Leg[] = [];
  process.argv.forEach((word, i) => {
    const value = process.argv[i + 1];
    if (word === "--leg" && value) {
      for (const one of value.split(",")) {
        if (!(LEGS as readonly string[]).includes(one)) {
          throw new Error(`no leg ${one}: ${LEGS.join(", ")}`);
        }
        named.push(one as Leg);
      }
    }
  });
  return new Set(named.length > 0 ? named : LEGS);
}

/** The runtime a booted simulator runs, as `iOS-27-2`. */
async function runtimeOf(udid: string): Promise<string> {
  const listed = JSON.parse(await sh("xcrun simctl list devices -j")) as {
    devices: Record<string, { udid: string }[]>;
  };
  const runtime = Object.entries(listed.devices).find(([, devices]) =>
    devices.some((device) => device.udid === udid)
  )?.[0];
  return runtime?.replace(RUNTIME_PREFIX, "") ?? "unknown";
}

interface On {
  bridge: SafariBridge;
  kit: Kit;
  tag: string;
  udid: string;
}

/** Opens `url` in a fresh Safari. */
async function openFresh(udid: string, url: string): Promise<void> {
  await sh(`xcrun simctl terminate ${udid} ${SAFARI} || true`);
  await sh(`xcrun simctl openurl ${udid} '${url}'`);
}

/** A finger's tap at screen point (x, y) (`axe tap`, a touch down and up). */
const touch = (udid: string, x: number, y: number) =>
  sh(
    `${AXE} tap -x ${Math.round(x)} -y ${Math.round(y)} --udid ${udid} >/dev/null`
  );

/**
 * Where the page's viewport stands on the screen, in points: a tap at a known
 * point is heard by the page at its client coordinates. Safari's web content
 * is not in the accessibility tree `axe` reads, so taps on the page go by
 * point, the element's box plus this.
 */
async function viewportOnScreen(
  udid: string,
  page: SafariPage
): Promise<{ x: number; y: number }> {
  await page.run(() => {
    const w = window as unknown as { __touched?: { x: number; y: number } };
    w.__touched = undefined;
    document.addEventListener(
      "pointerdown",
      (event) => {
        w.__touched = { x: event.clientX, y: event.clientY };
      },
      { capture: true, once: true }
    );
  });
  const at = { x: 200, y: 420 };
  await touch(udid, at.x, at.y);
  await Bun.sleep(300);
  const heard = await page.run(
    () =>
      (window as unknown as { __touched?: { x: number; y: number } }).__touched
  );
  if (!heard) {
    throw new Error("the page heard no tap at (200, 420)");
  }
  return { x: at.x - heard.x, y: at.y - heard.y };
}

/**
 * A finger's tap on the middle of the first element `selector` finds (scrolled
 * into the middle first when it stands near an edge). The page hears where
 * the tap landed: one that missed the element (Safari's bars moved the web
 * view since `offset` was read) corrects `offset` from where it landed and
 * taps once more.
 */
async function tapOn(
  on: On,
  page: SafariPage,
  offset: { x: number; y: number },
  selector: string
): Promise<void> {
  for (const attempt of [1, 2]) {
    const box = await page.run(
      async (sel: string) => {
        const element = document.querySelector(sel);
        if (!element) {
          return null;
        }
        const r0 = element.getBoundingClientRect();
        if (r0.top < 80 || r0.bottom > innerHeight - 80) {
          element.scrollIntoView({ block: "center" });
          await new Promise((go) => setTimeout(go, 400));
        }
        const w = window as unknown as {
          __landed?: { inside: boolean; x: number; y: number };
        };
        w.__landed = undefined;
        document.addEventListener(
          "pointerdown",
          (event) => {
            w.__landed = {
              x: event.clientX,
              y: event.clientY,
              // Inside its box: a field's own decoration over it takes
              // the press as the field's.
              inside: (() => {
                const r = element.getBoundingClientRect();
                return (
                  event.clientX >= r.left &&
                  event.clientX <= r.right &&
                  event.clientY >= r.top &&
                  event.clientY <= r.bottom
                );
              })(),
            };
          },
          { capture: true, once: true }
        );
        const r = element.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      },
      [selector]
    );
    if (!box) {
      throw new Error(`nothing matches ${selector}`);
    }
    const at = { x: box.x + offset.x, y: box.y + offset.y };
    await touch(on.udid, at.x, at.y);
    await Bun.sleep(250);
    const landed = await page.run(
      () =>
        (
          window as unknown as {
            __landed?: { inside: boolean; x: number; y: number };
          }
        ).__landed
    );
    if (landed?.inside) {
      return;
    }
    if (!landed || attempt === 2) {
      throw new Error(
        `a tap at (${Math.round(at.x)}, ${Math.round(at.y)}) for ${selector} landed ${landed ? `at client (${Math.round(landed.x)}, ${Math.round(landed.y)}), outside it` : "nowhere the page heard"}`
      );
    }
    offset.x = at.x - landed.x;
    offset.y = at.y - landed.y;
  }
}

// ---- starting-style: WebKit bug 275184, comment 8 ------------------------

/** jsfiddle.net/ymnujoLt's CSS, as the fiddle has it. */
const FIDDLE_CSS = `.square {
  width: 100px;
  height: 100px;
  background-image: linear-gradient(purple, yellow);
  transition: display 0.5s allow-discrete, opacity 0.5s, transform 0.5s;
}

@starting-style {
  .square {
    opacity: 0;
    transform: scale(0);
  }
}

.square.hide {
  display: none;
  opacity: 0;
}`;
/** Its script and markup, as the fiddle has them. */
const FIDDLE_SCRIPT = `document.addEventListener("DOMContentLoaded", () => {
  const element = document.querySelector(".square");
  const addButton = document.querySelector(".add-square");

  addButton.addEventListener("click", () => {
    const newSquare = document.createElement("div");
    newSquare.classList.add("square");
    document.querySelector(".wrapper").appendChild(newSquare);
  });
});`;
const FIDDLE_BODY = `<div class="wrapper">
  <div class="square"></div>
</div>
<button class="add-square">Add Square</button>`;
const ADDS = 20;

/** One added square's frames, as the page read them. */
interface Added {
  /** The transitions it held on its first frame, by property. */
  first: string[];
  frames: { opacity: number; t: number; transform: string }[];
}

/** Installed in the page: every square added from here on is read each frame for 700ms. */
function watchSquares(): void {
  const w = window as unknown as { __adds: Added[] };
  w.__adds = [];
  const wrapper = document.querySelector(".wrapper") as HTMLElement;
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        const start = performance.now();
        const seen: Added = {
          first: node
            .getAnimations()
            .map((a) =>
              String(
                (a as unknown as { transitionProperty?: string })
                  .transitionProperty ?? a.constructor.name
              )
            ),
          frames: [],
        };
        w.__adds.push(seen);
        const read = () => {
          const style = getComputedStyle(node);
          const t = performance.now() - start;
          seen.frames.push({
            t: Math.round(t),
            opacity: Number(style.opacity),
            transform: style.transform,
          });
          if (t < 700) {
            requestAnimationFrame(read);
          }
        };
        read();
      }
    }
  }).observe(wrapper, { childList: true });
}

/** Whether one add's transition ran: transitions on both from its first frame, and a frame part way. */
const applied = (add: Added) =>
  add.first.includes("opacity") &&
  add.first.includes("transform") &&
  add.frames.some((f) => f.opacity > 0.02 && f.opacity < 0.98);

/** One add in words: its first frame's transitions and opacity at a few points. */
const said = (add: Added, n: number) => {
  const at = (ms: number) =>
    add.frames.find((f) => f.t >= ms) ?? add.frames.at(-1);
  const points = [0, 100, 250, 400, 600]
    .map((ms) => {
      const f = at(ms);
      return f ? `${f.t}ms ${f.opacity.toFixed(2)}` : "-";
    })
    .join(", ");
  return `add ${n}: transitions [${add.first.join(" ")}], opacity ${points}`;
};

async function startingStyle(on: On): Promise<void> {
  const url = on.bridge.html(
    "starting-style",
    `<style>${FIDDLE_CSS}</style><script>${FIDDLE_SCRIPT}</script>`,
    FIDDLE_BODY
  );
  await openFresh(on.udid, url);
  const page = await on.bridge.page((href) => href.startsWith(url));
  await Bun.sleep(SETTLE_MS);
  const offset = await viewportOnScreen(on.udid, page);
  await page.run(watchSquares);
  for (let n = 0; n < ADDS; n += 1) {
    await page.run(() =>
      document.querySelector(".add-square")?.scrollIntoView({ block: "center" })
    );
    await Bun.sleep(400);
    await tapOn(on, page, offset, ".add-square");
    await Bun.sleep(900);
  }
  const adds = await page.run(
    () => (window as unknown as { __adds: Added[] }).__adds
  );
  const lines = adds.map((add, i) => said(add, i + 1));
  console.log(
    `  ${on.tag} starting-style, each add:\n    ${lines.join("\n    ")}`
  );
  const ran = adds.filter(applied).length;
  on.kit.check(
    `${on.tag}: WebKit 275184's repro: the @starting-style transition is applied on every one of ${ADDS} tapped adds`,
    adds.length === ADDS && ran === ADDS,
    `${adds.length} squares added, ${ran} transitioned`
  );
}

// ---- reading motion in the page --------------------------------------------

/** One element's look on one frame. */
interface Look {
  filter: string;
  opacity: number;
  scale: string;
  transform: string;
  translate: string;
}
/**
 * What a watch read, every 16ms from the first read that found `selector`:
 * each matched element's look as its computed style says it then (the
 * engine's animation clock, whether or not a frame was drawn), and the
 * longest gap between two animation frames the page ran meanwhile.
 */
interface Watched {
  /** Each element's runs on the read it was first found, as `kind property duration`. */
  first: string[][];
  /** How long after the watch began the first match stood, in ms; null when none did. */
  found: number | null;
  /** The longest gap between two `requestAnimationFrame` callbacks while it read, in ms. */
  frameGap: number;
  /** Each read: when, each element's look, and the visual viewport's height (the keyboard's room). */
  frames: { looks: Look[]; t: number; vh: number }[];
}

/**
 * In the page: waits up to `waitMs` for `selector`, then reads every
 * element it matches (its `pseudo` element, when one is named) every 16ms
 * for `forMs`. Read on a timer, not on
 * animation frames: a computed style answers the animation's value at the
 * moment it is read, so the clock is read even where no frame is drawn, and
 * the frames drawn are counted beside it.
 */
function watch(
  selector: string,
  waitMs: number,
  forMs: number,
  pseudo: string | null = null
) {
  return new Promise<Watched>((resolve) => {
    const began = performance.now();
    let start: number | null = null;
    const out: Watched = { first: [], frames: [], found: null, frameGap: 0 };
    let lastFrame: number | null = null;
    let reading = true;
    const tick = (at: number) => {
      if (start !== null && lastFrame !== null) {
        out.frameGap = Math.max(out.frameGap, Math.round(at - lastFrame));
      }
      lastFrame = at;
      if (reading) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
    const seen = new Map<Element, number>();
    const runs = (el: Element) =>
      (pseudo
        ? el
            .getAnimations({ subtree: true })
            .filter(
              (run) =>
                (run.effect as KeyframeEffect | null)?.pseudoElement === pseudo
            )
        : el.getAnimations()
      ).map((run) => {
        const named = run as Animation & {
          animationName?: string;
          transitionProperty?: string;
        };
        const timing = run.effect?.getComputedTiming();
        return `${run.constructor.name} ${named.transitionProperty ?? named.animationName ?? ""} ${Math.round(Number(timing?.duration ?? 0))}`;
      });
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: it runs in the page inside one serialized function, so its steps stand in it
    const frame = () => {
      const now = performance.now();
      const els = [...document.querySelectorAll(selector)];
      if (start === null && els.length > 0) {
        start = now;
        out.found = Math.round(now - began);
      }
      if (start !== null) {
        for (const el of els) {
          if (!seen.has(el)) {
            seen.set(el, seen.size);
            out.first.push(runs(el));
          }
        }
        out.frames.push({
          t: Math.round(now - start),
          vh: Math.round(visualViewport?.height ?? innerHeight),
          looks: els.map((el) => {
            const style = getComputedStyle(el, pseudo);
            return {
              opacity: Number(style.opacity),
              filter: style.filter,
              translate: style.translate,
              scale: style.scale,
              transform: style.transform,
            };
          }),
        });
      }
      const done = start === null ? now - began > waitMs : now - start > forMs;
      if (done) {
        reading = false;
        resolve(out);
      } else {
        setTimeout(frame, 16);
      }
    };
    frame();
  });
}

/** A `blur(Npx)` filter's radius; 0 for none. */
const blurOf = (filter: string) => {
  const m = filter.match(BLUR);
  return m ? Number(m[1]) : 0;
};

/** The frame at or after `ms` (the last when none is). */
const frameAt = (w: Watched, ms: number) =>
  w.frames.find((f) => f.t >= ms) ?? w.frames.at(-1);

/** The watch in words: each element's opacity and blur at a few points. */
const blurWords = (w: Watched, points: number[]) =>
  points
    .map((ms) => {
      const f = frameAt(w, ms);
      return `${f?.t ?? "-"}ms ${(f?.looks ?? [])
        .map((l) => `${l.opacity.toFixed(2)}/${blurOf(l.filter).toFixed(2)}px`)
        .join(" ")}`;
    })
    .join("; ");

/** The watch in words: the surface's opacity, translate and scale at a few points. */
const lookWords = (w: Watched, points: number[]) =>
  points
    .map((ms) => {
      const f = frameAt(w, ms);
      const l = f?.looks[0];
      return l
        ? `${f.t}ms opacity ${l.opacity.toFixed(2)} translate ${l.translate} scale ${l.scale}`
        : `${ms}ms -`;
    })
    .join("; ");

/**
 * Whether a blur ran on every element the watch read: an early frame
 * blurred part way (a radius strictly between 0 and `most`, never snapped),
 * and the last frame clear and opaque.
 */
const blurRan = (w: Watched, most: number) => {
  const count = w.first.length;
  if (count === 0 || w.frames.length === 0) {
    return false;
  }
  const last = w.frames.at(-1)?.looks ?? [];
  return Array.from({ length: count }, (_, i) => i).every(
    (i) =>
      w.frames.some((f) => {
        const r = blurOf(f.looks[i]?.filter ?? "none");
        return r > 0.05 && r < most - 0.05;
      }) &&
      blurOf(last[i]?.filter ?? "none") === 0 &&
      (last[i]?.opacity ?? 0) > 0.99
  );
};

/**
 * Whether a surface came in by CSS transitions: it held them from its first
 * frame (none a script's animation), a frame read its opacity part way, and
 * it stands whole at the end.
 */
const transitioned = (w: Watched) => {
  const first = w.first[0] ?? [];
  const last = w.frames.at(-1)?.looks[0];
  return (
    first.some((run) => run.startsWith("CSSTransition opacity")) &&
    !first.some((run) => run.startsWith("Animation ")) &&
    w.frames.some(
      (f) =>
        (f.looks[0]?.opacity ?? 1) > 0.02 && (f.looks[0]?.opacity ?? 1) < 0.98
    ) &&
    (last?.opacity ?? 0) > 0.99
  );
};

const POINTS = [0, 50, 100, 150, 200, 300, 450, 700];

async function keep(on: On, leg: string, value: unknown): Promise<void> {
  await mkdir(on.kit.out, { recursive: true });
  await writeFile(
    join(on.kit.out, `${on.tag}-${leg}.json`),
    JSON.stringify(value, null, 1)
  );
}

// ---- the fleet ---------------------------------------------------------------

const ASK = "PROBE-LONG-ASK";
const SLOW = "PROBE-SLOW";
const DESCRIPTION = "Slim the exports to text and file lists";
/** The owner's command's shape, some 1,000 characters (safari-long-ask's). */
const COMMAND = [
  'O=~/.cache/cawco-orchestrator/lost-scan; ( cd ~/.worktrees/backlot-assistant && mkdir -p "$O/exports" &&',
  "git ls-files -z -- 'exports/**' | tr '\\0' '\\n' | while read -r f; do",
  'kind=$(file -b --mime-type "$f" | cut -d/ -f1); size=$(wc -c < "$f" | tr -d " ");',
  'if [ "$kind" = "text" ]; then printf "%s\\t%s\\t%s\\n" "$f" "$kind" "$size" >> "$O/exports/text.tsv";',
  'else printf "%s\\t%s\\n" "$f" "$size" >> "$O/exports/files.tsv"; fi; done;',
  'for list in "$O/exports/text.tsv" "$O/exports/files.tsv"; do [ -f "$list" ] && sort -t "$(printf \'\\t\')" -k1,1 -u "$list" -o "$list"; done;',
  'echo "text: $(wc -l < "$O/exports/text.tsv" 2>/dev/null || echo 0) files: $(wc -l < "$O/exports/files.tsv" 2>/dev/null || echo 0)";',
  'git log --since="14 days ago" --name-only --pretty=format: -- exports | sort -u | grep -v "^$" | while read -r gone; do',
  '[ -e "$gone" ] || echo "lost: $gone ($(git log -1 --format=%h --diff-filter=D -- "$gone"))"; done | tee "$O/exports/lost.txt" | head -n 40;',
  'du -sh "$O/exports" | cut -f1 | xargs -I{} echo "kept {} in $O/exports" )',
].join(" ");

/** The long ask; a turn that runs for a while; every other one, a word. */
const respond = (request: Seen): Reply => {
  if (!request.tools || request.afterTool) {
    return { everyMs: 5, words: [request.tools ? "ok" : "Probe title"] };
  }
  if (request.last.includes(ASK)) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: { command: COMMAND, description: DESCRIPTION, timeout: 300_000 },
      },
    };
  }
  if (request.last.includes(SLOW)) {
    return { everyMs: 300, words: Array.from({ length: 80 }, () => "step") };
  }
  return { everyMs: 5, words: ["ok"] };
};

interface Stood {
  /** The built dashboard against this fleet, through the bridge's front. */
  base: string;
  fleet: KitFleet;
}

async function standUp(kit: Kit, bridge: SafariBridge): Promise<Stood> {
  const jev = jevMock();
  const fleet = await kit.fleet(respond);
  fleet.standIns.typesafeUrl = jev.url;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await jevOn(fleet.base);
  return { fleet, base: bridge.front(await fleet.dashboard()) };
}

/** A session's page open in a fresh Safari, its composer drawn: the page's agent. */
async function sessionPage(
  on: On,
  base: string,
  id: string
): Promise<SafariPage> {
  const url = `${base}/session/${id}`;
  await openFresh(on.udid, url);
  const page = await on.bridge.page((href) => href.startsWith(url));
  await until(
    "the composer drawn",
    () =>
      page.run(
        (sel: string) => Boolean(document.querySelector(sel)),
        [COMPOSER]
      ),
    Boolean,
    90_000
  );
  await Bun.sleep(SETTLE_MS);
  return page;
}

// ---- long-ask: the permission card's parts ----------------------------------

const PARTS = '[data-slot="ask"] [class*="blur-(--part-blur)"]';

async function longAsk(on: On, stood: Stood): Promise<void> {
  const { fleet, base } = stood;
  const id = await fleet.spawn("claude", "Probe long ask", fleet.workdir, {
    permissionMode: "default",
  });
  const page = await sessionPage(on, base, id);
  const blur = await page.run(() =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--part-blur")
    )
  );
  const run = await answering(page, async () => {
    const watched = page.run(watch, [PARTS, 120_000, 1500], 150_000);
    await fleet.send(id, `${ASK} slim the exports`);
    return watched;
  });
  const parts = run.result;
  const card = await page.run(
    (description: string) => {
      const ask = document.querySelector('[data-slot="ask"]');
      const box = ask?.getBoundingClientRect();
      const names = [...(ask?.querySelectorAll("button") ?? [])].map(
        (b) => b.getAttribute("aria-label") ?? b.textContent?.trim() ?? ""
      );
      const text = ask?.textContent ?? "";
      return {
        drawn: Boolean(box && box.height > 0 && box.width > 0),
        described: text.includes(description),
        timeout: text.includes("300000"),
        command:
          ask?.querySelector('[data-slot="cmd-text"]')?.textContent?.length ??
          0,
        approve: names.some((n) => n.startsWith("Approve")),
        deny: names.some((n) => n.startsWith("Deny")),
      };
    },
    [DESCRIPTION]
  );
  await keep(on, "long-ask", {
    blur,
    card,
    run: { ...run, result: undefined },
    parts,
  });
  console.log(
    `  ${on.tag} long-ask: the card found ${parts.found}ms in, ${parts.first.length} parts, runs ${JSON.stringify(parts.first)}, longest gap between frames ${parts.frameGap}ms\n    opacity/blur by part: ${blurWords(parts, POINTS)}`
  );
  on.kit.check(
    `${on.tag} long-ask: the page answers a script within a second while the ask comes up and its parts animate`,
    run.longest < 1000,
    `longest round trip ${Math.round(run.longest)}ms over ${run.asked} asks`
  );
  on.kit.check(
    `${on.tag} long-ask: the composer grows into the card: the command's description, the command, its timeout, Approve and Deny drawn`,
    card.drawn &&
      card.described &&
      card.command > 0 &&
      card.timeout &&
      card.approve &&
      card.deny,
    JSON.stringify(card)
  );
  on.kit.check(
    `${on.tag} long-ask: every part comes up out of the ${blur}px blur (a frame blurred part way) and stands clear`,
    blurRan(parts, blur),
    blurWords(parts, POINTS)
  );
  // Approve, so the session goes on.
  await page
    .run(() => {
      const approve = [
        ...document.querySelectorAll('[data-slot="ask"] button'),
      ].find((b) =>
        (b.getAttribute("aria-label") ?? b.textContent ?? "")
          .trim()
          .startsWith("Approve")
      ) as HTMLButtonElement | undefined;
      approve?.click();
    })
    .catch(() => undefined);
}

// ---- queued-edit: the edit row's label and Keep it --------------------------

const QUEUED = "Then rename the branch";
const EDIT_PARTS =
  '[data-slot="edit-row"] [data-slot="what"], [data-slot="edit-row"] [data-keep]';

/** When, in the lift, the field took the focus, the keyboard's room came, and frames stopped and came again. */
interface Lift {
  before: number | null;
  focus: number | null;
  held: number | null;
  keyboard: number | null;
  room: number | null;
}

/**
 * In the page, before the lift: hears the field take the focus, the visual
 * viewport shrink for the keyboard, and the longest wait between frames
 * (`before`, the frame it followed, and `held`, the one that ended it), each
 * in ms from now.
 */
function hearLift(): void {
  const t0 = performance.now();
  const lift: Lift = {
    before: null,
    focus: null,
    held: null,
    keyboard: null,
    room: null,
  };
  (window as unknown as { __lift: Lift }).__lift = lift;
  const since = () => Math.round(performance.now() - t0);
  let last = t0;
  let longest = 0;
  const tick = (now: number) => {
    if (now - last > longest) {
      longest = now - last;
      lift.before = Math.round(last - t0);
      lift.held = Math.round(now - t0);
    }
    last = now;
    if (now - t0 < 6000) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
  document.addEventListener(
    "focusin",
    (event) => {
      if ((event.target as Element).matches('[contenteditable="true"]')) {
        lift.focus ??= since();
      }
    },
    true
  );
  visualViewport?.addEventListener("resize", () => {
    lift.keyboard ??= since();
    lift.room ??= Math.round(visualViewport?.height ?? 0);
  });
}

async function queuedEdit(on: On, stood: Stood): Promise<void> {
  const { fleet, base } = stood;
  const id = await fleet.spawn("claude", "Probe queued edit", fleet.workdir);
  const page = await sessionPage(on, base, id);
  await fleet.send(id, `${SLOW} the long turn`);
  await until(
    "the turn running",
    () => fleet.instance(id),
    (instance) => instance?.turn_open_at !== null,
    60_000
  );
  await fleet.send(id, QUEUED);
  await Bun.sleep(1500);
  const blur = await page.run(() =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--part-blur")
    )
  );
  // A person's way on a phone: a tap on the queued message shows its row's
  // actions, and its Edit lifts it into the field.
  const offset = await viewportOnScreen(on.udid, page);
  const queued = await page.run(
    (words: string) => {
      const bubble = [...document.querySelectorAll("[data-message]")].find(
        (at) => at.textContent?.includes(words)
      );
      if (!bubble) {
        return null;
      }
      bubble.setAttribute("data-probe-queued", "");
      bubble.scrollIntoView({ block: "center" });
      return true;
    },
    [QUEUED]
  );
  if (!queued) {
    on.kit.check(`${on.tag} queued-edit: the queued message is drawn`, false);
    return;
  }
  await Bun.sleep(400);
  await tapOn(
    on,
    page,
    offset,
    "[data-probe-queued] [data-slot=bubble], [data-probe-queued]"
  );
  await Bun.sleep(600);
  await page.run(hearLift);
  const run = await answering(page, async () => {
    const watched = page.run(watch, [EDIT_PARTS, 10_000, 1200], 30_000);
    await tapOn(
      on,
      page,
      offset,
      `[data-probe-queued] button[aria-label="${transcriptWords.editMessage}"]`
    );
    return watched;
  });
  const parts = run.result;
  const heard = await page.run(
    () => (window as unknown as { __lift: Lift }).__lift
  );
  const row = await page.run(() => {
    const at = document.querySelector('[data-slot="edit-row"]');
    const box = at?.getBoundingClientRect();
    return {
      drawn: Boolean(box && box.height > 0),
      words: at?.querySelector('[data-slot="what"]')?.textContent?.trim() ?? "",
    };
  });
  await keep(on, "queued-edit", {
    blur,
    row,
    run: { ...run, result: undefined },
    parts,
  });
  console.log(
    `  ${on.tag} queued-edit: the row found ${parts.found}ms in, ${parts.first.length} parts, runs ${JSON.stringify(parts.first)}, longest gap between frames ${parts.frameGap}ms\n    opacity/blur by part: ${blurWords(parts, POINTS)}`
  );
  on.kit.check(
    `${on.tag} queued-edit: the page answers a script within a second while the row comes up`,
    run.longest < 1000,
    `longest round trip ${Math.round(run.longest)}ms over ${run.asked} asks`
  );
  on.kit.check(
    `${on.tag} queued-edit: the edit row draws, saying what it is`,
    row.drawn && row.words.length > 0,
    JSON.stringify(row)
  );
  const last = parts.frames.at(-1);
  const blurred = parts.frames.some((f) =>
    f.looks.some((l) => blurOf(l.filter) > 0)
  );
  on.kit.check(
    `${on.tag} queued-edit: its label and Keep it come up with no filter and stand whole`,
    !blurred &&
      parts.first.length > 0 &&
      (last?.looks ?? []).every((l) => l.opacity > 0.99),
    blurWords(parts, POINTS)
  );
  // Where the page went without a frame: from the focus the lift puts in
  // the field to the keyboard's room reaching the page.
  on.kit.note(
    `${on.tag} queued-edit: the longest gap between frames ${parts.frameGap}ms; the field took the focus at ${heard.focus ?? "-"}ms, the keyboard's room reached the page at ${heard.keyboard ?? "-"}ms (the visual viewport ${heard.room ?? "-"}px), and the frame before it came at ${heard.held ?? "-"}ms after one at ${heard.before ?? "-"}ms`
  );
}

// ---- entrances: popover, menu, / menu ---------------------------------------

async function entrance(
  on: On,
  page: SafariPage,
  what: string,
  surface: string,
  act: () => Promise<unknown>
): Promise<void> {
  await page.run(() => {
    const heard: string[] = [];
    (window as unknown as { __heard: string[] }).__heard = heard;
    for (const type of ["pointerdown", "pointerup", "click", "touchend"]) {
      document.addEventListener(
        type,
        (event) => {
          const at = event.target instanceof Element ? event.target : null;
          heard.push(
            `${type} ${(event as PointerEvent).pointerType ?? ""} on ${at?.tagName.toLowerCase()}[${at?.getAttribute("data-open") ?? at?.getAttribute("data-slot") ?? ""}]`
          );
        },
        true
      );
    }
  });
  const watched = page.run(watch, [surface, 8000, 700], 20_000);
  await act();
  const w = await watched;
  if (w.found === null) {
    console.log(
      `  ${on.tag} ${what}: heard ${JSON.stringify(await page.run(() => (window as unknown as { __heard: string[] }).__heard))}`
    );
    // What stands open instead, and what the page says of the act.
    const open = await page.run(() =>
      [...document.querySelectorAll("[data-state=open], [aria-expanded=true]")]
        .map(
          (el) =>
            `${el.tagName.toLowerCase()} ${el.getAttribute("data-slot") ?? ""} ${el.getAttribute("aria-expanded") ?? ""}`
        )
        .slice(0, 12)
    );
    console.log(
      `  ${on.tag} ${what}: not found; open now: ${JSON.stringify(open)}`
    );
  }
  await keep(on, `entrance-${what.replaceAll(NON_WORD, "-")}`, w);
  console.log(
    `  ${on.tag} ${what}: found ${w.found}ms in, runs ${JSON.stringify(w.first[0] ?? [])}, longest gap between frames ${w.frameGap}ms\n    ${lookWords(w, POINTS)}`
  );
  on.kit.check(
    `${on.tag} ${what}: comes in by its @starting-style transitions (CSS transitions from its first frame, opacity part way, whole at the end)`,
    transitioned(w),
    `runs ${JSON.stringify(w.first[0] ?? [])}; ${lookWords(w, POINTS)}`
  );
}

async function entrances(on: On, stood: Stood): Promise<void> {
  const bench = on.bridge.front(await on.kit.built());
  for (const [kind, surface] of [
    ["popover", '[data-slot="popover-content"][data-state="open"]'],
    ["dropdown-menu", '[data-slot="dropdown-menu-content"][data-state="open"]'],
  ] as const) {
    const url = `${bench}/motion/overlays?only=${kind}`;
    await openFresh(on.udid, url);
    const page = await on.bridge.page((href) => href.startsWith(url));
    await Bun.sleep(SETTLE_MS);
    const offset = await viewportOnScreen(on.udid, page);
    await entrance(on, page, `the kit's ${kind}`, surface, () =>
      tapOn(on, page, offset, `[data-open="${kind}"]`)
    );
  }
  const { fleet, base } = stood;
  const id = await fleet.spawn("claude", "Probe slash menu", fleet.workdir);
  const page = await sessionPage(on, base, id);
  const offset = await viewportOnScreen(on.udid, page);
  await tapOn(on, page, offset, COMPOSER);
  await Bun.sleep(800);
  await entrance(on, page, "the composer's / menu", '[data-slot="menu"]', () =>
    sh(`${AXE} type '/' --udid ${on.udid} >/dev/null`)
  );
}

// ---- caw-dock: Caw's docked panel, on an iPad --------------------------------

async function cawDock(on: On, stood: Stood): Promise<void> {
  const { fleet, base } = stood;
  const home = fleet.env.HOME as string;
  const src = join(fleet.sandbox, "harbour");
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await mkdir(src, { recursive: true });
  await writeFile(join(src, "README.md"), "# Harbour site\n");
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Harbour site",
    machineId: MACHINE,
    cwd: src,
  });
  const url = `${base}/project/${project.id}`;
  await openFresh(on.udid, url);
  const page = await on.bridge.page((href) => href.startsWith(url));
  await until(
    "Caw's seat drawn",
    () =>
      page.run(() => Boolean(document.querySelector('[data-slot="caw-seat"]'))),
    Boolean,
    90_000
  );
  await Bun.sleep(SETTLE_MS);
  // A panel the page opened by itself goes away first, so its entrance is read.
  const already = await page.run(() =>
    Boolean(document.querySelector("[data-caw-dock]"))
  );
  const offset = await viewportOnScreen(on.udid, page);
  if (already) {
    await tapOn(on, page, offset, '[data-slot="caw-seat"]');
    await Bun.sleep(1200);
  }
  const watched = page.run(watch, ["[data-caw-dock]", 8000, 700], 20_000);
  await tapOn(on, page, offset, '[data-slot="caw-seat"]');
  const w = await watched;
  await keep(on, "caw-dock", w);
  console.log(
    `  ${on.tag} Caw's docked panel: found ${w.found}ms in, runs ${JSON.stringify(w.first[0] ?? [])}, longest gap between frames ${w.frameGap}ms\n    ${lookWords(w, POINTS)}`
  );
  const rise = (l: Look | undefined) =>
    Math.abs(Number.parseFloat(l?.translate ?? "") || 0);
  const last = w.frames.at(-1)?.looks[0];
  on.kit.check(
    `${on.tag} Caw's docked panel: comes in from its side as it fades (a read part way in both, whole at the end)`,
    w.frames.some(
      (f) =>
        (f.looks[0]?.opacity ?? 1) > 0.02 &&
        (f.looks[0]?.opacity ?? 1) < 0.98 &&
        rise(f.looks[0]) > 0.05
    ) &&
      (last?.opacity ?? 0) > 0.99 &&
      rise(last) < 0.05,
    `runs ${JSON.stringify(w.first[0] ?? [])}; ${lookWords(w, POINTS)}`
  );
}

// ---- desk-entrances: the other @starting-style fades, on an iPad -------------

/**
 * Whether a fade ran: a read part way (strictly between 0 and 1: a fade of
 * --dur-control on ease-out is past 0.98 a read after it starts), and whole
 * at the end.
 */
const fadedIn = (w: Watched) => {
  const last = w.frames.at(-1)?.looks[0];
  return (
    w.frames.some(
      (f) =>
        (f.looks[0]?.opacity ?? 1) > 0.001 && (f.looks[0]?.opacity ?? 1) < 0.999
    ) && (last?.opacity ?? 0) > 0.999
  );
};

/** Goes to `href` as a link on the page does: SvelteKit's own navigation. */
function follow(href: string): void {
  const link = document.createElement("a");
  link.href = href;
  document.body.append(link);
  link.click();
  link.remove();
}

/** The page at `url` in a fresh Safari, once `selector` stands in it. */
async function pageAt(
  on: On,
  url: string,
  selector: string
): Promise<SafariPage> {
  await openFresh(on.udid, url);
  const page = await on.bridge.page((href) => href.startsWith(url));
  await until(
    `${selector} drawn`,
    () =>
      page.run(
        (sel: string) => Boolean(document.querySelector(sel)),
        [selector]
      ),
    Boolean,
    90_000
  );
  await Bun.sleep(SETTLE_MS);
  return page;
}

/** Watches `selector` (its `pseudo`) while `act` runs, says it, and checks it faded in. */
async function fadeOf(
  on: On,
  page: SafariPage,
  what: string,
  selector: string,
  act: () => Promise<unknown>,
  pseudo: string | null = null
): Promise<void> {
  const watched = page.run(watch, [selector, 10_000, 700, pseudo], 25_000);
  await act();
  const w = await watched;
  await keep(on, `fade-${what.replaceAll(NON_WORD, "-")}`, w);
  console.log(
    `  ${on.tag} ${what}: found ${w.found}ms in, runs ${JSON.stringify(w.first[0] ?? [])}, longest gap between frames ${w.frameGap}ms\n    ${lookWords(w, POINTS)}`
  );
  on.kit.check(
    `${on.tag} ${what}: fades in (a read part way, whole at the end)`,
    fadedIn(w),
    `runs ${JSON.stringify(w.first[0] ?? [])}; ${lookWords(w, POINTS)}`
  );
}

/** The decision page the graph draws: two cards, the second after the first. */
const PRICING = `root = Decisions("Price the hosted plan", [shape, trial])
shape = Decision("shape", "What does a customer pay for?", [seat, machine], "A machine is what the fleet costs to run.")
seat = Option("seat", "Per seat", "Each person on the team pays.", false, [], "A solo builder pays once.")
machine = Option("machine", "Per machine", "Each machine pays.", true, [], "A team on one machine pays once.")
trial = Decision("trial", "How long is the trial?", [week, month], "A month covers a whole project.", [], ["shape"])
week = Option("week", "A week", "People decide fast.", false, [], "Too short.")
month = Option("month", "A month", "Thirty days, then pay.", true, [], "Revenue starts later.")`;

async function deskEntrances(on: On, stood: Stood): Promise<void> {
  const { fleet, base } = stood;
  const steps: [string, () => Promise<void>][] = [
    [
      "the opened-at record's mark",
      async () => {
        const id = await fleet.spawn("claude", "Probe mark", fleet.workdir);
        for (const words of ["first", "second", "third"]) {
          await fleet.send(id, words);
          await until(
            "the turn ended",
            () => fleet.instance(id),
            (instance) => instance?.turn_open_at === null,
            120_000
          );
        }
        const page = await pageAt(
          on,
          `${base}/session/${id}`,
          "[data-message]"
        );
        const record = await page.run(
          () =>
            document
              .querySelector("[data-message]")
              ?.getAttribute("data-message") ?? ""
        );
        await fadeOf(
          on,
          page,
          "the opened-at record's mark (its row's ::before)",
          '[data-row][data-marked="on"]',
          () => page.run(follow, [`/session/${id}?at=${record}`]),
          "::before"
        );
      },
    ],
    [
      "the config rail's unsaved dot",
      async () => {
        const field = "main :is(input:not([type=hidden]), textarea)";
        const page = await pageAt(on, `${base}/config/hooks/new`, field);
        const offset = await viewportOnScreen(on.udid, page);
        // The field holds the caret before a key goes in: a tap Safari
        // spent on its own bars is made again.
        const focused = () =>
          page.run(
            (sel: string) => document.activeElement?.matches(sel) ?? false,
            [field]
          );
        for (const _tap of [1, 2, 3]) {
          await tapOn(on, page, offset, field);
          await Bun.sleep(800);
          if (await focused()) {
            break;
          }
        }
        await fadeOf(
          on,
          page,
          "the config rail's unsaved dot",
          'a[data-slot="row"][href="/config/hooks"] span[title]',
          () => sh(`${AXE} type 'x' --udid ${on.udid} >/dev/null`)
        );
      },
    ],
    [
      "the canvas's corner grip",
      async () => {
        const id = await fleet.spawn("claude", "Probe grip", fleet.workdir);
        const page = await pageAt(on, `${base}/session/${id}`, COMPOSER);
        await fadeOf(
          on,
          page,
          "the canvas's corner grip",
          '[data-slot="canvas-stage"] [data-canvas-stages-grab="top-left"]',
          () =>
            page.run(
              (sel: string) => {
                const field = document.querySelector(sel) as HTMLElement | null;
                field?.focus();
                field?.dispatchEvent(
                  new KeyboardEvent("keydown", {
                    key: "D",
                    code: "KeyD",
                    metaKey: true,
                    shiftKey: true,
                    bubbles: true,
                    cancelable: true,
                  })
                );
              },
              [COMPOSER]
            )
        );
      },
    ],
    [
      "the graphs' cards",
      async () => {
        const dir = join(fleet.sandbox, "pricing-site");
        await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir}`.quiet();
        const project = await fleet.api<{ id: string }>("/api/projects", {
          name: "Pricing",
          machineId: MACHINE,
          cwd: dir,
          caw: false,
        });
        const writer = await fleet.spawn("claude", "Price the plan", dir, {
          projectId: project.id,
        });
        await fleet.api(`/api/instances/${writer}/artifacts`, {
          kind: "page",
          does: "pick",
          ask: "Pick one option on each card",
          name: "pricing",
          program: PRICING,
        });
        const first = await fleet.api<{ id: string }>(
          `/api/projects/${project.id}/tasks`,
          { title: "Write the pricing page" }
        );
        const second = await fleet.api<{ id: string }>(
          `/api/projects/${project.id}/tasks`,
          { title: "Ship the pricing page", after: [first.id] }
        );
        const page = await pageAt(
          on,
          `${base}/project/${project.id}`,
          '[role="tablist"]'
        );
        await fadeOf(
          on,
          page,
          "a decision graph's card",
          '[data-slot="decision-graph"] .svelte-flow__node-decision',
          () =>
            page.run(follow, [
              `/project/${project.id}?view=decisions&mode=graph`,
            ])
        );
        await page.run(follow, [`/project/${project.id}?view=canvas`]);
        await until(
          "the Canvas view settled",
          () =>
            page.run(() => {
              const nodes = document.querySelectorAll(
                '[data-slot="view-canvas"][data-settled] .svelte-flow__node'
              );
              for (const node of nodes) {
                node.setAttribute("data-probe-old", "");
              }
              return nodes.length;
            }),
          (n) => n >= 2,
          60_000
        );
        await Bun.sleep(800);
        await fadeOf(
          on,
          page,
          "a card new to the Canvas view",
          '[data-slot="view-canvas"][data-settled] .svelte-flow__node:not([data-probe-old])',
          () =>
            fleet.api(`/api/projects/${project.id}/tasks`, {
              title: "Announce the pricing",
              after: [second.id],
            })
        );
      },
    ],
  ];
  for (const [what, step] of steps) {
    await step().catch((error: unknown) => {
      on.kit.check(
        `${on.tag} ${what}: runs to its end`,
        false,
        String(error).split("\n")[0]
      );
    });
  }
}

// ---- the run --------------------------------------------------------------

async function onSimulator(
  kit: Kit,
  udid: string,
  run: Set<Leg>,
  bridge: SafariBridge,
  stood: () => Promise<Stood>
) {
  const tag = await runtimeOf(udid);
  console.log(`  simulator ${udid} on ${tag}`);
  const on: On = { bridge, kit, tag, udid };
  try {
    if (run.has("starting-style")) {
      await startingStyle(on);
    }
    if (run.has("long-ask")) {
      await longAsk(on, await stood());
    }
    if (run.has("queued-edit")) {
      await queuedEdit(on, await stood());
    }
    if (run.has("entrances")) {
      await entrances(on, await stood());
    }
  } finally {
    await sh(`xcrun simctl terminate ${udid} ${SAFARI} || true`).catch(
      () => ""
    );
  }
}

async function onIpad(
  kit: Kit,
  udid: string,
  run: Set<Leg>,
  bridge: SafariBridge,
  stood: () => Promise<Stood>
) {
  const tag = `${await runtimeOf(udid)}-iPad`;
  console.log(`  simulator ${udid} on ${tag}`);
  const on: On = { bridge, kit, tag, udid };
  try {
    if (run.has("caw-dock")) {
      await cawDock(on, await stood());
    }
    if (run.has("desk-entrances")) {
      await deskEntrances(on, await stood());
    }
  } finally {
    await sh(`xcrun simctl terminate ${udid} ${SAFARI} || true`).catch(
      () => ""
    );
  }
}

/** A simulator named in `env`, or a Mac slot of `choice`, for `use`. */
async function onOne(
  env: string,
  choice: Parameters<typeof macSim>[0],
  use: (udid: string) => Promise<void>
): Promise<void> {
  const named = process.env[env]?.trim();
  if (named) {
    await use(named);
    return;
  }
  const sim = await macSim(choice);
  try {
    await sh(`xcrun simctl bootstatus ${sim.udid} -b >/dev/null`);
    await use(sim.udid);
  } finally {
    await sim.release();
  }
}

const spec: Spec = {
  name: "ios-safari-motion",
  run: async (kit) => {
    const run = legs();
    const bridge = safariBridge();
    let fleet: Promise<Stood> | null = null;
    const stood = () => {
      fleet ??= standUp(kit, bridge);
      return fleet;
    };
    try {
      if ([...run].some((leg) => !IPAD_LEGS.has(leg))) {
        await onOne("PROBE_SIM_UDID", { newest: "iPhone \\d+ Pro" }, (udid) =>
          onSimulator(kit, udid, run, bridge, stood)
        );
      }
      if ([...run].some((leg) => IPAD_LEGS.has(leg))) {
        await onOne(
          "PROBE_IPAD_UDID",
          { newest: "iPad Pro 13-inch.*" },
          (udid) => onIpad(kit, udid, run, bridge, stood)
        );
      }
    } finally {
      bridge.stop();
    }
  },
};
export default spec;
