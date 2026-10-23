/**
 * A `finish_item` whose report points at the chat for its result is refused,
 * and the same item finished with the content lands and reaches its parent
 * whole. On a scratch fleet (real hub, agent and sessiond; Claude Code against
 * the mock model). This spec delegates, so its fleet cuts workspaces: it runs
 * on the host, outside every boundary.
 *
 * The scripted delegate commits a file and calls finish_item with "The report
 * is the previous message" (three leaves handed in exactly that on
 * 2026-10-23, and their parent got nothing). The hub's answer must say why it
 * refused and what to send instead (hub report-pointer.ts
 * `chatPointerRefusal`), and the item must not land. The delegate then calls
 * finish_item again with the deliverable in its summary: the item is done,
 * and the parent's next model request carries that deliverable.
 *
 *   bun scripts/probe-kit/run.ts finish-report-pointer
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  chatPointer,
  chatPointerRefusal,
} from "../../../packages/hub/src/report-pointer";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { declareGate } from "../gate";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const BRIEF = "PROBE-REPORT-POINTER";
const POINTER_SUMMARY = "The report is the previous message.";
/** The deliverable the second finish carries, marked so the parent's request can be found by it. */
const CONTENT =
  "PROBE-POINTER-CONTENT. Option A: one column, 320px. Option B: two columns, 640px. Option C: a sheet. Recommended: A.";
/** The hub's whole refusal of {@link POINTER_SUMMARY}, as the request's JSON body carries it. */
const REFUSAL = JSON.stringify(
  chatPointerRefusal(chatPointer(POINTER_SUMMARY) ?? POINTER_SUMMARY)
).slice(1, -1);
const COMMIT =
  "git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit' && echo DONE-COMMIT";

interface State {
  contentSent: boolean;
  ended: boolean;
  pointerSent: boolean;
  /** The raw request that answered the pointer finish: it carries the hub's words. */
  refusal: Seen | undefined;
  searched: boolean;
}
const fresh = (): State => ({
  contentSent: false,
  ended: false,
  pointerSent: false,
  refusal: undefined,
  searched: false,
});
let state = fresh();

const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** The delegate: commit, finish pointing at the chat, then finish with the content. */
const respond = (request: Seen): Reply => {
  if (!(request.tools && request.all.includes(BRIEF))) {
    return text("ok");
  }
  if (state.contentSent) {
    state.ended = true;
    return text("Landed.");
  }
  if (!request.all.includes("DONE-COMMIT")) {
    return tool("Bash", {
      command: `printf 'options\\n' > options.txt && git add options.txt && ${COMMIT}`,
      description: "Commit",
    });
  }
  if (!request.toolNames.includes(FINISH)) {
    if (!state.searched) {
      state.searched = true;
      return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
    }
    return text("done");
  }
  if (!state.pointerSent) {
    state.pointerSent = true;
    return tool(FINISH, {
      headline: "Wrote the three layout options.",
      summary: POINTER_SUMMARY,
    });
  }
  if (!state.refusal && request.afterTool) {
    state.refusal = request;
  }
  state.contentSent = true;
  return tool(FINISH, {
    headline: "Wrote the three layout options.",
    summary: `${CONTENT}\n\nNot run: none.`,
  });
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

const itemState = (fleet: Fleet, id: string) =>
  fleet.query<{ state: string }>(
    "SELECT state FROM work_items WHERE id = ?",
    id
  )[0]?.state;

const run = async (kit: Kit) => {
  const { check } = kit;
  state = fresh();
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await writeFile(
    join(fleet.env.HOME as string, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const repo = join(fleet.sandbox, "code");
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "README.md"), "# finish-report-pointer\n");
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: fleet.env.HOME as string })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Finish report pointer",
    machineId: MACHINE,
    cwd: repo,
  });
  await declareGate(fleet.base, project.id, "---\ntrue\n---\n");
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  const started = await fleet.api<{ instanceId: string; workItemId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title: "Layout options",
      prompt: `${BRIEF}: write three layout options, then finish.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: repo,
    }
  );

  const refused = await until(
    "the pointer finish is answered",
    () => state.refusal,
    (seen) => seen !== undefined,
    300_000
  ).catch(() => undefined);
  const said = refused?.body ?? "";
  check(
    `finish_item with "${POINTER_SUMMARY}" is refused with words that say why and what to send instead`,
    said.includes(REFUSAL),
    said.includes(REFUSAL)
      ? `refusal: ${JSON.parse(`"${REFUSAL}"`)}`
      : `no refusal in: ${said.slice(-600)}`
  );

  const done = await until(
    "the content finish lands",
    () => itemState(fleet, started.workItemId),
    (now) => now === "done" || now === "failed",
    300_000
  ).catch(() => itemState(fleet, started.workItemId));
  check(
    "finish_item with the deliverable in its summary lands the item",
    done === "done" && state.ended,
    `item ${done}; delegate's turn ended: ${state.ended}`
  );

  const delivered = await until(
    "the parent's request carries the report",
    () =>
      fleet.seen.find(
        (one) =>
          one.tools &&
          !one.afterTool &&
          one.last.includes(CONTENT) &&
          !one.last.includes(BRIEF)
      ),
    (one) => one !== undefined,
    120_000
  ).catch(() => undefined);
  check(
    "the parent's delivery carries the deliverable whole, and nothing of the refused report",
    delivered?.last.includes(CONTENT) === true &&
      !delivered.last.includes(POINTER_SUMMARY),
    delivered
      ? `parent's request: ${delivered.last.slice(0, 600)}`
      : "no request of the parent carried it"
  );
};

export default {
  name: "finish-report-pointer",
  host: "it delegates, so its fleet cuts workspaces",
  run,
} satisfies Spec;
