/**
 * A fact marked private is never stored, and one stored can be forgotten
 * by the person's act alone (hub forget-fact.ts, core private-mark.ts).
 * Private office, 2026-11: a fact the owner later called private sat in a
 * task's close reason (its commit's `CawCo-Reason` trailer), a memory note
 * and its commit, a delegate's brief, a carry, the hub's database and the
 * transcript index, and none of it could be removed.
 *
 * On an in-process hub (hub-in-process.ts) over a scratch database and
 * project folder, listening on loopback; a second machine stands in over
 * the hub's own socket, answering a carry's removal with the agent's own
 * `removeFolder` (held to its floor) and the index's forget with a real
 * transcript index (jsonl-parser fts5.ts) synced from a planted Claude
 * transcript. git filter-repo as published is put on the PATH first (uv,
 * into the scratch folder) when the machine has none.
 *
 * - a. `<private>` never stored: a task filed and moved by the person with
 *   a private span in its title and close reason, a session's memory note
 *   with one, a work item's brief with one: no file, commit message or row
 *   holds the private words; a note that is all private is refused,
 *   nothing written; the secret filter masks a private span where it
 *   answers.
 * - b. A note marked `private: true` is never a candidate: memory_propose
 *   citing it is refused, and the curator's brief carries the plain note
 *   beside it and not it.
 * - c. A forget: a dry run lists every place (the close reason's trailer,
 *   the note, the knowledge line resting on it, the brief's row, the carry,
 *   the index, the mask) and changes nothing; a forget without that
 *   confirm, or with other words, is refused; the forget removes it from
 *   the trailer (the task's history reads `[redacted]`), the note, the
 *   line resting on it alone (a line resting on another note stays), the
 *   brief's row, the carry (gone from the machine's disk, its row letting
 *   it go), the hub's database file and the index; no git object of the
 *   folder holds it, reachable or not; the secret filter masks it; its
 *   report names what stays (each harness's own transcripts).
 * - d. An agent's call to forget is refused: a session's credential on the
 *   dry run and on the forget, and no tool a session lists forgets.
 *
 *   bun scripts/probe-kit/run.ts fact-forget
 */
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MachineFloor } from "../../../packages/agent/src/remove-folder";
import type {
  ForgetTranscriptText,
  RemoveFolder,
  TaskHistory,
} from "../../../packages/core/src";
import {
  fetchHub,
  type HubRequest,
  hubInit,
  hubRequest,
} from "../../../packages/core/src/hub-request";
import { machinePath } from "../../../packages/core/src/machine-path";
import { forgetFactWords } from "../../../packages/core/src/words/forget-fact";
import type { hubInProcess as inProcess } from "../../../packages/hub/scripts/hub-in-process";
import type { ForgetAnswer } from "../../../packages/hub/src/forget-fact";
import type { TranscriptIndex } from "../../../packages/jsonl-parser/src/fts5";
import { type ToolSession, toolWords } from "../../lib/tool-call";
import type { Kit, Spec } from "../kit";

const B = "probe-forget-b";
/** The fact the person forgets: one line, as it was written. */
const FACT = "Rosalind's surgery is on 14 March at St Thomas";
/** A private span's words: never stored anywhere. */
const SECRET = "the side gate code is 4471";
/** A plain note's words, beside the private one. */
const PLAIN = "Deploys go out on Tuesdays after the standup";
/** A private-marked note's words. */
const MARKED = "The owner is moving house in December";

interface Answer {
  status: number;
  text: string;
}

type HubDb = Awaited<ReturnType<typeof inProcess>>["db"];

interface Rig {
  base: string;
  /** A call as the person, through the board's door; `headers` beside. */
  board: (
    request: HubRequest,
    headers?: Record<string, string>
  ) => Promise<Answer>;
  db: HubDb;
  dbPath: string;
  disk: string;
  floor: MachineFloor;
  index: TranscriptIndex;
  /** The index's file. */
  indexPath: string;
  kit: Kit;
  /** The project's folder on the hub. */
  root: (projectId: string) => string;
  session: ToolSession;
}

const there = async (path: string): Promise<boolean> =>
  readdir(path).then(
    () => true,
    () => false
  );

/** git in a project folder, its output. */
const git = async (root: string, args: string[]): Promise<string> => {
  const ran = Bun.spawn(["git", "-C", root, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
  });
  const out = await new Response(ran.stdout).text();
  await ran.exited;
  return out;
};

/** Every object in a folder's git, reachable or not, its content whole. */
const everyObject = (root: string): Promise<string> =>
  git(root, ["cat-file", "--batch-all-objects", "--batch"]);

/** Every commit message and every file of every commit of the folder. */
const wholeHistory = (root: string): Promise<string> =>
  git(root, ["log", "--all", "-p", "--format=%B"]);

/**
 * git filter-repo on the PATH: the machine's own, else the release
 * published on PyPI put into the scratch folder by uv (the hub runs it from
 * the PATH, as published). Undefined, with why, when neither can be had.
 */
const filterRepo = async (scratch: string): Promise<string | undefined> => {
  if (Bun.which("git-filter-repo", { PATH: process.env.PATH ?? "" })) {
    return;
  }
  const uv = Bun.which("uv");
  if (!uv) {
    return "git filter-repo is not on the PATH, and uv is not here to fetch it";
  }
  const bin = join(scratch, "uv-bin");
  const installed = Bun.spawn(
    [uv, "tool", "install", "--quiet", "git-filter-repo"],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        UV_TOOL_DIR: join(scratch, "uv-tools"),
        UV_TOOL_BIN_DIR: bin,
      },
    }
  );
  const said = await new Response(installed.stderr).text();
  if ((await installed.exited) !== 0) {
    return `uv could not install git-filter-repo: ${said.trim()}`;
  }
  process.env.PATH = `${bin}:${process.env.PATH ?? ""}`;
  return Bun.which("git-filter-repo", { PATH: process.env.PATH ?? "" })
    ? undefined
    : "git-filter-repo was installed but is not on the PATH";
};

/** One Claude transcript line. */
const transcriptLine = (
  sessionId: string,
  at: number,
  role: "user" | "assistant",
  text: string
): string =>
  `${JSON.stringify({
    type: role,
    uuid: crypto.randomUUID(),
    parentUuid: null,
    sessionId,
    cwd: "/probe",
    timestamp: new Date(Date.UTC(2026, 10, 1) + at * 1000).toISOString(),
    isSidechain: false,
    message:
      role === "user"
        ? { role: "user", content: text }
        : {
            id: `msg_${sessionId}_${at}`,
            type: "message",
            role: "assistant",
            model: "claude-haiku-4-5",
            content: [{ type: "text", text }],
            usage: { input_tokens: 10, output_tokens: 20 },
          },
  })}\n`;

/** The second machine: registers over the hub's socket, answers a carry's removal and the index's forget. */
const standIn = async (
  base: string,
  floor: MachineFloor,
  index: TranscriptIndex,
  calls: string[]
): Promise<WebSocket> => {
  const { removeFolder } =
    await import("../../../packages/agent/src/remove-folder");
  const answerOf = async (method: string, args: unknown[]) => {
    switch (method) {
      case "removeFolder":
        return await removeFolder(args[0] as RemoveFolder, floor);
      case "forgetTranscriptText": {
        const { text, dry } = args[0] as ForgetTranscriptText;
        return { documents: index.forgetText(text, dry) };
      }
      default:
        return null;
    }
  };
  const socket = new WebSocket(`${base.replace("http", "ws")}/ws`);
  socket.addEventListener("message", (event) => {
    const frame = JSON.parse(String(event.data)) as {
      payload?: { args?: unknown[]; method?: string; requestId?: string };
      verb?: string;
    };
    if (frame.verb !== "control" || !frame.payload?.method) {
      return;
    }
    const { method, args = [], requestId } = frame.payload;
    calls.push(method);
    answerOf(method, args).then(
      (result) =>
        socket.send(
          JSON.stringify({
            verb: "frames",
            machineId: B,
            payload: { kind: "control_result", requestId, ok: true, result },
          })
        ),
      (error: unknown) =>
        socket.send(
          JSON.stringify({
            verb: "frames",
            machineId: B,
            payload: {
              kind: "control_result",
              requestId,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
          })
        )
    );
  });
  await new Promise<void>((done, fail) => {
    socket.addEventListener("open", () => done(), { once: true });
    socket.addEventListener(
      "error",
      () => fail(new Error("the stand-in's socket did not open")),
      { once: true }
    );
  });
  socket.send(
    JSON.stringify({
      verb: "register",
      machineId: B,
      payload: {
        machineId: B,
        hostname: B,
        os: "linux",
        home: floor.home,
        auth: { state: "signed-out" },
      },
    })
  );
  return socket;
};

/** A project on the stand-in with the code template, and its session (its turns delivered, so its notes are untainted). */
const project = (
  rig: Pick<Rig, "db" | "floor">,
  name: string
): { id: string; session: string } => {
  const id = crypto.randomUUID();
  const at = machinePath(
    rig.floor.home,
    join(rig.floor.home, "src", "office"),
    B
  );
  rig.db.createProject({
    id,
    name,
    checkout: { machineId: B, path: at },
    remote: null,
  });
  rig.db.setProjectTemplate(id, "code");
  const session = crypto.randomUUID();
  rig.db.openInstance({
    id: session,
    machineId: B,
    cwd: at,
    sessionId: crypto.randomUUID(),
    harness: "claude",
    origin: "person",
    projectId: id,
    title: "Office session",
    kind: "mainline",
    permissionMode: "bypassPermissions",
    model: "model-a",
  });
  rig.db.putSessionTaint({
    instanceId: session,
    web: false,
    fromRoutine: null,
    delivered: true,
    routine: null,
    subagents: [],
    updatedAt: new Date(),
  });
  return { id, session };
};

/** A task filed by the person, its id. */
const file = async (rig: Rig, projectId: string, title: string) => {
  const made = await rig.board(
    hubRequest("POST /api/projects/:id/tasks", {
      path: { id: projectId },
      body: { title },
    })
  );
  const id = (JSON.parse(made.text) as { id?: string }).id ?? "";
  if (!id) {
    throw new Error(`the task was not filed: ${made.status} ${made.text}`);
  }
  return id;
};

/** The person's move of a task, with a reason. */
const move = (
  rig: Rig,
  projectId: string,
  taskId: string,
  stage: string,
  reason: string
) =>
  rig.board(
    hubRequest("POST /api/projects/:id/tasks/:taskId/stage", {
      path: { id: projectId, taskId },
      body: { stage, reason },
    })
  );

/** A note's id, as the hub names it. */
const NOTE_ID = /n-\d{8}-\d{6}-[0-9a-f]{6}/u;
/** A note's front matter marking it private. */
const MARKED_LINE = /^private:\s*true$/mu;

/** A memory note as the session writes it: its id, or the refusal's words. */
const note = async (rig: Rig, args: { private?: boolean; text: string }) => {
  const said = await toolWords(rig.session, "memory_note", args);
  const id = NOTE_ID.exec(said.text)?.[0];
  return { ...said, id };
};

/** a: what is marked private is never stored. */
const privateLeg = async (rig: Rig, projectId: string): Promise<void> => {
  const { check } = rig.kit;
  const taskId = await file(
    rig,
    projectId,
    `Book the venue <private>${SECRET}</private>`
  );
  const moved = await move(
    rig,
    projectId,
    taskId,
    "done",
    `Booked <private>${SECRET}</private> for Friday`
  );
  const noted = await note(rig, {
    text: `Deploys are on Tuesdays <private>${SECRET}</private>`,
  });
  const allPrivate = await note(rig, { text: `<private>${SECRET}</private>` });
  const history = await wholeHistory(rig.root(projectId));
  const tree = await git(rig.root(projectId), [
    "grep",
    "-F",
    "-e",
    "4471",
    "HEAD",
  ]);
  check(
    "a. a task's title and close reason and a session's note with a private span: no file or commit message holds its words",
    moved.status === 200 &&
      !noted.refused &&
      !history.includes("4471") &&
      tree === "" &&
      history.includes("Booked  for Friday") &&
      history.includes("Deploys are on Tuesdays"),
    `${moved.status} ${noted.text.slice(0, 200)} | ${history
      .split("\n")
      .filter((line) => line.includes("4471"))
      .join(" / ")
      .slice(0, 300)}`
  );
  check(
    "a. a note that is all private is refused, nothing written",
    allPrivate.refused && allPrivate.text.includes("<private>"),
    allPrivate.text
  );
  const workspaceId = crypto.randomUUID();
  rig.db.createWorkspace({
    id: workspaceId,
    machineId: B,
    repoRoot: machinePath(
      rig.floor.home,
      join(rig.floor.home, "src", "office"),
      B
    ),
    path: machinePath(rig.floor.home, join(rig.disk, "ws", workspaceId), B),
    branch: `ws/${workspaceId.slice(0, 8)}`,
    createdByInstanceId: rig.session.id,
    createdAt: new Date(),
    state: "active",
    carry: null,
  });
  const itemId = crypto.randomUUID();
  rig.db.createWorkItem({
    id: itemId,
    workspaceId,
    parentInstanceId: rig.session.id,
    instanceId: rig.session.id,
    brief: `Check the venue booking. <private>${SECRET}</private> Report back.`,
    title: "Check the venue booking",
    harness: "claude",
    createdAt: new Date(),
    projectId,
  });
  const brief = rig.db.workItem(itemId)?.brief ?? "";
  check(
    "a. a work item's brief keeps no private span",
    !brief.includes("4471") && brief.includes("Check the venue booking."),
    brief
  );
  const { redactSecrets } =
    await import("../../../packages/hub/src/secret-filter");
  const masked = await redactSecrets(
    `He said <private>${SECRET}</private> twice.`
  );
  check(
    "a. where the secret filter answers (an agent's find, a transcript), a private span is masked",
    !masked.includes("4471") && masked.includes("[redacted]"),
    masked
  );
};

/** b: a note marked private is never a candidate, nor in a brief. */
const markedLeg = async (rig: Rig, projectId: string): Promise<void> => {
  const { check } = rig.kit;
  const plain = await note(rig, { text: PLAIN });
  const marked = await note(rig, { text: MARKED, private: true });
  const proposed = await toolWords(rig.session, "memory_propose", {
    files: [
      {
        path: "knowledge/people.md",
        content: `# People\n\n- ${MARKED} (since 2026-11-07, from ${marked.id})\n`,
      },
    ],
    notes: [marked.id ?? ""],
    why: "the owner's move",
  });
  const noteFile = await readFile(
    join(rig.root(projectId), "memory", "inbox", `${marked.id}.md`),
    "utf8"
  ).catch(() => "");
  check(
    "b. a note marked private is written so: its file says private: true",
    !marked.refused && MARKED_LINE.test(noteFile),
    `${marked.text} | ${noteFile}`
  );
  check(
    "b. memory_propose citing the private note is refused: it is no candidate",
    proposed.refused && proposed.text.includes(marked.id ?? "?"),
    proposed.text
  );
  const { createMemory, createTurnWatch } =
    await import("../../../packages/hub/src/memory");
  const memory = createMemory({
    db: rig.db,
    watch: createTurnWatch({
      fleetHosts: () => [],
      get: (id) => rig.db.sessionTaint(id),
      mcpUrl: () => undefined,
      put: (row) => rig.db.putSessionTaint(row),
    }),
    curator: () => ({ ensure: () => undefined, inboxPassed: () => undefined }),
    folderChanged: () => undefined,
    notice: () => undefined,
    park: () => undefined,
    settle: () => undefined,
    tell: () => false,
  });
  const brief = await memory.curatorBrief(projectId);
  const text = brief.kind === "run" ? brief.text : "";
  check(
    "b. the curator's brief carries the plain note and not the private one",
    !plain.refused && text.includes(PLAIN) && !text.includes(MARKED),
    `${brief.kind} ${text.slice(0, 600)}`
  );
};

/** What the forget's places say, one line each. */
const placesOf = (answer: ForgetAnswer): string =>
  answer.places.map((place) => `${place.kind}: ${place.says}`).join("\n");

/** Where the fact stands before the forget: a close reason, a note and its commit, a knowledge line resting on it alone, a brief, a carry (the index holds it already). */
const plantFact = async (rig: Rig, projectId: string) => {
  const taskId = await file(rig, projectId, "Cover the owner's week");
  const closed = await move(rig, projectId, taskId, "done", `Covered: ${FACT}`);
  const fact = await note(rig, { text: FACT });
  const other = await note(rig, {
    text: "The office closes at six on Fridays",
  });
  const { writeFolderFile } =
    await import("../../../packages/hub/src/project-folder");
  await writeFolderFile(
    projectId,
    "knowledge/people.md",
    `# People\n\nWho the office works for.\n\n- ${FACT} (since 2026-11-01, from ${fact.id})\n- The office closes at six on Fridays (since 2026-11-01, from ${other.id})\n`,
    { author: { name: "you" }, message: "knowledge: people" }
  );
  const workspaceId = crypto.randomUUID();
  const carry = join(rig.floor.carries, `${workspaceId}-20261107`);
  await mkdir(carry, { recursive: true });
  await writeFile(join(carry, "patch"), `+ ${FACT}\n`);
  rig.db.createWorkspace({
    id: workspaceId,
    machineId: B,
    repoRoot: machinePath(
      rig.floor.home,
      join(rig.floor.home, "src", "office"),
      B
    ),
    path: machinePath(rig.floor.home, join(rig.disk, "ws", workspaceId), B),
    branch: `ws/${workspaceId.slice(0, 8)}`,
    createdByInstanceId: rig.session.id,
    createdAt: new Date(),
    state: "archived",
    carry,
  });
  const itemId = crypto.randomUUID();
  rig.db.createWorkItem({
    id: itemId,
    workspaceId,
    parentInstanceId: rig.session.id,
    instanceId: rig.session.id,
    brief: `Move the owner's meetings: ${FACT}. Keep it quiet.`,
    title: "Move the owner's meetings",
    harness: "claude",
    createdAt: new Date(),
    projectId,
  });

  return { taskId, closed, factId: fact.id, carry, itemId, workspaceId };
};

/** The person's dry run (no confirm) or forget, through the board's door. */
const forgetCall = (rig: Rig, body: { text: string; confirm?: string }) =>
  rig.board(
    body.confirm === undefined
      ? hubRequest("POST /api/facts/forget/dry-run", {
          body: { text: body.text },
        })
      : hubRequest("POST /api/facts/forget", {
          body: { text: body.text, confirm: body.confirm },
        })
  );

/** c, once forgotten: nothing of the fact is left where it stood. */
const afterForget = async (
  rig: Rig,
  projectId: string,
  planted: Awaited<ReturnType<typeof plantFact>>
): Promise<void> => {
  const { check } = rig.kit;
  const root = rig.root(projectId);
  const { taskId, closed, factId, carry, itemId, workspaceId } = planted;
  const history = JSON.parse(
    (
      await rig.board(
        hubRequest("GET /api/projects/:id/tasks/:taskId/history", {
          path: { id: projectId, taskId },
        })
      )
    ).text
  ) as TaskHistory;
  const reason = history.events.findLast(
    (event) => event.stage?.to === "done"
  )?.reason;
  check(
    "c. the close reason's trailer reads [redacted]: the task's history says so",
    closed.status === 200 && reason === "Covered: [redacted]",
    String(reason)
  );
  const objects = await everyObject(root);
  check(
    "c. no git object of the project folder holds it, reachable or not: messages, notes, knowledge",
    !objects.includes(FACT) && objects.includes("[redacted]"),
    objects
      .split("\n")
      .filter((line) => line.includes(FACT))
      .join(" / ")
      .slice(0, 300)
  );
  const knowledge = await readFile(
    join(root, "knowledge", "people.md"),
    "utf8"
  );
  check(
    "c. its note is gone, the knowledge line resting on it alone is gone, the line resting on another note stays",
    !(
      (await Bun.file(
        join(root, "memory", "inbox", `${factId}.md`)
      ).exists()) ||
      (await Bun.file(
        join(root, "memory", "archive", `${factId}.md`)
      ).exists()) ||
      knowledge.includes("St Thomas")
    ) && knowledge.includes("The office closes at six on Fridays"),
    knowledge
  );
  const brief = rig.db.workItem(itemId)?.brief ?? "";
  check(
    "c. the brief's row reads [redacted] where the fact stood",
    brief === "Move the owner's meetings: [redacted]. Keep it quiet.",
    brief
  );
  const workspace = rig.db
    .workspacesNamed(workspaceId)
    .find((one) => one.id === workspaceId);
  check(
    "c. the carry is gone from its machine's disk, its workspace's row lets it go",
    !(await there(carry)) && workspace?.carry === null,
    `${await there(carry)} ${workspace?.carry}`
  );
  const dbBytes = [
    await readFile(rig.dbPath),
    await readFile(`${rig.dbPath}-wal`).catch(() => Buffer.alloc(0)),
  ];
  check(
    "c. the hub's database file and its WAL hold no byte of it",
    dbBytes.every((bytes) => !bytes.includes(FACT)),
    dbBytes.map((bytes) => bytes.length).join(", ")
  );
  const left = rig.index.forgetText(FACT, true);
  const indexed = rig.index.search("surgery Thomas", {}).length;
  const indexBytes = [
    await readFile(rig.indexPath),
    await readFile(`${rig.indexPath}-wal`).catch(() => Buffer.alloc(0)),
  ];
  check(
    "c. the machine's transcript index holds it no more: no document, no search for its words finds one, no byte of its file holds it",
    left === 0 &&
      indexed === 0 &&
      indexBytes.every((bytes) => !bytes.includes(FACT)),
    `${left} documents, ${indexed} hits, ${indexBytes.map((bytes) => bytes.includes(FACT)).join(", ")}`
  );
  const { redactSecrets } =
    await import("../../../packages/hub/src/secret-filter");
  const masked = await redactSecrets(
    `Remember: ${FACT.toLowerCase()}, and call her.`
  );
  check(
    "c. from now on the secret filter masks it wherever the hub answers, its case aside",
    !masked.toLowerCase().includes("st thomas") &&
      masked.includes("[redacted]"),
    masked
  );
};

/** c: a fact forgotten wherever it stands, by the person's act, a dry run first. */
const forgetLeg = async (rig: Rig, projectId: string): Promise<void> => {
  const { check } = rig.kit;
  const root = rig.root(projectId);
  const planted = await plantFact(rig, projectId);
  const { carry, itemId } = planted;
  const forget = (body: { text: string; confirm?: string }) =>
    forgetCall(rig, body);

  const dry = await forget({ text: FACT });
  const plan =
    dry.status === 200 ? (JSON.parse(dry.text) as ForgetAnswer) : undefined;
  const planned = plan ? placesOf(plan) : dry.text;
  check(
    "c. the dry run lists every place: the close reason's trailer, the note, the knowledge line, the brief's row, the carry, the index, the mask",
    plan?.dryRun === true &&
      typeof plan.confirm === "string" &&
      planned.includes("CawCo-Reason") &&
      planned.includes(`Memory note ${planted.factId}`) &&
      planned.includes("1 knowledge line") &&
      planned.includes("work_items.brief") &&
      planned.includes(carry) &&
      planned.includes(`The transcript index on ${B}: 1 document`) &&
      planned.includes(forgetFactWords.mask),
    planned
  );
  check(
    "c. the dry run names what stays (each harness's own transcripts) and changes nothing",
    (plan?.stays ?? []).includes(forgetFactWords.harnessTranscripts) &&
      (await wholeHistory(root)).includes(FACT) &&
      (await there(carry)) &&
      (rig.db.workItem(itemId)?.brief ?? "").includes(FACT),
    JSON.stringify(plan?.stays ?? [])
  );
  const unconfirmed = await forget({
    text: FACT,
    confirm: crypto.randomUUID(),
  });
  const otherWords = await forget({
    text: `${FACT}.`,
    confirm: plan?.confirm ?? "",
  });
  check(
    "c. a forget without the dry run's confirm, or with other words, is refused",
    unconfirmed.status === 409 &&
      unconfirmed.text === forgetFactWords.dryRunFirst &&
      otherWords.status === 409 &&
      otherWords.text === forgetFactWords.confirmStale,
    `${unconfirmed.status} ${unconfirmed.text} | ${otherWords.status} ${otherWords.text}`
  );

  // The confirm was taken by the refused try with other words: a dry run again.
  const again = JSON.parse((await forget({ text: FACT })).text) as ForgetAnswer;
  const done = await forget({ text: FACT, confirm: again.confirm ?? "" });
  const report =
    done.status === 200 ? (JSON.parse(done.text) as ForgetAnswer) : undefined;
  check(
    "c. the forget answers its report: what it was removed from, and what stays",
    report !== undefined &&
      !report.dryRun &&
      placesOf(report).includes("CawCo-Reason") &&
      placesOf(report).includes(carry) &&
      report.stays.includes(forgetFactWords.harnessTranscripts) &&
      report.stays.includes(forgetFactWords.newIds),
    `${done.status} ${report ? `${placesOf(report)}\nstays: ${report.stays.join(" / ")}` : done.text}`
  );
  await afterForget(rig, projectId, planted);
};

/** d: an agent's call to forget is refused. */
const agentLeg = async (rig: Rig): Promise<void> => {
  const { check } = rig.kit;
  const asSession = { Authorization: `Bearer ${rig.session.credential}` };
  const dry = await fetchHub(
    fetch,
    rig.base,
    hubRequest("POST /api/facts/forget/dry-run", { body: { text: FACT } }),
    { headers: asSession }
  );
  const real = await fetchHub(
    fetch,
    rig.base,
    hubRequest("POST /api/facts/forget", {
      body: { text: FACT, confirm: "x" },
    }),
    { headers: asSession }
  );
  check(
    "d. a session's credential is refused on the dry run and on the forget",
    [401, 403].includes(dry.status) && [401, 403].includes(real.status),
    `${dry.status} ${await dry.text()} | ${real.status} ${await real.text()}`
  );
  const listed = await fetch(
    `${rig.base}/mcp/cawco?instanceId=${rig.session.id}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${rig.session.credential}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    }
  );
  const raw = await listed.text();
  const names = [...raw.matchAll(/"name":"([a-z_]+)"/gu)].map(
    (match) => match[1] ?? ""
  );
  check(
    "d. no tool a session lists forgets",
    names.includes("memory_note") &&
      !names.some((name) => name.includes("forget")),
    `${listed.status} ${names.join(", ").slice(0, 600)}`
  );
};

export default {
  group: "The hub and machines",
  name: "fact-forget",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load, and the folder's git reads the PATH filter-repo is put on once",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "fact-forget-")
    );
    let socket: WebSocket | undefined;
    let index: TranscriptIndex | undefined;
    try {
      const missing = await filterRepo(scratch);
      kit.check(
        "git filter-repo is on the PATH the hub runs it from",
        !missing,
        missing ?? ""
      );
      if (missing) {
        return;
      }
      const dbPath = join(scratch, "hub", "hub.db");
      const { hubInProcess } =
        await import("../../../packages/hub/scripts/hub-in-process");
      const { db, hub } = await hubInProcess(dbPath, join(scratch, "home"));
      const { projectRoot } =
        await import("../../../packages/hub/src/project-folder");
      const { createSessionIdentities } =
        await import("../../../packages/hub/src/session-identity");
      const listening = (
        hub as unknown as {
          listen: (options: object) => { server?: { port?: number } };
        }
      ).listen({ hostname: "127.0.0.1", port: 0 });
      const base = `http://127.0.0.1:${listening.server?.port ?? 0}`;
      for (let tries = 0; tries < 50; tries += 1) {
        if (
          await fetchHub(fetch, base, hubRequest("GET /health")).then(
            (r) => r.ok,
            () => false
          )
        ) {
          break;
        }
        await Bun.sleep(100);
      }
      const disk = join(scratch, "disk");
      const home = join(disk, "home");
      const floor: MachineFloor = {
        carries: join(home, ".cawco", "carries"),
        home,
        own: [
          join(home, ".cawco"),
          join(home, ".local", "share", "cawco"),
          join(home, ".config", "cawco"),
        ],
      };
      await mkdir(floor.carries, { recursive: true });

      // The stand-in's index: a transcript where the person said the fact.
      const { TranscriptIndex: Index } =
        await import("../../../packages/jsonl-parser/src/fts5");
      const indexPath = join(scratch, "index.db");
      index = new Index(indexPath);
      const transcript = join(scratch, "transcript.jsonl");
      const said = crypto.randomUUID();
      await writeFile(
        transcript,
        transcriptLine(said, 0, "user", `Keep this between us: ${FACT}.`) +
          transcriptLine(
            said,
            1,
            "assistant",
            "Understood, I will keep the week clear."
          )
      );
      await index.sync([{ harness: "claude-code", path: transcript }]);

      const calls: string[] = [];
      socket = await standIn(base, floor, index, calls);
      for (let tries = 0; tries < 50; tries += 1) {
        if (db.listAgents().some((one) => one.machineId === B)) {
          break;
        }
        await Bun.sleep(100);
      }
      const made = project({ db, floor }, "Private office probe");
      const rig: Rig = {
        base,
        board: async (request, headers = {}) => {
          const response = await hub.handle(
            new Request(
              `http://127.0.0.1${request.path}`,
              hubInit(request, { headers })
            )
          );
          return { status: response.status, text: await response.text() };
        },
        db,
        dbPath,
        disk,
        floor,
        index,
        indexPath,
        kit,
        root: projectRoot,
        session: {
          base,
          id: made.session,
          credential: createSessionIdentities(db).mint(made.session),
        },
      };
      await privateLeg(rig, made.id);
      await markedLeg(rig, made.id);
      await forgetLeg(rig, made.id);
      await agentLeg(rig);
    } finally {
      socket?.close();
      index?.db.close();
      await rm(scratch, { recursive: true, force: true });
    }
  },
} satisfies Spec;
