/**
 * The Memory view's Fold and Reshape (hub memory-view.ts, routines.ts
 * `curateNow`): each asks the project's curator for a run, its slot naming
 * what was asked, and the curator's model session proposes it. On a scratch
 * fleet with Claude Code against the mock model, which answers the curator's
 * brief with `memory_propose`; the desk fixture's folder seeded into a
 * project.
 *
 * 1. Fold on deploy (under its budget) starts a curator run whose brief asks
 *    for deploy's fold; its proposal (deploy's `Why:` lines cut, every fact
 *    line word for word) is a card, a fold, landed on deploy's row.
 * 2. Reshape starts a curator run whose brief asks for a reshape; its
 *    proposal (a line moved whole into a new file) is a card, a reshape,
 *    landed at the top of Facts.
 *
 * The curator's run is a delegate, so its fleet cuts a workspace: this spec
 * runs on the host.
 *
 *   bun scripts/probe-kit/run.ts memory-view-curator
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { MemoryPage } from "../../../packages/core/src/memory-view";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const DESK = join(ROOT, "apps/dashboard/src/lib/cawco/memory/fixtures/desk");
const PROPOSE = "mcp__cawco__memory_propose";
const DEPLOY = "knowledge/deploy.md";
const RELEASES = "Releases are cut from main every Tuesday";

const deploy = readFileSync(join(DESK, DEPLOY), "utf8");
/** deploy folded: its Why: lines cut, every fact line as it stands. */
const FOLDED = deploy.replace(/^\s+Why:.*\n/gm, "");
/** deploy reshaped: its releases line moved whole into a file of its own. */
const RELEASE_LINE =
  deploy.split("\n").find((line) => line.includes(RELEASES)) ?? "";
const RESHAPED = deploy.replace(`${RELEASE_LINE}\n`, "");
const RELEASES_FILE = `Releases: when and how they are cut.\n\n${RELEASE_LINE}\n`;

/** What the curator's brief asks of its run: the person's fold, their reshape, or neither. */
const kindAsked = (all: string): "fold" | "reshape" | null => {
  if (all.includes("and the person asked for its fold")) {
    return "fold";
  }
  return all.includes("and the person asked for a reshape") ? "reshape" : null;
};

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const asked = new Set<string>();

/** The curator's model: a fold or a reshape when its brief asks, through memory_propose (loaded with ToolSearch once). */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Memory curator probe");
  }
  const kind = kindAsked(request.all);
  if (!kind || request.all.includes('"waiting"') || asked.has(`${kind}:done`)) {
    return text("Done.");
  }
  if (!request.toolNames.includes(PROPOSE)) {
    if (asked.has(kind) || !request.toolNames.includes("ToolSearch")) {
      return text(`${PROPOSE} is not offered`);
    }
    asked.add(kind);
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "ToolSearch",
        input: { query: `select:${PROPOSE}`, max_results: 1 },
      },
    };
  }
  asked.add(`${kind}:done`);
  const files =
    kind === "fold"
      ? [{ path: DEPLOY, content: FOLDED }]
      : [
          { path: DEPLOY, content: RESHAPED },
          { path: "knowledge/releases.md", content: RELEASES_FILE },
        ];
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: PROPOSE,
      input: {
        files,
        notes: [],
        why:
          kind === "fold"
            ? "deploy folded: its Why: lines cut"
            : "deploy's release line moved to a file of its own",
      },
    },
  };
};

const filesOf = (dir: string, base = dir): string[] =>
  readdirSync(dir).flatMap((name) => {
    const at = join(dir, name);
    return statSync(at).isDirectory()
      ? filesOf(at, base)
      : [relative(base, at)];
  });

async function run(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: "cockpit",
    machineId: MACHINE,
    cwd: fleet.workdir,
  });
  const project = `${fleet.base}/api/projects/${projectId}`;
  for (const path of filesOf(DESK).filter(
    (one) => one !== "hub.json" && !one.startsWith("memory/")
  )) {
    // biome-ignore lint/performance/noAwaitInLoops: one commit at a time
    await fetch(`${project}/folder/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path,
        content: readFileSync(join(DESK, path), "utf8"),
      }),
    });
  }
  const page = async () =>
    (await (await fetch(`${project}/memory`)).json()) as MemoryPage;
  const post = (path: string, body: unknown) =>
    fetch(`${project}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const fold = await post("/memory/propose/fold", { path: DEPLOY });
  kit.check(
    "Fold starts the curator's run",
    fold.ok,
    `${fold.status} ${await fold.clone().text()}`
  );
  const folded = await until(
    "the curator's fold proposal",
    page,
    (one) => one.proposals.some((each) => each.kind === "fold"),
    180_000
  ).catch(() => undefined);
  const foldRow = folded?.proposals.find((each) => each.kind === "fold");
  kit.check(
    "the fold is a card on deploy's row",
    !!foldRow &&
      folded?.files
        .find((one) => one.path === DEPLOY)
        ?.proposals.includes(foldRow.id) === true,
    JSON.stringify(folded?.proposals ?? null)
  );
  const [routine] = fleet.query<{ id: string }>(
    "SELECT id FROM routines WHERE project_id = ? AND target = 'curator'",
    projectId
  );
  const slots = fleet.query<{ slot: string }>(
    "SELECT slot FROM routine_runs WHERE routine_id = ? ORDER BY started_at",
    routine?.id ?? ""
  );
  kit.check(
    "the fold's run is the curator's, its slot naming the file",
    slots.some(
      (one) => one.slot.startsWith("fold:") && one.slot.endsWith(`|${DEPLOY}`)
    ),
    JSON.stringify(slots)
  );
  // The fold is answered first: a reshape changes deploy too.
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "permission.answer",
    machineId: "hub",
    sessionId: foldRow?.id ?? "",
    payload: {
      instanceId: foldRow?.id ?? "",
      requestId: foldRow?.id ?? "",
      method: "resolvePermission",
      args: [foldRow?.id ?? "", { behavior: "deny", message: "probe" }],
    },
  });
  await until(
    "the fold answered",
    page,
    (one) => one.proposals.length === 0,
    30_000
  ).catch(() => undefined);

  const reshape = await until(
    "the curator free for the reshape",
    async () => {
      const answer = await post("/memory/propose/reshape", {});
      return { ok: answer.ok, said: await answer.text() };
    },
    (answer) => answer.ok && !answer.said.includes('"skipped"'),
    120_000
  ).catch((error: Error) => ({ ok: false, said: error.message }));
  kit.check("Reshape starts the curator's run", reshape.ok, reshape.said);
  const reshaped = await until(
    "the curator's reshape proposal",
    page,
    (one) => one.proposals.some((each) => each.kind === "reshape"),
    180_000
  ).catch(() => undefined);
  kit.check(
    "the reshape is a card at the top of Facts: a reshape across files",
    reshaped?.proposals.some(
      (each) =>
        each.kind === "reshape" && each.files.includes("knowledge/releases.md")
    ) === true,
    JSON.stringify(reshaped?.proposals ?? null)
  );
}

export default {
  name: "memory-view-curator",
  host: "the curator's run is a delegate, so its fleet cuts workspaces",
  run,
} satisfies Spec;
