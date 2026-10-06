#!/usr/bin/env bun
/**
 * Real-turn restart probe: what a restart of the agent, or of the hub, does to
 * sessions caught in the middle of real work, on this machine, with its real
 * services and its signed-in harnesses.
 *
 * Each case drives a real session through the hub's own HTTP API and its
 * dashboard socket into one state (model streaming, a long shell command, an
 * open permission ask, a CawCo tool call, a work item's checks, a message
 * queued behind a running turn, an image generation), then restarts one
 * service through the service manager: the agent cleanly, the agent's main
 * process with SIGKILL, or the hub. It then records whether the turn
 * completed, the transcript's gaps and duplicates, whether an open ask could
 * still be answered, and the last thing the model said. A table goes to
 * stdout and every run to a JSON file.
 *
 * It spends tokens and restarts this machine's services, so it does nothing
 * without `--yes`. `--dry-run` prints the plan and touches nothing.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { hostname, platform, tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessKind, PermissionMode } from "../packages/core/src/harness";
import type {
  TranscriptBlock,
  TranscriptPage,
} from "../packages/core/src/transcript-types";

const help = (
  cases: readonly string[]
) => `probe-restart-turns — restart CawCo's services under real turns and record what survives

Usage
  bun scripts/probe-restart-turns.ts --yes [options]
  bun scripts/probe-restart-turns.ts --dry-run [options]

Options
  --yes                 run it: real sessions, real tokens, real restarts
  --dry-run             print the plan and touch nothing
  --only <case>         one case (repeatable): ${cases.join(", ")}
  --harness <name>      one harness (repeatable): claude, opencode, pi
  --restart <kind>      one restart (repeatable): agent, agent-kill, hub
  --hub <url>           the hub (default http://127.0.0.1:$CAWCO_HUB_PORT or 3456)
  --machine <id>        this machine's id (default: the hub's row for this hostname)
  --cwd <dir>           where the sessions work (default: a fresh scratch folder)
  --repo <dir>          a git repository with a remote, for the finish-item case
                        (a delegate's workspace is cut from it)
  --model <h>=<model>   the model a harness runs (default: its machine's first)
  --out <file>          the JSON (default: a timestamped file in the temp folder)
  --help                this

Restarts
  agent       systemctl --user restart cawco-agent.service (launchctl kickstart -k on macOS)
  agent-kill  SIGKILL to the agent's main process; the service manager starts it again
  hub         systemctl --user restart cawco-hub.service (launchctl kickstart -k on macOS)

The hub restart cuts every CawCo tool call held open at the hub; the agent
restart cuts what the agent carries itself. Neither should cut a turn.`;

type Restart = "agent" | "agent-kill" | "hub";
const RESTARTS: readonly Restart[] = ["agent", "agent-kill", "hub"];
const HARNESSES: readonly HarnessKind[] = ["claude", "opencode", "pi"];

/** How long a session gets to reach a case's state, and its turn to end after the restart. */
const REACH_MS = 3 * 60_000;
const SETTLE_MS = 6 * 60_000;
const POLL_MS = 1000;
const TRAILING_SLASH = /\/$/;
const HTTP_SCHEME = /^http/;

/** What one run found. */
interface Outcome {
  /** An ask open before the restart that could still be answered after it. */
  askAnswerable?: boolean;
  case: string;
  /** The turn ended, and said what it was asked to. */
  completed: boolean;
  /** Transcript blocks seen twice. */
  duplicates: number;
  error?: string;
  /** Transcript gaps the hub or the agent announced. */
  gaps: number;
  harness: HarnessKind;
  instanceId?: string;
  /** The last thing the model said, as the transcript has it. */
  modelSaw: string;
  ms: number;
  note?: string;
  reached: boolean;
  restart: Restart;
  /** How the turn ended: the last result block's type. */
  turnEnd: string;
}

/** A session the probe drives. */
interface Run {
  answer: (requestId: string, result: unknown) => Promise<void>;
  blocks: () => Promise<TranscriptBlock[]>;
  harness: HarnessKind;
  instanceId: string;
  note: (line: string) => void;
  page: () => Promise<TranscriptPage>;
  pending: () => Promise<PendingAsk[]>;
  send: (text: string) => Promise<void>;
}

interface PendingAsk {
  payload: {
    input?: { questions?: { question: string }[] };
    instanceId: string;
    requestId: string;
    toolName?: string;
  };
}

interface Case {
  /** Where the session works, when the case needs more than a folder. */
  cwd?: (options: Options) => string | undefined;
  /** A string the transcript must hold once the turn is over. */
  expect?: string;
  harnesses: readonly HarnessKind[];
  id: string;
  mode?: PermissionMode;
  prompt: string;
  /** Resolves once the session is in the state the restart should cut through. */
  reach: (run: Run) => Promise<void>;
  /** After the services are back: answer what is open, read what landed. */
  settle?: (run: Run, before: Snapshot) => Promise<Partial<Outcome>>;
  what: string;
}

/** What was open just before the restart. */
interface Snapshot {
  asks: PendingAsk[];
}

interface Options {
  cwd?: string;
  dryRun: boolean;
  harnesses: HarnessKind[];
  hub: string;
  machine?: string;
  models: Partial<Record<HarnessKind, string>>;
  only: string[];
  out?: string;
  repo?: string;
  restarts: Restart[];
  yes: boolean;
}

const delay = (ms: number) => Bun.sleep(ms);

async function until<T>(
  label: string,
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  ms = REACH_MS
): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each observation follows the live services' previous state
    const value = await read().catch(() => undefined as T);
    if (value !== undefined && accept(value)) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new Error(`${label} did not happen in ${ms / 1000}s`);
    }
    await delay(POLL_MS);
  }
}

const textOf = (blocks: TranscriptBlock[]): string =>
  blocks.map((block) => block.content).join("\n");

const toolCalled = (run: Run, name: string) =>
  until(`a ${name} call`, run.blocks, (blocks) =>
    blocks.some(
      (block) => block.type === "tool.use" && block.content.includes(name)
    )
  ).then(() => undefined);

const askOpen = (run: Run) =>
  until("an open ask", run.pending, (asks) =>
    asks.some((ask) => ask.payload.instanceId === run.instanceId)
  ).then(() => undefined);

/** The ask the snapshot held, open again after the restart, answered with `result`. */
async function answerAgain(
  run: Run,
  before: Snapshot,
  result: (ask: PendingAsk) => unknown
): Promise<Partial<Outcome>> {
  const [held] = before.asks.filter(
    (ask) => ask.payload.instanceId === run.instanceId
  );
  if (!held) {
    return { askAnswerable: false, note: "no ask was open at the restart" };
  }
  const again = await until(
    "the ask parked again",
    run.pending,
    (asks) => asks.some((ask) => ask.payload.instanceId === run.instanceId),
    60_000
  ).catch(() => undefined);
  const open = again?.find((ask) => ask.payload.instanceId === run.instanceId);
  if (!open) {
    return { askAnswerable: false, note: "the ask was not open after it" };
  }
  await run.answer(open.payload.requestId, result(open));
  return {
    askAnswerable: true,
    note:
      open.payload.requestId === held.payload.requestId
        ? "answered under its own request id"
        : `answered as ${open.payload.requestId}, was ${held.payload.requestId}`,
  };
}

const CASES: readonly Case[] = [
  {
    id: "streaming",
    what: "the model streaming a long answer",
    harnesses: HARNESSES,
    mode: "bypassPermissions",
    prompt:
      "Write the numbers from one to three hundred in words, one per line, and nothing else.",
    expect: "three hundred",
    reach: (run) =>
      until("streaming text", run.page, (page) =>
        Boolean(page.tail && page.tail.streaming.length > 40)
      ).then(() => undefined),
  },
  {
    id: "shell",
    what: "a long shell command running",
    harnesses: HARNESSES,
    mode: "bypassPermissions",
    prompt:
      "Run exactly this shell command with your shell tool, then reply with its output and nothing else: sleep 60; echo probe-done",
    expect: "probe-done",
    reach: (run) => toolCalled(run, "sleep 60"),
  },
  {
    id: "ask-default",
    what: "a permission ask open, in default mode",
    harnesses: ["claude", "opencode"],
    mode: "default",
    prompt:
      "Run exactly this shell command with your shell tool, then reply with its output: echo probe-asked",
    expect: "probe-asked",
    reach: askOpen,
    settle: (run, before) =>
      answerAgain(run, before, () => ({ behavior: "allow" })),
  },
  {
    id: "ask-bypass",
    what: "a question open, in bypassPermissions",
    harnesses: ["claude"],
    mode: "bypassPermissions",
    prompt:
      "Use the AskUserQuestion tool to ask me one question: red or blue, with those two options. Then reply with only the colour I chose.",
    expect: "red",
    reach: askOpen,
    settle: (run, before) =>
      answerAgain(run, before, (ask) => {
        const question = ask.payload.input?.questions?.[0]?.question ?? "";
        return {
          behavior: "allow",
          updatedInput: { answers: { [question]: "red" } },
        };
      }),
  },
  {
    id: "mcp-short",
    what: "a short CawCo tool call",
    harnesses: HARNESSES,
    mode: "bypassPermissions",
    prompt:
      "Call the CawCo list_sessions tool exactly once, then reply with the word probe-listed and the first line it returned.",
    expect: "probe-listed",
    reach: (run) => toolCalled(run, "list_sessions"),
  },
  {
    id: "finish-item",
    what: "a work item's checks running after finish_item",
    harnesses: HARNESSES,
    mode: "bypassPermissions",
    cwd: (options) => options.repo,
    prompt: "",
    reach: () => Promise.resolve(),
  },
  {
    id: "queued-send",
    what: "a message queued behind a running turn, not yet handed to the harness",
    harnesses: HARNESSES,
    mode: "bypassPermissions",
    prompt:
      "Run exactly this shell command with your shell tool, then reply with its output: sleep 45; echo probe-done",
    expect: "probe-queued",
    reach: async (run) => {
      await toolCalled(run, "sleep 45");
      await run.send(
        "When you are done, also reply with the word probe-queued."
      );
      await until(
        "the send queued",
        run.page,
        (page) => (page.queued?.length ?? 0) > 0
      );
    },
  },
  {
    id: "image",
    what: "an image generation running",
    harnesses: HARNESSES,
    mode: "bypassPermissions",
    prompt:
      "Call the CawCo generate_image tool once: a plain red square, output_path probe-red.png, size 1024x1024, quality low. Then reply with the word probe-image and the path it returned.",
    expect: "probe-image",
    reach: (run) => toolCalled(run, "generate_image"),
  },
];

function parse(argv: string[]): Options | "help" {
  const options: Options = {
    dryRun: false,
    harnesses: [],
    hub: `http://127.0.0.1:${process.env.CAWCO_HUB_PORT ?? 3456}`,
    models: {},
    only: [],
    restarts: [],
    yes: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      i += 1;
      const next = argv[i];
      if (next === undefined) {
        throw new Error(`${flag} needs a value`);
      }
      return next;
    };
    switch (flag) {
      case "--help":
      case "-h":
        return "help";
      case "--yes":
        options.yes = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--only":
        options.only.push(value());
        break;
      case "--harness":
        options.harnesses.push(value() as HarnessKind);
        break;
      case "--restart":
        options.restarts.push(value() as Restart);
        break;
      case "--hub":
        options.hub = value().replace(TRAILING_SLASH, "");
        break;
      case "--machine":
        options.machine = value();
        break;
      case "--cwd":
        options.cwd = value();
        break;
      case "--repo":
        options.repo = value();
        break;
      case "--out":
        options.out = value();
        break;
      case "--model": {
        const [harness, ...model] = value().split("=");
        options.models[harness as HarnessKind] = model.join("=");
        break;
      }
      default:
        throw new Error(`unknown option ${flag}; see --help`);
    }
  }
  return options;
}

/** The (case, harness, restart) triples the options select, in order. */
function plan(options: Options) {
  const unknown = [
    ...options.only.filter((id) => !CASES.some((one) => one.id === id)),
    ...options.harnesses.filter((h) => !HARNESSES.includes(h)),
    ...options.restarts.filter((r) => !RESTARTS.includes(r)),
  ];
  if (unknown.length > 0) {
    throw new Error(`unknown: ${unknown.join(", ")}; see --help`);
  }
  const cases = CASES.filter(
    (one) => options.only.length === 0 || options.only.includes(one.id)
  );
  const restarts = options.restarts.length ? options.restarts : RESTARTS;
  return cases.flatMap((one) =>
    one.harnesses
      .filter(
        (h) => options.harnesses.length === 0 || options.harnesses.includes(h)
      )
      .flatMap((harness) =>
        restarts.map((restart) => ({ case: one, harness, restart }))
      )
  );
}

/** The service manager's command for a restart, as it will run. */
function restartCommand(kind: Restart, uid: number): string[] {
  const unit = kind === "hub" ? "hub" : "agent";
  if (platform() === "darwin") {
    return kind === "agent-kill"
      ? ["launchctl", "kill", "SIGKILL", `gui/${uid}/dev.cawco.agent`]
      : ["launchctl", "kickstart", "-k", `gui/${uid}/dev.cawco.${unit}`];
  }
  return kind === "agent-kill"
    ? [
        "systemctl",
        "--user",
        "kill",
        "--signal=SIGKILL",
        "--kill-whom=main",
        "cawco-agent.service",
      ]
    : ["systemctl", "--user", "restart", `cawco-${unit}.service`];
}

function hubClient(options: Options) {
  const api = async <T>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${options.hub}${path}`, {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${path}: ${response.status} ${text}`);
    }
    return JSON.parse(text) as T;
  };
  let socket: WebSocket | undefined;
  /** The dashboard socket, opened again after a hub restart closed it. */
  const open = async (): Promise<WebSocket> => {
    if (socket?.readyState === WebSocket.OPEN) {
      return socket;
    }
    const next = new WebSocket(
      `${options.hub.replace(HTTP_SCHEME, "ws")}/ws/dashboard`
    );
    await new Promise<void>((done, fail) => {
      next.onopen = () => done();
      next.onerror = () => fail(new Error("the dashboard socket did not open"));
    });
    socket = next;
    return next;
  };
  const post = async (message: object) =>
    (await open()).send(JSON.stringify(message));
  return { api, post, close: () => socket?.close() };
}

type Hub = ReturnType<typeof hubClient>;

interface AgentRow {
  custody?: { state: string };
  harnesses?: {
    harness: HarnessKind;
    models?: { resolvedModel?: string; value: string }[];
  }[];
  hostname: string;
  machineId: string;
  status: string;
}

/** The services are back: the hub answers, and this machine's agent holds custody again. */
async function back(hub: Hub, machine: string): Promise<void> {
  await until(
    "the hub answering",
    () => hub.api<{ ok: boolean }>("/health"),
    (health) => health.ok,
    120_000
  );
  await until(
    "the agent back with custody",
    () => hub.api<AgentRow[]>("/api/agents"),
    (rows) =>
      rows.some(
        (row) =>
          row.machineId === machine &&
          row.status === "online" &&
          row.custody?.state === "available"
      ),
    120_000
  );
}

/** A model the machine's harness reports, preferring a small one for Claude. */
function modelFor(row: AgentRow, harness: HarnessKind, options: Options) {
  const named = options.models[harness];
  if (named) {
    return named;
  }
  const models =
    row.harnesses?.find((entry) => entry.harness === harness)?.models ?? [];
  const small = models.find((model) => model.value.includes("haiku"));
  const chosen = small ?? models.find((model) => model.value !== "default");
  const fallback = models.find((model) => model.value === "default");
  return chosen?.value ?? fallback?.resolvedModel;
}

async function startSession(
  hub: Hub,
  machine: string,
  spawn: {
    cwd: string;
    harness: HarnessKind;
    mode?: PermissionMode;
    model: string;
    title: string;
  }
): Promise<string> {
  const instanceId = crypto.randomUUID();
  await hub.post({
    verb: "spawn",
    machineId: machine,
    instanceId,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId,
      cwd: spawn.cwd,
      harness: spawn.harness,
      model: spawn.model,
      title: spawn.title,
      ...(spawn.harness === "pi" || !spawn.mode
        ? {}
        : { permissionMode: spawn.mode }),
    },
  });
  await until(
    "the session running",
    () => hub.api<{ id: string; status: string }[]>("/api/instances"),
    (rows) =>
      rows.some((row) => row.id === instanceId && row.status === "running")
  );
  return instanceId;
}

function runFor(
  hub: Hub,
  machine: string,
  harness: HarnessKind,
  instanceId: string,
  notes: string[]
): Run {
  const page = () =>
    hub.api<TranscriptPage>(
      `/api/instances/${encodeURIComponent(instanceId)}/transcript?limit=400`
    );
  const command = (kind: string, payload: object) =>
    hub.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind,
      machineId: machine,
      sessionId: instanceId,
      payload: { instanceId, ...payload },
    });
  return {
    harness,
    instanceId,
    page,
    blocks: async () => (await page()).blocks,
    pending: () => hub.api<PendingAsk[]>("/api/pending"),
    note: (line) => notes.push(line),
    send: (text) => {
      const uuid = crypto.randomUUID();
      return command("send", {
        message: {
          type: "user",
          uuid,
          message: { role: "user", content: text },
          parent_tool_use_id: null,
          origin: { kind: "human" },
        },
      });
    },
    answer: (requestId, result) =>
      command("permission.answer", {
        requestId,
        method: "resolvePermission",
        args: [requestId, result],
      }),
  };
}

/** What the transcript says about itself: blocks seen twice, gaps announced, the turn's end, the model's last words. */
function readTranscript(blocks: TranscriptBlock[]) {
  const seen = new Map<string, number>();
  for (const block of blocks) {
    seen.set(block.id, (seen.get(block.id) ?? 0) + 1);
  }
  const results = blocks.filter((block) => block.type.startsWith("result."));
  const said = blocks.filter((block) => block.type === "assistant");
  return {
    duplicates: [...seen.values()].filter((count) => count > 1).length,
    gaps: blocks.filter(
      (block) =>
        block.type.startsWith("system.") &&
        (block.type.includes("gap") || block.content.includes("resumes at"))
    ).length,
    results: results.length,
    turnEnd: results.at(-1)?.type ?? "none",
    modelSaw: (said.at(-1)?.content ?? "").slice(0, 200),
  };
}

/** The finish-item case: a work item whose delegate finishes at once, restarted while the hub runs its slow check. */
async function finishItem(
  hub: Hub,
  machine: string,
  harness: HarnessKind,
  model: string,
  repo: string,
  restart: () => Promise<void>
): Promise<Partial<Outcome>> {
  const parent = await startSession(hub, machine, {
    cwd: repo,
    harness,
    model,
    title: "Restart probe parent",
    mode: harness === "pi" ? undefined : "bypassPermissions",
  });
  const started = await hub.api<{ workItemId: string; instanceId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title: "Restart probe item",
      prompt:
        'Call finish_item now with the summary "probe". Do nothing else, and run no command yourself.',
      harness,
      model,
      cwd: repo,
      checks: [
        {
          name: "Slow probe check",
          command: "sleep 45; echo probe-checked",
          expect: "probe-checked",
          timeoutSec: 300,
        },
      ],
    }
  );
  const item = () =>
    hub.api<{ checkingSince?: string | null; state: string }>(
      `/api/work-items/${encodeURIComponent(started.workItemId)}`
    );
  await until("the checks running", item, (row) => Boolean(row.checkingSince));
  const reachedAt = Date.now();
  await restart();
  const ended = await until(
    "the item settled",
    item,
    (row) => !["starting", "running"].includes(row.state),
    SETTLE_MS
  ).catch(() => undefined);
  return {
    instanceId: started.instanceId,
    reached: true,
    completed: ended?.state === "done",
    turnEnd: ended?.state ?? "still running",
    note: `checks were ${Math.round((Date.now() - reachedAt) / 1000)}s from running to settled`,
  };
}

async function probeOne(
  hub: Hub,
  machine: string,
  row: AgentRow,
  options: Options,
  workdir: string,
  step: { case: Case; harness: HarnessKind; restart: Restart }
): Promise<Outcome> {
  const startedAt = Date.now();
  const outcome: Outcome = {
    case: step.case.id,
    harness: step.harness,
    restart: step.restart,
    reached: false,
    completed: false,
    duplicates: 0,
    gaps: 0,
    turnEnd: "none",
    modelSaw: "",
    ms: 0,
  };
  const notes: string[] = [];
  const restart = async () => {
    const command = restartCommand(step.restart, process.getuid?.() ?? 0);
    const ran = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" });
    if (ran.exitCode !== 0) {
      throw new Error(`${command.join(" ")}: ${ran.stderr.toString().trim()}`);
    }
    await delay(2000);
    await back(hub, machine);
  };
  try {
    const model = modelFor(row, step.harness, options);
    if (!model) {
      throw new Error(`${step.harness} reports no model on this machine`);
    }
    if (step.case.id === "finish-item") {
      if (!options.repo) {
        return { ...outcome, note: "skipped: needs --repo", ms: 0 };
      }
      const found = await finishItem(
        hub,
        machine,
        step.harness,
        model,
        options.repo,
        restart
      );
      return { ...outcome, ...found, ms: Date.now() - startedAt };
    }
    const instanceId = await startSession(hub, machine, {
      cwd: step.case.cwd?.(options) ?? workdir,
      harness: step.harness,
      mode: step.case.mode,
      model,
      title: `Restart probe ${step.case.id}`,
    });
    outcome.instanceId = instanceId;
    const run = runFor(hub, machine, step.harness, instanceId, notes);
    await run.send(step.case.prompt);
    await step.case.reach(run);
    outcome.reached = true;
    const before: Snapshot = { asks: await run.pending() };
    const resultsBefore = readTranscript(await run.blocks()).results;
    await restart();
    Object.assign(outcome, (await step.case.settle?.(run, before)) ?? {});
    const blocks = await until(
      "the turn's end",
      run.blocks,
      (now) => readTranscript(now).results > resultsBefore,
      SETTLE_MS
    ).catch(() => run.blocks());
    const read = readTranscript(blocks);
    outcome.duplicates = read.duplicates;
    outcome.gaps = read.gaps;
    outcome.turnEnd = read.turnEnd;
    outcome.modelSaw = read.modelSaw;
    outcome.completed =
      read.results > resultsBefore &&
      (!step.case.expect || textOf(blocks).includes(step.case.expect));
  } catch (error) {
    outcome.error = error instanceof Error ? error.message : String(error);
  }
  if (notes.length > 0) {
    outcome.note = [outcome.note, ...notes].filter(Boolean).join("; ");
  }
  outcome.ms = Date.now() - startedAt;
  return outcome;
}

function table(outcomes: Outcome[]): string {
  const rows = [
    [
      "case",
      "harness",
      "restart",
      "reached",
      "completed",
      "end",
      "gaps",
      "dups",
      "ask",
      "note",
    ],
    ...outcomes.map((one) => [
      one.case,
      one.harness,
      one.restart,
      one.reached ? "yes" : "no",
      one.completed ? "yes" : "no",
      one.turnEnd,
      String(one.gaps),
      String(one.duplicates),
      one.askAnswerable === undefined ? "-" : String(one.askAnswerable),
      (one.error ?? one.note ?? "").slice(0, 60),
    ]),
  ];
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((cells) => cells[column].length))
  );
  return rows
    .map((cells) =>
      cells.map((cell, column) => cell.padEnd(widths[column])).join("  ")
    )
    .join("\n");
}

function printPlan(options: Options, steps: ReturnType<typeof plan>): void {
  const uid = process.getuid?.() ?? 0;
  console.log(`hub      ${options.hub}`);
  console.log(
    `machine  ${options.machine ?? `the hub's row for ${hostname()}`}`
  );
  console.log(`cwd      ${options.cwd ?? "a fresh scratch folder"}`);
  console.log(`runs     ${steps.length}`);
  for (const restart of new Set(steps.map((step) => step.restart))) {
    console.log(
      `restart  ${restart}: ${restartCommand(restart, uid).join(" ")}`
    );
  }
  for (const step of steps) {
    console.log(
      `  ${step.case.id.padEnd(12)} ${step.harness.padEnd(9)} ${step.restart.padEnd(11)} ${step.case.what}`
    );
  }
}

async function main(): Promise<void> {
  const parsed = parse(Bun.argv.slice(2));
  if (parsed === "help") {
    console.log(help(CASES.map((one) => one.id)));
    return;
  }
  const options = parsed;
  const steps = plan(options);
  if (options.dryRun) {
    printPlan(options, steps);
    return;
  }
  if (!options.yes) {
    throw new Error(
      "this starts real sessions, spends tokens and restarts this machine's services: pass --yes, or --dry-run to see the plan"
    );
  }
  const hub = hubClient(options);
  const rows = await hub.api<AgentRow[]>("/api/agents");
  const row = rows.find((one) =>
    options.machine
      ? one.machineId === options.machine
      : one.hostname === hostname()
  );
  if (!row) {
    throw new Error(
      `the hub has no machine ${options.machine ?? `named ${hostname()}`}; pass --machine`
    );
  }
  const workdir =
    options.cwd ?? (await mkdtemp(join(tmpdir(), "probe-restart-turns-")));
  const outcomes: Outcome[] = [];
  for (const step of steps) {
    console.log(
      `… ${step.case.id} on ${step.harness}, ${step.restart} restart`
    );
    // biome-ignore lint/performance/noAwaitInLoops: one session and one restart at a time, each on the services the last one left
    const outcome = await probeOne(
      hub,
      row.machineId,
      row,
      options,
      workdir,
      step
    );
    outcomes.push(outcome);
  }
  hub.close();
  const out =
    options.out ??
    join(
      tmpdir(),
      `probe-restart-turns-${new Date().toISOString().replaceAll(":", "-")}.json`
    );
  await writeFile(out, `${JSON.stringify(outcomes, null, 2)}\n`);
  console.log(`\n${table(outcomes)}\n\nwrote ${out}`);
}

await main().catch((error: unknown) => {
  console.error(
    `probe-restart-turns: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
