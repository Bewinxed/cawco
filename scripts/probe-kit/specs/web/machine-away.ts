/**
 * A read the dashboard asks of one machine, whose machine goes away while it
 * is out, is waited out as a transcript is (machine-wait.svelte.ts
 * `MachineWait`, MachineAway.svelte): the hub answers it at the read's
 * deadline as the machine away (503 naming it, server.ts `awayStatus`), the
 * surface says so in place, a line of its own (`[data-slot=machine-away]`:
 * the machine reconnecting or offline, and that it reads again by itself),
 * never the hub's refusal, and once the machine is back the read runs again
 * and its answer arrives with no press. On a scratch fleet (real hub, agent,
 * sessiond), desk, light; the agent frozen so the read is out, then killed
 * so it is away at the deadline, then started again:
 *
 *  (a) Continue in new session's sizing (GET …/continue: the source's start,
 *      its continuation inputs, its git changes): the line under the
 *      "From a summary / From my asks" switch, then the sizing.
 *  (b) Skills' On each machine, a machine's Show what it has (POST
 *      …/inspect): the line in the machine's row, then what it has.
 *
 *   bun scripts/probe-kit/run.ts machine-away
 */
import type { Page } from "playwright-core";
import { type Kit, type KitFleet, open, type Spec } from "../../kit";

/** The New Session form, as a popover at desk. */
const FORM = "[data-ns-popover]";
/** The line a surface says while its read waits for its machine. */
const AWAY_LINE = '[data-slot="machine-away"]';
const SOURCE_TITLE = "Away source";
const SOURCE_TAB = /Away source/;
/** The sizing the continue form reads once the hub answers it. */
const SIZED = /Current context/;
/** How long the line may take: the hub's read deadline (server.ts `READ_TIMEOUT_MS`), and a margin. */
const LINE_WITHIN_MS = 30_000;
/** How long the answer may take once the machine is back. */
const BACK_WITHIN_MS = 60_000;
/** The hub's refusal of a read, drawn as it was before a machine away was waited out. */
const REFUSAL = /whether it ran is not known|Could not read what this machine/;
/** The away line's words: the machine on its way back or offline, and that the read comes by itself. */
const AWAY_WORDS =
  /is (reconnecting|offline)\. This reads again by itself once it's back\./;

/** What a surface said while its machine was away, and after. */
interface Seen {
  /** The line's words while away, or why there was none. */
  away: string;
  /** Whether the hub's own refusal ("whether it ran is not known", a read refused) was drawn anywhere. */
  refused: boolean;
}

/** Waits for the away line in `scope` and reads it, or says it never came. */
const awayLine = async (page: Page, scope: string): Promise<Seen> => {
  const line = page.locator(`${scope} ${AWAY_LINE}`).first();
  const away = await line
    .waitFor({ state: "visible", timeout: LINE_WITHIN_MS })
    .then(() => line.innerText())
    .catch((error: unknown) => `(no line: ${String(error).slice(0, 200)})`);
  const refused = await page
    .getByText(REFUSAL)
    .count()
    .then((count) => count > 0);
  return { away, refused };
};

/** The machine's agent frozen (its read out), then killed (away at the read's deadline). */
const dropAgent = async (fleet: KitFleet, ask: () => Promise<void>) => {
  fleet.freeze("agent", true);
  await ask();
  await new Promise((done) => setTimeout(done, 1000));
  await fleet.stop("agent", "SIGKILL");
};

/** The agent back: started again, registered. */
const agentBack = async (fleet: KitFleet) => {
  fleet.launch("agent");
  await fleet.agentUp();
};

/** The line says the machine is away and that the read comes by itself. */
const saysAway = (seen: Seen) => AWAY_WORDS.test(seen.away) && !seen.refused;

async function continueSizing(
  kit: Kit,
  page: Page,
  fleet: KitFleet,
  base: string,
  source: string
) {
  await page.goto(`${base}/session/${source}`, {
    waitUntil: "domcontentloaded",
  });
  const tab = page
    .getByRole("tab", { name: SOURCE_TAB })
    .filter({ visible: true })
    .first();
  await tab.waitFor({ state: "visible", timeout: 60_000 });
  await dropAgent(fleet, async () => {
    await tab.click({ button: "right" });
    const item = page
      .getByRole("menuitem", { name: "Continue in new session…" })
      .first();
    await item.waitFor({ state: "visible", timeout: 10_000 });
    await item.click();
    await page.waitForSelector(FORM, { state: "visible", timeout: 15_000 });
  });
  const seen = await awayLine(page, FORM);
  kit.check(
    "(a) Continue's sizing, its machine away at the read's deadline: the form says so in place, a line of its own, never the hub's refusal",
    saysAway(seen),
    JSON.stringify(seen)
  );
  await agentBack(fleet);
  const sized = await page
    .locator(FORM)
    .getByText(SIZED)
    .first()
    .waitFor({ state: "visible", timeout: BACK_WITHIN_MS })
    .then(() => true)
    .catch(() => false);
  // The line leaves on its exit transition (MachineAway.svelte `unfold`).
  const lineGone = await page
    .locator(`${FORM} ${AWAY_LINE}`)
    .waitFor({ state: "detached", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  kit.check(
    "(a) with the machine back, the sizing arrives with no press, and the line goes",
    sized && lineGone,
    `sized ${sized}, line gone ${lineGone}`
  );
  await page.keyboard.press("Escape");
}

async function inventory(kit: Kit, page: Page, fleet: KitFleet, base: string) {
  await open(page, `${base}/config/skills`, '[data-slot="machines"]', 120_000);
  const row = page.locator('[data-slot="machine"]').first();
  const head = row.locator('[data-slot="head"]');
  await head.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    () =>
      !(
        document.querySelector(
          '[data-slot="machine"] [data-slot="head"]'
        ) as HTMLButtonElement | null
      )?.disabled,
    null,
    { timeout: 60_000 }
  );
  await dropAgent(fleet, () => head.click());
  const seen = await awayLine(page, '[data-slot="machine"]');
  kit.check(
    "(b) Show what it has, its machine away at the read's deadline: the row says so in place, a line of its own, never the hub's refusal",
    saysAway(seen),
    JSON.stringify(seen)
  );
  await agentBack(fleet);
  const arrived = await page
    .waitForFunction(
      () => {
        const machine = document.querySelector('[data-slot="machine"]');
        return (
          machine !== null &&
          !machine.querySelector('[data-slot="machine-away"]') &&
          (machine.querySelector('[data-slot="entry"]') !== null ||
            // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
            /no skills at all/.test(machine.textContent ?? ""))
        );
      },
      null,
      { timeout: BACK_WITHIN_MS }
    )
    .then(() => true)
    .catch(() => false);
  const said = (await row.innerText()).replace(/\s+/g, " ").slice(0, 300);
  kit.check(
    "(b) with the machine back, what it has arrives with no press, and the line goes",
    arrived,
    said
  );
}

const spec: Spec = {
  name: "machine-away",
  async run(kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const base = await fleet.dashboard();
    const source = await fleet.spawn("claude", SOURCE_TITLE, fleet.repo);
    await fleet.send(source, "PROBE-AWAY first turn");
    const deadline = Date.now() + 60_000;
    while (
      Date.now() < deadline &&
      !fleet
        .query<{ state: string }>(
          "SELECT state FROM sent_messages WHERE instance_id = ?",
          source
        )
        .some((one) => one.state === "read")
    ) {
      // biome-ignore lint/performance/noAwaitInLoops: one look a beat until the turn is read
      await new Promise((done) => setTimeout(done, 250));
    }
    const page = await kit.page("desk", { theme: "light" });
    await continueSizing(kit, page, fleet, base, source);
    await inventory(kit, page, fleet, base);
  },
};

export default spec;
