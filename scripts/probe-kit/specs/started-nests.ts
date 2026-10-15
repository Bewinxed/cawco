/**
 * The sidebar's top level holds only sessions a person started: a session
 * another session started with `start_session` records its starter
 * (`parentInstanceId`) and hangs under it, like a delegate, while staying
 * what start_session makes it (no work item, nothing reported back). On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model) and the built dashboard against its hub:
 *
 * (a) A person starts Starter (the dashboard's spawn) and asks it to start a
 *     session; its turn calls `start_session`. The row the hub lists
 *     (`GET /api/instances`, the tree data every rail reads) names Starter
 *     as its parent and runs no work item; Starter and a second session the
 *     person started, Other, have no parent.
 * (b) The started session's turn ends and Starter hears nothing from it: no
 *     send to Starter comes from it.
 * (c) The rail, on Other's page, Finished tab: with the Delegates switch off
 *     (the default) the started session has no row of its own and Starter
 *     stands at the top; with it on, Starter's mark counts one row under it,
 *     and opening it draws the started session inside Starter's branch.
 * (d) The hub's backfill (drizzle 0163): the started session's parent is
 *     taken off its row and the migration's mark removed, as a hub from
 *     before this change left both; on the hub's next start the migration
 *     names Starter again, from the session's first send, and leaves the two
 *     sessions the person started at the top.
 *
 *   bun scripts/probe-kit/run.ts started-nests
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { open, ROOT, type Spec, settle } from "../kit";

const START_TOOL = "mcp__cawco__start_session";
const CHILD_TITLE = "Started probe child";
/** The rail's Finished tab, whatever its count says. */
const FINISHED = /Finished/;

interface Row {
  id: string;
  parentInstanceId?: string | null;
  title?: string | null;
  turnEndedAt?: string | number | null;
  workItemId?: string | null;
}

/** Where each session's line stands in the rail: drawn, at the top, and the line it hangs under. */
interface Placed {
  drawn: boolean;
  /** The id of the session whose branch it is drawn in; null at the top. */
  under: string | null;
}

const placeOf = (page: Page, ids: string[]): Promise<Record<string, Placed>> =>
  page.evaluate((wanted) => {
    // On a session's page the rail's Working and Finished are the only tree.
    const out: Record<string, { drawn: boolean; under: string | null }> = {};
    for (const id of wanted) {
      const line = document.querySelector<HTMLElement>(
        `.tree-line[data-key="${id}"]`
      );
      if (!line) {
        out[id] = { drawn: false, under: null };
        continue;
      }
      const branch = line.closest("li.tree-node")?.parentElement;
      const holder = branch?.classList.contains("tree-branch")
        ? branch.closest("li.tree-node")
        : null;
      const key =
        holder?.querySelector<HTMLElement>(":scope > .tree-line")?.dataset
          .key ?? null;
      out[id] = { drawn: true, under: key };
    }
    return out;
  }, ids);

const spec: Spec = {
  name: "started-nests",
  run: async (kit) => {
    const tag = crypto.randomUUID().slice(0, 6);
    const START = `start probe ${tag}`;
    const CHILD = `child probe ${tag}`;
    let started = false;
    let workdir = "";
    const respond = (request: Seen): Reply => {
      if (
        request.tools &&
        request.all.includes(START) &&
        !request.all.includes(CHILD) &&
        !started &&
        request.toolNames.includes(START_TOOL)
      ) {
        started = true;
        return {
          everyMs: 1,
          words: [],
          tool: {
            name: START_TOOL,
            input: {
              cwd: workdir,
              prompt: `${CHILD}: say ok.`,
              title: CHILD_TITLE,
            },
          },
        };
      }
      return { everyMs: 5, words: [request.tools ? "Done." : "Probe title"] };
    };
    const fleet = await kit.fleet(respond);
    ({ workdir } = fleet);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const rows = () => fleet.api<Row[]>("/api/instances");
    const rowOf = async (id: string) =>
      (await rows()).find((row) => row.id === id);

    // (a) the person's two sessions, and the one Starter starts.
    const other = await fleet.spawn("claude", "Other probe");
    await fleet.send(other, "say ok.");
    const starter = await fleet.spawn("claude", "Starter probe");
    await fleet.send(starter, `${START}: start a session.`);
    const child = await until(
      "the started session's row",
      async () => (await rows()).find((row) => row.title === CHILD_TITLE),
      Boolean,
      5 * 60_000
    );
    kit.check(
      "(a) a session start_session started names its starter",
      child.parentInstanceId === starter,
      `parentInstanceId ${child.parentInstanceId ?? "null"}, starter ${starter.slice(0, 8)}`
    );
    kit.check(
      "(a) it is no work item",
      !child.workItemId,
      `workItemId ${child.workItemId ?? "null"}`
    );
    const [starterRow, otherRow] = await Promise.all([
      rowOf(starter),
      rowOf(other),
    ]);
    kit.check(
      "(a) the sessions a person started have no parent",
      !(starterRow?.parentInstanceId || otherRow?.parentInstanceId),
      `starter ${starterRow?.parentInstanceId ?? "null"}, other ${otherRow?.parentInstanceId ?? "null"}`
    );

    // (b) its turn ends, and nothing of it reaches Starter.
    const ended = await until(
      "the started session's turn ended",
      () => rowOf(child.id),
      (row) => Boolean(row?.turnEndedAt),
      5 * 60_000
    ).catch(() => undefined);
    await until(
      "Starter's turn ended",
      () => rowOf(starter),
      (row) => Boolean(row?.turnEndedAt),
      5 * 60_000
    );
    const reports = fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ? AND json_extract(body, '$.origin.fromSession') = ?",
      starter,
      child.id
    )[0]?.n;
    kit.check(
      "(b) its turn ends and Starter hears nothing from it",
      ended !== undefined && reports === 0,
      `turn ended ${ended ? "yes" : "no"}, sends from it to Starter ${reports}`
    );

    // (c) the rail.
    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    await open(
      page,
      `${base}/session/${other}`,
      'button[aria-label="Delegates"]',
      120_000
    );
    const finished = page.getByRole("tab", { name: FINISHED }).first();
    await finished.click();
    await page.waitForSelector(`.tree-line[data-key="${starter}"]`, {
      timeout: 60_000,
    });
    await settle(page);
    const off = await placeOf(page, [starter, child.id]);
    kit.check(
      "(c) Delegates off: Starter stands at the top, the started session has no row of its own",
      off[starter]?.drawn === true &&
        off[starter].under === null &&
        off[child.id]?.drawn === false,
      JSON.stringify(off)
    );
    await page.locator('button[aria-label="Delegates"]').first().click();
    const fold = page
      .locator(`.tree-line[data-key="${starter}"] [aria-label^="Show 1 "]`)
      .first();
    const counted = await fold
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (counted) {
      await fold.click();
    }
    await page
      .waitForSelector(`.tree-line[data-key="${child.id}"]`, {
        timeout: 30_000,
      })
      .catch(() => undefined);
    await settle(page);
    const on = await placeOf(page, [starter, child.id]);
    kit.check(
      "(c) Delegates on: Starter counts one under it, and the started session is drawn in Starter's branch",
      counted &&
        on[starter]?.under === null &&
        on[child.id]?.drawn === true &&
        on[child.id].under === starter,
      `counted ${counted}, ${JSON.stringify(on)}`
    );
    await page.close();

    // (d) the backfill, on the hub's next start.
    const journal = JSON.parse(
      await readFile(
        join(ROOT, "packages/hub/drizzle/meta/_journal.json"),
        "utf8"
      )
    ) as { entries: { tag: string; when: number }[] };
    const when = journal.entries.find((entry) =>
      entry.tag.endsWith("_started_by_parent")
    )?.when;
    await fleet.stop("hub");
    fleet.write(
      "UPDATE instances SET parent_instance_id = NULL WHERE id = ?",
      child.id
    );
    fleet.write(
      "DELETE FROM __drizzle_migrations WHERE created_at = ?",
      when ?? -1
    );
    const cleared = fleet.query<{ parent: string | null }>(
      "SELECT parent_instance_id AS parent FROM instances WHERE id = ?",
      child.id
    )[0]?.parent;
    fleet.launch("hub");
    await fleet.hubUp();
    const [again, starterAgain, otherAgain] = await Promise.all([
      rowOf(child.id),
      rowOf(starter),
      rowOf(other),
    ]);
    kit.check(
      "(d) the hub's next start names the starter again from the session's first send",
      when !== undefined &&
        cleared === null &&
        again?.parentInstanceId === starter,
      `migration ${when ?? "not in the journal"}, cleared ${cleared === null}, now ${again?.parentInstanceId ?? "null"}`
    );
    kit.check(
      "(d) and leaves the sessions the person started at the top",
      !(starterAgain?.parentInstanceId || otherAgain?.parentInstanceId),
      `starter ${starterAgain?.parentInstanceId ?? "null"}, other ${otherAgain?.parentInstanceId ?? "null"}`
    );
  },
};

export default spec;
