/**
 * Nothing the agent has not said stands above the person's newest message
 * (rows.ts `aheadOf`): not the working indicator, not a call in flight, not a
 * placeholder, at any frame from the send until its answer. On a scratch
 * fleet (real hub, agent and sessiond; the New session dialog's harness
 * against the mock model), the built dashboard at the desk, the session's
 * transcript sampled every animation frame:
 *
 * 1. New session: `/?spawn=` opens the dialog (the root's redirect keeps
 *    the query), a first prompt, Ctrl+Enter twice while the machine is still
 *    reading the folder: Start says it is checking the folder, and exactly
 *    one session starts once the check passes. From submit until its
 *    answer: no frame draws the indicator without the first message, and no
 *    indicator, live call or placeholder row is ever above the newest
 *    message.
 * 2. A composer send into that session, idle: the same, for that send.
 * 3. A send into the same session while its turn's indicator stands (the
 *    mock holds each event 2.5 s): the indicator never stands above it.
 *
 *   bun scripts/probe-kit/run.ts first-prompt
 */
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen } from "../../scratch-fleet";
import { COMPOSER, type Spec } from "../kit";

const MARK = {
  first: "PROBE-FP-FIRST say one",
  second: "PROBE-FP-SECOND say two",
  third: "PROBE-FP-THIRD say three slowly",
  fourth: "PROBE-FP-FOURTH words while it works",
};
const ANSWER = {
  first: "PROBE-FP-ANSWER-ONE",
  second: "PROBE-FP-ANSWER-TWO",
  third: "PROBE-FP-ANSWER-THREE",
  fourth: "PROBE-FP-ANSWER-FOUR",
};
/** How long the mock holds each event of the slow turn: the indicator's stand. */
const SLOW_MS = 2500;

const said = (answer: string, everyMs = 300): Reply => ({
  everyMs,
  words: [`${answer} `, "and ", "a ", "few ", "more ", "words."],
});

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  if (request.last.includes(MARK.fourth)) {
    return said(ANSWER.fourth);
  }
  if (request.last.includes(MARK.third)) {
    return said(ANSWER.third, SLOW_MS);
  }
  if (request.last.includes(MARK.second)) {
    return said(ANSWER.second);
  }
  if (request.last.includes(MARK.first)) {
    return said(ANSWER.first);
  }
  return { everyMs: 5, words: ["ok"] };
};

interface FrameRow {
  /** What is animating on the row's item and inside it, by name. */
  moving: string;
  /** The row holds the working/thinking indicator or a call in flight: the agent's tail. */
  tail: boolean;
  text: string;
  top: number;
  you: boolean;
}
interface Frame {
  phase: string;
  /** Placeholders drawn: the skeleton veil, the transcript's empty/loading lines. */
  placeholders: number[];
  rows: FrameRow[];
  t: number;
}
declare global {
  interface Window {
    fpFrames: Frame[];
    fpPhase: string;
  }
}

/** Samples the transcript every animation frame, from now on, into `window.fpFrames`. */
function sampleFrames(): void {
  window.fpFrames = [];
  window.fpPhase = "";
  const shown = (el: Element): boolean =>
    el.checkVisibility({ visibilityProperty: true }) &&
    el.getBoundingClientRect().height > 0;
  /**
   * Where the element is painted from: its box, less the top a slide clips
   * off (Transcript's `slide` cuts what a row gained at its top while it
   * travels). Those pixels are not drawn.
   */
  const top = (el: Element): number => {
    // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
    const clipped = /^inset\(([\d.]+)px/.exec(getComputedStyle(el).clipPath);
    return Math.round(
      el.getBoundingClientRect().top + Number(clipped?.[1] ?? 0)
    );
  };
  const rowOf = (el: Element): FrameRow => ({
    you: el.querySelector("section.turn.you") !== null,
    tail:
      el.querySelector('[data-slot="thinking-indicator"], .livetool') !== null,
    top: top(el),
    moving: [
      ...(el.parentElement?.getAnimations() ?? []),
      ...el.getAnimations({ subtree: true }),
    ]
      .filter((run) => !(run instanceof CSSAnimation))
      .flatMap((run) =>
        run.effect instanceof KeyframeEffect
          ? run.effect
              .getKeyframes()
              .map((k) =>
                String(k.translate ?? k.blockSize ?? k.transform ?? "")
              )
              .filter(Boolean)
              .join("→")
          : []
      )
      .filter(Boolean)
      .join(", "),
    text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
  });
  const tick = () => {
    const rows = document.querySelectorAll(
      '[aria-label="Session transcript"] [data-row]'
    );
    const placeholders = document.querySelectorAll(
      '[aria-label="Session transcript"] .empty, .skeleton'
    );
    window.fpFrames.push({
      t: performance.now(),
      phase: window.fpPhase,
      rows: [...rows].filter(shown).map(rowOf),
      placeholders: [...placeholders].filter(shown).map(top),
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** What is wrong with one frame: a tail row or placeholder above the newest message. */
function wrong(frame: Frame): string | null {
  const youAt = frame.rows.findLastIndex((row) => row.you);
  if (youAt === -1) {
    return null;
  }
  const you = frame.rows[youAt] as FrameRow;
  const above = frame.rows.findIndex(
    (row, at) => row.tail && (at < youAt || row.top < you.top)
  );
  if (above !== -1) {
    return `tail row ${above} (${frame.rows[above]?.text}) above the newest message (row ${youAt}, ${you.text})`;
  }
  const veil = frame.placeholders.find((top) => top < you.top);
  return veil === undefined
    ? null
    : `placeholder at ${veil} above the newest message at ${you.top}`;
}

/** Waits for `answer` in a settled row and the tail gone, the turn over. */
const answered = (page: Page, answer: string) =>
  page.waitForFunction(
    (words) => {
      const scroller = document.querySelector(
        '[aria-label="Session transcript"]'
      );
      return (
        !!scroller?.textContent?.includes(words) &&
        !scroller.querySelector(
          '[data-row] [data-slot="thinking-indicator"], [data-row] .livetool'
        )
      );
    },
    answer,
    { timeout: 180_000 }
  );

const spec: Spec = {
  name: "first-prompt",
  run: async (kit) => {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    const logged: string[] = [];
    page.on("console", (message) => logged.push(message.text().slice(0, 300)));
    // The root, as a "Spawn here" link names it: its redirect to the session
    // index carries the query, and `?spawn=` opens New session.
    const spawnAt = `${base}/?spawn=${encodeURIComponent(MACHINE)}&cwd=${encodeURIComponent(fleet.workdir)}`;
    await page.goto(spawnAt, { waitUntil: "domcontentloaded" });
    const opened = await page
      .waitForSelector('[aria-label="First prompt"]', { timeout: 60_000 })
      .then(
        () => "",
        async (error: unknown) =>
          `${String(error)} at ${page.url()}: ${await page.evaluate(() =>
            document.body.innerText.replace(/\s+/g, " ").slice(0, 600)
          )}`
      );
    kit.check(
      "/?spawn=<machine> opens New session (the root's redirect keeps the query)",
      opened === "",
      opened || page.url()
    );
    if (opened) {
      return;
    }
    await page.evaluate(sampleFrames);
    /** A wait that ran out, with what the page, the hub and the agent said by then. */
    const why = async (error: unknown): Promise<never> => {
      const shown = await page.evaluate(() =>
        document.body.innerText.replace(/\s+/g, " ").slice(0, 1200)
      );
      const instances = fleet.query<object>(
        "SELECT id, harness, status, last_error FROM instances"
      );
      const agent = (await fleet.logs("agent")).split("\n").slice(-25);
      throw new Error(
        `${String(error)}\nat ${page.url()}: ${shown}\ninstances ${JSON.stringify(instances)}\nmodel requests ${fleet.seen.length}\npage:\n${logged.slice(-30).join("\n")}\nagent:\n${agent.join("\n")}`
      );
    };
    const phase = (name: string) =>
      page.evaluate((value) => {
        window.fpPhase = value;
      }, name);

    // 1. The new session's first prompt.
    // Pressed twice while the machine is still reading the folder: the press
    // waits for the check, Start says so, and one session starts.
    const prompt = page.locator('[aria-label="First prompt"]');
    await prompt.click();
    await page.keyboard.insertText(MARK.first);
    const checking = await page.evaluate(
      () =>
        document
          .querySelector("[role=dialog]")
          ?.textContent?.includes("Reading…") ?? false
    );
    await phase("first");
    await page.keyboard.press("Control+Enter");
    const waiting = await page
      .waitForFunction(
        () =>
          document
            .querySelector("#session-start")
            ?.textContent?.includes("Checking the folder…"),
        null,
        { timeout: 2000, polling: "raf" }
      )
      .then(
        () => true,
        () => false
      );
    await page.keyboard.press("Control+Enter");
    await answered(page, ANSWER.first).catch(why);
    kit.check(
      "Ctrl+Enter pressed during the folder check: Start says it is checking the folder",
      checking && waiting,
      `the dialog was reading: ${checking}; Start said it was checking: ${waiting}`
    );
    const started = fleet.query<{ id: string }>("SELECT id FROM instances");
    kit.check(
      "two presses during the check start exactly one session, once the check passes",
      started.length === 1,
      `${started.length} instances`
    );

    // 2. A composer send into the idle session.
    await phase("idle");
    const field = page.locator(COMPOSER).first();
    await field.click();
    await field.fill(MARK.second);
    await phase("second");
    await field.press("Enter");
    await answered(page, ANSWER.second).catch(why);

    // 3. A send while the slow turn's indicator stands.
    await phase("idle");
    await field.click();
    await field.fill(MARK.third);
    await phase("third");
    await field.press("Enter");
    await page.waitForFunction(
      () =>
        !!document.querySelector(
          '[aria-label="Session transcript"] [data-row] [data-slot="thinking-indicator"]'
        ),
      null,
      { timeout: 120_000 }
    );
    await page.waitForTimeout(400);
    await field.fill(MARK.fourth);
    await phase("fourth");
    await field.press("Enter");
    await answered(page, ANSWER.fourth).catch(why);
    await phase("done");

    const frames = await page.evaluate(() => window.fpFrames);
    const of = (name: string) => frames.filter((f) => f.phase === name);
    const sentFirst = (f: Frame, mark: string) =>
      f.rows.some((row) => row.you && row.text.includes(mark));

    for (const [name, mark] of [
      ["first", MARK.first],
      ["second", MARK.second],
      ["third", MARK.third],
    ] as const) {
      const sampled = of(name);
      // The indicator drawn while the send it answers is not.
      const early = sampled.find(
        (f) => f.rows.some((row) => row.tail) && !sentFirst(f, mark)
      );
      kit.check(
        `${name}: no frame of ${sampled.length} from submit to its answer draws the agent's tail before the message`,
        sampled.length > 0 && early === undefined,
        early ? JSON.stringify(early.rows) : `${sampled.length} frames`
      );
    }
    for (const name of ["first", "second", "third", "fourth"]) {
      const sampled = of(name);
      const failing = sampled
        .map((f) => ({ f, wrongly: wrong(f) }))
        .filter((one) => one.wrongly !== null);
      const [bad] = failing;
      kit.check(
        `${name}: in all ${sampled.length} frames nothing the agent has not said stands above the newest message`,
        sampled.length > 0 && bad === undefined,
        bad
          ? `${failing.length} frames, ${Math.round(bad.f.t)}–${Math.round(failing.at(-1)?.f.t ?? 0)} ms; first: ${bad.wrongly}; rows ${JSON.stringify(bad.f.rows)}`
          : undefined
      );
    }
    const indicated = of("fourth").some((f) => f.rows.some((row) => row.tail));
    kit.check(
      "fourth: the slow turn's indicator stood while the send drew (the case was exercised)",
      indicated
    );
  },
};

export default spec;
