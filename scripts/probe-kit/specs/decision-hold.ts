/**
 * A build whose design is still being decided never lands on main (hub
 * work-items.ts `holdForPicks`): an item that names a decision page in
 * `buildsFrom` lands only once every card there is picked. On a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model).
 * This spec delegates, so its fleet cuts workspaces: it runs on the host,
 * outside every boundary.
 *
 * - H: a page with two cards, a delegate linked to it by name. It commits
 *   and calls finish_item: the item stays live, its landing phase `held`,
 *   its commit on its own branch on origin (`cawco/<item>`) and not on
 *   main, and its parent's report says it is held for the person's picks,
 *   each open card by its link.
 * - One card picked (the doc's `state`, as the page's own press writes it):
 *   still held, main untouched.
 * - The other picked: it lands on main by itself, the project's merge
 *   checks run on top of main, and the item is done with them in its report.
 * - U: a delegate whose brief names the page without linking it: its
 *   `delegate` answer names the page, and its work lands as before.
 *
 *   bun scripts/probe-kit/run.ts decision-hold
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";
import {
  artifactLink,
  decisionLink,
} from "../../../packages/core/src/references";
import { workWords } from "../../../packages/core/src/words/work";
import {
  HELD_FOR_PICKS,
  landingBranch,
} from "../../../packages/hub/src/work-items";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { declareGate } from "../gate";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = /PROBE-HOLD-([HU])\b/;
type Tag = "H" | "U";
const PAGE = "probe-picks";
const TITLE = "Probe picks";
const ONE = "Which way does the probe file read?";
const TWO = "Where does the probe file live?";
const PROGRAM = `root = Decisions("${TITLE}", [one, two])
one = Decision("one", "${ONE}", [plain, rich], "Plain reads anywhere today.")
plain = Option("plain", "Plain text", "Reads in any editor.", true, [], "No headings.")
rich = Option("rich", "Markdown", "Headings and lists.", false, [], "Needs a renderer.")
two = Decision("two", "${TWO}", [root, docs], "The root holds every file today.")
root = Option("root", "At the root", "One place to look.", true, [], "The root grows.")
docs = Option("docs", "Under docs", "Kept apart.", false, [], "One more folder.")`;
/** Each delegate's summary: no tag in it, so the parent's report never reads as the delegate's brief. */
const SUMMARY: Record<Tag, string> = {
  H: "Wrote the held file.\n\nNot run: none.",
  U: "Wrote the unlinked file.\n\nNot run: none.",
};

interface DelegateState {
  ended: boolean;
  finished: boolean;
  searched: boolean;
}
const states = new Map<Tag, DelegateState>();
const stateOf = (tag: Tag): DelegateState => {
  const had = states.get(tag);
  if (had) {
    return had;
  }
  const made = { ended: false, finished: false, searched: false };
  states.set(tag, made);
  return made;
};

const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** Each delegate: commit its file, find finish_item, finish once, then end. */
const respond = (request: Seen): Reply => {
  const tag = TAG.exec(request.all)?.[1] as Tag | undefined;
  if (!(request.tools && tag)) {
    return text("ok");
  }
  const own = stateOf(tag);
  if (own.finished) {
    own.ended = true;
    return text("Ended.");
  }
  if (!request.all.includes(`DONE-COMMIT-${tag}`)) {
    return tool("Bash", {
      command: `printf '${tag}\\n' > ${tag.toLowerCase()}.txt && git add ${tag.toLowerCase()}.txt && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Commit ${tag}' && echo DONE-COMMIT-${tag}`,
      description: "Commit",
    });
  }
  if (!request.toolNames.includes(FINISH)) {
    if (!own.searched) {
      own.searched = true;
      return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
    }
    return text("done");
  }
  own.finished = true;
  return tool(FINISH, {
    headline: `Wrote file ${tag}.`,
    summary: SUMMARY[tag],
  });
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

interface ItemRow {
  landing_phase: string | null;
  result: string | null;
  state: string;
}

const itemOf = (fleet: Fleet, id: string): ItemRow | undefined =>
  fleet.query<ItemRow>(
    "SELECT state, landing_phase, result FROM work_items WHERE id = ?",
    id
  )[0];

/** A pick on `card` written into the page's doc, as the page's own press writes it (core choices.ts `ChoiceEntry`). */
const pick = async (
  fleet: Fleet,
  owner: string,
  page: string,
  card: string,
  option: string
): Promise<void> => {
  const { pageHash } = await fleet.api<{ pageHash: string }>(
    `/api/instances/${owner}/artifacts/${page}`
  );
  const doc = new Doc();
  const provider = new WebsocketProvider(
    `${fleet.base.replace("http", "ws")}/ws/artifact/${encodeURIComponent(owner)}`,
    page,
    doc,
    { disableBc: true, WebSocketPolyfill: WebSocket as never }
  );
  await until("the page's doc synced", () => provider.synced, Boolean, 15_000);
  doc.getMap("state").set(card, {
    at: new Date().toISOString(),
    note: null,
    options: [option],
    pageHash,
    value: null,
  });
  // The hub keeps what it is sent; a moment for the update to travel.
  await Bun.sleep(1000);
  provider.destroy();
  doc.destroy();
};

const run = async (kit: Kit) => {
  const { check } = kit;
  states.clear();
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const repo = join(fleet.sandbox, "code");
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "README.md"), "# decision-hold\n");
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Decision hold",
    machineId: MACHINE,
    cwd: repo,
  });
  await declareGate(fleet.base, project.id, "---\ntrue\n---\n");
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  // The project's origin is the hub's own remote: main lands there.
  const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
  const logOf = async (ref: string): Promise<string[]> =>
    (await Bun.$`git log --format=%s ${ref}`.cwd(bare).nothrow().quiet().text())
      .trim()
      .split("\n");

  const page = await fleet.api<{ id: string }>(
    `/api/instances/${parent}/artifacts`,
    {
      kind: "page",
      does: "pick",
      ask: "Pick how the probe file reads and where it lives",
      name: PAGE,
      program: PROGRAM,
    }
  );
  const pageLink = artifactLink(page.id, PAGE);

  const delegate = (tag: Tag, extra: object) =>
    fleet.api<{ workItemId: string; text: string }>("/api/work-items", {
      parentInstanceId: parent,
      title: `Write file ${tag}`,
      prompt: `PROBE-HOLD-${tag}: write ${tag.toLowerCase()}.txt from the decision page ${PAGE}, then finish.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: repo,
      ...extra,
    });

  // H: linked to the page by its name.
  const held = await delegate("H", { buildsFrom: [PAGE] });
  check(
    "a delegate linked to the page is not warned of it",
    !held.text.includes(pageLink),
    held.text.slice(-400)
  );
  const heldRow = await until(
    "H is held",
    () => itemOf(fleet, held.workItemId),
    (row) =>
      row?.landing_phase === "held" ||
      (row !== undefined &&
        row.state !== "starting" &&
        row.state !== "running"),
    300_000
  ).catch(() => itemOf(fleet, held.workItemId));
  const branch = landingBranch({ id: held.workItemId, taskId: null });
  const branchLog = await logOf(branch);
  const mainHeld = await logOf("main");
  check(
    "H's finish_item holds it: live, its landing held, its commit on its own branch and not on main",
    heldRow?.state === "running" &&
      heldRow.landing_phase === "held" &&
      branchLog.includes("Commit H") &&
      !mainHeld.includes("Commit H"),
    `item ${heldRow?.state} (${heldRow?.landing_phase}); ${branch}: ${branchLog.join(", ")}; main: ${mainHeld.join(", ")}`
  );
  const report = await until(
    "the parent hears H is held",
    () =>
      fleet.seen.find(
        (one) =>
          !one.afterTool &&
          one.last.includes(HELD_FOR_PICKS) &&
          one.last.includes(SUMMARY.H.split("\n")[0])
      ),
    (one) => one !== undefined,
    120_000
  ).catch(() => undefined);
  const said = report?.last ?? "";
  check(
    "the parent's report says it is held for the person's picks, each open card by its link",
    said.includes(decisionLink(page.id, "one", ONE)) &&
      said.includes(decisionLink(page.id, "two", TWO)),
    report ? said.slice(0, 900) : "no request of the parent carried it"
  );

  // One card picked: still held.
  await pick(fleet, parent, page.id, "one", "plain");
  await Bun.sleep(5000);
  const oneRow = itemOf(fleet, held.workItemId);
  const mainOne = await logOf("main");
  check(
    "with one card picked it is still held, main untouched",
    oneRow?.state === "running" &&
      oneRow.landing_phase === "held" &&
      !mainOne.includes("Commit H"),
    `item ${oneRow?.state} (${oneRow?.landing_phase}); main: ${mainOne.join(", ")}`
  );

  // The other picked: it lands by itself, its checks on top of main.
  await pick(fleet, parent, page.id, "two", "root");
  const landed = await until(
    "H lands",
    () => itemOf(fleet, held.workItemId),
    (row) =>
      row !== undefined && row.state !== "running" && row.state !== "starting",
    300_000
  ).catch(() => itemOf(fleet, held.workItemId));
  const mainLanded = await logOf("main");
  check(
    "with every card picked it lands on main, its merge checks in its report",
    landed?.state === "done" &&
      mainLanded.includes("Commit H") &&
      (landed.result ?? "").includes(workWords.gateHeading),
    `item ${landed?.state}; main: ${mainLanded.join(", ")}; result: ${(landed?.result ?? "").slice(0, 600)}`
  );

  // U: the page named in its brief, not linked.
  const unlinked = await delegate("U", {});
  check(
    "a delegate whose brief names the page unlinked is warned, the page by its link",
    unlinked.text.includes(pageLink),
    unlinked.text.slice(-600)
  );
  const free = await until(
    "U lands",
    () => itemOf(fleet, unlinked.workItemId),
    (row) =>
      row !== undefined && row.state !== "running" && row.state !== "starting",
    300_000
  ).catch(() => itemOf(fleet, unlinked.workItemId));
  const mainFree = await logOf("main");
  check(
    "an unlinked item lands as before",
    free?.state === "done" &&
      free.landing_phase === null &&
      mainFree.includes("Commit U"),
    `item ${free?.state}; main: ${mainFree.join(", ")}`
  );
};

export default {
  name: "decision-hold",
  host: "it delegates, so its fleet cuts workspaces",
  run,
} satisfies Spec;
