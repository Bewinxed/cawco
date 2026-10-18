/**
 * The files a project's Caw may edit are the ones it declares, never guessed
 * from their names (hub lead-gate.ts `editDenied`, gate-file.ts `Caw edits:`).
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), project "Edits" with Caw on, its place a repository. Each leg
 * is your words in thread main, and Caw's answer a Write of one file.
 *
 * - N: no gate.md, so no list: the Write is parked on your Approve card,
 *   neither refused nor run (its `lead_calls` row `asked`).
 * - I: gate.md declares `Caw edits:` with `docs/**`: a Write of
 *   docs/in.md runs with no card (`ran`), and the file is there.
 * - O: under the same list, a Write of src/out.ts is refused with "is not in
 *   this project's Caw edits: file a task.", and no file is written.
 * - R: gate.md is a FIFO in the project's hub folder, so the gate's read of
 *   it waits until the probe writes it. While it waits, Caw's process is
 *   killed (its open ask settled, `cancelled`). Once the read ends the ask is
 *   dropped with the gate's "withdrawn while gate.md was read" line: no card
 *   parked, no `lead_calls` row, no file.
 *
 * Run it where a workspace boundary can start (not inside another one).
 *
 *   bun scripts/probe-kit/run.ts caw-edits
 */
import { existsSync } from "node:fs";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { signal } from "../../../packages/core/src/signal";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { declareGate } from "../gate";
import type { Kit, KitFleet, Spec } from "../kit";

const CAW = "You are Caw";
const REFUSED = "is not in this project's Caw edits: file a task.";
const STAGES =
  "---\nready      todo\nworking    active\nreview     you\ndone       done\ndropped    dropped\nmoves\n  * → *    you, session\nviews\n  board      by stage\n---\n";
/** The list leg I and O read: docs/ only. */
const DOCS_ONLY = "---\nCaw edits:\n  docs/**\n---\n";

/** Each leg: the words that wake Caw, and the file (from his place) he writes. */
const LEGS = {
  N: { words: "PROBE-N write the notes", file: "notes-n.md" },
  I: { words: "PROBE-I write the doc", file: "docs/in.md" },
  O: { words: "PROBE-O write the source", file: "src/out.ts" },
  R: { words: "PROBE-R write the race", file: "docs/race.md" },
} as const;
type Leg = keyof typeof LEGS;

/** Caw's place, once his session is known: his Writes name files under it. */
let place = "";
const written = new Set<Leg>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

const caw = (request: Seen): Reply => {
  for (const [leg, { words, file }] of Object.entries(LEGS) as [
    Leg,
    (typeof LEGS)[Leg],
  ][]) {
    if (!written.has(leg) && request.last.includes(words)) {
      written.add(leg);
      return {
        everyMs: 5,
        words: [],
        tool: {
          name: "Write",
          input: { file_path: join(place, file), content: `${leg}\n` },
        },
      };
    }
  }
  return text("ok");
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  return request.all.includes(CAW) ? caw(request) : text("ok");
};

interface Ask {
  instanceId: string;
  payload: { toolName: string };
  requestId: string;
}

interface CallRow {
  command: string;
  outcome: string;
  why: string | null;
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
  const repo = join(fleet.sandbox, "code");
  await mkdir(join(repo, "docs"), { recursive: true });
  await mkdir(join(repo, "src"), { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Edits",
    machineId: MACHINE,
    cwd: repo,
    caw: true,
  });
  const put = await fetch(
    `${fleet.base}/api/projects/${project.id}/folder/file`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "stages.md", content: STAGES }),
    }
  );
  if (!put.ok) {
    throw new Error(`stages.md: ${put.status} ${await put.text()}`);
  }

  // Thread "main": your words wake Caw, who answers.
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
  place =
    fleet.query<{ cwd: string }>(
      "SELECT cwd FROM instances WHERE id = ?",
      leadId
    )[0]?.cwd ?? repo;
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

  /** Your words in main, as the dashboard sends them. */
  const say = (words: string) =>
    fleet.api(`/api/projects/${project.id}/threads/${main}/messages`, {
      body: words,
    });
  /** The row of Caw's Write of `file`, once the gate has judged it. */
  const rowOf = (file: string) =>
    until(
      `the gate's row for ${file}`,
      () =>
        fleet
          .query<CallRow>(
            "SELECT command, outcome, why FROM lead_calls WHERE project_id = ? AND tool = 'Write' AND command = ?",
            project.id,
            file
          )
          .at(0),
      Boolean,
      180_000
    ) as Promise<CallRow>;
  const writeAsks = async (): Promise<Ask[]> =>
    (await fleet.api<Ask[]>("/api/pending")).filter(
      (one) => one.instanceId === leadId && one.payload.toolName === "Write"
    );

  // ── N: no list: the Write is put on your card ─────────────────────────
  await say(LEGS.N.words);
  const n = await rowOf(LEGS.N.file);
  const card = await until("N: the Write's card", writeAsks, (asks) =>
    Boolean(asks[0])
  ).then((asks) => asks[0] as Ask);
  kit.check(
    "N: with no Caw edits declared, the Write goes to the Approve card: neither refused nor run",
    n.outcome === "asked" &&
      n.why === null &&
      !existsSync(join(place, LEGS.N.file)),
    JSON.stringify({ row: n, card: card.requestId })
  );
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "permission.answer",
    machineId: MACHINE,
    sessionId: card.instanceId,
    payload: {
      instanceId: card.instanceId,
      requestId: card.requestId,
      method: "resolvePermission",
      args: [card.requestId, { behavior: "deny", message: "No." }],
    },
  });
  await until(
    "N: the Write's row denied",
    () =>
      fleet
        .query<{ outcome: string }>(
          "SELECT outcome FROM lead_calls WHERE project_id = ? AND command = ?",
          project.id,
          LEGS.N.file
        )
        .at(0),
    (row) => row?.outcome === "denied",
    60_000
  );

  // ── I: a file the list matches runs, with no card ─────────────────────
  await declareGate(fleet.base, project.id, DOCS_ONLY);
  await say(LEGS.I.words);
  const inside = await rowOf(LEGS.I.file);
  const landed = await until(
    "I: docs/in.md written",
    () => existsSync(join(place, LEGS.I.file)),
    Boolean,
    120_000
  ).catch(() => false);
  kit.check(
    "I: with Caw edits docs/**, a Write of docs/in.md runs with no card, and the file is written",
    inside.outcome === "ran" &&
      Boolean(landed) &&
      (await writeAsks()).length === 0,
    JSON.stringify({ row: inside, landed })
  );

  // ── O: a file outside the list is refused, in the gate's words ────────
  await say(LEGS.O.words);
  const outside = await rowOf(LEGS.O.file);
  kit.check(
    `O: under the same list, a Write of src/out.ts is refused with “${REFUSED}”, and nothing is written`,
    outside.outcome === "refused" &&
      outside.why === `${LEGS.O.file} ${REFUSED}` &&
      !existsSync(join(place, LEGS.O.file)) &&
      (await writeAsks()).length === 0,
    JSON.stringify({ row: outside })
  );

  // ── R: an ask over while the gate reads gate.md is never parked ───────
  const gateFile = join(
    dirname(fleet.env.CAWCO_DB_PATH ?? ""),
    "projects",
    project.id,
    "gate.md"
  );
  await rm(gateFile, { force: true });
  await Bun.$`mkfifo ${gateFile}`.quiet();
  await say(LEGS.R.words);
  // The writer's open resolves once the hub opens gate.md to read it: the
  // gate is waiting on the read now.
  const writer = await open(gateFile, "w");
  const pid = await until(
    "R: Caw's process",
    () => fleet.sessionPid(leadId),
    (one) => one > 0
  );
  signal(pid, "SIGKILL");
  await until(
    "R: Caw's process gone, as the hub keeps it",
    () =>
      fleet.query<{ status: string }>(
        "SELECT status FROM instances WHERE id = ?",
        leadId
      )[0]?.status,
    (status) => !["running", "starting"].includes(status),
    60_000
  ).catch(() => undefined);
  await writer.writeFile(DOCS_ONLY);
  await writer.close();
  const said = await until(
    "R: the gate's withdrawn line",
    () => fleet.logs("hub"),
    (log) =>
      log.includes("withdrawn while gate.md was read") &&
      log.includes(LEGS.R.file),
    60_000
  ).catch(() => "");
  const raceRows = fleet.query<CallRow>(
    "SELECT command, outcome, why FROM lead_calls WHERE project_id = ? AND command = ?",
    project.id,
    LEGS.R.file
  );
  const raceLine =
    said
      .split("\n")
      .find((line) => line.includes("withdrawn while gate.md was read")) ??
    "none";
  kit.check(
    "R: a Write whose ask is over (its process killed) while gate.md is read is dropped: no card, no row, no file",
    raceLine !== "none" &&
      raceRows.length === 0 &&
      (await writeAsks()).length === 0 &&
      !existsSync(join(place, LEGS.R.file)),
    JSON.stringify({ line: raceLine, rows: raceRows })
  );
};

export default { name: "caw-edits", run } satisfies Spec;
