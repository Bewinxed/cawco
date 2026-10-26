/**
 * A read the dashboard asks of one machine, whose machine goes away while it
 * is out, is waited out as a transcript is (machine-wait.svelte.ts
 * `MachineWait`, MachineAway.svelte): the hub answers it at the read's
 * deadline as the machine away (503 naming it, server.ts `awayStatus`), the
 * surface says so in place, a line of its own (`[data-slot=machine-away]`:
 * the machine reconnecting or offline, and that it reads again by itself),
 * never the hub's refusal, and once the machine is back the read runs again
 * and its answer arrives with no press. On a scratch fleet (real hub, agent,
 * sessiond), light, in Chromium, WebKit and Firefox, at desk and on a phone
 * (390); each leg freezes the agent so its read is out, kills it so the
 * machine is away at the read's deadline, then starts it again:
 *
 *  (a) Continue in new session's sizing (GET …/continue: the source's start,
 *      its continuation inputs, its git changes): the form opened on the
 *      source as a reload opens it (`cawco:continuing`); the line in the
 *      form, then the sizing.
 *  (b) Skills' On each machine, a machine's Show what it has (POST
 *      …/inspect): the line in the machine's row, then what it has.
 *  (c) The memory editor's Compare, its machine's CLAUDE.md edited there
 *      (POST …/memory/peek): the line in the compare fold, then the
 *      machine's copy.
 *  (d) A hook editor's Compare, its machine's script edited there (POST
 *      …/hooks/peek): the line in the compare fold, then the machine's
 *      script.
 *  (e) A fault's Fetch again, on a skill adopted from the machine whose last
 *      fetch the hub holds as failed (POST …/skills/:name/refresh, which
 *      reads the machine's files): the line in the fault, then the fault
 *      cleared.
 *
 *   bun scripts/probe-kit/run.ts machine-away
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { CLAUDE_DIR_NAME } from "../../../../packages/core/src/claude-dirs";
import { HOOK_TEMPLATES } from "../../../../packages/core/src/hooks";
import { commonWords } from "../../../../packages/core/src/words/common";
import { skillsWords } from "../../../../packages/core/src/words/skills";
import { spawnWords } from "../../../../packages/core/src/words/spawn";
import { MACHINE } from "../../../scratch-fleet";
import {
  type Engine,
  type Kit,
  type KitFleet,
  open,
  type Spec,
  type View,
} from "../../kit";
import { literal } from "../../words";

/** The New Session form: the desk's popover, the phone's bottom sheet. */
const FORM = "[data-ns-popover], [data-session-card][data-vaul-drawer]";
/** The line a surface says while its read waits for its machine. */
const AWAY_LINE = '[data-slot="machine-away"]';
const SOURCE_TITLE = "Away source";
/** The sizing the continue form reads once the hub answers it. */
const SIZED = new RegExp(literal(spawnWords.currentContext), "u");
/** How long the line may take: the hub's read deadline (server.ts `READ_TIMEOUT_MS`), and a margin. */
const LINE_WITHIN_MS = 30_000;
/** How long the answer may take once the machine is back. */
const BACK_WITHIN_MS = 60_000;
/** The hub's refusal of a read, drawn as it was before a machine away was waited out. */
const REFUSAL =
  /whether it ran is not known|Could not read what this machine|Could not read this machine/u;
/** The away line's words: the machine on its way back or offline, and that the read comes by itself. */
const AWAY_WORDS =
  /is (reconnecting|offline)\. This reads again by itself once it's back\./u;
/** What the fleet's memory says, and the line its machine adds to it there. */
const MEMORY = "# PROBE-AWAY fleet memory\n";
const MEMORY_EDIT = "PROBE-AWAY edited on the machine";
/** The fleet hook the hook leg compares, and the line its machine adds to its script. */
const HOOK_ID = "probe-away-hook";
const HOOK_EDIT = "# PROBE-AWAY edited on the machine";
/** The skill adopted from the machine, and the fetch failure the hub is made to hold for it. */
const SKILL = "probe-away-skill";
const SKILL_ERROR = "PROBE-AWAY the last fetch failed";
const ENGINES: Engine[] = ["chromium", "webkit", "firefox"];
const VIEWS: View[] = ["desk", "phone"];

/** What a surface said while its machine was away. */
interface Seen {
  /** The line's words while away, or why there was none. */
  away: string;
  /** Whether the hub's own refusal of the read was drawn anywhere. */
  refused: boolean;
}

/** Waits for the away line and reads it, or says it never came. */
const awayLine = async (page: Page): Promise<Seen> => {
  const line = page.locator(AWAY_LINE).filter({ visible: true }).first();
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

/** The line says the machine is away and that the read comes by itself. */
const saysAway = (seen: Seen) => AWAY_WORDS.test(seen.away) && !seen.refused;

/** Whether the away line has left (on its exit transition, MachineAway.svelte `unfold`). */
const lineGone = (page: Page) =>
  page
    .locator(AWAY_LINE)
    .first()
    .waitFor({ state: "detached", timeout: 5000 })
    .then(() => true)
    .catch(() => false);

/** Whether `ready` holds: each waits its own {@link BACK_WITHIN_MS} once the machine is back. */
const arrives = (ready: () => Promise<unknown>) =>
  ready().then(
    () => true,
    () => false
  );

/** A leg: `ask` with the agent frozen, then killed; the line; the agent back; `back` with no press. */
async function leg(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  tag: string,
  what: string,
  ask: () => Promise<void>,
  back: () => Promise<unknown>,
  said: () => Promise<string>
) {
  fleet.freeze("agent", true);
  await ask();
  await page.waitForTimeout(1000);
  await fleet.stop("agent", "SIGKILL");
  const seen = await awayLine(page);
  kit.check(
    `${tag}: ${what}, its machine away at the read's deadline: said in place, a line of its own, never the hub's refusal`,
    saysAway(seen),
    JSON.stringify(seen)
  );
  fleet.launch("agent");
  await fleet.agentUp();
  const answered = await arrives(back);
  const gone = await lineGone(page);
  kit.check(
    `${tag}: ${what}, with the machine back, its answer arrives with no press and the line goes`,
    answered && gone,
    `answered ${answered}, line gone ${gone}; ${(await said()).replace(/\s+/gu, " ").slice(0, 240)}`
  );
}

/**
 * Waits until a button, by its accessible name, is there and pressable: its
 * machine online. By name, never its text: a kit Button that can be pending
 * holds its idle and pending words in one cell (kit.ts `buttonNames`).
 */
const pressable = async (page: Page, name: string) => {
  const button = page
    .getByRole("button", { name, exact: true })
    .filter({ visible: true })
    .first();
  await button.waitFor({ state: "visible", timeout: 60_000 });
  const deadline = Date.now() + 60_000;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll until its machine is online
    if (await button.isEnabled()) {
      break;
    }
    if (Date.now() > deadline) {
      throw new Error(`“${name}” never became pressable`);
    }
    await page.waitForTimeout(250);
  }
  return button;
};

/** `path` on the machine once the fleet has written it, its text holding `holding`. */
async function machineFile(path: string, holding: string): Promise<string> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll until the fleet has written it
    const text = await readFile(path, "utf8").catch(() => "");
    if (text.includes(holding)) {
      return path;
    }
    if (Date.now() > deadline) {
      throw new Error(`${path} never held “${holding}”`);
    }
    await new Promise((done) => setTimeout(done, 500));
  }
}

/** `path` asked of the hub with `method` and `body`, refused loudly. */
async function hubSend(
  fleet: KitFleet,
  method: "POST" | "PUT",
  path: string,
  body: unknown
) {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `${method} ${path}: ${response.status} ${await response.text()}`
    );
  }
}

/** The machine drifted from the fleet on its memory and on a hook, and holding a skill the fleet adopted from it. */
async function fixtures(fleet: KitFleet) {
  await hubSend(fleet, "PUT", "/api/fleet/memory", { content: MEMORY });
  // The machine's user layer, where the fleet writes (agent fleet.ts `userLayerPath`).
  const layer = join(fleet.home, CLAUDE_DIR_NAME);
  const memory = await machineFile(
    join(layer, "CLAUDE.md"),
    "PROBE-AWAY fleet"
  );
  const [template] = HOOK_TEMPLATES;
  if (!template) {
    throw new Error("no hook template to start from");
  }
  await hubSend(fleet, "PUT", `/api/fleet/hooks/${HOOK_ID}`, template.draft);
  const script = await machineFile(
    join(layer, "cawco-hooks", `${HOOK_ID}.sh`),
    (template.draft.script ?? "").split("\n")[0] ?? ""
  );
  await writeFile(memory, `${MEMORY}${MEMORY_EDIT}\n`);
  await writeFile(script, `${await readFile(script, "utf8")}\n${HOOK_EDIT}\n`);
  // A skill written on the machine by hand, taken into the fleet from there.
  const skill = join(layer, "skills", SKILL);
  await mkdir(skill, { recursive: true });
  await writeFile(
    join(skill, "SKILL.md"),
    `---\nname: ${SKILL}\ndescription: A skill the machine-away probe adopts.\n---\nPROBE-AWAY skill body\n`
  );
  await hubSend(fleet, "PUT", `/api/fleet/skills/${SKILL}`, {
    fromMachine: MACHINE,
  });
  await hubSend(fleet, "POST", "/api/fleet/sync", { machineId: MACHINE });
}

async function continueSizing(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  tag: string,
  base: string,
  source: string
) {
  await open(page, `${base}/session`, "body", 120_000);
  await page.evaluate(
    ({ id, cwd, machineId }) =>
      sessionStorage.setItem(
        "cawco:continuing",
        JSON.stringify({
          instanceId: id,
          machineId,
          cwd,
          harness: "claude",
          title: "Away source",
        })
      ),
    { id: source, cwd: fleet.repo, machineId: MACHINE }
  );
  await leg(
    kit,
    fleet,
    page,
    `(a) ${tag}`,
    "Continue's sizing",
    async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(FORM, { state: "visible", timeout: 60_000 });
    },
    () =>
      page
        .locator(FORM)
        .getByText(SIZED)
        .first()
        .waitFor({ state: "visible", timeout: BACK_WITHIN_MS }),
    () => page.locator(FORM).first().innerText()
  );
  await page.evaluate(() => sessionStorage.removeItem("cawco:continuing"));
}

async function inventory(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  tag: string,
  base: string
) {
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
  await leg(
    kit,
    fleet,
    page,
    `(b) ${tag}`,
    skillsWords.showWhatItHas,
    () => head.click(),
    () =>
      page.waitForFunction(
        () => {
          const machine = document.querySelector('[data-slot="machine"]');
          return (
            machine !== null &&
            !machine.querySelector('[data-slot="machine-away"]') &&
            (machine.querySelector('[data-slot="entry"]') !== null ||
              // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
              /no skills at all/u.test(machine.textContent ?? ""))
          );
        },
        null,
        { timeout: BACK_WITHIN_MS }
      ),
    () => row.innerText()
  );
}

/** A Compare on the editor at `path`, which shows the machine's copy holding `edit`. */
async function compare(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  tag: string,
  what: string,
  url: string,
  edit: string
) {
  await open(page, url, "body", 120_000);
  const button = await pressable(page, "Compare");
  await leg(
    kit,
    fleet,
    page,
    tag,
    what,
    () => button.click(),
    () =>
      page
        .getByText(edit)
        .filter({ visible: true })
        .first()
        .waitFor({ state: "visible", timeout: BACK_WITHIN_MS }),
    () => page.locator("main").first().innerText()
  );
}

async function fetchAgain(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  tag: string,
  base: string
) {
  fleet.write("UPDATE skills SET error = ? WHERE name = ?", SKILL_ERROR, SKILL);
  await open(page, `${base}/config/skills`, '[data-slot="machines"]', 120_000);
  const details = page
    .getByRole("button", { name: "Details" })
    .filter({ visible: true })
    .first();
  await details.waitFor({ state: "visible", timeout: 60_000 });
  await details.click();
  const again = await pressable(page, commonWords.fetchAgain);
  await leg(
    kit,
    fleet,
    page,
    `(e) ${tag}`,
    "a fault's Fetch again",
    () => again.click(),
    // The fetch landed: the fault says so, or has gone with the hub's failure.
    () =>
      page.waitForFunction(
        () =>
          !document.querySelector('[data-slot="machine-away"]') &&
          ((document.body.textContent ?? "").includes(
            "Fetched. The machines"
          ) ||
            ![...document.querySelectorAll("button")].some(
              (one) =>
                one.textContent?.trim() === "Details" &&
                one.getBoundingClientRect().width > 0
            )),
        null,
        { timeout: BACK_WITHIN_MS }
      ),
    () => page.locator("main").first().innerText()
  );
  const [row] = fleet.query<{ error: string | null }>(
    "SELECT error FROM skills WHERE name = ?",
    SKILL
  );
  kit.check(
    `(e) ${tag}: the fetch the fault asked for landed: the hub holds no failure for the skill`,
    row?.error === null,
    `error ${row?.error ?? "null"}`
  );
}

const spec: Spec = {
  group: "The hub and machines",
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
    await fixtures(fleet);
    for (const engine of ENGINES) {
      for (const view of VIEWS) {
        const tag = `${engine} ${view}`;
        // biome-ignore lint/performance/noAwaitInLoops: one browser at a time, its legs dropping the one agent in turn
        const page = await kit.page(view, { theme: "light", engine });
        await continueSizing(kit, fleet, page, tag, base, source);
        await inventory(kit, fleet, page, tag, base);
        await compare(
          kit,
          fleet,
          page,
          `(c) ${tag}`,
          "the memory's Compare",
          `${base}/config/memory/CLAUDE.md`,
          MEMORY_EDIT
        );
        await compare(
          kit,
          fleet,
          page,
          `(d) ${tag}`,
          "a hook's Compare",
          `${base}/config/hooks/${HOOK_ID}`,
          HOOK_EDIT
        );
        await fetchAgain(kit, fleet, page, tag, base);
        await page.close();
      }
    }
  },
};

export default spec;
