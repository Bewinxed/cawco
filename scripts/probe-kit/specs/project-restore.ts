/**
 * Forgetting a project can be undone (hub project-trash.ts, db forget.ts),
 * on an in-process hub over a scratch database, through the hub's own
 * routes:
 *
 * - a. A project carrying a checkout, a task (its folder made), a routine,
 *   a rule, a page (a blob in its log), an account (its own and its allowed
 *   one), an area it sits in and a session is forgotten (`DELETE /api/projects/:id`, a tab's
 *   presence id sent): every one of them is gone, the trash holds its
 *   folder and its record, its browser stays on its machine with its
 *   profile, its area stands with nothing of it deleted, and the journal's
 *   line names the project and the presence. No read that outlived the forget (its task's triage) makes
 *   its folder again.
 * - b. `GET /api/projects/forgotten` lists it with its name and what a
 *   restore brings back.
 * - c. A project made since at its checkout holds its place: the restore is
 *   refused in core's words; one made since under its id: refused too.
 * - d. Those gone, `POST /api/projects/:id/restore` brings it back, every
 *   row as it was: the row with its account and allowed accounts, its
 *   places, the task, the routine, the rule, the page and its log's blob,
 *   the session counted its own again, its folder back in place and no
 *   entry left in the trash, the project in its area again (`area_id` kept
 *   through the foreign-key walk); the journal's line names it. A second restore
 *   finds nothing to bring back.
 * - e. A project forgotten before the hub kept records (a folder in the
 *   trash, its row gone, nothing beside it) is listed with no name and what
 *   its folder alone brings; its restore needs a name, then brings its row
 *   back under its id with its folder and the task its folder holds.
 * - f. A project whose browser runs on a machine the hub can't reach is
 *   kept: its browser can't be stopped, as before.
 * - g. Duplicates folded before the hub kept records: one whose every task
 *   a fold's commit wrote into the project that kept it is neither listed
 *   nor restored; one only some of whose tasks one wrote is listed with
 *   that project in `tasksIn`.
 * - h. Each row names the places deleting it with its files removes, the
 *   same the delete removes: a forgotten project with a record names its
 *   folder in the trash and its checkout on its machine, by the machine's
 *   name; one forgotten before records names its folder and what the
 *   folder says of it (its AGENTS.md heading, newest task, decision pages,
 *   stages and newest file's time).
 * - i. One forgotten before records holding two task files and no stages.md
 *   (made on the code template, and on the brand template whose stages.md
 *   went) comes back with both tasks in the column they were filed in on
 *   its board's first read: through the route, and read before its index
 *   caught up with its folder.
 *
 *   bun scripts/probe-kit/run.ts project-restore
 */
import { Database } from "bun:sqlite";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRESENCE_HEADER } from "../../../packages/core/src/browser-gate";
import {
  type HubRequest,
  hubInit,
  hubRequest,
} from "../../../packages/core/src/hub-request";
import {
  type MachinePath,
  machinePath,
} from "../../../packages/core/src/machine-path";
import { projectTrashWords } from "../../../packages/core/src/words/project-trash";
import type { hubInProcess as inProcess } from "../../../packages/hub/scripts/hub-in-process";
import type { Kit, Spec } from "../kit";

const MACHINE = "probe-restore-machine";
const PRESENCE = "probe-presence-4f2a";
const NAME = "Probe restore";
const TASK = "Bring the project back";

interface Answer {
  json: unknown;
  status: number;
  text: string;
}

/** The in-process hub and what the legs read it with. */
interface Rig {
  call: (request: HubRequest) => Promise<Answer>;
  db: Awaited<ReturnType<typeof inProcess>>["db"];
  /** Every journal line the hub wrote. */
  journal: string[];
  kit: Kit;
  /** The hub's database, read beside the hub. */
  raw: Database;
  /** A project's folder on the hub. */
  root: (projectId: string) => string;
  /** The trash's entries, by name. */
  trash: () => Promise<string[]>;
  trashDir: string;
}

/** The seeded project: its id, and the ids of what it carries. */
interface Seeded {
  accountId: string;
  /** The area it sits in. */
  areaId: string;
  blob: Uint8Array;
  checkout: MachinePath;
  id: string;
  pageId: string;
  routineId: string;
  ruleId: string;
  session: string;
}

/** A forgotten project as the list answers it. */
interface Listed {
  brings: Record<string, unknown>;
  by: string | null;
  forgottenAt: number;
  hints: Record<string, unknown> | null;
  id: string;
  name: string | null;
  places: {
    kind: string;
    machineId: string;
    machineName: string;
    path: string;
  }[];
}

const idOf = (answer: Answer): string =>
  (answer.json as { id?: string } | undefined)?.id ?? "";

const there = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  );

/** The forgotten projects the hub lists now. */
const listed = async (rig: Rig): Promise<Listed[]> =>
  ((await rig.call(hubRequest("GET /api/projects/forgotten"))).json as
    Listed[] | undefined) ?? [];

/** A project carrying a checkout, a task, a routine, a rule, an account, a page and a session. */
const seed = async (rig: Rig): Promise<Seeded> => {
  const { call, db, raw } = rig;
  db.upsertAgent({
    machineId: MACHINE,
    hostname: `${MACHINE}.local`,
    os: "linux",
    auth: "unknown",
  });
  const checkout = machinePath(
    "/home/probe",
    "/home/probe/src/restore",
    MACHINE
  );
  const id = crypto.randomUUID();
  db.createProject({
    id,
    name: NAME,
    checkout: { machineId: MACHINE, path: checkout },
    remote: null,
  });
  // Set up on the code template, so its tasks have stages.
  db.setProjectTemplate(id, "code");
  const task = await call(
    hubRequest("POST /api/projects/:id/tasks", {
      path: { id },
      body: {
        title: TASK,
      },
    })
  );
  const routine = await call(
    hubRequest("POST /api/routines", {
      body: {
        projectId: id,
        name: "Probe routine",
        cron: "0 9 * * *",
        timeZone: "UTC",
        target: "conversation",
        prompt: "Say how the project stands.",
        keep: true,
      },
    })
  );
  const rule = await call(
    hubRequest("POST /api/rules", {
      body: {
        name: "Probe rule",
        enabled: true,
        pattern: "probe phrase",
        matchKind: "phrase",
        caseSensitive: false,
        wholeWord: false,
        watch: "text",
        reply: "The probe rule fired.",
        timing: "turn",
        repeat: true,
        scope: { projectId: id },
      },
    })
  );
  const account = await call(
    hubRequest("POST /api/accounts", {
      body: {
        provider: "anthropic",
        kind: "subscription",
        label: "Probe account",
      },
    })
  );
  const accountId = idOf(account);
  const allowed = await call(
    hubRequest("PUT /api/projects/:id/accounts", {
      path: { id },
      body: {
        accounts: [accountId],
      },
    })
  );
  const own = await call(
    hubRequest("PATCH /api/projects/:id", {
      path: { id },
      body: {
        account: accountId,
      },
    })
  );
  const area = await call(
    hubRequest("POST /api/areas", { body: { name: "Probe area" } })
  );
  const areaId = idOf(area);
  const inArea = await call(
    hubRequest("PUT /api/projects/:id/area", { path: { id }, body: { areaId } })
  );
  const pageId = crypto.randomUUID();
  const now = Date.now();
  raw
    .prepare(
      "INSERT INTO artifacts (id, origin, kind, name, project_id, created_at, updated_at) VALUES (?, ?, 'page', 'probe-page', ?, ?, ?)"
    )
    .run(pageId, crypto.randomUUID(), id, now, now);
  const blob = new Uint8Array([0, 1, 2, 250, 251, 255, 7]);
  raw
    .prepare(
      'INSERT INTO artifact_updates (artifact_id, seq, "update") VALUES (?, 1, ?)'
    )
    .run(pageId, blob);
  const session = crypto.randomUUID();
  db.openInstance({
    id: session,
    machineId: MACHINE,
    cwd: checkout,
    sessionId: crypto.randomUUID(),
    harness: "claude",
    origin: "person",
    projectId: id,
    title: "Probe session",
    kind: "mainline",
    permissionMode: "bypassPermissions",
    model: "model-a",
  });
  // Ended, as a forget asks: nothing of a project still runs.
  db.endInstance(session, "stop");
  // Its browser on the machine, asleep there, its profile (its sign-ins)
  // on the machine's disk: as the machine's frame told the hub.
  db.browsers.put(MACHINE, {
    key: `project:${id}`,
    name: "Probe browser",
    host: "local",
    state: "asleep",
    lastUsedAt: now,
    projectId: id,
    takeover: null,
  });
  const seeded = [task, routine, rule, account, allowed, own, area, inArea];
  rig.kit.check(
    "a. seeded: a task, a routine, a rule, an account (own and allowed), an area it sits in",
    seeded.every((one) => one.status === 200),
    JSON.stringify(seeded.map((one) => one.status))
  );
  return {
    accountId,
    areaId,
    blob,
    checkout,
    id,
    pageId,
    routineId: idOf(routine),
    ruleId: idOf(rule),
    session,
  };
};

/** What the hub holds of the seeded project now, read through its own reads and its rows. */
const held = async (rig: Rig, seeded: Seeded) => {
  const { call, db, raw } = rig;
  const { id } = seeded;
  const project = db.project(id);
  const tasks = await call(
    hubRequest("GET /api/projects/:id/tasks", { path: { id } })
  );
  const routines = await call(
    hubRequest("GET /api/routines", { query: { projectId: id } })
  );
  const { rules } = (await call(hubRequest("GET /api/rules"))).json as {
    rules: { id: string; scope: { projectId?: string } }[];
  };
  const page = raw
    .query("SELECT name, project_id FROM artifacts WHERE id = ?")
    .get(seeded.pageId) as { name: string; project_id: string } | null;
  const update = raw
    .query(
      'SELECT "update" AS bytes FROM artifact_updates WHERE artifact_id = ?'
    )
    .get(seeded.pageId) as { bytes: Uint8Array } | null;
  const session = raw
    .query("SELECT project_id FROM instances WHERE id = ?")
    .get(seeded.session) as { project_id: string | null } | null;
  return {
    name: project?.name ?? null,
    account: project?.account ?? null,
    accounts: project?.accounts ?? null,
    area: project?.areaId ?? null,
    places: (project?.places ?? [])
      .map((place) => `${place.kind}:${place.machineId}:${place.path}`)
      .sort(),
    tasks: tasks.status === 200 && tasks.text.includes(TASK),
    routine: routines.text.includes(seeded.routineId),
    rule:
      rules.find((one) => one.id === seeded.ruleId)?.scope.projectId ?? null,
    page: page ? `${page.name}:${page.project_id}` : null,
    blob: update ? Buffer.from(update.bytes).toString("hex") : null,
    session: session?.project_id ?? null,
    folder: await there(rig.root(id)),
    browser: db.browsers.get(MACHINE, `project:${id}`)?.name ?? null,
  };
};
type Held = Awaited<ReturnType<typeof held>>;

/** a and b: forgotten, gone, kept in the trash, named in the journal, listed. */
const forgetLeg = async (rig: Rig, seeded: Seeded): Promise<Held> => {
  const { call, journal, kit } = rig;
  const { id } = seeded;
  const before = await held(rig, seeded);
  kit.note(`before: ${JSON.stringify(before)}`);
  kit.check(
    "a. before: each one is the project's",
    before.name === NAME &&
      before.account === seeded.accountId &&
      before.area === seeded.areaId &&
      before.places.length === 2 &&
      before.tasks &&
      before.routine &&
      before.rule === id &&
      before.page === `probe-page:${id}` &&
      before.blob === Buffer.from(seeded.blob).toString("hex") &&
      before.session === id &&
      before.folder &&
      before.browser === "Probe browser",
    JSON.stringify(before)
  );

  const forgot = await call(
    hubRequest("DELETE /api/projects/:id", { path: { id } })
  );
  // What the task's filing started (its triage, its waits) reads on after
  // the forget: none of it makes the folder again.
  await Bun.sleep(1000);
  const gone = await held(rig, seeded);
  check(
    rig,
    "a. forgotten: the project, its task, routine, rule, page and folder gone, its session unlinked",
    forgot.status === 200 &&
      gone.name === null &&
      !(gone.tasks || gone.routine || gone.folder) &&
      gone.rule === null &&
      gone.page === null &&
      gone.session === null,
    JSON.stringify({ forgot: forgot.status, gone })
  );
  kit.check(
    "a. its browser is kept on its machine, its profile with it, not removed",
    gone.browser === "Probe browser",
    JSON.stringify(gone.browser)
  );
  const area = await call(
    hubRequest("GET /api/areas/:id", { path: { id: seeded.areaId } })
  );
  kit.check(
    "a. its area stands, the forget taking nothing of it",
    area.status === 200 &&
      (area.json as { projects?: string[] } | undefined)?.projects?.length ===
        0,
    area.text.slice(0, 300)
  );
  const entries = (await rig.trash()).filter((one) => one.startsWith(`${id}-`));
  kit.check(
    "a. the trash holds its folder and its record beside it",
    entries.length === 2 &&
      entries.some((one) => one.endsWith(".json")) &&
      entries.some((one) => !one.endsWith(".json")),
    JSON.stringify(entries)
  );
  const lines = journal.filter((line) =>
    line.startsWith(projectTrashWords.forgetLine(id))
  );
  kit.check(
    "a. one journal line names the forget, its project and the presence that asked",
    lines.length === 1 &&
      lines[0]?.includes(`presence=${PRESENCE}`) === true &&
      lines[0].includes("outcome=forgotten"),
    lines.join(" | ")
  );

  const entry = (await listed(rig)).find((one) => one.id === id);
  kit.check(
    "b. listed with its name, who forgot it and what it brings back",
    entry?.name === NAME &&
      entry.by === PRESENCE &&
      JSON.stringify(entry.brings) ===
        JSON.stringify({
          account: seeded.accountId,
          browsers: 1,
          folder: true,
          memoryDocs: 0,
          notes: 0,
          pages: 1,
          places: 2,
          routines: 1,
          rows: entry.brings.rows,
          rules: 1,
          sessions: 1,
          settings: true,
          tasks: 1,
          tasksIn: null,
        }),
    JSON.stringify(entry)
  );
  return before;
};

/** `kit.check`, its detail cut to a line a person reads. */
const check = (rig: Rig, name: string, ok: boolean, detail: string): void => {
  rig.kit.check(name, ok, detail.slice(0, 600));
};

/** c: refused while a live project holds its checkout, then its id. Answers when its own entry was forgotten. */
const refusedLeg = async (rig: Rig, seeded: Seeded): Promise<number> => {
  const { call, db } = rig;
  const { id } = seeded;
  const blocker = crypto.randomUUID();
  db.createProject({
    id: blocker,
    name: "Probe blocker",
    checkout: { machineId: MACHINE, path: seeded.checkout },
    remote: null,
  });
  const placeTaken = await call(
    hubRequest("POST /api/projects/:id/restore", { path: { id } })
  );
  check(
    rig,
    "c. a live project at its checkout: refused in core's words",
    placeTaken.status === 409 &&
      placeTaken.text ===
        projectTrashWords.placeTaken(NAME, "Probe blocker", seeded.checkout),
    placeTaken.text
  );
  await call(hubRequest("DELETE /api/projects/:id", { path: { id: blocker } }));
  db.createProject({ id, name: "Probe usurper", remote: null });
  const idTaken = await call(
    hubRequest("POST /api/projects/:id/restore", { path: { id } })
  );
  check(
    rig,
    "c. a live project under its id: refused in core's words",
    idTaken.status === 409 &&
      idTaken.text === projectTrashWords.idTaken("Probe usurper", id),
    idTaken.text
  );
  await call(hubRequest("DELETE /api/projects/:id", { path: { id } }));
  // The usurper's own forget is in the trash now, newer: the restore names
  // the probe's own by when it was forgotten.
  return (
    (await listed(rig)).find((one) => one.id === id && one.name === NAME)
      ?.forgottenAt ?? 0
  );
};

/** d: brought back, every part as it was, its entry gone from the trash. */
const restoreLeg = async (
  rig: Rig,
  seeded: Seeded,
  before: Held,
  forgottenAt: number
): Promise<void> => {
  const { call, journal, kit } = rig;
  const { id } = seeded;
  const restored = await call(
    hubRequest("POST /api/projects/:id/restore", {
      path: { id },
      body: {
        forgottenAt,
      },
    })
  );
  const after = await held(rig, seeded);
  kit.note(`after: ${JSON.stringify(after)}`);
  check(
    rig,
    "d. restored: 200, its name in the answer",
    restored.status === 200 &&
      (
        restored.json as
          { brought?: { browsers?: number }; name?: string } | undefined
      )?.name === NAME &&
      (restored.json as { brought: { browsers: number } }).brought.browsers ===
        1,
    restored.text
  );
  for (const part of Object.keys(before) as (keyof Held)[]) {
    kit.check(
      `d. its ${part} is back as it was`,
      JSON.stringify(after[part]) === JSON.stringify(before[part]),
      `${JSON.stringify(before[part])} → ${JSON.stringify(after[part])}`
    );
  }
  // The usurper never had a folder: its record alone is its entry.
  const left = (await rig.trash()).filter((one) => one.startsWith(`${id}-`));
  const names = (await listed(rig))
    .filter((one) => one.id === id)
    .map((one) => one.name);
  kit.check(
    "d. its own entry left the trash; the usurper's record stays",
    left.length === 1 &&
      left[0]?.endsWith(".json") === true &&
      JSON.stringify(names) === JSON.stringify(["Probe usurper"]),
    JSON.stringify({ left, names })
  );
  const lines = journal.filter((line) =>
    line.startsWith(projectTrashWords.restoreLine(id))
  );
  kit.check(
    "d. one journal line names the restore, its project and the presence",
    lines.filter(
      (line) =>
        line.includes(`presence=${PRESENCE}`) &&
        line.includes("outcome=restored")
    ).length === 1,
    lines.join(" | ")
  );
  const again = await call(
    hubRequest("POST /api/projects/:id/restore", {
      path: { id },
      body: {
        forgottenAt,
      },
    })
  );
  check(
    rig,
    "d. a second restore finds nothing to bring back",
    again.status === 404 && again.text === projectTrashWords.notForgotten(id),
    again.text
  );
};

/** e: a project forgotten before the hub kept records, its folder alone in the trash. */
const oldFolderLeg = async (rig: Rig): Promise<void> => {
  const { call, db } = rig;
  const old = crypto.randomUUID();
  db.createProject({ id: old, name: "Probe old", remote: null });
  db.setProjectTemplate(old, "code");
  const oldTask = await call(
    hubRequest("POST /api/projects/:id/tasks", {
      path: { id: old },
      body: {
        title: "Kept in the folder alone",
      },
    })
  );
  await call(hubRequest("DELETE /api/projects/:id", { path: { id: old } }));
  // As a hub before this change left it: the folder, nothing beside it.
  for (const one of await rig.trash()) {
    if (one.startsWith(`${old}-`) && one.endsWith(".json")) {
      await rm(join(rig.trashDir, one));
    }
  }
  const entry = (await listed(rig)).find((one) => one.id === old);
  check(
    rig,
    "e. an old trash folder is listed: no name, its folder and its task file",
    oldTask.status === 200 &&
      entry?.name === null &&
      entry.brings.settings === false &&
      entry.brings.folder === true &&
      entry.brings.tasks === 1,
    JSON.stringify({ oldTask: oldTask.status, entry })
  );
  const unnamed = await call(
    hubRequest("POST /api/projects/:id/restore", { path: { id: old } })
  );
  check(
    rig,
    "e. its restore needs a name: refused in core's words",
    unnamed.status === 400 &&
      unnamed.text === projectTrashWords.nameNeeded(old),
    unnamed.text
  );
  const named = await call(
    hubRequest("POST /api/projects/:id/restore", {
      path: { id: old },
      body: {
        name: "Probe old, back",
      },
    })
  );
  const tasks = await call(
    hubRequest("GET /api/projects/:id/tasks", { path: { id: old } })
  );
  check(
    rig,
    "e. named, it comes back under its id with its folder and its task",
    named.status === 200 &&
      db.project(old)?.name === "Probe old, back" &&
      (await there(rig.root(old))) &&
      tasks.text.includes("Kept in the folder alone"),
    JSON.stringify({ named: named.text, tasks: tasks.status })
  );
};

/** f: a project whose browser runs on a machine the hub can't reach stays, as a forget that can't stop it always has. */
const runningBrowserLeg = async (rig: Rig): Promise<void> => {
  const { call, db } = rig;
  const id = crypto.randomUUID();
  db.createProject({ id, name: "Probe running browser", remote: null });
  db.browsers.put(MACHINE, {
    key: `project:${id}`,
    name: "Probe live browser",
    host: "local",
    state: "live",
    lastUsedAt: Date.now(),
    projectId: id,
    takeover: null,
  });
  const forgot = await call(
    hubRequest("DELETE /api/projects/:id", { path: { id } })
  );
  check(
    rig,
    "f. a browser that runs and can't be stopped keeps the project, its browser as it was",
    forgot.status === 409 &&
      db.project(id) !== undefined &&
      db.browsers.get(MACHINE, `project:${id}`)?.state === "live" &&
      !(await listed(rig)).some((one) => one.id === id),
    JSON.stringify({ forgot })
  );
};

/** A project with tasks of these titles, made through the hub's own routes. */
const projectWithTasks = async (
  rig: Rig,
  name: string,
  titles: readonly string[]
): Promise<string> => {
  const id = crypto.randomUUID();
  rig.db.createProject({ id, name, remote: null });
  rig.db.setProjectTemplate(id, "code");
  for (const title of titles) {
    await rig.call(
      hubRequest("POST /api/projects/:id/tasks", {
        path: { id },
        body: { title },
      })
    );
  }
  return id;
};

/** A forget as a hub before records left it: the folder in the trash, nothing beside it. */
const forgetAsBefore = async (rig: Rig, id: string): Promise<void> => {
  await rig.call(hubRequest("DELETE /api/projects/:id", { path: { id } }));
  for (const one of await rig.trash()) {
    if (one.startsWith(`${id}-`) && one.endsWith(".json")) {
      await rm(join(rig.trashDir, one));
    }
  }
};

/**
 * g: duplicates folded before the hub kept records. The keeper's folder
 * holds the fold's commit (tasks.ts `mergedInMessage`, the dup's task files
 * under the keeper's next numbers, as `adopt` writes them); the dup's folder
 * went to the trash with nothing beside it. One whose every task the fold
 * wrote is no project a person forgot: not listed, not restored. One only
 * some of whose tasks it wrote is listed, with the project they live in.
 */
const foldLeg = async (rig: Rig): Promise<void> => {
  const { call } = rig;
  const { writeFolderFiles, readFolderFile } =
    await import("../../../packages/hub/src/project-folder");
  const { hubActor, mergedInMessage } =
    await import("../../../packages/hub/src/tasks");
  const { taskPath } = await import("../../../packages/hub/src/task-file");
  const keeper = await projectWithTasks(rig, "Probe keeper", ["Keeper's own"]);
  const dupTitles = ["Fold me in", "And me too"];
  const dup = await projectWithTasks(rig, "Probe dup", dupTitles);
  const partly = await projectWithTasks(rig, "Probe partly", [
    "Fold me in",
    "Only mine",
  ]);
  const files = await Promise.all(
    dupTitles.map(async (title, at) => {
      const file = await readFolderFile(dup, taskPath(at + 1, title));
      if (!("content" in file)) {
        throw new Error(file.response.detail);
      }
      return { path: taskPath(at + 2, title), content: file.content };
    })
  );
  const committed = await writeFolderFiles(keeper, files, {
    author: hubActor("Probe dup shares a repository with this project").author,
    message: mergedInMessage(
      hubActor("Probe dup shares a repository with this project"),
      ["tsk-2", "tsk-3"],
      "Probe dup"
    ),
  });
  if (!("sha" in committed)) {
    throw new Error(committed.response.detail);
  }
  await forgetAsBefore(rig, dup);
  await forgetAsBefore(rig, partly);
  const list = await listed(rig);
  const partlyListed = list.find((one) => one.id === partly);
  check(
    rig,
    "g. a duplicate whose every task the fold wrote is not listed",
    !list.some((one) => one.id === dup),
    JSON.stringify(list.map((one) => [one.id, one.name]))
  );
  check(
    rig,
    "g. one only some of whose tasks a fold wrote is listed, its tasks said to live in the keeper",
    JSON.stringify(partlyListed?.brings.tasksIn) ===
      JSON.stringify({ id: keeper, name: "Probe keeper", tasks: 1 }),
    JSON.stringify(partlyListed)
  );
  const folded = await call(
    hubRequest("POST /api/projects/:id/restore", {
      path: { id: dup },
      body: {
        name: "Probe dup, back",
      },
    })
  );
  check(
    rig,
    "g. the fold is not restored: refused in core's words",
    folded.status === 409 &&
      folded.text === projectTrashWords.foldedInto(dup, "Probe keeper") &&
      rig.db.project(dup) === undefined,
    folded.text
  );
};

/**
 * h: what each row names to tell it apart and what a delete with its files
 * removes. One with a record names its trash folder and its checkout, its
 * machine by name, and the delete with `fromDisk` removes that checkout
 * (refused first while its machine is away, naming the same machine); one
 * forgotten before records names its folder and what its files say.
 */
const placesLeg = async (rig: Rig): Promise<void> => {
  const { call, db } = rig;
  const { writeFolderFiles } =
    await import("../../../packages/hub/src/project-folder");
  const checkout = machinePath(
    "/home/probe",
    "/home/probe/src/places",
    MACHINE
  );
  const recorded = crypto.randomUUID();
  db.createProject({
    id: recorded,
    name: "Probe places",
    checkout: { machineId: MACHINE, path: checkout },
    remote: null,
  });
  db.setProjectTemplate(recorded, "code");
  await call(
    hubRequest("POST /api/projects/:id/tasks", {
      path: { id: recorded },
      body: { title: "Placed" },
    })
  );
  await call(
    hubRequest("DELETE /api/projects/:id", { path: { id: recorded } })
  );
  const row = (await listed(rig)).find((one) => one.id === recorded);
  const folder = (await rig.trash()).find(
    (one) => one.startsWith(`${recorded}-`) && !one.endsWith(".json")
  );
  check(
    rig,
    "h. a forgotten project with a record names its trash folder and its checkout, its machine by name, and no hints",
    row?.hints === null &&
      JSON.stringify(row.places) ===
        JSON.stringify([
          {
            kind: "hub",
            machineId: "hub",
            machineName: "hub",
            path: join(rig.trashDir, folder ?? ""),
            within: [],
          },
          {
            kind: "checkout",
            machineId: MACHINE,
            machineName: MACHINE,
            path: checkout,
            within: [],
          },
        ]),
    JSON.stringify(row)
  );
  // The delete reads the same places: its machine away, it is refused
  // naming that machine; nothing of it went.
  const away = await call(
    hubRequest("POST /api/projects/:id/delete", {
      path: { id: recorded },
      body: {
        fromDisk: true,
      },
    })
  );
  check(
    rig,
    "h. a delete with its files reads the same checkout: refused while its machine is away, naming it",
    away.status === 409 &&
      away.text === projectTrashWords.machinesAway("Probe places", [MACHINE]) &&
      (await listed(rig)).some((one) => one.id === recorded),
    away.text
  );

  const old = crypto.randomUUID();
  db.createProject({ id: old, name: "Probe hinted", remote: null });
  db.setProjectTemplate(old, "code");
  for (const title of ["First hinted task", "Newest hinted task"]) {
    await call(
      hubRequest("POST /api/projects/:id/tasks", {
        path: { id: old },
        body: { title },
      })
    );
  }
  const committed = await writeFolderFiles(
    old,
    [
      {
        path: "AGENTS.md",
        content:
          "# AGENTS.md\n\nOwned by you.\n\n## Probe hinted, the garden planner\n",
      },
      { path: "stages.md", content: "---\nbeds  todo\nsowing  active\n---\n" },
      { path: "decisions/zeta-pick/page.oui", content: "x" },
      { path: "decisions/alpha-pick/page.oui", content: "x" },
    ],
    {
      author: { name: "probe", email: "probe@cawco.invalid" },
      message: "probe",
    }
  );
  if (!("sha" in committed)) {
    throw new Error(committed.response.detail);
  }
  const wrote = Date.now();
  await forgetAsBefore(rig, old);
  const hinted = (await listed(rig)).find((one) => one.id === old);
  const hints = hinted?.hints as
    | {
        changedAt: number | null;
        heading: string | null;
        newestTask: { number: number; title: string } | null;
        pages: string[];
        stages: string[];
      }
    | null
    | undefined;
  const oldFolder = (await rig.trash()).find((one) =>
    one.startsWith(`${old}-`)
  );
  check(
    rig,
    "h. one forgotten before records names its folder and what its files say",
    hinted?.name === null &&
      JSON.stringify(hinted.places) ===
        JSON.stringify([
          {
            kind: "hub",
            machineId: "hub",
            machineName: "hub",
            path: join(rig.trashDir, oldFolder ?? ""),
            within: [],
          },
        ]) &&
      hints?.heading === "Probe hinted, the garden planner" &&
      JSON.stringify(hints.newestTask) ===
        JSON.stringify({ number: 2, title: "Newest hinted task" }) &&
      JSON.stringify(hints.pages) ===
        JSON.stringify(["alpha-pick", "zeta-pick"]) &&
      JSON.stringify(hints.stages) === JSON.stringify(["beds", "sowing"]) &&
      hints.changedAt !== null &&
      Math.abs(hints.changedAt - wrote) < 60_000,
    JSON.stringify(hinted)
  );
};

/** A project's board as the dashboard reads it: its stages and its tasks at once. */
const boardOf = async (rig: Rig, id: string) => {
  const [stages, tasks] = await Promise.all([
    rig.call(hubRequest("GET /api/projects/:id/stages", { path: { id } })),
    rig.call(hubRequest("GET /api/projects/:id/tasks", { path: { id } })),
  ]);
  const read = stages.json as
    { source?: string; stages?: { name: string }[] } | undefined;
  const columns = (read?.stages ?? []).map((one) => one.name);
  return {
    source: read?.source ?? null,
    columns,
    // Each task by its title, and the column it stands in: "" for none.
    tasks: (
      (tasks.json as { tasks?: { title: string; stage: string }[] } | undefined)
        ?.tasks ?? []
    ).map((one) => [one.title, columns.includes(one.stage) ? one.stage : ""]),
  };
};

/**
 * i: a folder forgotten before records holding two task files and no
 * stages.md, made on `template` (its stages.md taken out in a commit, as a
 * hub before stages.md held every template left one). Brought back, the
 * board's first read (its stages and tasks at once, as the dashboard loads)
 * shows both tasks in its columns: through the route, and before the index
 * has caught up with the folder (the restore alone, which the route then
 * catches up after).
 */
const twoTasksLeg = async (
  rig: Rig,
  template: "brand" | "code",
  caughtUp: boolean
): Promise<void> => {
  const { call, db } = rig;
  const { deleteFolderFile } =
    await import("../../../packages/hub/src/project-folder");
  const { projectTrash } =
    await import("../../../packages/hub/src/project-trash");
  const id = crypto.randomUUID();
  db.createProject({ id, name: `Probe two ${template}`, remote: null });
  const applied = await call(
    hubRequest("POST /api/projects/:id/stages/template", {
      path: { id },
      body: {
        template,
      },
    })
  );
  const titles = ["First of two", "Second of two"];
  const made: number[] = [];
  for (const title of titles) {
    made.push(
      (
        await call(
          hubRequest("POST /api/projects/:id/tasks", {
            path: { id },
            body: { title },
          })
        )
      ).status
    );
  }
  if (template !== "code") {
    const committed = await deleteFolderFile(id, "stages.md", {
      message: "stages: none",
    });
    if (!("sha" in committed)) {
      throw new Error(committed.response.detail);
    }
  }
  await forgetAsBefore(rig, id);
  const entry = (await listed(rig)).find((one) => one.id === id);
  const name = `Probe two ${template}, back`;
  const restored = caughtUp
    ? (
        await call(
          hubRequest("POST /api/projects/:id/restore", {
            path: { id },
            body: { name },
          })
        )
      ).status
    : await projectTrash(db)
        .restore(id, { name })
        .then(
          () => 200,
          (error: unknown) => String(error)
        );
  const board = await boardOf(rig, id);
  const stage = template === "code" ? "ready" : "source";
  check(
    rig,
    `i. a ${template} folder of two task files and no stages.md comes back with both in its ${stage} column${caughtUp ? "" : ", read before its index caught up"}`,
    applied.status === 200 &&
      made.every((status) => status === 200) &&
      entry?.brings.tasks === 2 &&
      restored === 200 &&
      board.source === "template" &&
      JSON.stringify(board.tasks.sort()) ===
        JSON.stringify(titles.map((title) => [title, stage])),
    JSON.stringify({ restored, ...board })
  );
};

export default {
  group: "The hub and machines",
  name: "project-restore",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "project-restore-")
    );
    const dbPath = join(scratch, "hub", "hub.db");
    // Every journal line the hub writes while the spec runs.
    const journal: string[] = [];
    const { log } = console;
    console.log = (...parts: unknown[]) => {
      journal.push(parts.map(String).join(" "));
      log(...parts);
    };
    try {
      const { hubInProcess } =
        await import("../../../packages/hub/scripts/hub-in-process");
      const { db, hub } = await hubInProcess(dbPath, join(scratch, "home"));
      const { PROJECT_TRASH_DIR } =
        await import("../../../packages/hub/src/project-folder");
      const { projectRootOf } =
        await import("../../../packages/hub/src/project-refusal");
      const raw = new Database(dbPath);
      raw.run("PRAGMA busy_timeout = 5000");
      const rig: Rig = {
        call: async (request) => {
          const response = await hub.handle(
            new Request(
              `http://127.0.0.1${request.path}`,
              hubInit(request, { headers: { [PRESENCE_HEADER]: PRESENCE } })
            )
          );
          const text = await response.text();
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            // Words, not JSON: a refusal.
          }
          return { status: response.status, text, json };
        },
        db,
        journal,
        kit,
        raw,
        root: projectRootOf,
        trash: async () =>
          (await readdir(PROJECT_TRASH_DIR).catch(() => [] as string[])).sort(),
        trashDir: PROJECT_TRASH_DIR,
      };
      try {
        const seeded = await seed(rig);
        const before = await forgetLeg(rig, seeded);
        const forgottenAt = await refusedLeg(rig, seeded);
        await restoreLeg(rig, seeded, before, forgottenAt);
        await oldFolderLeg(rig);
        await runningBrowserLeg(rig);
        await foldLeg(rig);
        await placesLeg(rig);
        for (const template of ["code", "brand"] as const) {
          for (const caughtUp of [true, false]) {
            await twoTasksLeg(rig, template, caughtUp);
          }
        }
      } finally {
        raw.close();
      }
    } finally {
      console.log = log;
      await rm(scratch, { recursive: true, force: true });
    }
  },
} satisfies Spec;
