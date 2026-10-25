/**
 * Sending words never interrupts a turn; only the Stop control stops one
 * (the owner: "i haven not interrupted anything, this bug where something
 * keeps interrupting and you think i'm interrupting keeps happening"). His
 * hub's log paired `interrupt -> <session> from a screen` with his own send
 * each time: the composer's mod+Enter was "interrupt and send". It is now the
 * same send as Enter (Composer.svelte `onkeydown`).
 *
 * On a scratch fleet (real hub, agent and sessiond, against the mock model)
 * and the built dashboard at the desk, per harness (Claude Code, OpenCode,
 * pi), on a session whose turn streams a long answer:
 *
 * 1. Words typed into the composer and sent with Enter, then more sent with
 *    Ctrl+Enter, while the answer streams: the hub logs no `interrupt` for
 *    the session, the answer streams to its end (the next request comes no
 *    sooner than it could), and the model is then asked with both.
 * 2. A second long answer, and the composer's Stop control pressed: the hub
 *    logs the session's `interrupt` from a screen and the turn closes well
 *    before its answer could have ended.
 *
 *   bun scripts/probe-kit/run.ts send-never-stops
 */
import type { Page } from "playwright-core";
import { turnWords } from "../../../packages/core/src/words/turns";
import { HARNESSES, type Harness, type Seen, until } from "../../scratch-fleet";
import { COMPOSER, type Kit, type KitFleet, open, type Spec } from "../kit";

/** What a turn that streams long carries, in the message that starts it. */
const BUSY = "PROBE-BUSY-STREAM";
/** How long a busy answer streams: one word every {@link EVERY_MS}. */
const HOLD_MS = 24_000;
const EVERY_MS = 50;
const STREAMED = Array.from({ length: HOLD_MS / EVERY_MS }, (_, n) => `s${n} `);
/** How far into the stream the person's words go. */
const INTO_MS = 4000;
/** Slack on the stream's length for a request that follows it. */
const SLACK_MS = 3000;
/** How soon a pressed Stop closes the turn. */
const STOPPED_WITHIN_MS = 10_000;
/** The Stop control: the composer's action button while a turn runs. */
const STOP = '[data-slot="stop"][aria-label="Stop the agent"]';

const respond = (request: Seen) =>
  request.tools && request.last.includes(BUSY)
    ? { everyMs: EVERY_MS, words: STREAMED }
    : { everyMs: 5, words: ["Noted."] };

/** The first session request carrying `words`, once the mock has one. */
const askedWith = (fleet: KitFleet, words: string, from = 0) =>
  fleet.seen.slice(from).find((seen) => seen.tools && seen.all.includes(words));

/** The hub's `interrupt` lines for `instanceId` in `log`. */
const interruptsIn = (log: string, instanceId: string): string[] =>
  log
    .split("\n")
    .filter((line) => line.includes(turnWords.interruptOpening(instanceId)));

/** A busy turn under way: its message sent, its streaming request seen; the request. */
const busyTurn = async (
  fleet: KitFleet,
  instanceId: string,
  label: string
): Promise<Seen> => {
  const from = fleet.seen.length;
  const words = `${BUSY} ${label} ${crypto.randomUUID()}`;
  await fleet.send(instanceId, words);
  const started = await until(
    `${label}: the long answer streaming`,
    () => askedWith(fleet, words, from),
    () => true,
    120_000
  );
  await until(
    `${label}: the turn open`,
    () => fleet.instance(instanceId),
    (row) => row?.turn_open_at !== null,
    30_000
  );
  return started;
};

/** Writes `words` into the composer and sends them with `key`. */
const sendFromComposer = async (
  page: Page,
  words: string,
  key: "Enter" | "Control+Enter"
): Promise<void> => {
  const field = page.locator(COMPOSER).first();
  await field.click();
  await page.keyboard.type(words);
  await page.keyboard.press(key);
};

const leg = async (
  kit: Kit,
  fleet: KitFleet,
  base: string,
  harness: Harness
): Promise<void> => {
  const instanceId = await fleet.spawn(harness, `send never stops ${harness}`);
  const page = await kit.page("desk");
  await open(page, `${base}/session/${instanceId}`, COMPOSER, 120_000);

  // 1. Enter and Ctrl+Enter while the answer streams.
  const busy = await busyTurn(fleet, instanceId, `${harness} words`);
  const mark = await fleet.logMark("hub");
  await page.waitForTimeout(INTO_MS);
  const entered = `${harness} sent with Enter ${crypto.randomUUID()}`;
  const modEntered = `${harness} sent with Ctrl+Enter ${crypto.randomUUID()}`;
  await sendFromComposer(page, entered, "Enter");
  await page.waitForTimeout(1500);
  await sendFromComposer(page, modEntered, "Control+Enter");
  const both = await until(
    `${harness}: the model asked with both sends`,
    () =>
      fleet.seen.find(
        (seen) =>
          seen.tools &&
          seen.all.includes(entered) &&
          seen.all.includes(modEntered)
      ),
    () => true,
    HOLD_MS + 90_000
  ).catch(() => undefined);
  const firstAfter = askedWith(fleet, entered);
  const sentLog = await mark.since();
  const sentInterrupts = interruptsIn(sentLog, instanceId);
  kit.check(
    `${harness}: Enter and Ctrl+Enter during a turn log no interrupt on the hub`,
    sentInterrupts.length === 0,
    sentInterrupts.join(" | ") || "none"
  );
  kit.check(
    `${harness}: the streaming answer runs to its end; the words are read after it`,
    firstAfter !== undefined && firstAfter.at - busy.at >= HOLD_MS - SLACK_MS,
    `first request with the Enter words ${firstAfter ? `${firstAfter.at - busy.at} ms` : "never"} after the stream began (it streams ${HOLD_MS} ms)`
  );
  kit.check(
    `${harness}: both sends reach the model`,
    both !== undefined,
    `Enter words asked: ${askedWith(fleet, entered) !== undefined}; Ctrl+Enter words asked: ${askedWith(fleet, modEntered) !== undefined}`
  );
  await until(
    `${harness}: the turns after the sends over`,
    () => fleet.instance(instanceId),
    (row) => row?.turn_open_at === null,
    60_000
  );

  // 2. The Stop control.
  const stopped = await busyTurn(fleet, instanceId, `${harness} stop`);
  const stopMark = await fleet.logMark("hub");
  await page.waitForTimeout(INTO_MS);
  await page.locator(STOP).first().click();
  const pressedAt = Date.now();
  const closed = await until(
    `${harness}: the stopped turn closed`,
    () => fleet.instance(instanceId),
    (row) => row?.turn_open_at === null,
    STOPPED_WITHIN_MS
  ).catch(() => undefined);
  const closedIn = Date.now() - pressedAt;
  const stopInterrupts = interruptsIn(await stopMark.since(), instanceId);
  kit.check(
    `${harness}: the Stop control logs the session's interrupt from a screen`,
    stopInterrupts.length === 1 &&
      stopInterrupts[0].includes(turnWords.fromScreen),
    stopInterrupts.join(" | ") || "none"
  );
  kit.check(
    `${harness}: the Stop control ends the turn before its answer could`,
    closed !== undefined && Date.now() - stopped.at < HOLD_MS - SLACK_MS,
    `closed ${closed ? `${closedIn} ms after the press` : `not within ${STOPPED_WITHIN_MS} ms`}, ${Date.now() - stopped.at} ms into a ${HOLD_MS} ms answer`
  );
  await page.close();
};

const run = async (kit: Kit): Promise<void> => {
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
  for (const harness of HARNESSES) {
    // biome-ignore lint/performance/noAwaitInLoops: one harness's session at a time, each its own hub log marks
    await leg(kit, fleet, base, harness);
  }
};

export default { name: "send-never-stops", run } satisfies Spec;
