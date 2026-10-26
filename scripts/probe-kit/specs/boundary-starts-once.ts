/**
 * A new delegate's workspace starts one boundary, on every harness that keeps
 * a spill folder (agent first-session.ts): the hub's cut names the session it
 * is cut for (core `WorkspaceFirstSession`), the machine places that
 * session's spill folder before the boundary starts (a Claude session's under
 * the conversation id minted at the cut, `--session-id`), and the session's
 * spawn finds the boundary's form unchanged. Before, every new workspace's
 * boundary was handed over to a second one at its first spawn, its spill
 * folder added then (landing-cutoff r287: "its boundary 3017194 … is handed
 * over to 3017329"). On a scratch fleet (real hub, agent and sessiond; each
 * harness against the mock model), boundaries included: run it where a
 * workspace boundary can start (not inside another one).
 *
 * For Claude Code, OpenCode and pi in turn, a delegate runs one command in
 * its workspace and rests in a wait, its item live, so its workspace stands
 * while the spec reads it (a finished item's workspace is settled and its
 * state dir goes, r295):
 *
 * - its command ran in the workspace's boundary;
 * - the agent decided nothing of that boundary (agent boundary.ts
 *   `BoundaryDecision`): no handover, no replacement, no older generation
 *   closed: one boundary, started as the clone was cut;
 * - the spill folder its session saves in is one the boundary started with:
 *   in the record of what that generation was granted
 *   (`boundaries/<gen>/policy.json`), and, for Claude Code, the
 *   conversation's own (`<config dir>/projects/<slug>/<session id>/tool-results`,
 *   the session id its row names).
 *
 *   bun scripts/probe-kit/run.ts boundary-starts-once
 */
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  HARNESSES,
  type HarnessKind,
} from "../../../packages/core/src/harness";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { decisionsOf } from "../agent-records";
import type { Kit, Spec } from "../kit";

const tagOf = (harness: HarnessKind) => `PROBE-ONCE-${harness.toUpperCase()}:`;
const TAG = /PROBE-ONCE-([A-Z]+):/u;
/** The command's mark, spelled apart in the command so only its output carries it whole. */
const ranMark = (harness: HarnessKind) => `ONCE-RAN-${harness.toUpperCase()}`;

/** OpenCode's Code Mode tool, which runs MCP tools from a script (source-burst's leg 6 calls `set_title` by it). */
const CODE_MODE = "execute";

const steps = new Map<
  string,
  { ran?: boolean; rested?: boolean; searched?: boolean }
>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The shell tool a harness offers, and its input for `command`. */
const shellCall = (
  offered: readonly string[],
  command: string
): { name: string; input: object } | undefined => {
  if (offered.includes("Bash")) {
    return { name: "Bash", input: { command, description: "Run it once" } };
  }
  if (offered.includes("shell")) {
    return { name: "shell", input: { command } };
  }
  return offered.includes("bash")
    ? { name: "bash", input: { command } }
    : undefined;
};

/** Each delegate runs its one command, then rests in a wait, its item live. */
const respond = (request: Seen): Reply => {
  const harness = request.tools
    ? (TAG.exec(request.all)?.[1]?.toLowerCase() as HarnessKind | undefined)
    : undefined;
  if (!(harness && HARNESSES.includes(harness))) {
    return text(request.tools ? "ok" : "Probe title");
  }
  const step = steps.get(harness) ?? {};
  steps.set(harness, step);
  if (!step.ran) {
    const mark = ranMark(harness);
    const shell = shellCall(
      request.toolNames,
      `echo "${mark.slice(0, 5)}""${mark.slice(5)}"; readlink /proc/self/ns/pid`
    );
    if (!shell) {
      return text("No shell tool is offered.");
    }
    step.ran = true;
    return call(shell.name, shell.input);
  }
  const rest = { minutes: 60, reason: "the spec reads its workspace" };
  const wait = request.toolNames.find((name) => name.endsWith("wait_item"));
  if (!step.rested && wait) {
    step.rested = true;
    return call(wait, rest);
  }
  // OpenCode offers CawCo's tools through its Code Mode tool, a script
  // calling each by its server and name.
  if (!step.rested && request.toolNames.includes(CODE_MODE)) {
    step.rested = true;
    return call(CODE_MODE, {
      code: `return await tools.cawco.wait_item(${JSON.stringify(rest)});`,
    });
  }
  if (
    !(step.rested || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return call("ToolSearch", {
      query: "select:mcp__cawco__wait_item",
      max_results: 1,
    });
  }
  return text("Done.");
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** Workspace `id`'s state dir on the agent's machine. */
const stateOf = (home: string, id: string): string =>
  join(home, ".cawco", "workspaces", id);

/** A JSON file, or undefined when it is not there or does not parse. */
const readJson = async <T>(path: string): Promise<T | undefined> =>
  JSON.parse(await readFile(path, "utf8").catch(() => "null")) ?? undefined;

/** One harness's delegate: its command run, then what its workspace's boundary went through. */
const oneHarness = async (
  kit: Kit,
  fleet: Fleet,
  home: string,
  parent: string,
  src: string,
  harness: HarnessKind
): Promise<void> => {
  const started = await fleet.api<{
    instanceId: string;
    workspaceId: string;
  }>("/api/work-items", {
    parentInstanceId: parent,
    title: `Run once, ${harness}`,
    prompt: `${tagOf(harness)} run the command once, then wait.`,
    harness,
    model: MODEL[harness],
    cwd: src,
  });
  const mark = ranMark(harness);
  const ran = await until(
    `${harness}'s command's output`,
    // The command's output, as the harness hands it back in its next request.
    () => fleet.seen.find((one) => one.body.includes(mark)),
    Boolean,
    300_000
  ).catch(() => undefined);
  const state = stateOf(home, started.workspaceId);
  const held = await readJson<{ gen?: string }>(join(state, "boundary.json"));
  const decisions = await decisionsOf(home, started.workspaceId);
  const changed = decisions.filter((one) =>
    ["handed-over", "replaced", "older-closed", "narrowed-stopped"].includes(
      one.decision
    )
  );
  kit.check(
    `${harness}: its delegate's command ran in its workspace, whose boundary the agent never handed over, replaced or closed: one boundary, started as the clone was cut`,
    ran !== undefined && held?.gen !== undefined && changed.length === 0,
    `ran: ${ran !== undefined}; boundary ${held?.gen ?? "none"}; decisions: ${JSON.stringify(decisions)}`
  );
  const granted = held?.gen
    ? await readJson<{ allowRead?: string[] }>(
        join(state, "boundaries", held.gen, "policy.json")
      )
    : undefined;
  const spills = (await readJson<string[]>(join(state, "spills.json"))) ?? [];
  const [row] = fleet.query<{ session_id: string | null }>(
    "SELECT session_id FROM instances WHERE id = ?",
    started.instanceId
  );
  const own = spills.filter((dir) =>
    harness === "claude"
      ? basename(dir) === "tool-results" &&
        basename(dirname(dir)) === row?.session_id
      : basename(dir) === started.instanceId
  );
  // As the policy grants it: by its real path.
  const real = await Promise.all(
    own.map((dir) => realpath(dir).catch(() => dir))
  );
  kit.check(
    `${harness}: the spill folder its session saves in was granted to the boundary as it started${harness === "claude" ? ", under the conversation id its row names" : ""}`,
    own.length === 1 &&
      granted?.allowRead?.some((path) => real.includes(path)) === true,
    `session ${row?.session_id ?? "unread"}; spills ${JSON.stringify(spills)}; granted ${granted?.allowRead ? JSON.stringify(granted.allowRead.filter((path) => path.includes("tool-results") || path.includes("/spills/"))) : "not on record"}`
  );
};

const run = async (kit: Kit) => {
  const nested =
    await Bun.$`bwrap --unshare-user --unshare-net --die-with-parent --ro-bind / / --dev /dev --proc /proc true`
      .quiet()
      .nothrow();
  if (nested.exitCode !== 0) {
    kit.check(
      "0: a workspace boundary can start here (run this spec on the host, not inside a workspace)",
      false,
      nested.stderr.toString().trim()
    );
    return;
  }
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
  await Bun.$`mkdir -p ${src}`.quiet();
  await Bun.write(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`sh -c ${"git init -q -b main && echo once > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Once",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  for (const harness of HARNESSES) {
    await oneHarness(kit, fleet, home, parent, src, harness);
  }
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "boundary-starts-once",
  run,
};

export default spec;
