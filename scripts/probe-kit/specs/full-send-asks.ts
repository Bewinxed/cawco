/**
 * A session in Full Send never puts an approval to the person: every admin
 * write it makes runs at once, whichever door it came in by and however
 * recently the mode was set (hub asks.ts). The owner's case of 2026-11-05:
 * his Caw session asked him to approve seven `admin_skills_write` installs,
 * and the three still open when he switched it to Full Send stayed open
 * until he approved each by hand.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), each session's admin write made through the REST door with
 * its own credential, as its MCP call reaches the hub, and its mode switched
 * with the very envelope the session card's mode control sends:
 *
 * (a) A session in Bypass asks the person to approve `admin_rules_write`.
 *     The card's mode control switches it to Full Send (the
 *     `set-permission-mode` command, applied). The open approval is gone
 *     from every screen (`/api/pending`), approved by Full Send, and its
 *     rule was made; the session is told Full Send approved it.
 * (b) Its very next `admin_rules_write` runs at once: its call answers the
 *     tool's own words, nothing is put to the person, and the rule is there.
 * (c) A session in Accept edits asks to approve a write; the card's mode
 *     control starts it again in Full Send (the dashboard's relaunch spawn).
 *     Its open approval is approved by Full Send and its rule made, and its
 *     next write runs at once.
 * (d) A write made while the switch is on its way (the call and the command
 *     sent together) leaves nothing open once the switch has applied, and
 *     its rule is made.
 * (e) A session in Bypass whose repository's ask rule makes Claude Code ask
 *     for a shell command (`permissions.ask`, which Bypass still asks): its
 *     prompt waits on the person. The card's mode control switches it to
 *     Full Send: the prompt is approved by Full Send (the agent says so), it
 *     leaves every screen, and the command runs.
 * (f) A continuation asked by a session in Accept edits (its
 *     `continue_session`, naming no mode for the new session, while its
 *     machine is paused so the new session cannot start yet). The asking
 *     session is switched to Full Send by the mode control, the pause ends,
 *     and the new session starts in Full Send: the asking session's mode as
 *     it starts, not as the continuation was asked.
 *
 *   bun scripts/probe-kit/run.ts full-send-asks
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchHub, hubRequest } from "../../../packages/core/src/hub-request";
import { projectClaudeDir } from "../../../packages/core/src/paths/claude";
import type { ContinuationJob } from "../../../packages/core/src/protocol";
import { toolWords } from "../../lib/tool-call";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const TAG = crypto.randomUUID().slice(0, 8);
/** The person's words that make the mock call {@link ASKED_COMMAND} (e). */
const BASH_STEP = `PROBE-FSA-BASH-${TAG}`;
/** The shell command the repository's ask rule asks for (e). */
const ASKED_COMMAND = "echo probe-full-send-asked";
/** The agent's line for a prompt Full Send approved as its session entered it (claude.ts `#answerOpen`). */
const APPROVED_LINE = "approved by Full Send as the session entered it";

/** What the mock heard come back from {@link ASKED_COMMAND}. */
const heardResults: string[] = [];

/** The mock: (e)'s step calls the asked command; every other request says ok. */
const respond = (request: Seen): Reply => {
  if (request.all.includes(BASH_STEP)) {
    if (request.afterTool) {
      heardResults.push(request.last);
      return { everyMs: 5, words: ["done"] };
    }
    if (request.toolNames.includes("Bash")) {
      return {
        everyMs: 5,
        words: [],
        tool: {
          name: "Bash",
          input: { command: ASKED_COMMAND, description: "Probe step" },
        },
      };
    }
  }
  return { everyMs: 5, words: ["ok"] };
};
/** What an approve ask's call answers (core asks.ts `askRecordedWords`). */
const RECORDED = "Recorded as";

interface Parked {
  instanceId?: string;
  payload: { toolName?: string };
  requestId?: string;
}

/** The approvals `instanceId` has on every screen now. */
const parkedOf = async (fleet: KitFleet, instanceId: string) =>
  (await fleet.api<Parked[]>(hubRequest("GET /api/pending"))).filter(
    (one) => one.instanceId === instanceId && one.requestId?.startsWith("ask_")
  );

/** Whether a rule named `name` is among the fleet's rules. */
const ruleMade = async (fleet: KitFleet, name: string): Promise<boolean> =>
  (
    await fleet.api<{ rules: { name: string }[] }>(hubRequest("GET /api/rules"))
  ).rules.some((rule) => rule.name === name);

/** `instanceId`'s `admin_rules_write` making a disabled rule named `name`: the call's words. */
const writeRule = async (fleet: KitFleet, instanceId: string, name: string) =>
  await toolWords(
    {
      base: fleet.base,
      id: instanceId,
      credential: await fleet.sessionCredential(instanceId),
    },
    "admin_rules_write",
    {
      action: "create",
      name,
      enabled: false,
      pattern: `full-send-asks-${TAG}`,
      reply: "Nothing to do.",
      reason: `The full-send-asks probe's rule ${name}.`,
    }
  );

/** The answer an ask's record keeps (`asks.record`), by its id. */
const answerOf = (fleet: KitFleet, id: string) => {
  const [row] = fleet.query<{ state: string; record: string }>(
    "SELECT state, record FROM asks WHERE id = ?",
    id
  );
  const record = row
    ? (JSON.parse(row.record) as {
        answer?: { by?: { via?: string; behavior?: string } };
      })
    : undefined;
  return { state: row?.state, by: record?.answer?.by };
};

/** The mode `instanceId`'s row reads. */
const modeOf = (fleet: KitFleet, instanceId: string) =>
  fleet.query<{ mode: string | null }>(
    "SELECT permission_mode AS mode FROM instances WHERE id = ?",
    instanceId
  )[0]?.mode ?? null;

/** Waits until `instanceId` has no approval open; answers how many it has then. */
const settledOpen = async (fleet: KitFleet, instanceId: string) =>
  await until(
    `${instanceId.slice(0, 8)} with no approval open`,
    async () => (await parkedOf(fleet, instanceId)).length,
    (open) => open === 0,
    30_000
  ).catch(async () => (await parkedOf(fleet, instanceId)).length);

/** Waits until a rule named `name` is made; answers whether it was. */
const madeWithin = async (fleet: KitFleet, name: string) =>
  await until(
    `rule ${name} made`,
    () => ruleMade(fleet, name),
    (made) => made,
    30_000
  ).catch(() => false);

/** (e): a harness's own prompt, open as the card switches Bypass to Full Send. */
const promptLeg = async (kit: Kit, fleet: KitFleet) => {
  const { check } = kit;
  const asking = join(fleet.sandbox, "ask-rule");
  await mkdir(projectClaudeDir(asking), { recursive: true });
  await writeFile(
    projectClaudeDir(asking, "settings.json"),
    JSON.stringify({ permissions: { ask: [`Bash(${ASKED_COMMAND}:*)`] } })
  );
  const prompted = await fleet.spawn("claude", "Full Send prompt", asking);
  const agentMark = await fleet.logMark("agent");
  await fleet.send(prompted, BASH_STEP);
  /** The harness's own prompts `prompted` has on every screen (not the hub's asks). */
  const promptsOf = async () =>
    (await fleet.api<Parked[]>(hubRequest("GET /api/pending"))).filter(
      (one) => one.instanceId === prompted && !one.requestId?.startsWith("ask_")
    );
  const [prompt] = await until(
    "the ask rule's prompt on every screen",
    promptsOf,
    (open) => open.length > 0,
    120_000
  ).catch(() => []);
  const promptSwitch = await fleet.command(
    prompted,
    "set-permission-mode",
    "setPermissionMode",
    ["fullSend"]
  );
  const promptsLeft = await until(
    "the prompt gone from every screen",
    async () => (await promptsOf()).length,
    (left) => left === 0,
    30_000
  ).catch(async () => (await promptsOf()).length);
  const ran = await until(
    "the asked command's output heard",
    () => heardResults.join("\n"),
    (said) => said.includes("probe-full-send-asked"),
    60_000
  ).catch(() => heardResults.join("\n"));
  const agentSaid = await agentMark.since();
  check(
    "(e) a harness's prompt open as the card's mode control switches the session from Bypass to Full Send is approved by Full Send, leaves every screen, and its call runs",
    prompt?.payload.toolName === "Bash" &&
      promptSwitch.stage === "applied" &&
      promptsLeft === 0 &&
      ran.includes("probe-full-send-asked") &&
      agentSaid.includes(APPROVED_LINE),
    `the prompt: ${prompt ? `${prompt.requestId} (${prompt.payload.toolName})` : "none"}; the switch: ${JSON.stringify(promptSwitch)}; prompts left: ${promptsLeft}; the command said: ${ran.slice(0, 200) || "nothing"}; the agent said Full Send approved it: ${agentSaid.includes(APPROVED_LINE)}`
  );
};

/** (f): a continuation asked in Accept edits, started after a switch to Full Send. */
const continuationLeg = async (kit: Kit, fleet: KitFleet, cwd: string) => {
  const { check } = kit;
  const source = await fleet.spawn("claude", "Continued source", cwd);
  const said = await fleet.send(source, "Say ok.");
  await until(
    "the source's turn read and ended",
    () => ({ send: fleet.sendRow(said), row: fleet.instance(source) }),
    ({ send, row }) => send?.state === "read" && !row?.turn_open_at,
    180_000
  );
  const caller = await fleet.spawn("claude", "Continuing caller", cwd, {
    permissionMode: "acceptEdits",
  });
  const paused = await fetchHub(
    fetch,
    fleet.base,
    hubRequest("POST /api/machines/:machineId/pause", {
      path: { machineId: MACHINE },
      body: {
        until: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
    })
  );
  const before = new Set(
    (
      await fleet.api<ContinuationJob[]>(hubRequest("GET /api/continuations"))
    ).map((one) => one.id)
  );
  const continuing = toolWords(
    {
      base: fleet.base,
      id: caller,
      credential: await fleet.sessionCredential(caller),
    },
    "continue_session",
    {
      session: source,
      from: "asks",
      target_harness: "claude",
      target_model: MODEL.claude,
    },
    { timeoutMs: 300_000 }
  );
  const job = await until(
    "the continuation held at its start",
    async () =>
      (
        await fleet.api<ContinuationJob[]>(hubRequest("GET /api/continuations"))
      ).find((one) => !before.has(one.id)),
    (one) => one?.stage === "starting",
    60_000
  ).catch(() => undefined);
  const callerSwitch = await fleet.command(
    caller,
    "set-permission-mode",
    "setPermissionMode",
    ["fullSend"]
  );
  const callerMode = modeOf(fleet, caller);
  await fleet.api(
    hubRequest("POST /api/machines/:machineId/resume", {
      path: { machineId: MACHINE },
    })
  );
  const answered = await continuing;
  const started = job
    ? await until(
        "the continuation started",
        async () =>
          (
            await fleet.api<ContinuationJob[]>(
              hubRequest("GET /api/continuations")
            )
          ).find((one) => one.id === job.id),
        (one) => one !== undefined && ["started", "failed"].includes(one.stage),
        180_000
      ).catch(() => undefined)
    : undefined;
  const targetMode = job ? modeOf(fleet, job.targetInstanceId) : null;
  check(
    "(f) a continuation asked by a session in Accept edits, switched to Full Send before the continuation starts, starts its new session in Full Send",
    paused.status === 200 &&
      job?.stage === "starting" &&
      callerSwitch.stage === "applied" &&
      callerMode === "fullSend" &&
      started?.stage === "started" &&
      targetMode === "fullSend",
    `pause: ${paused.status}; the job held: ${job ? `${job.id} at ${job.stage}` : "none"}; the switch: ${JSON.stringify(callerSwitch)}, the caller's row ${callerMode}; the job ended ${started?.stage ?? "unseen"}${started?.error ? ` (${started.error})` : ""}; its new session's mode: ${targetMode}; continue_session said: ${answered.text.slice(0, 200)}`
  );
};

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const cwd = join(fleet.sandbox, "full-send");
  await mkdir(cwd, { recursive: true });

  // (a) Bypass, an approval open, then Full Send from the card's control.
  const bypass = await fleet.spawn("claude", "Full Send by control", cwd);
  const firstName = `fs-a-${TAG}`;
  const first = await writeRule(fleet, bypass, firstName);
  const [firstAsk] = await parkedOf(fleet, bypass);
  const switched = await fleet.command(
    bypass,
    "set-permission-mode",
    "setPermissionMode",
    ["fullSend"]
  );
  const openAfter = await settledOpen(fleet, bypass);
  const firstMade = await madeWithin(fleet, firstName);
  const firstAnswer = firstAsk?.requestId
    ? answerOf(fleet, firstAsk.requestId)
    : undefined;
  check(
    "(a) an approval a session in Bypass had open is approved by Full Send as the card's mode control switches it, and its write runs",
    first.text.includes(RECORDED) &&
      !!firstAsk &&
      switched.stage === "applied" &&
      modeOf(fleet, bypass) === "fullSend" &&
      openAfter === 0 &&
      firstMade &&
      firstAnswer?.by?.via === "fullSend" &&
      firstAnswer.by.behavior === "allow",
    `the write said: ${first.text.slice(0, 160)}; its ask: ${firstAsk?.requestId ?? "none"}; the switch: ${JSON.stringify(switched)}, row mode ${modeOf(fleet, bypass)}; open after: ${openAfter}; rule made: ${firstMade}; the ask's answer: ${JSON.stringify(firstAnswer)}`
  );

  // (b) Its very next write runs at once.
  const nextName = `fs-b-${TAG}`;
  const next = await writeRule(fleet, bypass, nextName);
  const nextOpen = (await parkedOf(fleet, bypass)).length;
  const nextMade = await ruleMade(fleet, nextName);
  check(
    "(b) the very next admin write of a session switched to Full Send runs at once, putting nothing to the person",
    !(next.refused || next.text.includes(RECORDED)) &&
      nextOpen === 0 &&
      nextMade,
    `the write said: ${next.text.slice(0, 160)}; open: ${nextOpen}; rule made: ${nextMade}`
  );

  // (c) Accept edits, an approval open, then Full Send: the card starts it
  // again in place (SessionDetails `changePermission`, client.svelte.ts
  // `relaunchSession`).
  const edits = await fleet.spawn("claude", "Full Send by relaunch", cwd, {
    permissionMode: "acceptEdits",
  });
  const relaunchName = `fs-c-${TAG}`;
  const asked = await writeRule(fleet, edits, relaunchName);
  const [relaunchAsk] = await parkedOf(fleet, edits);
  const sessionKey = fleet.query<{ key: string | null }>(
    "SELECT session_id AS key FROM instances WHERE id = ?",
    edits
  )[0]?.key;
  const spawnedBefore = fleet.instance(edits)?.spawned_at ?? 0;
  await fleet.post({
    verb: "spawn",
    machineId: MACHINE,
    instanceId: edits,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId: edits,
      cwd,
      harness: "claude",
      ...(sessionKey ? { resume: { sessionKey } } : {}),
      relaunch: true,
      permissionMode: "fullSend",
      model: MODEL.claude,
    },
  });
  const relaunchedMode = await until(
    "the relaunched row in Full Send",
    () => modeOf(fleet, edits),
    (mode) => mode === "fullSend",
    60_000
  ).catch(() => modeOf(fleet, edits));
  // Its next write is its new process's, on the credential that launch holds.
  await until(
    "the relaunched session running",
    () => fleet.instance(edits),
    (row) => row?.status === "running" && (row.spawned_at ?? 0) > spawnedBefore,
    180_000
  ).catch(() => undefined);
  const relaunchOpen = await settledOpen(fleet, edits);
  const relaunchMade = await madeWithin(fleet, relaunchName);
  const relaunchAnswer = relaunchAsk?.requestId
    ? answerOf(fleet, relaunchAsk.requestId)
    : undefined;
  const afterName = `fs-c2-${TAG}`;
  const after = await writeRule(fleet, edits, afterName);
  check(
    "(c) an approval a session in Accept edits had open is approved by Full Send as the card starts it again in Full Send, and its next write runs at once",
    asked.text.includes(RECORDED) &&
      !!relaunchAsk &&
      relaunchedMode === "fullSend" &&
      relaunchOpen === 0 &&
      relaunchMade &&
      relaunchAnswer?.by?.via === "fullSend" &&
      !(after.refused || after.text.includes(RECORDED)) &&
      (await ruleMade(fleet, afterName)),
    `the write said: ${asked.text.slice(0, 160)}; its ask: ${relaunchAsk?.requestId ?? "none"}; row mode ${relaunchedMode}; open after: ${relaunchOpen}; rule made: ${relaunchMade}; the ask's answer: ${JSON.stringify(relaunchAnswer)}; the next write said: ${after.text.slice(0, 160)}`
  );

  // (d) A write and the switch at once.
  const racing = await fleet.spawn("claude", "Full Send mid-call", cwd);
  const raceName = `fs-d-${TAG}`;
  const [raced, raceSwitch] = await Promise.all([
    writeRule(fleet, racing, raceName),
    fleet.command(racing, "set-permission-mode", "setPermissionMode", [
      "fullSend",
    ]),
  ]);
  const raceOpen = await settledOpen(fleet, racing);
  const raceMade = await madeWithin(fleet, raceName);
  check(
    "(d) a write made while the switch to Full Send is on its way leaves nothing open once it applies, and runs",
    raceSwitch.stage === "applied" && raceOpen === 0 && raceMade,
    `the write said: ${raced.text.slice(0, 160)}; the switch: ${JSON.stringify(raceSwitch)}; open after: ${raceOpen}; rule made: ${raceMade}`
  );

  await promptLeg(kit, fleet);
  await continuationLeg(kit, fleet, cwd);
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "full-send-asks",
  run,
};

export default spec;
