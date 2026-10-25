/**
 * What a delegate leaves in `$TMPDIR/outputs/` reaches its project's folder
 * under `assets/<item>/` and outlives its workspace (hub work-items.ts
 * `scratchOutputs`, `keepScratchOutputs`). On 2026-10-25 a delegate's report
 * written there went with its workspace: the hub copied only outputs named
 * at delegate time. On a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model). This spec delegates, so its fleet cuts
 * workspaces: it runs on the host, outside every boundary.
 *
 * - A leaf delegated with no outputs, landing none, is told in its brief that
 *   `$TMPDIR/outputs/` is copied to `assets/<item>/`.
 * - It writes `$TMPDIR/outputs/x.md` and `$TMPDIR/outputs/notes/y.md`, then
 *   finishes: its item is done, and the hub's report names both at
 *   `assets/<item>/x.md` and `assets/<item>/notes/y.md`.
 * - Its workspace retires (its own settle, or the archive the hub serves),
 *   its scratch dir gone.
 * - Each path the report names holds what the leaf wrote: the parent reads
 *   it there on the hub's machine.
 * - A second leaf writes `$TMPDIR/outputs/z.md` and never finishes: its
 *   parent stops it, and its workspace is archived (copied as it closed).
 * - A third delegate of the project, on a fresh workspace, reads all three
 *   with `folder_read` (roles.ts: a delegate reads its own project's folder;
 *   a worker such as the parent has no `folder_read`, which is Caw's and
 *   the delegates').
 *
 *   bun scripts/probe-kit/run.ts scratch-outputs
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { workWords } from "../../../packages/core/src/words/work";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const TAG = "PROBE-SCRATCH-OUTPUTS";
const STOPPED_TAG = "PROBE-SCRATCH-OUTPUTS-STOPPED";
/** The third delegate's brief: it works until stopped, and the spec calls folder_read as it. */
const READER_TAG = "PROBE-OUTPUTS-READER";
const FINISH = "mcp__cawco__finish_item";
const X = `x-${crypto.randomUUID()}`;
const Y = `y-${crypto.randomUUID()}`;
const Z = `z-${crypto.randomUUID()}`;
const HEADLINE = "Wrote the report to outputs.";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
/** A deferred tool is found first, then called. */
const found = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return useTool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? useTool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

/** Where each leaf is: the first's files written and its finish_item sent, the second's file written. */
const leaf: { finished: boolean; stoppedWrote: boolean; wrote: boolean } = {
  finished: false,
  stoppedWrote: false,
  wrote: false,
};

/**
 * The first leaf writes its two files, then finishes; the second writes one
 * and works (short sleeps) until stopped; every other turn answers "ok".
 */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("ok");
  }
  if (request.all.includes(READER_TAG)) {
    return useTool("Bash", { command: "sleep 2", description: "Work" });
  }
  if (request.all.includes(STOPPED_TAG)) {
    if (!leaf.stoppedWrote) {
      leaf.stoppedWrote = true;
      return useTool("Bash", {
        command: `mkdir -p "$TMPDIR/outputs" && printf %s ${Z} > "$TMPDIR/outputs/z.md"`,
        description: "Write an output",
      });
    }
    return useTool("Bash", { command: "sleep 2", description: "Work" });
  }
  if (!request.all.includes(TAG) || leaf.finished) {
    return text("ok");
  }
  if (!leaf.wrote) {
    leaf.wrote = true;
    return useTool("Bash", {
      command: `mkdir -p "$TMPDIR/outputs/notes" && printf %s ${X} > "$TMPDIR/outputs/x.md" && printf %s ${Y} > "$TMPDIR/outputs/notes/y.md"`,
      description: "Write the outputs",
    });
  }
  const reply = found(request, FINISH, {
    headline: HEADLINE,
    summary: `${HEADLINE}\n\nThe report is $TMPDIR/outputs/x.md, its notes $TMPDIR/outputs/notes/y.md.`,
  });
  if (reply.tool?.name === FINISH) {
    leaf.finished = true;
  }
  return reply;
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

interface Started {
  instanceId: string;
  workItemId: string;
  workspaceId: string;
  workspaceTmp: string;
}

/** The fleet up, a repository in a project, and its parent session running. */
const setUp = async (
  kit: Kit
): Promise<{ fleet: Fleet; parent: string; src: string }> => {
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`sh -c ${"git init -q -b main && echo outputs > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Scratch outputs",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  return { fleet, parent, src };
};

/** The parent's tools, as it calls the hub with its own credential. */
const parentTool = async (
  fleet: Fleet,
  parent: string,
  name: string,
  args: Record<string, unknown>
) =>
  await toolWords(
    {
      base: fleet.base,
      id: parent,
      credential: await fleet.sessionCredential(parent),
    },
    name,
    args
  );

/**
 * The workspace retired: its own settle, or, when its session is still kept
 * awake past the wait, the archive the hub serves (server.ts
 * `/api/workspaces/:id/archive`), which closes it the same way.
 */
const retired = async (fleet: Fleet, started: Started): Promise<string> => {
  const state = () =>
    fleet.query<{ state: string }>(
      "SELECT state FROM workspaces WHERE id = ?",
      started.workspaceId
    )[0]?.state ?? "gone";
  const settled = await until(
    "the workspace settled",
    state,
    (now) => now === "archived",
    90_000
  ).catch(() => state());
  if (settled !== "archived") {
    await fleet.api(`/api/workspaces/${started.workspaceId}/archive`, {});
  }
  return state();
};

/** A file a leaf handed in: its path in the project's folder, what it holds, which leaf wrote it. */
interface Handed {
  by: string;
  path: string;
  token: string;
}

/**
 * The paths the report names, `- <project folder>/assets/…` a line (hub
 * work-items.ts `collectOutputs`), each read on the hub's machine, as the
 * parent reads them there: every handed file is at its path and holds what
 * the leaf wrote.
 */
const reportPathsHold = async (
  { check }: Kit,
  result: string,
  handed: readonly Handed[]
): Promise<void> => {
  const listed = result
    .split("\n")
    .filter((line) => line.startsWith("- /") && line.includes("/assets/"))
    .map((line) => line.slice(2));
  const read = await Promise.all(
    handed.map(async (one) => {
      const at = listed.find((path) => path.endsWith(`/${one.path}`));
      const held = at ? await readFile(at, "utf8").catch(() => "") : "";
      return { path: one.path, at, ok: held === one.token };
    })
  );
  check(
    "each path the report names holds what the leaf wrote, on the hub's machine",
    read.every((one) => one.ok),
    read
      .map(
        (one) =>
          `${one.path}: ${one.at ?? "not listed"} ${one.ok ? "ok" : "wrong"}`
      )
      .join("; ")
  );
};

/** The scratch dir is gone from the machine. */
const scratchGone = async (started: Started): Promise<boolean> =>
  await stat(started.workspaceTmp).then(
    () => false,
    () => true
  );

/** The first leaf: write two files, finish, retire, read them back. */
const finishedLeg = async (
  kit: Kit,
  fleet: Fleet,
  parent: string,
  src: string
): Promise<Handed[]> => {
  const { check } = kit;
  const started = await fleet.api<Started>("/api/work-items", {
    parentInstanceId: parent,
    title: "Scratch outputs probe",
    prompt: `${TAG}: write your report to $TMPDIR/outputs, then finish.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: src,
    lands: "none",
  });
  const assets = `assets/${started.workItemId.slice(0, 8)}`;
  const brief = await until(
    "the leaf's brief",
    () =>
      fleet.seen.find(
        (one) => one.tools && one.all.includes(TAG) && !one.afterTool
      ),
    Boolean,
    180_000
  );
  check(
    "the brief of a leaf with no declared outputs says $TMPDIR/outputs/ is copied to its assets folder",
    brief.all.includes(workWords.scratchOutputsCopied(assets)),
    brief.all.slice(0, 1200)
  );
  const ended = await until(
    "the leaf's item ended",
    () =>
      fleet.query<{ state: string; result: string | null }>(
        "SELECT state, result FROM work_items WHERE id = ?",
        started.workItemId
      )[0],
    (row) => ["done", "failed", "cancelled"].includes(row.state),
    300_000
  ).catch(() => undefined);
  const result = ended?.result ?? "";
  check(
    "the leaf finishes, and its item, which lands none, is done",
    ended?.state === "done" && result.includes(HEADLINE),
    `${ended?.state}: ${result.slice(0, 400)}`
  );
  check(
    "the hub's report names both files at their paths in the item's assets folder",
    result.includes(`/${assets}/x.md`) &&
      result.includes(`/${assets}/notes/y.md`),
    result.slice(-800)
  );
  const state = await retired(fleet, started);
  check(
    "its workspace retires, its scratch dir gone",
    state === "archived" && (await scratchGone(started)),
    `state ${state}, ${started.workspaceTmp} ${(await scratchGone(started)) ? "gone" : "still there"}`
  );
  const handed = [
    { by: "the finished leaf", path: `${assets}/x.md`, token: X },
    { by: "the finished leaf", path: `${assets}/notes/y.md`, token: Y },
  ];
  await reportPathsHold(kit, result, handed);
  return handed;
};

/** The second leaf: write one file, get stopped, its workspace archived, read it back. */
const stoppedLeg = async (
  { check }: Kit,
  fleet: Fleet,
  parent: string,
  src: string
): Promise<Handed[]> => {
  const started = await fleet.api<Started>("/api/work-items", {
    parentInstanceId: parent,
    title: "Stopped outputs probe",
    prompt: `${STOPPED_TAG}: write an output, then keep working.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: src,
    lands: "none",
  });
  const assets = `assets/${started.workItemId.slice(0, 8)}`;
  await until(
    "the stopped leaf wrote its output",
    () =>
      stat(join(started.workspaceTmp, "outputs", "z.md")).then(
        () => true,
        () => false
      ),
    Boolean,
    180_000
  );
  const stopped = await parentTool(fleet, parent, "stop_delegate", {
    target: started.instanceId,
  });
  check(
    "the parent stops the second leaf before it finishes",
    !stopped.refused,
    `${stopped.status} ${stopped.text.slice(0, 300)}`
  );
  const state = await retired(fleet, started);
  check(
    "the stopped leaf's workspace is archived, its scratch dir gone",
    state === "archived" && (await scratchGone(started)),
    `state ${state}`
  );
  return [
    {
      by: "the stopped leaf, copied as its workspace closed",
      path: `${assets}/z.md`,
      token: Z,
    },
  ];
};

/**
 * A third delegate of the project, in a workspace of its own, reads every
 * handed file with `folder_read` as itself (its own credential, while its
 * session runs), then its parent stops it.
 */
const readerLeg = async (
  { check }: Kit,
  fleet: Fleet,
  parent: string,
  src: string,
  handed: readonly Handed[]
): Promise<void> => {
  const started = await fleet.api<Started>("/api/work-items", {
    parentInstanceId: parent,
    title: "Outputs reader probe",
    prompt: `${READER_TAG}: keep working.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: src,
    lands: "none",
  });
  const credential = await until(
    "the reader's session credential",
    () => fleet.sessionCredential(started.instanceId),
    (held) => held !== "",
    180_000
  );
  const reader = { base: fleet.base, id: started.instanceId, credential };
  for (const one of handed) {
    // biome-ignore lint/performance/noAwaitInLoops: one read at a time, as a delegate makes them
    const read = await toolWords(reader, "folder_read", { path: one.path });
    check(
      `a delegate's folder_read ${one.path} returns what ${one.by} wrote, its workspace gone`,
      !read.refused && read.text.includes(one.token),
      `${read.refused ? `refused ${read.status}: ` : ""}${read.text.slice(0, 400)}`
    );
  }
  await parentTool(fleet, parent, "stop_delegate", {
    target: started.instanceId,
  });
};

const spec: Spec = {
  name: "scratch-outputs",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
    const { fleet, parent, src } = await setUp(kit);
    const handed = [
      ...(await finishedLeg(kit, fleet, parent, src)),
      ...(await stoppedLeg(kit, fleet, parent, src)),
    ];
    await readerLeg(kit, fleet, parent, src, handed);
  },
};

export default spec;
