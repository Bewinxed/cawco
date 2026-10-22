/**
 * A session taken back after an agent restart runs under every rule its
 * launch ran under (agent session.ts `#sessionContext`, claude.ts
 * `sessionSpecOf`): the hub sends the attach the spawn it launches the
 * session with (hub server.ts `restore`), and the agent reads it as a
 * launch does. On a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model), boundaries included: Caw's place and a
 * delegate's workspace each run in one, so run it where a workspace
 * boundary can start (a `host` check).
 *
 * A project's Caw, put in Full Send by the owner, and a delegate of a
 * session in Full Send (it inherits its root's mode). Each step is the
 * person's words naming it, and the mock's one Bash call:
 *
 * c1. Before the restart, Caw's `touch` (a write his gate puts on your
 *     Approve card, lead-gate.ts) goes to the hub's gate: its `lead_calls`
 *     row is `asked`, Full Send did not answer it, and no file is written.
 * d1. Before the restart, the delegate's `echo` under an ask rule of its
 *     repository's Claude Code settings (`permissions.ask`) is answered
 *     "allow" by Full Send and runs.
 * r1. The agent restarts, and attaches to both live CLIs.
 * c2. After it, Caw's next `touch` still goes to the hub's gate, as c1.
 * d2. After it, the delegate is still in Full Send: its next `echo` is
 *     answered "allow" by Full Send and runs, as d1.
 *
 *   bun scripts/probe-kit/run.ts restart-rules
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const CAW = "You are Caw";
/** The delegate's brief, which its every request carries. */
const BRIEF = "PROBE-RR-DELEGATE-BRIEF: wait for the person's steps.";
/** The command the repository's own Claude Code settings put an ask rule on. */
const ASK_RULE_COMMAND = "echo probe-ask-rule";
/** A step, in the person's words. */
const STEP_TAG = /PROBE-RR-[a-z0-9-]+/;

/** Caw's place, once his session is known: his `touch`es name files in it. */
let place = "";

/** One step as the mock plays it: its call made, then what came back. */
interface Step {
  called: boolean;
  result?: { body: string; failed: boolean };
  tag: string;
}
let step: Step | undefined;

const words = (said: string): Reply => ({ everyMs: 5, words: [said] });

/** The Bash call a step makes: Caw writes a file named for it; the delegate echoes under its ask rule. */
const callOf = (tag: string): Reply => ({
  everyMs: 5,
  words: [],
  tool: {
    name: "Bash",
    input: tag.startsWith("PROBE-RR-caw")
      ? {
          command: `touch ${join(place, `${tag}.txt`)}`,
          description: "Probe Caw's gate",
        }
      : { command: ASK_RULE_COMMAND, description: "Probe an ask rule" },
  },
});

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return words("Probe title");
  }
  const tag = STEP_TAG.exec(request.last)?.[0];
  if (tag && !request.afterTool && step?.tag !== tag) {
    step = { tag, called: false };
  }
  // Only the session the step's words were sent to plays it.
  const now = step;
  if (!(now && request.all.includes(now.tag)) || now.result) {
    return words(request.all.includes(CAW) ? "ok" : "waiting");
  }
  if (!now.called) {
    now.called = true;
    return callOf(now.tag);
  }
  if (request.afterTool) {
    now.result = { body: request.body, failed: request.toolFailed };
    return words("done");
  }
  return words("ok");
};

interface Ask {
  instanceId: string;
  machineId: string;
  payload: { toolName?: string };
  requestId: string;
}

interface CallRow {
  command: string;
  outcome: string;
}

const run = async (kit: Kit) => {
  const fleet: KitFleet = await kit.fleet(respond);
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
  // A repository whose own Claude Code settings put an ask rule on one echo.
  const repo = join(fleet.sandbox, "code");
  await mkdir(projectClaudeDir(repo), { recursive: true });
  await writeFile(
    projectClaudeDir(repo, "settings.json"),
    JSON.stringify({ permissions: { ask: [`Bash(${ASK_RULE_COMMAND})`] } })
  );
  await Bun.$`git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Restart rules",
    machineId: MACHINE,
    cwd: repo,
    caw: true,
  });
  const modeOf = (id: string) =>
    fleet.query<{ permission_mode: string | null }>(
      "SELECT permission_mode FROM instances WHERE id = ?",
      id
    )[0]?.permission_mode;
  const pending = () => fleet.api<Ask[]>("/api/pending");
  /** Sets a session's mode as the dashboard's picker does. */
  const setMode = (instanceId: string, mode: string) =>
    fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "set-permission-mode",
      machineId: MACHINE,
      sessionId: instanceId,
      payload: { mode },
    });

  // ── Caw, in Full Send ─────────────────────────────────────────────────
  const opened = await fleet.api<{ thread: { id: string } }>(
    `/api/projects/${project.id}/threads`,
    { body: "PROBE-RR: hello Caw." }
  );
  const main = opened.thread.id;
  const caw = (await until(
    "Caw's session",
    () =>
      fleet.query<{ lead_instance_id: string | null }>(
        "SELECT lead_instance_id FROM projects WHERE id = ?",
        project.id
      )[0]?.lead_instance_id ?? undefined,
    (id): id is string => Boolean(id),
    180_000
  )) as string;
  place =
    fleet.query<{ cwd: string }>(
      "SELECT cwd FROM instances WHERE id = ?",
      caw
    )[0]?.cwd ?? repo;
  await until(
    "Caw's first turn over",
    () => fleet.instance(caw),
    (row) => row?.status === "running" && row.turn_open_at === null,
    180_000
  );
  await setMode(caw, "fullSend");
  await until(
    "Caw in Full Send",
    () => modeOf(caw),
    (mode) => mode === "fullSend",
    60_000
  ).catch(() => undefined);

  /**
   * Caw's step: the person's words in main, then the gate's row for his
   * `touch`, and the agent's ask line for it. A card he gets is denied, so
   * his turn ends.
   */
  const cawStep = async (tag: string) => {
    const agentMark = await fleet.logMark("agent");
    await fleet.api(`/api/projects/${project.id}/threads/${main}/messages`, {
      body: `Run step ${tag}.`,
    });
    const file = join(place, `${tag}.txt`);
    const row = await until(
      `the gate's row for ${tag}`,
      () =>
        fleet
          .query<CallRow>(
            "SELECT command, outcome FROM lead_calls WHERE project_id = ? AND tool = 'Bash' AND command LIKE ?",
            project.id,
            `%${tag}%`
          )
          .at(0),
      Boolean,
      120_000
    ).catch(() => undefined);
    const card = await until(
      `the card for ${tag}`,
      async () =>
        (await pending()).find(
          (ask) => ask.instanceId === caw && ask.payload.toolName === "Bash"
        ),
      Boolean,
      30_000
    ).catch(() => undefined);
    if (card) {
      await fleet.post({
        type: "command",
        commandId: crypto.randomUUID(),
        kind: "permission.answer",
        machineId: card.machineId,
        sessionId: card.instanceId,
        payload: {
          requestId: card.requestId,
          args: [card.requestId, { behavior: "deny", message: "Probe: no." }],
        },
      });
    }
    await until(
      `Caw's turn for ${tag} over`,
      () => fleet.instance(caw),
      (now) => now?.turn_open_at === null,
      120_000
    ).catch(() => undefined);
    const asked = (await agentMark.since())
      .split("\n")
      .find((line) => line.includes("[claude] permission asked: Bash"));
    return { row, card: card !== undefined, asked, written: existsSync(file) };
  };
  const gated = (seen: Awaited<ReturnType<typeof cawStep>>) =>
    seen.row?.outcome === "asked" &&
    seen.card &&
    seen.asked !== undefined &&
    !seen.asked.includes("[full send: answered]") &&
    !seen.written;
  const gatedDetail = (seen: Awaited<ReturnType<typeof cawStep>>) =>
    `mode ${modeOf(caw)}; row ${JSON.stringify(seen.row)}; card ${seen.card}; written ${seen.written}; log: ${seen.asked ?? "none"}`;

  const before = await cawStep("PROBE-RR-caw-before");
  kit.check(
    "c1: Caw in Full Send, before the restart: his touch goes to the hub's gate (row asked, your card), Full Send does not answer it, and nothing is written",
    modeOf(caw) === "fullSend" && gated(before),
    gatedDetail(before)
  );

  // ── A delegate of a session in Full Send ──────────────────────────────
  const parent = await fleet.spawn("claude", "Full Send parent", repo, {
    projectId: project.id,
    permissionMode: "fullSend",
  });
  const made = await fleet.api<{
    instanceId: string | null;
    workItemId: string | null;
  }>("/api/work-items", {
    parentInstanceId: parent,
    title: "Restart rules delegate",
    prompt: BRIEF,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: repo,
  });
  const delegate = made.instanceId as string;
  await until(
    "the delegate's first turn over",
    () => fleet.instance(delegate),
    (row) => row?.status === "running" && row.turn_open_at === null,
    180_000
  );
  /** The delegate's step: the person's words, then what its echo came back with and the agent's ask line for it. */
  const delegateStep = async (tag: string) => {
    const agentMark = await fleet.logMark("agent");
    await fleet.send(delegate, `${BRIEF} Run step ${tag}.`);
    const result = await until(
      `step ${tag} answered`,
      () => (step?.tag === tag ? step.result : undefined),
      Boolean,
      120_000
    ).catch(() => undefined);
    const answered = (await agentMark.since())
      .split("\n")
      .find((line) => line.includes("[claude] permission asked: Bash"));
    const left = (await pending()).filter((ask) => ask.instanceId === delegate);
    return { result, answered, left };
  };
  const sent = (seen: Awaited<ReturnType<typeof delegateStep>>) =>
    seen.result?.failed === false &&
    seen.result.body
      .slice(seen.result.body.lastIndexOf("PROBE-RR-delegate"))
      .includes("probe-ask-rule") &&
    (seen.answered ?? "").includes("[full send: answered]") &&
    seen.left.length === 0;
  const sentDetail = (seen: Awaited<ReturnType<typeof delegateStep>>) =>
    `mode ${modeOf(delegate)}; failed ${seen.result?.failed}; pending ${seen.left.length}; log: ${seen.answered ?? "none"}`;

  const dBefore = await delegateStep("PROBE-RR-delegate-before");
  kit.check(
    "d1: a delegate of a Full Send session is in Full Send, and before the restart its echo under the repository's ask rule is answered allow and runs",
    modeOf(delegate) === "fullSend" && sent(dBefore),
    sentDetail(dBefore)
  );

  // ── The agent restarts, and takes both back ───────────────────────────
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const attached = await until(
    "the agent attached to both CLIs",
    () => fleet.logs("agent"),
    (said) =>
      said.includes(`[custody] ${caw}: attached to its live process`) &&
      said.includes(`[custody] ${delegate}: attached to its live process`),
    180_000
  ).catch(() => "");
  kit.check(
    "r1: the restarted agent attaches to Caw's and the delegate's live CLIs",
    attached !== "",
    attached === ""
      ? "not both attached"
      : `${caw} and ${delegate} attached to their live processes`
  );

  const after = await cawStep("PROBE-RR-caw-after");
  kit.check(
    "c2: after the restart, Caw in Full Send: his touch still goes to the hub's gate (row asked, your card), Full Send does not answer it, and nothing is written",
    modeOf(caw) === "fullSend" && gated(after),
    gatedDetail(after)
  );
  const dAfter = await delegateStep("PROBE-RR-delegate-after");
  kit.check(
    "d2: after the restart, the delegate is still in Full Send: its echo under the repository's ask rule is answered allow and runs",
    modeOf(delegate) === "fullSend" && sent(dAfter),
    sentDetail(dAfter)
  );
};

const spec: Spec = {
  name: "restart-rules",
  host: "a project's Caw starts in a bounded place, and a delegate cuts a workspace",
  run,
};
export default spec;
