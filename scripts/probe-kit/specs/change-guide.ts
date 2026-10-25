/**
 * Guiding the person to what changed after the agent answered him (the
 * owner's pick: B, change lines in each thread and the rail as the inbox,
 * with C's chip in the transcript and a pinging ring in place of the green
 * fill; DESIGN.md, Changed since you looked), on a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model, which calls the
 * tools each PROBE-CALL names) and the built dashboard, at 390, 680 and
 * 1440, in Chromium and WebKit. Each leg makes its own page; at 680 it is
 * loaded with the panel shut first, and a press on the turn's artifact card
 * mounts the pane with the page drawn.
 *
 * 1. The person pins two elements: the headline (its pill on the
 *    headline's top-right corner) and a paragraph, in the middle of its
 *    second line. Both go to the session by themselves.
 * 2. The agent replies to the headline's comment and changes the page: the
 *    headline rewritten, the button moved under it and relabelled, and the
 *    paragraph under the second comment rewritten with no answer.
 * 3. Read from the engine:
 *    - each changed element wears the ring (`c-change-ring`) outside its
 *      own box, with no fill anywhere in the change layer;
 *    - the ring's ping plays once as the change lands, read by holding and
 *      seeking its clock (Chromium: the DevTools Animation domain on the
 *      preview's own target; WebKit: held in the page, as kit `readMotion`
 *      holds it there); under reduced motion the ring stands and no ping
 *      plays;
 *    - coming back (a reload), the rail opens itself on To check: the
 *      answered comment first, "changed, no answer" second;
 *    - the paragraph's pill, made mid-line, covers no word of the page;
 *    - a second revision carries what he hasn't looked at forward under
 *      its own revision, beside what it changed;
 *    - a To check row pressed opens its thread, whose change line says
 *      before → after (a "before" past 200 characters folds to three lines
 *      with More, which opens it in place to every word), the card standing clear of the element's box (on a
 *      phone, the foot sheet clear of it), and the row leaves To check;
 *    - a third comment, a 40-word line on the foot, answered in three
 *      paragraphs: the comment_reply's row shows the exchange whole (his
 *      words and the reply, word for word, selectable), nothing in it
 *      clamped, its overflow sweep 0 at this width, and resting the mouse
 *      on its pin chip opens no peek; resolved with no words, then reopened
 *      by him with more words and answered again, the resolve's row shows
 *      the thread as it stood at the resolve, none of what came after;
 *    - the agent's turn carries a chip for each spot it changed and for the
 *      comment it answered; the paragraph's chip opens the panel scrolled
 *      to it, its thread open;
 *    - Ask again (the desk's Chromium leg) delivers the comment to the
 *      session again, whole;
 *    - no page said an error.
 *
 *   bun scripts/probe-kit/run.ts change-guide
 *   bun scripts/probe-kit/run.ts change-guide --engine webkit   # one engine's legs
 */
import type { CDPSession, Frame, Page } from "playwright-core";
import type { Pin } from "../../../packages/core/src/comments";
import { artifactToolWords } from "../../../packages/core/src/words/artifact-tools";
import { commentWords } from "../../../packages/core/src/words/comments";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import {
  COMPOSER,
  type Engine,
  type Kit,
  open,
  type Spec,
  settle,
  VIEWS,
  type View,
} from "../kit";
import { pagePins, writePagePins } from "../pins";

const CREATE = "mcp__cawco__artifact_create";
const UPDATE = "mcp__cawco__artifact_update";
const REPLY = "mcp__cawco__comment_reply";
const RESOLVE = "mcp__cawco__comment_resolve";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
/** The person's comments, delivered by themselves (core injected.ts `artifactCommentsNotice`). */
const NOTICE = /\[CawCo\] The person commented on the page/;
/** The pane's page frame. */
const FRAME = 'iframe[title="Preview"]';
const RAIL = '[data-slot="comment-rail"]';
/** A ring's ping, as the overlay names its Web Animation (preview-overlay changes.ts `PING`). */
const PING = "cawco-change-ping";
/** A box-shadow's spread, its last length. */
const SPREAD = /(-?[\d.]+)px\s*$/;
const SPACES = /\s+/;

const HEADLINE =
  "A self-hosted control plane that puts every AI coding agent on every machine on one board";
/** The paragraph's words as first written: past 200 characters, so its change line's "before" runs past the line's three lines. */
const COPY =
  "Claude Code, OpenCode and pi sessions across every machine you own, on one board you can steer from your desk or your phone, every ask of theirs waiting in one place, every answer they need from you a press away, wherever you are.";

/** The person's comment on the headline: a 40-word line. */
const ASKED =
  "Too long for a headline that has to land in a second: say what it does in six words, keep the board and the phone, and drop the list of harnesses, which belongs in the paragraph right under it instead.";
/** The agent's answer to it: several paragraphs, read back whole from its transcript row. */
const ANSWER = [
  "Shortened it to six words, One board for every agent. The old line named every harness and every machine, which the paragraph under it already does, so the headline now says only what the product is.",
  "Moved the button under the headline and relabelled it Connect a machine, since connecting one is the first thing anyone does on a fresh hub, and Get started said nothing about what starts.",
  "The paragraph under your second comment changed too, but that one is not answered yet: it needs your pick between one real session and the whole board before I go further with it.",
].join("\n\n");
const WHITESPACE = /\s+/g;
/** What he writes on pin 3 after reopening it, and the agent's answer to that. */
const LATER_ASK = "One more thing: say it on the phone too.";
const LATER_ANSWER = "Said it on the phone too, under the headline.";

/** The page as each revision has it: first, the agent's answer, a later change no one asked for. */
const page = (leg: string, revision: 1 | 2 | 3) => {
  const headline = revision === 1 ? HEADLINE : "One board for every agent";
  const copy =
    revision === 1
      ? COPY
      : "One real session, live, instead of the whole board.";
  const cta = `<button id="cta" style="font:inherit;padding:8px 16px;border-radius:8px">${revision === 1 ? "Get started" : "Connect a machine"}</button>`;
  const foot =
    revision === 3 ? "Free for every machine you own." : "Free while in beta.";
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 18px/1.6 system-ui; }
  main { padding: 24px; }
  h1 { font-size: 28px; line-height: 1.25; margin: 0 0 24px; border-radius: 6px; }
  p { margin: 0 0 24px; }
  .tall { height: 1400px; }
</style></head>
<body data-leg="${leg}"><main>
  <h1 id="headline">${headline}</h1>
  ${revision === 1 ? "" : cta}
  <p id="copy">${copy}</p>
  ${revision === 1 ? cta : ""}
  <p id="foot">${foot}</p>
  <div class="tall"></div>
</main></body></html>`;
};

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
/** Every message the session was sent, as the model read it. */
const heard: string[] = [];

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  heard.push(request.last);
  if (NOTICE.test(request.last) && !request.afterTool) {
    return text("Heard the comments.");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

const meets = (a: Box, b: Box) =>
  a.x < b.x + b.w - 0.5 &&
  b.x < a.x + a.w - 0.5 &&
  a.y < b.y + b.h - 0.5 &&
  b.y < a.y + a.h - 0.5;

interface Fleet {
  base: string;
  call: (tool: string, input: object) => Promise<string>;
  session: string;
}

const setUp = async (kit: Kit): Promise<Fleet> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Change guide", fleet.repo);
  let sent = 0;
  const call = async (tool: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, {
      name: tool,
      input: { response_format: "detailed", ...input },
    });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  return { base: await fleet.dashboard(), call, session };
};

/** The frame that shows leg `leg`'s page now; null while none does. */
const shownFrame = async (screen: Page, leg: string): Promise<Frame | null> => {
  // No frame on the page is none shown: never waited for.
  if ((await screen.locator(FRAME).count()) === 0) {
    return null;
  }
  const frame = await (
    await screen.locator(FRAME).first().elementHandle({ timeout: 2000 })
  )?.contentFrame();
  const on = await frame
    ?.evaluate(
      (want) =>
        document.body?.dataset.leg === want &&
        !!document.querySelector("#headline") &&
        !!(window as unknown as { cawcoArtifact?: unknown }).cawcoArtifact,
      leg
    )
    .catch(() => false);
  return on && frame ? frame : null;
};

/**
 * The pane's page frame once it shows leg `leg`'s page. Where the window
 * keeps the panel shut until it is asked for (680: the conversation takes
 * the window), the turn's own artifact card opens it, as a person does.
 */
const legFrame = async (
  screen: Page,
  leg: string,
  what: string,
  artifact?: string
): Promise<Frame> => {
  const soon = await until(
    what,
    () => shownFrame(screen, leg),
    Boolean,
    artifact ? 8000 : 60_000
  ).catch(() => null);
  if (soon) {
    return soon;
  }
  const pressed = await screen
    .locator(
      `[data-slot="preview-tool"][data-artifact="${artifact}"] [data-slot="artifact-open"]`
    )
    .last()
    .click({ timeout: 10_000 })
    .then(() => "pressed")
    .catch((error: Error) => error.message.slice(0, 400));
  const opened = await until(
    `${what}, opened from its turn`,
    () => shownFrame(screen, leg),
    Boolean,
    60_000
  ).catch(() => null);
  if (!opened) {
    const there = await screen.evaluate(
      (press) => ({
        frames: [...document.querySelectorAll("iframe")].map(
          (one) => `${one.title} ${one.getBoundingClientRect().width}`
        ),
        tools: document.querySelectorAll('[data-slot="preview-tool"]').length,
        pane: !!document.querySelector(
          ':is([data-slot="preview-pane"], [data-side-card="preview"])'
        ),
        host: document
          .querySelector('[data-slot="preview-sheet-host"]')
          ?.getAttribute("style"),
        sheet: !!document.querySelector("[data-preview-sheet]"),
        composer: !!document.querySelector('[data-slot="composer"]'),
        width: innerWidth,
        pressed: press,
        url: location.href,
      }),
      pressed
    );
    throw new Error(`${what}: no frame shows it (${JSON.stringify(there)})`);
  }
  return opened;
};

/** The page doc's maps a leg reads, as plain data. */
const docRead = (frame: Frame) =>
  frame.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: { getMap: (n: string) => { toJSON: () => unknown } };
        };
      }
    ).cawcoArtifact;
    const meta = doc.getMap("meta").toJSON() as {
      changes?: {
        items: {
          anchor: string;
          answered?: boolean;
          before?: string;
          label: string;
          pin?: string;
          revision?: number;
        }[];
        revision: number;
      };
    };
    return {
      changes: meta.changes ?? null,
      seen: doc.getMap("seen").toJSON() as Record<string, string[]>,
      deliveries: doc.getMap("deliveries").toJSON() as Record<
        string,
        { sentAt?: string }
      >,
    };
  });

/** The rings in the page: each one's anchor, line colour, fill and box, its element's box, and whether anything in the change layer is filled. */
const ringsOf = (frame: Frame) =>
  frame.evaluate(() => {
    const layer = document.querySelector("[data-cawco-changes]");
    const filled = [...(layer?.querySelectorAll("*") ?? [])].filter((el) => {
      const ground = getComputedStyle(el).backgroundColor;
      return !(ground === "rgba(0, 0, 0, 0)" || ground === "transparent");
    }).length;
    const probe = document.createElement("span");
    probe.style.color = "var(--c-change-ring)";
    document.querySelector("cawco-overlay")?.shadowRoot?.append(probe);
    const token = getComputedStyle(probe).color;
    probe.remove();
    return {
      filled,
      token,
      rings: [...(layer?.querySelectorAll<HTMLElement>("[data-change]") ?? [])]
        .filter((ring) => !ring.hasAttribute("data-leaving"))
        .map((ring) => {
          const anchor = ring.getAttribute("data-change") ?? "";
          const el = document.querySelector(anchor)?.getBoundingClientRect();
          const r = ring.getBoundingClientRect();
          const own = getComputedStyle(ring);
          return {
            anchor,
            line: own.borderTopColor,
            width: Number.parseFloat(own.borderTopWidth),
            ring: { x: r.x, y: r.y, w: r.width, h: r.height },
            el: el ? { x: el.x, y: el.y, w: el.width, h: el.height } : null,
          };
        }),
    };
  });

/** A pin written into the page's doc as the overlay writes a person's comment, at `point` on its element. */
const pinOn = async (
  frame: Frame,
  number: number,
  selector: string,
  text: string,
  point: { x: number; y: number }
): Promise<string> => {
  const id = crypto.randomUUID();
  const at = new Date().toISOString();
  const words = await frame.evaluate(
    (sel) => document.querySelector(sel)?.textContent?.trim() ?? "",
    selector
  );
  const pin: Pin = {
    id,
    number,
    kind: "comment",
    anchor: { selector, source: null, text: words.slice(0, 200) },
    at,
    by: "person",
    elements: [],
    point,
    title: words.slice(0, 60),
    thread: [{ id: crypto.randomUUID(), by: "person", text, at }],
  };
  await writePagePins(frame, pin);
  return id;
};

/** The middle of the paragraph's second line, as a point on its box (fractions). */
const midSecondLine = (frame: Frame) =>
  frame.evaluate(() => {
    const el = document.querySelector("#copy") as Element;
    const box = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = [...range.getClientRects()].sort((a, b) => a.top - b.top);
    const second = lines.find((r) => r.top > (lines[0]?.bottom ?? 0) - 1);
    const line = second ?? lines[0];
    if (!line) {
      return { x: 0.5, y: 0.5 };
    }
    return {
      x: (line.left + line.width / 2 - box.left) / box.width,
      y: (line.top + line.height / 2 - box.top) / box.height,
    };
  });

/** Pin `n`'s pill on the page and every box of the page's words, in the page's viewport. */
const pillAndWords = (frame: Frame, n: number) =>
  frame.evaluate((number) => {
    const face = document.querySelector(
      `:is(svg[data-cawco-pins], svg[data-cawco-pins-fixed]) g[data-pin="${number}"] [data-face]`
    );
    const r = face?.getBoundingClientRect();
    const words: { h: number; w: number; x: number; y: number }[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const one of range.getClientRects()) {
        if (one.width > 0 && one.height > 0) {
          words.push({ x: one.x, y: one.y, w: one.width, h: one.height });
        }
      }
    }
    return {
      pill: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      words,
    };
  }, n);

/** What the recorder keeps in each frame: the pings made, and those held while a read holds them. */
interface ProbeWindow {
  probeHeld?: Animation[];
  probeHold?: boolean;
  probePings?: number;
}

/**
 * Started in every frame of a leg's page before its own scripts: each ring's
 * ping (`Element.animate` on a `[data-ping]` halo) is counted, and held at
 * its start while a read asks (`probeHold`). Where Playwright gives no
 * DevTools clock (WebKit), this is the clock the read seeks.
 */
const HOLD_PINGS = () => {
  const probe = window as unknown as ProbeWindow;
  const { animate } = Element.prototype;
  probe.probePings = 0;
  Element.prototype.animate = function (this: Element, ...args) {
    const made = animate.apply(this, args);
    if (this.hasAttribute("data-ping")) {
      probe.probePings = (probe.probePings ?? 0) + 1;
      if (probe.probeHold) {
        made.pause();
        probe.probeHeld?.push(made);
      }
    }
    return made;
  };
};

/**
 * The pings an action starts in the preview, held at their start and read
 * at 0, a half and the end of their run: the halo's opacity and its
 * shadow's spread there. Chromium: the DevTools Animation domain on the
 * preview's own target (`Animation.setPaused`, `Animation.seekAnimations`).
 * WebKit, which Playwright gives none: held in the page, each run its
 * `Element.animate` returns paused and sought (kit `readMotion`'s way there).
 */
const readPings = async (
  screen: Page,
  frame: Frame,
  engine: Engine,
  action: () => Promise<unknown>,
  wait = 15_000
): Promise<{ at: { opacity: number; spread: number }[]; target: string }[]> => {
  const readAt = (fraction: number) =>
    frame.evaluate(
      ({ name, fraction: f, spreadAt }) =>
        [...document.querySelectorAll("[data-cawco-changes] [data-ping]")]
          .flatMap((one) =>
            one.getAnimations().filter((run) => run.id === name)
          )
          .map((run) => {
            const halo = (run.effect as KeyframeEffect).target as HTMLElement;
            const own = getComputedStyle(halo);
            const spread = own.boxShadow.match(new RegExp(spreadAt))?.[1];
            return {
              target:
                halo.parentElement?.getAttribute("data-change") ?? "unknown",
              f,
              opacity: Number(own.opacity),
              spread: Number(spread ?? 0),
            };
          }),
      { name: PING, fraction, spreadAt: SPREAD.source }
    );
  const runs = new Map<
    string,
    { at: { opacity: number; spread: number }[]; target: string }
  >();
  const record = (read: Awaited<ReturnType<typeof readAt>>) => {
    for (const one of read) {
      const run = runs.get(one.target) ?? { target: one.target, at: [] };
      run.at.push({ opacity: one.opacity, spread: one.spread });
      runs.set(one.target, run);
    }
  };
  if (engine === "chromium") {
    let cdp: CDPSession;
    try {
      cdp = await screen.context().newCDPSession(frame);
    } catch {
      cdp = await screen.context().newCDPSession(screen);
    }
    const caught = new Map<string, { duration: number; name: string }>();
    cdp.on(
      "Animation.animationStarted",
      (event: {
        animation: { id: string; name: string; source?: { duration: number } };
      }) => {
        const { animation } = event;
        if (animation.name !== PING) {
          return;
        }
        caught.set(animation.id, {
          name: animation.name,
          duration: animation.source?.duration ?? 0,
        });
        cdp
          .send("Animation.setPaused", {
            animations: [animation.id],
            paused: true,
          })
          .catch(() => undefined);
      }
    );
    await cdp.send("Animation.enable");
    await action();
    await until("the pings started", () => caught.size, Boolean, wait).catch(
      () => 0
    );
    await settle(screen, 300);
    const ids = [...caught.keys()];
    const duration = Math.max(
      ...[...caught.values()].map((one) => one.duration)
    );
    for (const fraction of [0, 0.5, 1]) {
      if (ids.length === 0) {
        break;
      }
      // biome-ignore lint/performance/noAwaitInLoops: each fraction sought, then read
      await cdp.send("Animation.seekAnimations", {
        animations: ids,
        currentTime: Math.min(duration * fraction, duration - 1),
      });
      record(await readAt(fraction));
    }
    if (ids.length > 0) {
      await cdp.send("Animation.setPaused", { animations: ids, paused: false });
    }
    await cdp.send("Animation.disable").catch(() => undefined);
    await cdp.detach().catch(() => undefined);
    return [...runs.values()];
  }
  // WebKit: each ping held as `Element.animate` makes it (the recorder this page's frames start with, {@link HOLD_PINGS}).
  await frame.evaluate(() => {
    const probe = window as unknown as ProbeWindow;
    probe.probeHeld = [];
    probe.probeHold = true;
  });
  await action();
  await until(
    "the pings started",
    () =>
      frame.evaluate(
        () => (window as unknown as ProbeWindow).probeHeld?.length ?? 0
      ),
    Boolean,
    wait
  ).catch(() => 0);
  await settle(screen, 300);
  for (const fraction of [0, 0.5, 1]) {
    // biome-ignore lint/performance/noAwaitInLoops: each fraction sought, then read
    await frame.evaluate((f) => {
      for (const held of (window as unknown as ProbeWindow).probeHeld ?? []) {
        const end = Number(held.effect?.getComputedTiming().endTime ?? 0);
        held.currentTime = Math.min(end * f, end - 1);
      }
    }, fraction);
    record(await readAt(fraction));
  }
  await frame.evaluate(() => {
    const probe = window as unknown as ProbeWindow;
    probe.probeHold = false;
    for (const held of probe.probeHeld ?? []) {
      held.play();
    }
  });
  return [...runs.values()];
};

/** Whether a ping read as it should: 0.6 opaque at its start and spreading out, gone at its end. */
const pingRuns = (read: {
  at: { opacity: number; spread: number }[];
}): boolean => {
  const [start, half, end] = read.at;
  return (
    !!(start && half && end) &&
    Math.abs(start.opacity - 0.6) < 0.05 &&
    half.opacity < start.opacity &&
    half.spread > start.spread &&
    end.opacity < 0.05 &&
    end.spread >= half.spread
  );
};

/** The rows of the rail's To check: each pin's number and its words. */
const toCheckRows = (screen: Page) =>
  screen.evaluate(
    ({ rail, spaces }) =>
      [
        ...document.querySelectorAll(
          `${rail} [data-slot="to-check"] > li:has([data-pin-row])`
        ),
      ].map((row) => ({
        n: Number(
          row.querySelector("[data-pin-row]")?.getAttribute("data-pin-row")
        ),
        said:
          row.textContent?.replace(new RegExp(spaces, "g"), " ").trim() ?? "",
      })),
    { rail: RAIL, spaces: SPACES.source }
  );

interface Leg {
  engine: Engine;
  view: View;
}

const LEGS: Leg[] = [
  { engine: "chromium", view: "desk" },
  { engine: "chromium", view: "narrowDesk" },
  { engine: "chromium", view: "phone" },
  { engine: "webkit", view: "desk" },
  { engine: "webkit", view: "narrowDesk" },
  { engine: "webkit", view: "phone" },
];

/** One leg as it goes: its page, its artifact, its pins, the frame showing it now, and what its stages read. */
interface On {
  check: (what: string, ok: boolean, detail?: string) => boolean;
  fleet: Fleet;
  frame: Frame;
  id: string;
  key: string;
  leg: Leg;
  /** Pin 1's id (the headline) and pin 2's (the paragraph). */
  pins: [string, string];
  /** The update's revision, once it landed. */
  revision: number;
  said: string[];
  screen: Page;
  url: string;
}

/** The leg's page and its hero, with the two comments made: the headline's at its top-right corner, the paragraph's mid-line. */
const madeLeg = async (kit: Kit, fleet: Fleet, leg: Leg): Promise<On> => {
  const name = `${leg.engine} ${VIEWS[leg.view].width}`;
  // An artifact's name is lower case (artifact_create's `name`).
  const key = `${leg.engine}-${leg.view}`.toLowerCase();
  const screen = await kit.page(leg.view, { engine: leg.engine });
  await screen.addInitScript(HOLD_PINGS);
  const said: string[] = [];
  screen.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  screen.on("console", (message) => {
    if (message.type() === "error") {
      said.push(`error: ${message.text()}`);
    }
  });
  const url = `${fleet.base}/session/${fleet.session}`;
  await open(screen, url, COMPOSER);
  const made = await fleet.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Pin what reads wrong on the hero",
    name: `hero-${key}`,
    html: page(key, 1),
  });
  const id = made.match(ANSWERED_ID)?.[1] ?? "";
  if (!id) {
    throw new Error(`the hero was not made: ${made.slice(0, 600)}`);
  }
  const frame = await legFrame(screen, key, "the hero in the panel", id);
  await settle(screen, 400);
  const headline = await pinOn(
    frame,
    1,
    "#headline",
    "Too long. Say what it does in six words.",
    { x: 0.98, y: 0.1 }
  );
  const paragraph = await pinOn(
    frame,
    2,
    "#copy",
    "Can this show one real session instead of the whole board?",
    await midSecondLine(frame)
  );
  return {
    check: (what, ok, detail) => kit.check(`${name}: ${what}`, ok, detail),
    fleet,
    frame,
    id,
    key,
    leg,
    pins: [headline, paragraph],
    revision: 0,
    said,
    screen,
    url,
  };
};

/** 1. Both comments go by themselves, and the one made mid-line covers no word. */
const madeChecks = async (on: On) => {
  const [headline, paragraph] = on.pins;
  const delivered = await until(
    "both comments delivered",
    async () => (await docRead(on.frame)).deliveries,
    (all) => !!(all[headline]?.sentAt && all[paragraph]?.sentAt),
    60_000
  ).catch(() => null);
  on.check("both comments went to the session by themselves", !!delivered);
  const midLine = await until(
    "pin 2's pill drawn",
    () => pillAndWords(on.frame, 2),
    (read) => !!read.pill,
    10_000
  ).catch(() => null);
  const pill = midLine?.pill ?? null;
  const covered = pill
    ? (midLine?.words ?? []).filter((box) => meets(box, pill))
    : [];
  on.check(
    "pin 2, made in the middle of the paragraph's second line, stands where its pill covers no word of the page",
    !!pill && covered.length === 0,
    `pill ${JSON.stringify(pill)}; words it covers ${JSON.stringify(covered)}`
  );
};

/** 2. The agent answers pin 1 and changes the page: what the hub keeps, the rings, and their ping as they land. */
const landedChecks = async (on: On) => {
  const [headline, paragraph] = on.pins;
  await on.fleet.call(REPLY, {
    pin: headline,
    text: "Shortened it to six words, and moved the button under it.",
  });
  const landing = await readPings(on.screen, on.frame, on.leg.engine, () =>
    on.fleet.call(UPDATE, { id: on.id, html: page(on.key, 2) })
  );
  on.frame = await legFrame(
    on.screen,
    on.key,
    "the hero after the update",
    on.id
  );
  const read = await until(
    "the update's changes in the doc",
    () => docRead(on.frame),
    (doc) => (doc.changes?.items.length ?? 0) >= 3,
    20_000
  ).catch(() => null);
  on.revision = read?.changes?.revision ?? 0;
  const items = read?.changes?.items ?? [];
  const itemAt = (anchor: string) => items.find((it) => it.anchor === anchor);
  on.check(
    "the hub keeps each change with its before and its comment: the headline (before, its first words) answering pin 1, the button tied to pin 1's answer, the paragraph under pin 2 with no answer",
    itemAt("#headline")?.before === HEADLINE &&
      itemAt("#headline")?.pin === headline &&
      itemAt("#headline")?.answered === true &&
      itemAt("#cta")?.pin === headline &&
      itemAt("#copy")?.pin === paragraph &&
      itemAt("#copy")?.answered === false,
    JSON.stringify(items)
  );
  const pinged = new Set(landing.filter(pingRuns).map((it) => it.target));
  on.check(
    "as the update lands, each changed element's ring pings once: held and sought, its halo 0.6 opaque at its start, spreading and fading by its half, gone at its end",
    ["#headline", "#cta", "#copy"].every((anchor) => pinged.has(anchor)) &&
      landing.length === pinged.size,
    JSON.stringify(landing)
  );
  const rings = await until(
    "the rings drawn",
    () => ringsOf(on.frame),
    (now) => now.rings.length >= 3,
    10_000
  ).catch(() => null);
  const outside = (rings?.rings ?? []).every(
    (ring) =>
      !!ring.el &&
      ring.ring.x <= ring.el.x - ring.width &&
      ring.ring.y <= ring.el.y - ring.width &&
      ring.ring.x + ring.ring.w >= ring.el.x + ring.el.w + ring.width &&
      ring.ring.y + ring.ring.h >= ring.el.y + ring.el.h + ring.width &&
      ring.line === rings?.token
  );
  on.check(
    "each changed element wears the ring outside its own box (its line clear of the box), in c-change-ring, and nothing in the change layer is filled",
    (rings?.rings.length ?? 0) === 3 && outside && rings?.filled === 0,
    JSON.stringify(rings)
  );
};

/** Coming back: the rail opens itself on To check, in the check order; with less motion the rings stand still. */
const cameBackChecks = async (on: On) => {
  await open(on.screen, on.url, COMPOSER);
  on.frame = await legFrame(on.screen, on.key, "the hero, come back to", on.id);
  const rows = await until(
    "To check open by itself",
    () => toCheckRows(on.screen),
    (read) => read.length >= 2,
    15_000
  ).catch(() => [] as Awaited<ReturnType<typeof toCheckRows>>);
  const tab = await on.screen
    .locator(`${RAIL} [role="tab"][aria-selected="true"]`)
    .textContent()
    .catch(() => null);
  on.check(
    `coming back, the rail opens itself on To check: pin 1 (answered) first, pin 2 second saying "${commentWords.changedNoAnswer}"`,
    !!tab?.trim().startsWith(commentWords.toCheck) &&
      rows[0]?.n === 1 &&
      rows[1]?.n === 2 &&
      !rows[0]?.said.includes(commentWords.changedNoAnswer) &&
      !!rows[1]?.said.includes(commentWords.changedNoAnswer),
    `tab ${tab}; rows ${JSON.stringify(rows)}`
  );
  await on.screen.emulateMedia({ reducedMotion: "reduce" });
  await open(on.screen, on.url, COMPOSER);
  on.frame = await legFrame(
    on.screen,
    on.key,
    "the hero with less motion",
    on.id
  );
  const still = await until(
    "the rings drawn with less motion",
    () => ringsOf(on.frame),
    (now) => now.rings.length >= 3,
    10_000
  ).catch(() => null);
  await settle(on.screen, 1500);
  const pings = await on.frame
    .evaluate(() => (window as unknown as ProbeWindow).probePings ?? -1)
    .catch(() => -1);
  on.check(
    "asking for less motion, the rings stand and no ping plays",
    (still?.rings.length ?? 0) >= 3 && pings === 0,
    `pings ${pings}; rings ${still?.rings.length}`
  );
  await on.screen.emulateMedia({ reducedMotion: "no-preference" });
};

/** A second revision carries what he hasn't looked at forward. */
const carriedChecks = async (on: On) => {
  await on.fleet.call(UPDATE, { id: on.id, html: page(on.key, 3) });
  const read = await until(
    "the second revision's changes",
    () => docRead(on.frame),
    (doc) => !!doc.changes?.items.some((it) => it.anchor === "#foot"),
    20_000
  ).catch(() => null);
  const second = read?.changes;
  const copyItem = second?.items.find((it) => it.anchor === "#copy");
  const footItem = second?.items.find((it) => it.anchor === "#foot");
  on.check(
    "a second revision carries what he hasn't looked at forward under its own revision (the paragraph still pin 2's, unanswered), beside what it changed",
    !!(second && copyItem && footItem) &&
      copyItem.revision === on.revision &&
      copyItem.pin === on.pins[1] &&
      copyItem.answered === false &&
      footItem.revision === second.revision &&
      second.revision > on.revision &&
      second.items.some((it) => it.anchor === "#headline"),
    JSON.stringify(second)
  );
};

/** What of `selector` the frame shows, on the screen; null when none. */
const shownOf = async (on: On, selector: string): Promise<Box | null> => {
  const inner = await on.frame
    .locator(selector)
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })
    .catch(() => null);
  const outer = await on.screen.locator(FRAME).boundingBox();
  if (!(inner && outer)) {
    return null;
  }
  const x = Math.max(inner.x + outer.x, outer.x);
  const y = Math.max(inner.y + outer.y, outer.y);
  const right = Math.min(inner.x + outer.x + inner.w, outer.x + outer.width);
  const bottom = Math.min(inner.y + outer.y + inner.h, outer.y + outer.height);
  return right > x && bottom > y ? { x, y, w: right - x, h: bottom - y } : null;
};

/**
 * The desk's window drawn as narrow as 680 with the thread open: the panel
 * becomes the sheet (a pane under 900px), and the change lines, the thread
 * and the rail hold, nothing spilling sideways or past the window. The
 * thread's place at 680 is the 680 leg's own (its card clear of the
 * headline).
 */
const narrowHolds = async (on: On) => {
  const was = on.screen.viewportSize();
  await on.screen.setViewportSize({ width: 680, height: 900 });
  await settle(on.screen, 800);
  // Read once the layout has settled at the new width: a card the old split drew leaves as the sheet takes over.
  const spillsNow = () =>
    on.screen.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-slot="change-line"], [data-slot="pin-card"], [data-slot="comment-rail"]'
        ),
      ]
        .filter(
          (el) =>
            el.scrollWidth > el.clientWidth + 1 ||
            el.getBoundingClientRect().right > innerWidth + 0.5
        )
        .map(
          (el) =>
            `${el.getAttribute("data-slot")} ${Math.round(el.getBoundingClientRect().right)}/${el.scrollWidth}>${el.clientWidth}`
        )
    );
  let spills = await spillsNow();
  await until(
    "the layout settled at 680",
    async () => {
      spills = await spillsNow();
      return spills;
    },
    (now) => now.length === 0,
    5000
  ).catch(() => undefined);
  on.check(
    "drawn down to 680, the change lines, the thread and the rail hold: nothing spills sideways or past the window",
    spills.length === 0,
    `spills ${JSON.stringify(spills)}`
  );
  if (was) {
    await on.screen.setViewportSize(was);
  }
  await settle(on.screen, 800);
  // The window's width laid the panel out again: the page is read in the frame that shows it now.
  on.frame = await legFrame(
    on.screen,
    on.key,
    "the hero back at its width",
    on.id
  );
};

/** A To check row pressed: its thread's change line, the card clear of its element, and the row leaving To check. */
const rowChecks = async (on: On) => {
  await on.screen
    .locator(`${RAIL} [data-slot="to-check"] [data-pin-row="1"]`)
    .click()
    .catch(() => undefined);
  const card = on.screen.locator('[data-slot="pin-card"][data-pin-card="1"]');
  await card.waitFor({ timeout: 8000 }).catch(() => undefined);
  const line = card
    .locator('[data-slot="change-line"]')
    .filter({ hasText: "One board for every agent" })
    .first();
  const text = (slot: string) =>
    line
      .locator(`[data-slot="${slot}"]`)
      .textContent()
      .then((words) => words?.trim() ?? null)
      .catch(() => null);
  const lineSaid = {
    before: await text("change-before"),
    after: await text("change-after"),
    revision: await text("change-revision"),
  };
  on.check(
    "pin 1's thread says what changed under the reply: ↻ Headline, its words before → after, with its revision",
    lineSaid.before === HEADLINE &&
      lineSaid.after === "One board for every agent" &&
      !!lineSaid.revision?.includes(commentWords.revision(on.revision)),
    JSON.stringify(lineSaid)
  );
  // Nothing of the change lines is clipped: every line's words wrap inside it, in the thread and the rail.
  const clipped = await on.screen.evaluate(() =>
    [...document.querySelectorAll('[data-slot="change-line"]')]
      .filter((one) => one.scrollWidth > one.clientWidth + 1)
      .map((one) => one.textContent?.slice(0, 60))
  );
  on.check(
    "no change line is clipped: each one's words wrap inside its width, in the thread and the rail",
    clipped.length === 0,
    JSON.stringify(clipped)
  );
  await settle(on.screen, 500);
  const box = await card.boundingBox().catch(() => null);
  const cardBox = box
    ? { x: box.x, y: box.y, w: box.width, h: box.height }
    : null;
  const headline = await shownOf(on, "#headline");
  on.check(
    "pin 1's thread (its pill on the headline's top-right corner) stands clear of the headline's box: the card never covers what the comment is about",
    !!(cardBox && headline) && !meets(cardBox as Box, headline as Box),
    `card ${JSON.stringify(cardBox)}; headline shown ${JSON.stringify(headline)}`
  );
  if (on.leg.view === "desk") {
    await narrowHolds(on);
  }
  // On a phone the rail stands aside while a thread stands: the thread closed, the rail is back.
  await card
    .getByRole("button", { name: commentWords.close, exact: true })
    .click()
    .catch(() => undefined);
  let rows: Awaited<ReturnType<typeof toCheckRows>> = [];
  const left = await until(
    "pin 1's row gone from To check",
    async () => {
      rows = await toCheckRows(on.screen);
      return rows;
    },
    (read) => read.length > 0 && !read.some((row) => row.n === 1),
    8000
  ).catch(() => null);
  const seen = await docRead(on.frame).catch(() => null);
  const railNow = await on.screen
    .evaluate(
      (rail) => ({
        rail: !!document.querySelector(rail),
        tab: document
          .querySelector(`${rail} [role="tab"][aria-selected="true"]`)
          ?.textContent?.trim(),
        list: document
          .querySelector(`${rail} [data-slot="rows"]`)
          ?.textContent?.trim()
          .slice(0, 200),
      }),
      RAIL
    )
    .catch(() => null);
  on.check(
    "opened, pin 1 leaves To check once its rings have pinged; pin 2 stays",
    !!left?.some((row) => row.n === 2),
    `rows ${JSON.stringify(rows.map((row) => row.n))}; seen ${JSON.stringify(seen?.seen)}; rail ${JSON.stringify(railNow)}`
  );
};

/** Whether the paragraph's chip in the turn takes a press where it stands: nothing over it. */
const chipReachable = (on: On) =>
  on.screen.evaluate((artifact) => {
    const chip = document.querySelector(
      `[data-slot="call-chips"] [data-change-chip="${artifact}/#copy"]`
    );
    chip?.scrollIntoView({ block: "center" });
    const r = chip?.getBoundingClientRect();
    if (!(chip && r && r.width > 0)) {
      return false;
    }
    const hit = document.elementFromPoint(
      r.x + r.width / 2,
      r.y + r.height / 2
    );
    return !!hit && chip.contains(hit);
  }, on.id);

/** The comment_reply's row in the turn carrying pin `pin`'s exchange, as the engine lays it out now. */
const exchangeRead = (on: On, chipId: string) =>
  on.screen.evaluate(
    ({ chipId: pin, spaces }) => {
      const row = [...document.querySelectorAll('[data-slot="row"]')].find(
        (one) =>
          one.querySelector('[data-slot="pin-exchange"]') &&
          one.querySelector(`[data-pin-chip="${pin}"]`)
      );
      if (!row) {
        return null;
      }
      const squash = (words: string | null | undefined) =>
        (words ?? "").replace(new RegExp(spaces, "g"), "");
      const r = row.getBoundingClientRect();
      // The exchange's own boxes; its speakers' names read out alone (sr-only) are no box of words on screen.
      const well = row.querySelector('[data-slot="pin-exchange"]') as Element;
      const all = [well, ...well.querySelectorAll("*")].filter(
        (el) => !el.classList.contains("sr-only")
      );
      const entries = [
        ...row.querySelectorAll('[data-slot="exchange-entry"]'),
      ].map((entry) => {
        const box = entry.getBoundingClientRect();
        const words = entry.querySelector('[data-slot="tprose"]');
        const own = words ? getComputedStyle(words) : null;
        return {
          by: entry.getAttribute("data-by"),
          words: squash(words?.textContent),
          top: box.top,
          bottom: box.bottom,
          selectable:
            !!own &&
            (own.userSelect || own.webkitUserSelect || "auto") !== "none",
        };
      });
      // Every box of words in the row: its own text, or a paragraph of it.
      const texts = all.filter((el) =>
        [...el.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
        )
      );
      const clamped = texts
        .filter((el) => el.scrollHeight > el.clientHeight + 1)
        .map((el) => `${el.tagName} ${el.scrollHeight}>${el.clientHeight}`);
      const lineClamps = all
        .filter((el) => {
          const own = getComputedStyle(el);
          const clamp =
            own.getPropertyValue("-webkit-line-clamp") ||
            own.getPropertyValue("line-clamp");
          return !!clamp && clamp !== "none";
        })
        .map((el) => el.tagName);
      const sticksOut = all
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return (
            b.width > 0 && (b.left < r.left - 0.5 || b.right > r.right + 0.5)
          );
        })
        .map((el) => `${el.tagName}.${el.getAttribute("data-slot") ?? ""}`);
      const sideways = all
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => `${el.tagName}.${el.getAttribute("data-slot") ?? ""}`);
      const overlaps = entries
        .slice(1)
        .filter((entry, i) => entry.top < (entries[i]?.bottom ?? 0) - 0.5)
        .map((entry) => entry.by);
      const root = document.scrollingElement ?? document.documentElement;
      const pageWide = root.scrollWidth > root.clientWidth + 1 ? 1 : 0;
      return {
        entries,
        clamped,
        lineClamps,
        overflow: {
          sticksOut,
          sideways,
          overlaps,
          page: pageWide,
          total:
            sticksOut.length +
            sideways.length +
            overlaps.length +
            clamped.length +
            pageWide,
        },
        right: r.right,
        width: innerWidth,
      };
    },
    { chipId, spaces: SPACES.source }
  );

/**
 * A third comment, his 40-word line on the page's foot, answered with
 * several paragraphs (after the thread checks, so pin 1's card keeps its
 * short thread): the comment_reply's row reads as the exchange, whole, every
 * word in the DOM, nothing clamped, cut or scrolling sideways at this width;
 * resting the mouse on its pin chip peeks nothing (the thread already stands
 * there).
 */
const exchangeChecks = async (on: On) => {
  on.frame = await legFrame(on.screen, on.key, "the hero for pin 3", on.id);
  const third = await pinOn(on.frame, 3, "#foot", ASKED, { x: 0.5, y: 0.5 });
  // Answered once the hub holds it: its delivery to the session says so.
  await until(
    "pin 3 delivered",
    async () => (await docRead(on.frame)).deliveries,
    (all) => !!all[third]?.sentAt,
    60_000
  ).catch(() => undefined);
  await on.fleet.call(REPLY, { pin: third, text: ANSWER });
  // Resolved with no words; then he reopens it and writes again, and the agent answers that.
  await on.fleet.call(RESOLVE, { pin: third });
  await tellPage(on, { type: "cawco:resolve", pin: third, resolved: false });
  await tellPage(on, { type: "cawco:reply", pin: third, text: LATER_ASK });
  await until(
    "pin 3 reopened with his later words, delivered",
    async () => ({
      pin: (await pagePins(on.frame))[third],
      sent: (await docRead(on.frame)).deliveries[third]?.sentAt,
    }),
    (now) =>
      !now.pin?.resolvedAt &&
      !!now.pin?.thread.some((entry) => entry.text === LATER_ASK) &&
      !!now.sent,
    30_000
  ).catch(() => undefined);
  await on.fleet.call(REPLY, { pin: third, text: LATER_ANSWER });
  const pin = `${on.id}/3`;
  const reachable = () =>
    on.screen.evaluate((chipId) => {
      const chip = [
        ...document.querySelectorAll(`[data-pin-chip="${chipId}"]`),
      ].find((one) =>
        one
          .closest('[data-slot="row"]')
          ?.querySelector('[data-slot="pin-exchange"]')
      );
      chip?.scrollIntoView({ block: "center" });
      const r = chip?.getBoundingClientRect();
      if (!(chip && r && r.width > 0)) {
        return false;
      }
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2
      );
      return !!hit && chip.contains(hit);
    }, pin);
  if (!(await reachable())) {
    // The panel stands over the conversation (a phone's sheet): closed, the turn shows.
    await on.screen
      .locator(':is([data-slot="preview-pane"], [data-side-card="preview"])')
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click()
      .catch(() => undefined);
    await settle(on.screen, 600);
    await reachable();
  }
  const read = await until(
    "the reply's row shows his words and the reply",
    () => exchangeRead(on, pin),
    (now) => (now?.entries.length ?? 0) >= 2,
    20_000
  ).catch(() => exchangeRead(on, pin));
  const squash = (words: string) => words.replace(WHITESPACE, "");
  const person = read?.entries.find((one) => one.by === "person");
  const agent = read?.entries.find((one) => one.by === "agent");
  on.check(
    "the comment_reply's row shows the exchange whole: his 40-word comment, then the agent's three-paragraph reply, each word for word in the row, selectable",
    ASKED.split(" ").length === 40 &&
      read?.entries.length === 2 &&
      read.entries[0]?.by === "person" &&
      person?.words === squash(ASKED) &&
      agent?.words === squash(ANSWER) &&
      read.entries.every((one) => one.selectable),
    JSON.stringify(
      read?.entries.map((one) => ({ ...one, words: one.words.slice(0, 60) }))
    )
  );
  on.check(
    "nothing in the reply's row is clamped: every box of its words is as tall as its words (scrollHeight ≤ clientHeight + 1), and none sets a line clamp",
    !!read && read.clamped.length === 0 && read.lineClamps.length === 0,
    `clamped ${JSON.stringify(read?.clamped)}; line clamps ${JSON.stringify(read?.lineClamps)}`
  );
  on.check(
    `at ${VIEWS[on.leg.view].width}, the overflow sweep of the reply's row totals 0: nothing sticks out of the row, scrolls sideways, overlaps or is clipped, and the page scrolls nothing sideways`,
    read?.overflow.total === 0,
    JSON.stringify(read?.overflow)
  );
  const chip = on.screen
    .locator('[data-slot="row"]:has([data-slot="pin-exchange"])')
    .locator(`[data-pin-chip="${pin}"]`)
    .first();
  const hovered = await chip
    .hover({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  // Past --dur-peek (300ms) and the peek's own entrance: a peek would be up by now.
  await settle(on.screen, 900);
  const peeks = await on.screen.locator('[data-slot="pin-chip-peek"]').count();
  await on.screen.mouse.move(0, 0);
  on.check(
    "resting the mouse on the reply row's pin chip opens no peek",
    hovered && peeks === 0,
    `hovered ${hovered}; peeks ${peeks}`
  );
  // Pin 3's three rows, in turn order: the reply, the wordless resolve, the reply after he reopened it.
  const saidIn = (said: { by: string; words: string }[] | undefined) =>
    JSON.stringify(said?.map((one) => [one.by, one.words]));
  const want = (...said: [string, string][]) =>
    JSON.stringify(said.map(([by, text]) => [by, squash(text)]));
  const rows = await until(
    "pin 3's later reply drawn, his later words read",
    () => exchangeRows(on, pin),
    (now) => (now[2]?.length ?? 0) >= 4,
    20_000
  ).catch(() => exchangeRows(on, pin));
  on.check(
    "a comment_resolve that said nothing shows the thread as it stood at the resolve: his comment and the reply, none of what he and the agent wrote after he reopened it (which the later reply's row shows)",
    rows.length === 3 &&
      saidIn(rows[1]) === want(["person", ASKED], ["agent", ANSWER]) &&
      saidIn(rows[2]) ===
        want(
          ["person", ASKED],
          ["agent", ANSWER],
          ["person", LATER_ASK],
          ["agent", LATER_ANSWER]
        ),
    JSON.stringify(
      rows.map((row) => row.map((one) => [one.by, one.words.slice(0, 40)]))
    )
  );
};

/** Each comment row's exchange that carries pin `chipId`'s chip, in turn order: who said each entry and its words, spaces off. */
const exchangeRows = (on: On, chipId: string) =>
  on.screen.evaluate(
    ({ chipId: wanted, spaces }) =>
      // Each exchange once, by its list: rows nest, so a row selector meets one call several times.
      [...document.querySelectorAll('[data-slot="pin-exchange"]')]
        .filter((list) =>
          list
            .closest('[data-slot="row"]')
            ?.querySelector(`[data-pin-chip="${wanted}"]`)
        )
        .map((list) =>
          [...list.querySelectorAll('[data-slot="exchange-entry"]')].map(
            (entry) => ({
              by: entry.getAttribute("data-by") ?? "",
              words: (
                entry.querySelector('[data-slot="tprose"]')?.textContent ?? ""
              ).replace(new RegExp(spaces, "g"), ""),
            })
          )
        ),
    { chipId, spaces: SPACES.source }
  );

/**
 * A message to the page in the pane as a host with no doc of its own sends
 * it (the app's `cawco:reply`, `cawco:resolve`): the overlay writes it on its
 * doc as the person's own reply or reopen.
 */
const tellPage = async (on: On, message: object) => {
  const frame = await on.frame.frameElement();
  await on.screen.evaluate(
    ([el, sent]) => {
      const iframe = el as HTMLIFrameElement;
      iframe.contentWindow?.postMessage(sent, new URL(iframe.src).origin);
    },
    [frame, message] as const
  );
};

const chipChecks = async (on: On) => {
  if (!(await chipReachable(on))) {
    // The panel stands over the conversation (a phone's sheet): closed, the turn shows.
    await on.screen
      .locator(':is([data-slot="preview-pane"], [data-side-card="preview"])')
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click()
      .catch(() => undefined);
    await settle(on.screen, 600);
  }
  const chips = await on.screen.evaluate((artifact) => {
    const of = (selector: string, attr: string) =>
      [
        ...document.querySelectorAll(`[data-slot="call-chips"] ${selector}`),
      ].map((one) => one.getAttribute(attr) ?? "");
    return {
      changes: of("[data-change-chip]", "data-change-chip")
        .filter((one) => one.startsWith(`${artifact}/`))
        .map((one) => one.slice(artifact.length + 1)),
      pins: of("[data-pin-chip]", "data-pin-chip"),
    };
  }, on.id);
  on.check(
    "the agent's turn carries a chip for each spot its update changed (headline, button, paragraph) and one for the comment it answered",
    ["#headline", "#cta", "#copy"].every((anchor) =>
      chips.changes.includes(anchor)
    ) && chips.pins.includes(`${on.id}/1`),
    JSON.stringify(chips)
  );
  const chip = on.screen
    .locator(`[data-slot="call-chips"] [data-change-chip="${on.id}/#copy"]`)
    .first();
  await chip.scrollIntoViewIfNeeded().catch(() => undefined);
  await chip.click().catch(() => undefined);
  // The chip alone opens it: no other press stands in for it.
  on.frame = await legFrame(on.screen, on.key, "the hero opened by its chip");
  const opened = await on.screen
    .locator('[data-slot="pin-card"][data-pin-card="2"]')
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  await settle(on.screen, 800);
  const shown = await shownOf(on, "#copy");
  on.check(
    "pressing the paragraph's chip opens the panel scrolled to the paragraph, pin 2's thread open",
    opened && !!shown,
    `card ${opened}; paragraph shown ${JSON.stringify(shown)}`
  );
  await wholeBeforeChecks(on);
};

/**
 * The paragraph's "before" ran past 200 characters: its change line in pin
 * 2's thread stands in three lines with More at its foot, and More opens it
 * in place to every word of it, none clipped.
 */
const wholeBeforeChecks = async (on: On) => {
  const line = on.screen
    .locator(
      '[data-slot="pin-card"][data-pin-card="2"] [data-slot="change-line"]'
    )
    .filter({ hasText: "One real session, live" })
    .first();
  const words = line.locator('[data-slot="change-words"]');
  const folded = await words
    .evaluate((el) => el.scrollHeight > el.clientHeight + 1)
    .catch(() => null);
  if (folded) {
    await line
      .locator('[data-slot="change-more"]')
      .click({ timeout: 5000 })
      .catch(() => undefined);
    await settle(on.screen, 300);
  }
  const whole = await words
    .evaluate((el) => ({
      clipped: el.scrollHeight > el.clientHeight + 1,
      before:
        el.querySelector('[data-slot="change-before"]')?.textContent ?? null,
      h:
        el.querySelector('[data-slot="change-before"]')?.getBoundingClientRect()
          .height ?? 0,
    }))
    .catch(() => null);
  const more = await line
    .locator('[data-slot="change-more"]')
    .getAttribute("aria-expanded", { timeout: 1000 })
    .catch(() => null);
  on.check(
    `the paragraph's ${COPY.length}-character "before" is reachable whole: where it runs past its line's three lines, ${commentWords.more} opens it in place; every word stands in the line, none clipped`,
    COPY.length >= 200 &&
      folded !== null &&
      (!folded || more === "true") &&
      whole?.before === COPY &&
      whole.clipped === false &&
      whole.h > 0,
    `folded ${folded}; ${commentWords.more} ${more}; ${JSON.stringify(whole)}`
  );
};

/** Ask again on pin 2's thread: the comment goes to the session again, whole. */
const askAgainChecks = async (on: On) => {
  const before = heard.length;
  await on.screen
    .locator(
      '[data-slot="pin-card"][data-pin-card="2"] [data-slot="ask-again"]'
    )
    .click()
    .catch(() => undefined);
  const asked = await until(
    "the comment asked again",
    () =>
      heard
        .slice(before)
        .find((said) => said.includes(artifactToolWords.askedAgain)),
    Boolean,
    30_000
  ).catch(() => null);
  on.check(
    "Ask again on pin 2's thread delivers the comment to the session again, with what changed under it",
    !!asked?.includes("Can this show one real session") &&
      !!asked.includes("One real session, live"),
    asked?.slice(0, 600) ?? "not heard"
  );
};

/**
 * Loaded at this width with the panel shut, the turn's artifact card opens
 * it: the pane mounts with the page drawn (the press, nothing else).
 */
const cardOpensChecks = async (on: On) => {
  await on.screen
    .locator(':is([data-slot="preview-pane"], [data-side-card="preview"])')
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click()
    .catch(() => undefined);
  await until(
    "the panel shut",
    async () => !(await shownFrame(on.screen, on.key)),
    Boolean,
    10_000
  ).catch(() => undefined);
  await open(on.screen, on.url, COMPOSER);
  const shut = !(await shownFrame(on.screen, on.key));
  await on.screen
    .locator(
      `[data-slot="preview-tool"][data-artifact="${on.id}"] [data-slot="artifact-open"]`
    )
    .last()
    .click({ timeout: 10_000 })
    .catch(() => undefined);
  const drawn = await until(
    "the pane opened by the card",
    () => shownFrame(on.screen, on.key),
    Boolean,
    30_000
  ).catch(() => null);
  const box = drawn
    ? await on.screen
        .locator(FRAME)
        .boundingBox()
        .catch(() => null)
    : null;
  on.check(
    "loaded at this width with the panel shut, a press on the turn's artifact card mounts the pane with the page drawn",
    shut && !!drawn && (box?.width ?? 0) > 0 && (box?.height ?? 0) > 0,
    `shut before ${shut}; frame ${JSON.stringify(box)}`
  );
  if (drawn) {
    on.frame = drawn;
  }
};

const legChecks = async (kit: Kit, fleet: Fleet, leg: Leg) => {
  const on = await madeLeg(kit, fleet, leg);
  try {
    if (leg.view === "narrowDesk") {
      await cardOpensChecks(on);
    }
    await madeChecks(on);
    await landedChecks(on);
    await cameBackChecks(on);
    await carriedChecks(on);
    await rowChecks(on);
    await exchangeChecks(on);
    await chipChecks(on);
    if (leg.engine === "chromium" && leg.view === "desk") {
      await askAgainChecks(on);
    }
  } finally {
    on.check(
      "the pages said no error",
      on.said.length === 0,
      on.said.slice(0, 6).join(" | ") || "none"
    );
    await on.screen.close();
  }
};

const runAll = async (kit: Kit) => {
  const fleet = await setUp(kit);
  const view = process.argv.includes("--view")
    ? process.argv[process.argv.indexOf("--view") + 1]
    : undefined;
  const only = process.argv.includes("--engine")
    ? process.argv[process.argv.indexOf("--engine") + 1]
    : undefined;
  for (const leg of LEGS.filter(
    (one) => (!only || one.engine === only) && (!view || one.view === view)
  )) {
    // biome-ignore lint/performance/noAwaitInLoops: one leg, then the next, on the one fleet
    await legChecks(kit, fleet, leg);
  }
};

const spec: Spec = { name: "change-guide", run: runAll };
export default spec;
