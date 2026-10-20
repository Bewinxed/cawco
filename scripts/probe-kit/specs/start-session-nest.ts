/**
 * A session started with `start_session` is listed under the session that
 * started it everywhere its children are listed, as a `delegate` child is
 * (owner, nightly 4343: "i don't see any delegates here in the list", after
 * backlot#d9ba2a7a started two sessions with start_session).
 *
 *   bun scripts/probe-kit/run.ts start-session-nest
 *
 * The owner's rows: the parent in a project, its children started in another
 * folder that no project claims, each row naming the parent
 * (`parent_instance_id`) and no work item. On a scratch fleet: a parent in a
 * project calls start_session three times, for children in a folder outside
 * it; each child runs a command that waits for a file of its own, so all
 * three are working while the page is read, and each turn ends when the spec
 * says. The parent's turn then says enough that the calls' cards leave the
 * view, as a delegate's does on a long turn. The built dashboard opens the
 * parent at a desk.
 *
 * Asserted:
 *   - the hub's rows name the parent and no work item (the start_session
 *     distinction kept);
 *   - the rail (desk): the parent's mark counts the three, and opened, each
 *     child's row hangs inside the parent's;
 *   - the composer's tray (desk), the children of the conversation in front:
 *     a chip for each, running; then one child's turn ends ("done" on its
 *     chip) and one child's process is killed. The failed child (the Tailwind
 *     conductor's leg, eee38793): its chip reads failed (its tone, its
 *     label, the status-fail glyph), stands in the work zone with no
 *     `data-end`, no "N failed" chip counts it, and a press on it opens a
 *     panel whose link opens its conversation;
 *   - the home's list (the session index's page, a phone's), its Working tab
 *     with the parent working again: as the rail, in the parent's tree node.
 *
 * The app's surfaces (its rail's Tree.swift nesting, its DelegateTray) read
 * the same rows and are not driven here: no Mac in a workspace.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { type Pid, signal } from "../../../packages/core/src/signal";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const START_TOOL = "mcp__cawco__start_session";
const START = "start-session-nest: start the children.";
const CHILD_PROMPT = "start-session-nest child: wait for";
/** The child's own file, as its prompt names it. */
const FLAG = /start-session-nest child: wait for (\S+)\./;
/** The parent's second turn: it works for the rest of the leg. */
const PARENT_WAIT = "start-session-nest: keep working.";
const THREE = /\b3\b/;

const KIDS = ["working", "done", "failed"] as const;
type Kid = (typeof KIDS)[number];
const TITLE: Record<Kid, string> = {
  working: "Nest working",
  done: "Nest done",
  failed: "Nest failed",
};

/** Enough words that the calls' cards scroll out of the parent's view. */
const LONG_TURN = Array.from(
  { length: 900 },
  (_, i) => `${i % 12 === 11 ? "\n\n" : ""}word${i}`
);

/** The children's folder, outside the project; each child's file is in it. */
let childCwd = "";
const flagOf = (kid: Kid) => join(childCwd, `${kid}.flag`);

/** A turn that works until `flag` is there. */
const waitFor = (flag: string): Reply => ({
  everyMs: 5,
  words: ["waiting"],
  tool: {
    name: "Bash",
    input: {
      command: `until [ -e ${flag} ]; do sleep 0.2; done`,
      description: "Wait",
      // Its whole life in the leg: past Bash's two minutes.
      timeout: 600_000,
    },
  },
});

const respond = (request: Seen): Reply => {
  const flag = FLAG.exec(request.all)?.[1];
  if (flag) {
    return request.afterTool
      ? { everyMs: 5, words: ["child", "done"] }
      : waitFor(flag);
  }
  if (request.last.includes(PARENT_WAIT) && !request.afterTool) {
    return waitFor(join(childCwd, "parent.flag"));
  }
  if (
    request.last.includes(START) &&
    !request.afterTool &&
    request.toolNames.includes(START_TOOL)
  ) {
    return {
      everyMs: 5,
      words: ["Starting", "them."],
      tools: KIDS.map((kid) => ({
        name: START_TOOL,
        input: {
          cwd: childCwd,
          prompt: `${CHILD_PROMPT} ${flagOf(kid)}.`,
          title: TITLE[kid],
        },
      })),
    };
  }
  if (request.afterTool) {
    return { everyMs: 1, words: LONG_TURN };
  }
  return { everyMs: 5, words: ["ok"] };
};

/**
 * One list: the parent's row counts its children on its mark; opened, each
 * child's row hangs inside the parent's.
 */
async function listNests(
  kit: Kit,
  page: Page,
  where: string,
  parentRow: string,
  childRows: string[],
  count: RegExp
): Promise<void> {
  const hit = page
    .locator(`${parentRow} [data-slot="hit"][aria-expanded]`)
    .first();
  const label = await hit
    .getAttribute("aria-label", { timeout: 30_000 })
    .catch(() => null);
  kit.check(
    `${where}: the parent's mark counts its children`,
    label !== null && count.test(label),
    label ?? "no fold on the parent's row"
  );
  if (label === null) {
    return;
  }
  if ((await hit.getAttribute("aria-expanded")) !== "true") {
    await hit.click();
  }
  for (const childRow of childRows) {
    // biome-ignore lint/performance/noAwaitInLoops: one row at a time, each its own check
    const nested = await page
      .waitForFunction(
        ([p, c]) => !!document.querySelector(p)?.querySelector(c),
        [parentRow, childRow] as const,
        { timeout: 10_000 }
      )
      .then(
        () => true,
        () => false
      );
    kit.check(
      `${where}: opened, ${childRow} hangs inside the parent's row`,
      nested,
      nested ? "" : `rows anywhere: ${await page.locator(childRow).count()}`
    );
  }
}

/** What the tray says of one chip, read in one pass. */
interface ChipRead {
  /** The row's "N failed" chip: what it says, if it stands. */
  count: string | null;
  /** The chip carries `data-end` (the failure zone's end chip). */
  end: boolean;
  /** The chip's own glyph is drawn (its state's mark, in its slot). */
  glyph: boolean;
  label: string | null;
  /** Its place among the row's chips, and how many stand. */
  place: string;
  tone: string | null;
}

const readChip = (page: Page, id: string): Promise<ChipRead | null> =>
  page.evaluate((key) => {
    const row = document.querySelector('[data-slot="tray"] [data-slot="row"]');
    const chip = row?.querySelector<HTMLElement>(
      `[data-key="${CSS.escape(key)}"]`
    );
    if (!(row && chip)) {
      return null;
    }
    const chips = [...row.querySelectorAll("[data-key]")];
    return {
      tone: chip.getAttribute("data-delegate-tray-tone"),
      label: chip.getAttribute("aria-label"),
      end: chip.hasAttribute("data-end"),
      glyph: !!chip.querySelector('[data-slot="glyph"] svg'),
      place: `${chips.indexOf(chip) + 1} of ${chips.length}`,
      count:
        row
          .querySelector('[data-delegate-tray-count] [data-slot="num"]')
          ?.textContent?.trim() ?? null,
    };
  }, id);

/** Waits for a chip to say `tone`, then reads it at once (a finished chip holds 6s). */
async function chipTurns(
  page: Page,
  id: string,
  tone: string
): Promise<ChipRead | null> {
  await page
    .waitForFunction(
      ([key, want]) =>
        document.querySelector(
          `[data-slot="tray"] [data-key="${CSS.escape(key)}"][data-delegate-tray-tone="${want}"]`
        ) !== null,
      [id, tone] as const,
      { timeout: 90_000, polling: 100 }
    )
    .catch(() => undefined);
  return readChip(page, id);
}

interface ChildRow {
  id: string;
  parent_instance_id: string | null;
  status: string;
  title: string;
  work_item_id: string | null;
}

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

  const repo = join(fleet.sandbox, "nest-project");
  childCwd = join(fleet.sandbox, "elsewhere");
  await mkdir(childCwd, { recursive: true });
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git -c user.name=O -c user.email=o@probe.test add -A && git -c user.name=O -c user.email=o@probe.test commit -qm 'First commit'`
    .cwd(repo)
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Nest probe",
    machineId: "scratch-fleet",
    cwd: repo,
    caw: false,
  });
  const parent = await fleet.spawn("claude", "Nest probe parent", repo, {
    projectId: project.id,
  });
  await fleet.send(parent, START);

  const rows = await until(
    "the children's rows, running",
    () =>
      fleet.query<ChildRow>(
        "SELECT id, title, parent_instance_id, work_item_id, status FROM instances WHERE parent_instance_id = ?",
        parent
      ),
    (found) =>
      found.length === KIDS.length &&
      found.every((row) => row.status === "running"),
    180_000
  );
  kit.check(
    "the hub's rows name the parent and no work item",
    rows.every(
      (row) => row.parent_instance_id === parent && row.work_item_id === null
    ),
    JSON.stringify(rows)
  );
  const idOf = (kid: Kid): string => {
    const found = rows.find((row) => row.title === TITLE[kid]);
    if (!found) {
      throw new Error(`no row titled ${TITLE[kid]}: ${JSON.stringify(rows)}`);
    }
    return found.id;
  };
  const ids = { working: "", done: "", failed: "" };
  for (const kid of KIDS) {
    ids[kid] = idOf(kid);
  }
  await until(
    "the parent's turn over",
    () => fleet.instance(parent),
    (row) => row?.turn_open_at === null,
    120_000
  );

  const base = await fleet.dashboard();
  const page = await kit.page("desk");

  // The rail, with the parent in front.
  await open(
    page,
    `${base}/session/${parent}`,
    `[data-session-row="${parent}"]`,
    120_000
  );
  await listNests(
    kit,
    page,
    "the rail",
    `[data-session-row="${parent}"]`,
    KIDS.map((kid) => `[data-session-row="${ids[kid]}"]`),
    THREE
  );

  // The composer's tray: the conversation in front's children, all working.
  for (const kid of KIDS) {
    // biome-ignore lint/performance/noAwaitInLoops: one chip at a time, each its own check
    const chip = await chipTurns(page, ids[kid], "running");
    kit.check(
      `the tray: ${TITLE[kid]}'s chip, running`,
      chip?.label === `${TITLE[kid]}, running`,
      JSON.stringify(chip)
    );
  }

  // The home's list, while the parent and all three work: its Working tab
  // lists working sessions, and with the Delegates switch off a child only
  // under its listed parent (home-state `#listedIn`), a delegate's alike.
  await fleet.send(parent, PARENT_WAIT);
  await until(
    "the parent's second turn open",
    () => fleet.instance(parent),
    (row) => row?.turn_open_at !== null,
    60_000
  );
  await homeNests(kit, await kit.page("phone"), base, parent, ids.working);

  // The done child: its turn ends.
  await writeFile(flagOf("done"), "");
  const done = await chipTurns(page, ids.done, "done");
  kit.check(
    "the tray: the child whose turn ended reads done",
    done?.tone === "done" && done.label === `${TITLE.done}, done`,
    JSON.stringify(done)
  );

  // The failed child: its process killed from outside twice inside the
  // hub's two minutes (server.ts `diedOnSignal`): the first is resumed,
  // the second fails the row.
  const pidOf = async (other?: Pid): Promise<Pid> => {
    const one = await until(
      "the failed child's process",
      () => fleet.sessionPid(ids.failed),
      (pid) => pid !== undefined && pid !== other,
      90_000
    );
    if (one === undefined) {
      throw new Error("the failed child has no process");
    }
    return one;
  };
  const first = await pidOf();
  signal(first, "SIGKILL");
  signal(await pidOf(first), "SIGKILL");
  const status = await until(
    "the failed child's row, failed",
    () => fleet.instance(ids.failed)?.status,
    (one) => one === "error",
    90_000
  ).catch(() => fleet.instance(ids.failed)?.status);
  kit.check(
    "the hub: the child killed twice is in error",
    status === "error",
    `status ${status}`
  );
  const failed = await chipTurns(page, ids.failed, "failed");
  kit.check(
    "the tray: the failed child's chip reads failed, its glyph drawn",
    failed?.tone === "failed" &&
      failed.label === `${TITLE.failed}, failed` &&
      failed.glyph,
    JSON.stringify(failed)
  );
  kit.check(
    "the tray: the failed child stands in the work zone, no data-end",
    failed !== null && !failed.end,
    JSON.stringify(failed)
  );
  kit.check(
    'the tray: no "N failed" chip counts it',
    failed !== null && failed.count === null,
    JSON.stringify(failed)
  );
  const working = await readChip(page, ids.working);
  kit.check(
    "the tray: the working child still reads running",
    working?.tone === "running",
    JSON.stringify(working)
  );

  // A press on the failed child's chip opens its panel; its link, its conversation.
  await page
    .locator(`[data-slot="tray"] [data-key="${ids.failed}"]`)
    .click()
    .catch(() => undefined);
  const link = page
    .locator(`[data-slot="tray"] a[href$="/session/${ids.failed}"]`)
    .first();
  const linked = await link.waitFor({ timeout: 10_000 }).then(
    () => true,
    () => false
  );
  if (linked) {
    await link.click();
    await page
      .waitForURL((url) => url.pathname === `/session/${ids.failed}`, {
        timeout: 15_000,
      })
      .catch(() => undefined);
  }
  kit.check(
    "the tray: a press on the failed child opens its conversation",
    linked && new URL(page.url()).pathname === `/session/${ids.failed}`,
    `link ${linked}, at ${page.url()}`
  );
};

/**
 * The home's list (the session index, its page on a phone; on a desk the
 * rail's projects hold these rows), on its Working tab: the working child
 * is there, the parent at its top.
 */
async function homeNests(
  kit: Kit,
  phone: Page,
  base: string,
  parent: string,
  child: string
): Promise<void> {
  const parentLine = `[data-slot="tree-line"][data-key="${parent}"]`;
  const childLine = `[data-slot="tree-line"][data-key="${child}"]`;
  const drawn = await open(
    phone,
    `${base}/session`,
    `${parentLine}, ${childLine}`,
    60_000
  ).then(
    () => true,
    () => false
  );
  if (!drawn) {
    const seen = await phone.evaluate(() => ({
      at: location.pathname,
      tabs: [...document.querySelectorAll('[role="tab"]')].map(
        (tab) =>
          `${tab.textContent?.trim()}${tab.getAttribute("aria-selected") === "true" ? "*" : ""}`
      ),
      lines: [...document.querySelectorAll('[data-slot="tree-line"]')].map(
        (line) => line.getAttribute("data-key")
      ),
    }));
    kit.check(
      "the home: the parent's tree is drawn",
      false,
      `parent ${parent}, child ${child}: ${JSON.stringify(seen)}`
    );
    return;
  }
  await listNests(
    kit,
    phone,
    "the home",
    `li[data-tree-node]:has(> ${parentLine})`,
    [childLine],
    THREE
  );
}

export default { name: "start-session-nest", run } satisfies Spec;
