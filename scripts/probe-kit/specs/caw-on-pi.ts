/**
 * A project's Caw on pi has the same hands, and the same gate, as on Claude
 * Code and OpenCode (agent pi-runtime.ts `PiLeadGate`, `cawcosExtensionsAlone`; hub
 * lead-gate.ts). On a scratch fleet (real hub, agent and sessiond; pi
 * against the mock model), project "Pi hands" with Caw on pi, its place a
 * repository. The person's own pi extension, in the sandbox's
 * `~/.pi/agent/extensions/`, registers a tool `probe_stamp` that writes the
 * file it is given. Each leg is your words in thread main, and Caw's answer
 * one call.
 *
 * - T: Caw's tools as pi declares them to the model: `bash` and the
 *   extension's `probe_stamp` are there, `powershell` (core
 *   `CAW_DENIED_TOOLS.pi`) is not.
 * - G1: `bash` of `cat README.md`, a line that only reads: the gate lets it
 *   run with no card (its `lead_calls` row `ran`, its exit `0`).
 * - G2: `bash` of `touch g2.txt`: put on your Approve card (`asked`), and
 *   nothing is written until you approve it; approved, it runs (`ran`, you
 *   approved it) and the file is there.
 * - X: the extension's `probe_stamp` is put on your card too (`asked`, tool
 *   `probe_stamp`), its file not written; approved, the extension's tool runs
 *   and writes it: the person's extension works, under the gate.
 * - F: a fenced run on pi: Caw's memory_note starts the project's Memory
 *   curator, its routine on a pi delegate type; the curator's session (role
 *   `curator`, `SpawnPayload.fence`) declares CawCo's tools alone: no
 *   `bash`, `edit`, `write`, `powershell`, no `probe_stamp`, no MCP tool.
 *
 * Caw's place is a boundary, which no workspace can start inside another:
 * run it on the host.
 *
 *   bun scripts/probe-kit/run.ts caw-on-pi
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const CAW = "You are Caw";
const CURATOR = "You are this project's memory curator";
/** The person's own pi extension's tool. */
const STAMP = "probe_stamp";
/** A pi delegate type the curator routine runs on. */
const PI_TYPE = "probe-pi";

/** The person's own pi extension: one tool, which writes the file it is given. */
const EXTENSION = `import { Type } from "@earendil-works/pi-ai";
import { writeFileSync } from "node:fs";

export default function (pi) {
  pi.registerTool({
    name: "${STAMP}",
    label: "Stamp",
    description: "Writes the word stamped into the file it is given.",
    parameters: Type.Object({ file: Type.String() }),
    async execute(_id, params) {
      writeFileSync(params.file, "stamped\\n");
      return { content: [{ type: "text", text: "stamped" }], details: undefined };
    },
  });
}
`;

/** Each leg's words, which wake Caw. */
const WORDS = {
  G1: "PROBE-G1 read the readme",
  G2: "PROBE-G2 touch the file",
  X: "PROBE-X stamp the file",
  F: "PROBE-F note it",
} as const;
type Leg = keyof typeof WORDS;

/** Caw's place, once his session is known: his calls name files under it. */
let place = "";
/** The tools pi declared to Caw in his first turn. */
let cawTools: string[] = [];
/** The tools pi declared to the curator's run. */
let curatorTools: string[] | undefined;
const called = new Set<Leg>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** CawCo's `short` tool as pi offers it: pi's own name, else as an MCP name. */
const cawcoTool = (request: Seen, short: string): string =>
  request.toolNames.find((name) =>
    [short, `mcp__cawco__${short}`, `cawco_${short}`].includes(name)
  ) ?? short;

const legCall = (request: Seen, leg: Leg): Reply => {
  switch (leg) {
    case "G1":
      return call("bash", { command: "cat README.md" });
    case "G2":
      return call("bash", { command: `touch ${join(place, "g2.txt")}` });
    case "X":
      return call(STAMP, { file: join(place, "stamped.txt") });
    case "F":
      return call(cawcoTool(request, "memory_note"), {
        text: "PROBE-F: the probe's deploys go out on Fridays.",
      });
    default: {
      const unhandled: never = leg;
      throw new Error(`no leg ${String(unhandled)}`);
    }
  }
};

const caw = (request: Seen): Reply => {
  if (cawTools.length === 0) {
    cawTools = request.toolNames;
  }
  for (const leg of Object.keys(WORDS) as Leg[]) {
    if (!called.has(leg) && request.last.includes(WORDS[leg])) {
      called.add(leg);
      return legCall(request, leg);
    }
  }
  return text("ok");
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(CURATOR) || request.body.includes(CURATOR)) {
    curatorTools ??= request.toolNames;
    return text("Nothing to keep.");
  }
  return request.all.includes(CAW) || request.body.includes(CAW)
    ? caw(request)
    : text("ok");
};

interface Ask {
  instanceId: string;
  payload: { toolName: string };
  requestId: string;
}

interface CallRow {
  approved: number | boolean;
  command: string;
  exit: string | null;
  outcome: string;
  tool: string;
}

const run = async (kit: Kit) => {
  const fleet: KitFleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  // The person's own extension, where pi loads them from (docs/extensions.md:
  // "Place the extension in your user or project extensions directory").
  await mkdir(join(home, ".pi", "agent", "extensions"), { recursive: true });
  await writeFile(
    join(home, ".pi", "agent", "extensions", "probe-stamp.ts"),
    EXTENSION
  );
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const repo = join(fleet.sandbox, "code");
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Pi hands",
    machineId: MACHINE,
    cwd: repo,
    caw: true,
  });
  const moved = await fetch(`${fleet.base}/api/projects/${project.id}/caw`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ harness: "pi", model: MODEL.pi }),
  });
  if (!moved.ok) {
    throw new Error(`Caw to pi: ${moved.status} ${await moved.text()}`);
  }

  const opened = await fleet.api<{ thread: { id: string } }>(
    `/api/projects/${project.id}/threads`,
    { body: "PROBE-MAIN: hello Caw." }
  );
  const main = opened.thread.id;
  const leadId = (await until(
    "Caw's session",
    () =>
      fleet.query<{ lead_instance_id: string | null }>(
        "SELECT lead_instance_id FROM projects WHERE id = ?",
        project.id
      )[0]?.lead_instance_id ?? undefined,
    (id): id is string => Boolean(id),
    180_000
  )) as string;
  const [lead] = fleet.query<{ cwd: string; harness: string }>(
    "SELECT cwd, harness FROM instances WHERE id = ?",
    leadId
  );
  place = lead?.cwd ?? repo;
  await until(
    "Caw answered in main",
    () =>
      fleet.query<{ n: number }>(
        "SELECT count(*) AS n FROM thread_messages WHERE thread_id = ? AND author = 'caw'",
        main
      )[0]?.n ?? 0,
    (count) => count > 0,
    180_000
  );

  // ── T: his tools, as pi declares them ─────────────────────────────────
  kit.check(
    "T: Caw runs on pi; pi declares bash and the person's extension tool to him, and no powershell",
    lead?.harness === "pi" &&
      cawTools.includes("bash") &&
      cawTools.includes(STAMP) &&
      !cawTools.includes("powershell"),
    JSON.stringify({ harness: lead?.harness, tools: cawTools })
  );

  const say = (words: string) =>
    fleet.api(`/api/projects/${project.id}/threads/${main}/messages`, {
      body: words,
    });
  /** The gate's row for Caw's call of `tool` whose command holds `words`. */
  const rowOf = (tool: string, words: string, outcome?: string) =>
    until(
      `the gate's row for ${tool} ${words}${outcome ? ` (${outcome})` : ""}`,
      () =>
        fleet
          .query<CallRow>(
            "SELECT tool, command, outcome, exit, approved FROM lead_calls WHERE instance_id = ? AND tool = ? AND command LIKE ?",
            leadId,
            tool,
            `%${words}%`
          )
          .at(0),
      (row) =>
        row !== undefined &&
        (outcome === undefined ||
          (row.outcome === outcome &&
            (outcome !== "ran" || row.exit !== null))),
      120_000
    ) as Promise<CallRow>;
  const askOf = (tool: string) =>
    until(
      `the card for ${tool}`,
      async () =>
        (await fleet.api<Ask[]>("/api/pending")).find(
          (one) => one.instanceId === leadId && one.payload.toolName === tool
        ),
      Boolean,
      120_000
    ) as Promise<Ask>;
  const approve = (ask: Ask) =>
    fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "permission.answer",
      machineId: MACHINE,
      sessionId: ask.instanceId,
      payload: {
        instanceId: ask.instanceId,
        requestId: ask.requestId,
        method: "resolvePermission",
        args: [ask.requestId, { behavior: "allow", updatedInput: {} }],
      },
    });

  // ── G1: a line that only reads runs, with no card ─────────────────────
  await say(WORDS.G1);
  const g1 = await rowOf("bash", "cat README.md", "ran").catch(
    (error: Error) => error
  );
  kit.check(
    "G1: bash of a reading line reaches the hub's gate, which lets it run with no card (ran, exit 0)",
    !(g1 instanceof Error) && g1.exit === "0",
    JSON.stringify(g1 instanceof Error ? g1.message : g1)
  );

  // ── G2: a writing line waits on your card ─────────────────────────────
  const g2File = join(place, "g2.txt");
  await say(WORDS.G2);
  const g2Asked = await rowOf("bash", "g2.txt", "asked").catch(
    (error: Error) => error
  );
  const g2Held = !existsSync(g2File);
  const g2Card = await askOf("bash").catch(() => undefined);
  if (g2Card) {
    await approve(g2Card);
  }
  const g2Ran = await rowOf("bash", "g2.txt", "ran").catch(
    (error: Error) => error
  );
  kit.check(
    "G2: bash of a writing line is put on your card and does not run; approved, it runs and writes the file",
    !(g2Asked instanceof Error) &&
      g2Held &&
      Boolean(g2Card) &&
      !(g2Ran instanceof Error) &&
      Boolean(g2Ran.approved) &&
      existsSync(g2File),
    JSON.stringify({
      asked: g2Asked instanceof Error ? g2Asked.message : g2Asked.outcome,
      held: g2Held,
      ran: g2Ran instanceof Error ? g2Ran.message : g2Ran,
    })
  );

  // ── X: the person's extension tool, under the gate ────────────────────
  const stamped = join(place, "stamped.txt");
  await say(WORDS.X);
  const xAsked = await rowOf(STAMP, "stamped.txt", "asked").catch(
    (error: Error) => error
  );
  const xHeld = !existsSync(stamped);
  const xCard = await askOf(STAMP).catch(() => undefined);
  if (xCard) {
    await approve(xCard);
  }
  const xRan = await rowOf(STAMP, "stamped.txt", "ran").catch(
    (error: Error) => error
  );
  const xWritten = await until(
    "X: the extension's file",
    () => existsSync(stamped),
    Boolean,
    60_000
  ).catch(() => false);
  kit.check(
    "X: the person's extension tool is put on your card and does not run; approved, it runs and writes its file",
    !(xAsked instanceof Error) &&
      xHeld &&
      Boolean(xCard) &&
      !(xRan instanceof Error) &&
      Boolean(xWritten),
    JSON.stringify({
      asked: xAsked instanceof Error ? xAsked.message : xAsked.outcome,
      held: xHeld,
      ran: xRan instanceof Error ? xRan.message : xRan.outcome,
      written: xWritten,
    })
  );

  // ── F: a fenced run on pi ─────────────────────────────────────────────
  const typed = await fetch(`${fleet.base}/api/delegate-types/${PI_TYPE}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      description: "The probe's pi type.",
      harness: "pi",
      model: MODEL.pi,
    }),
  });
  if (!typed.ok) {
    throw new Error(`${PI_TYPE}: ${typed.status} ${await typed.text()}`);
  }
  await say(WORDS.F);
  const routine = await until(
    "F: the project's Memory curator",
    () =>
      fleet
        .query<{ id: string }>(
          "SELECT id FROM routines WHERE project_id = ? AND target = 'curator'",
          project.id
        )
        .at(0),
    Boolean,
    120_000
  ).catch(() => undefined);
  if (routine) {
    const patched = await fetch(`${fleet.base}/api/routines/${routine.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delegateType: PI_TYPE }),
    });
    if (!patched.ok) {
      throw new Error(`curator to ${PI_TYPE}: ${await patched.text()}`);
    }
    await fleet.api(`/api/routines/${routine.id}/run`, {});
  }
  const tools = await until(
    "F: the curator's tools",
    () => curatorTools,
    Boolean,
    240_000
  ).catch(() => undefined);
  const curator = fleet
    .query<{ harness: string }>(
      "SELECT harness FROM instances WHERE role = 'curator' ORDER BY rowid DESC LIMIT 1"
    )
    .at(0);
  const outside = (tools ?? []).filter(
    (name) =>
      ["bash", "edit", "write", "powershell", STAMP].includes(name) ||
      name.startsWith("mcp__")
  );
  kit.check(
    "F: a fenced run on pi (the memory curator) declares CawCo's tools alone: no shell, edit, extension or MCP tool",
    curator?.harness === "pi" &&
      tools !== undefined &&
      tools.length > 0 &&
      outside.length === 0,
    JSON.stringify({
      routine: routine?.id,
      harness: curator?.harness,
      tools,
      outside,
    })
  );
};

export default {
  name: "caw-on-pi",
  host: "Caw's place is a boundary, which starts only outside every workspace",
  run,
} satisfies Spec;
