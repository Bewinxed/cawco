/**
 * The owner's two presence picks: the away clock's default is 5 minutes
 * ("configurable": the presence menu's row), and while a session's plan holds
 * away notes (`## Since HH:MM (you were away)`) the person hasn't seen, its
 * plan ring wears a small mark ("Yes, a small mark on the ring"), gone once
 * they open the plan, and kept by the hub with the plan (`session_plans.
 * away_seen`), so a reload and a hub restart keep it gone.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model), one session. On Chromium, then WebKit, a desk page:
 *
 * - (clock) the hub's away clock until the person sets one is 5 minutes, and
 *   the presence menu's row says so.
 * - (mark) with the person away (Appear away), a hand-off's turn writes its
 *   notes under the heading its away line names: the hub's plan says
 *   `awayUnseen`, and the open page's ring wears the needs-you dot on its
 *   glyph's top-end corner (6px, `status-attn-glyph`, the glyph cut round
 *   it, its echo three loops), its name saying it.
 * - (open) the ring opens the plan: the mark goes on the page and on the
 *   hub, and stays gone after a reload and after the hub is killed and
 *   started again.
 * - (again) a new line under the same heading: the mark is back on the open
 *   page, never reloaded.
 * - (recap) once, after both engines: the person comes back and writes to
 *   the session; its turn carries the recap, and the recap counts as seen:
 *   the mark goes (server.ts `recapFor` reads and writes the same record).
 * - no console error on any page.
 *
 *   bun scripts/probe-kit/run.ts away-notes-mark
 */

import type { Page } from "playwright-core";
import {
  AWAY_AFTER_DEFAULT_MS,
  type PersonView,
} from "../../../packages/core/src/notifications";
import type { SessionPlan } from "../../../packages/core/src/plan";
import { planWords } from "../../../packages/core/src/words/plan";
import { presenceWords } from "../../../packages/core/src/words/presence";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import {
  type Engine,
  type Kit,
  type KitFleet,
  kitsOwnMessage,
  type Spec,
  settle,
} from "../kit";
import { atRest } from "./turn-push";

const MINUTE = 60_000;
const TODO = "mcp__cawco__todo_write";
const LINE_AWAY = "[CawCo presence] The person is away";
const LINE_BACK = "[CawCo presence] The person is back on this chat";
/** The notes heading the away line names, as the session reads it. */
const HEADINGS = /under "(## Since [^"]+)"/g;
const RING = '[data-slot="plan-ring"]';

/** A tool call one turn makes: called once its tool is offered, searched for first when it is not. */
interface Call {
  called: boolean;
  done: boolean;
  searched: boolean;
}

/** One away turn: its tag, the lines it writes, and how far its todo_write got. */
interface Act extends Call {
  lines: string[];
  tag: string;
}
const acts: Act[] = [];

/** The helper session's hand-off to the session, one per away turn: CawCo's `handoff`, a peer's words. */
interface HandOff extends Call {
  marker: string;
  target: string;
  words: string;
}
const handOffs: HandOff[] = [];
const HANDOFF = "mcp__cawco__handoff";
const HANDOFF_MARK = "PROBE-HANDOFF:";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** One turn's tool call: the tool once offered (ToolSearch for it first), then "noted" after its answer. */
const callOnce = (
  request: Seen,
  step: Call,
  name: string,
  input: () => object
): Reply => {
  if (step.called) {
    if (request.afterTool) {
      step.done = true;
      return text("noted");
    }
    return text("ok");
  }
  if (request.toolNames.includes(name)) {
    step.called = true;
    return call(name, input());
  }
  if (!step.searched && request.toolNames.includes("ToolSearch")) {
    step.searched = true;
    return call("ToolSearch", { query: `select:${name}`, max_results: 1 });
  }
  step.called = true;
  step.done = true;
  return text(`${name} is not offered`);
};

/**
 * Every turn answers "ok". The helper's turn hands the session its words
 * (`handoff`); the session's away turn then writes its notes into its
 * plan's spec, under the heading its away line names.
 */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(HANDOFF_MARK)) {
    const handOff = handOffs.find(
      (one) => !one.done && request.all.includes(one.marker)
    );
    return handOff
      ? callOnce(request, handOff, HANDOFF, () => ({
          target: handOff.target,
          message: handOff.words,
        }))
      : text("ok");
  }
  const act = acts.find((one) => !one.done && request.all.includes(one.tag));
  if (!act) {
    return text("ok");
  }
  return callOnce(request, act, TODO, () => {
    const heading =
      [...request.all.matchAll(HEADINGS)].at(-1)?.[1] ?? "## Since ?";
    return {
      spec: `${heading}\n${act.lines.join("\n")}\n\n## Plan\nCarry on.`,
    };
  });
};

/** Another session hands `target` its words through CawCo's `handoff`: a peer's, not the person's. */
const handOff = async (
  fleet: KitFleet,
  helper: string,
  target: string,
  words: string
): Promise<void> => {
  const marker = `${HANDOFF_MARK}${handOffs.length + 1}`;
  handOffs.push({
    marker,
    target,
    words,
    called: false,
    done: false,
    searched: false,
  });
  await fleet.send(helper, `${marker} hand the session its next step.`);
};

/** The request whose last message holds `words`: the turn its line was read at. */
const turnOf = (fleet: KitFleet, words: string) =>
  until(
    `the turn ${words} started`,
    () =>
      fleet.seen.find((one) => one.tools && one.last.includes(words)) ?? null,
    Boolean,
    180_000
  ).catch(() => undefined);

/** The session's plan as the hub answers it. */
const planOf = (fleet: KitFleet, id: string) =>
  fleet.api<SessionPlan>(`/api/instances/${id}/plan`);

/** Everything `page` said went wrong: its console errors and uncaught errors. */
const errorsOf = (page: Page): string[] => {
  const said: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      said.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    said.push(`${error.message}\n${error.stack ?? ""}`);
  });
  return said;
};

/** What the ring draws: its name, whether it carries the mark, and the mark's geometry and ink. */
interface RingRead {
  /** The dot's background and `status-attn-glyph` as the engine resolves it. */
  dotInk: string;
  /** The dot's centre from the glyph's top-end corner, px (x along the inline axis). */
  dx: number;
  dy: number;
  /** The echo's runs: iterations each. */
  echo: number[];
  label: string;
  marked: boolean;
  /** The glyph's mask, cut round the dot. */
  mask: string;
  size: number;
  tokenInk: string;
}

const readRing = (page: Page): Promise<RingRead | null> =>
  page.evaluate((selector) => {
    const ring = document.querySelector<HTMLElement>(selector);
    if (!ring) {
      return null;
    }
    const dot = ring.querySelector<HTMLElement>('[data-dot="unseen"]');
    const glyph = ring.querySelector<HTMLElement>('[data-slot="plan-glyph"]');
    const probe = document.createElement("span");
    probe.style.background = "var(--status-attn-glyph)";
    document.body.append(probe);
    const tokenInk = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const label = ring.getAttribute("aria-label") ?? "";
    if (!(dot && glyph?.hasAttribute("data-dot"))) {
      return {
        marked: ring.hasAttribute("data-away-unseen") || !!dot,
        label,
        dx: 0,
        dy: 0,
        size: 0,
        dotInk: "",
        tokenInk,
        mask: "",
        echo: [],
      };
    }
    const d = dot.getBoundingClientRect();
    const g = glyph.getBoundingClientRect();
    const rtl = getComputedStyle(ring).direction === "rtl";
    const style = getComputedStyle(glyph);
    return {
      marked: ring.hasAttribute("data-away-unseen"),
      label,
      dx: d.left + d.width / 2 - (rtl ? g.left : g.right),
      dy: d.top + d.height / 2 - g.top,
      size: d.width,
      dotInk: getComputedStyle(dot).backgroundColor,
      tokenInk,
      mask: style.maskImage || style.getPropertyValue("-webkit-mask-image"),
      echo: dot
        .querySelector("[data-echo]")
        ?.getAnimations()
        .map((loop) => loop.effect?.getTiming().iterations ?? 0) as number[],
    };
  }, RING);

/** The ring once `accept` holds, polled; the last read when it never does. */
const ringWhen = (
  page: Page,
  label: string,
  accept: (ring: RingRead) => boolean
): Promise<RingRead | null> =>
  until(
    label,
    () => readRing(page),
    (ring) => !!ring && accept(ring),
    30_000
  ).catch(() => readRing(page));

/** Kills the hub as a crash does and starts it again; answers once its agent is back online. */
const restartHub = async (fleet: KitFleet): Promise<void> => {
  await fleet.stop("hub", "SIGKILL");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
};

const awaySeenOf = (fleet: KitFleet, id: string): string | null =>
  fleet.query<{ away_seen: string | null }>(
    "SELECT away_seen FROM session_plans WHERE instance_id = ?",
    id
  )[0]?.away_seen ?? null;

/** The session whose plan is read, and the one that hands it its away turns. */
interface Sessions {
  helper: string;
  session: string;
}

/** One away turn: the hand-off, its todo_write, the turn at rest. */
const awayTurn = async (
  fleet: KitFleet,
  { helper, session }: Sessions,
  tag: string,
  lines: string[]
) => {
  const act: Act = { tag, lines, called: false, done: false, searched: false };
  acts.push(act);
  await handOff(fleet, helper, session, `${tag}: run the build.`);
  const turn = await turnOf(fleet, tag);
  await until(
    `${tag}'s notes in the plan`,
    () =>
      fleet.query<{ spec: string | null }>(
        "SELECT spec FROM session_plans WHERE instance_id = ?",
        session
      )[0]?.spec ?? null,
    (written) => lines.every((line) => written?.includes(line)),
    180_000
  ).catch(() => undefined);
  await atRest(fleet, session);
  return turn;
};

const legs = async (
  kit: Kit,
  fleet: KitFleet,
  dashboard: string,
  sessions: Sessions,
  engine: Engine,
  round: number
) => {
  const { session } = sessions;
  const say = (words: string) => `(${engine}) ${words}`;
  const first = `- PROBE-NOTE-${round}a: the build went green`;
  const second = `- PROBE-NOTE-${round}b: the release is tagged`;

  // (clock) the person's away clock, never set: their pick.
  const person = await fleet.api<PersonView>("/api/person");
  let page = await kit.page("desk", { engine });
  let errors = errorsOf(page);
  const said: string[] = [];
  try {
    await page.goto(`${dashboard}/session/${session}`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator("[data-presence]:visible").first().click();
    const row = page.locator('[data-slot="away-clock"]');
    await row.waitFor({ state: "visible", timeout: 30_000 });
    const rowSays = (await row.innerText()).trim();
    await page.keyboard.press("Escape");
    kit.check(
      say(
        `(clock) the away clock until the person sets it is 5 minutes, on the hub and on the presence menu's row (“${presenceWords.awayAfter(5)}”)`
      ),
      AWAY_AFTER_DEFAULT_MS === 5 * MINUTE &&
        person.awayAfterMs === 5 * MINUTE &&
        rowSays === presenceWords.awayAfter(5),
      `hub ${person.awayAfterMs}, row "${rowSays}"`
    );

    // (mark) away, the session writes its notes; the open page's ring wears the dot.
    const turn = await awayTurn(fleet, sessions, `PROBE-AWAY-${round}`, [
      first,
    ]);
    const hubPlan = await planOf(fleet, session);
    const marked = await ringWhen(
      page,
      "the ring's mark",
      (ring) => ring.marked
    );
    const since = hubPlan.awayUnseen?.since ?? "";
    kit.check(
      say(
        "(mark) away, the hand-off's turn reads the away line and writes its notes: the hub's plan says they are unseen"
      ),
      Boolean(turn?.last.includes(LINE_AWAY)) && since.length > 0,
      `${JSON.stringify(hubPlan.awayUnseen)}; ${turn?.last.slice(-300) ?? "no turn"}`
    );
    kit.check(
      say(
        "(mark) the open page's ring wears the needs-you dot: 6px, status-attn-glyph, centred on its glyph's top-end corner, the glyph cut round it, its echo three loops, its name saying it"
      ),
      !!marked &&
        marked.marked &&
        Math.abs(marked.size - 6) < 0.5 &&
        Math.abs(marked.dx) <= 0.5 &&
        Math.abs(marked.dy) <= 0.5 &&
        marked.dotInk === marked.tokenInk &&
        marked.mask.includes("radial-gradient") &&
        marked.echo.length === 1 &&
        marked.echo[0] === 3 &&
        marked.label ===
          `${planWords.plan}, ${presenceWords.awayNotesUnseen(since)}`,
      JSON.stringify(marked)
    );

    // (open) the ring opens the plan: the mark goes, here and on the hub.
    await page.locator(RING).first().click();
    await page.waitForSelector('[data-slot="plan"]');
    const opened = await ringWhen(
      page,
      "the mark gone",
      (ring) => !ring.marked
    );
    const hubOpened = await until(
      "the hub's plan seen",
      () => planOf(fleet, session),
      (plan) => !plan.awayUnseen,
      10_000
    ).catch(() => planOf(fleet, session));
    kit.check(
      say(
        "(open) opening the plan takes the mark off the ring and off the hub's plan"
      ),
      !!opened &&
        !opened.marked &&
        opened.label === planWords.plan &&
        !hubOpened.awayUnseen &&
        Boolean(awaySeenOf(fleet, session)?.includes(first)),
      `${JSON.stringify(opened)}; hub ${JSON.stringify(hubOpened.awayUnseen)}; kept ${awaySeenOf(fleet, session)}`
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(RING);
    await settle(page, 500);
    const reloaded = await readRing(page);
    kit.check(
      say("(open) after a reload the ring has no mark"),
      !!reloaded && !reloaded.marked,
      JSON.stringify(reloaded)
    );
    said.push(...errors);
  } finally {
    await page.context().close();
  }

  await restartHub(fleet);
  page = await kit.page("desk", { engine });
  errors = errorsOf(page);
  try {
    await page.goto(`${dashboard}/session/${session}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(RING, { timeout: 60_000 });
    await settle(page, 500);
    const restarted = await readRing(page);
    const hubRestarted = await planOf(fleet, session);
    kit.check(
      say(
        "(open) after the hub is killed and started again the mark stays gone, on the ring and on the hub"
      ),
      !!restarted && !restarted.marked && !hubRestarted.awayUnseen,
      `${JSON.stringify(restarted)}; hub ${JSON.stringify(hubRestarted.awayUnseen)}`
    );

    // (again) a new line under the heading: the mark comes back, live.
    await awayTurn(fleet, sessions, `PROBE-AWAY-${round}-AGAIN`, [
      first,
      second,
    ]);
    const again = await ringWhen(page, "the mark back", (ring) => ring.marked);
    const navigations = await page.evaluate(
      () => performance.getEntriesByType("navigation").length
    );
    kit.check(
      say(
        "(again) a new line in the away notes: the mark is back on the open ring, never reloaded"
      ),
      !!again && again.marked && navigations === 1,
      `${JSON.stringify(again)}; navigations ${navigations}`
    );
    said.push(...errors);
  } finally {
    await page.context().close();
  }
  kit.check(
    say("no console error on any page"),
    said.length === 0,
    said.join(" | ").slice(0, 600)
  );
};

/** (recap) back, the person's own message: the recap, and the mark goes with it. */
const recapLeg = async (
  kit: Kit,
  fleet: KitFleet,
  dashboard: string,
  session: string
) => {
  const page = await kit.page("desk", { engine: "chromium" });
  const errors = errorsOf(page);
  try {
    await page.goto(`${dashboard}/session/${session}`, {
      waitUntil: "domcontentloaded",
    });
    const before = await ringWhen(
      page,
      "the mark before the recap",
      (ring) => ring.marked
    );
    // A return: input on a device, then Appear away off.
    await fleet.api("/api/presence", {
      clientId: "probe-desk",
      client: "web",
      sessionId: session,
      active: true,
      saidAt: Date.now(),
      idleMs: 0,
    });
    await fleet.api("/api/person/away", { on: false });
    await until(
      "the person here",
      () => fleet.api<PersonView>("/api/person"),
      (person) => person.state === "here",
      15_000
    ).catch(() => undefined);
    await fleet.send(session, "PROBE-BACK: where are we?");
    const back = await turnOf(fleet, "PROBE-BACK");
    await atRest(fleet, session);
    const after = await ringWhen(
      page,
      "the mark gone after the recap",
      (ring) => !ring.marked
    );
    const hub = await planOf(fleet, session);
    kit.check(
      "(recap) back, the person's message carries the recap of the unseen notes, and the recap takes the mark off the ring and the hub",
      !!before?.marked &&
        Boolean(back?.last.includes(LINE_BACK)) &&
        Boolean(back?.last.includes("PROBE-NOTE-")) &&
        !!after &&
        !after.marked &&
        !hub.awayUnseen,
      `before ${before?.marked}; after ${JSON.stringify(after)}; hub ${JSON.stringify(hub.awayUnseen)}; ${back?.last.slice(-400) ?? "no turn"}`
    );
    kit.check(
      "(recap) no console error on the page",
      errors.length === 0,
      errors.join(" | ").slice(0, 600)
    );
  } finally {
    await page.context().close();
  }
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Away notes", fleet.repo);
  const helper = await fleet.spawn("claude", "Hands off", fleet.repo);
  await atRest(fleet, session);
  await atRest(fleet, helper);
  const dashboard = await fleet.dashboard();
  await fleet.api("/api/person/away", { on: true });
  const engines: Engine[] = ["chromium", "webkit"];
  for (const [round, engine] of engines.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: one engine's legs at a time, on one fleet
    await legs(kit, fleet, dashboard, { helper, session }, engine, round + 1);
  }
  await recapLeg(kit, fleet, dashboard, session);
};

const spec: Spec = { name: "away-notes-mark", run };
export default spec;
