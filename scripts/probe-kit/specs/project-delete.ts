/**
 * Deleting a project for good (hub project-delete.ts, `POST
 * /api/projects/:id/delete`), on an in-process hub listening on loopback,
 * its second machine a stand-in that registers over the hub's own socket
 * and answers its calls: a browser's removal, a workspace's archive (its
 * clone's folder removed), and a folder's removal through the agent's own
 * `removeFolder` held to a floor of the stand-in's home.
 *
 * - a. A live project with a checkout on the second machine, an active
 *   workspace (its clone there), an archived one with a carry, a browser
 *   and an ended session, deleted without `fromDisk`: the project, its rows
 *   and its folder on the hub gone; its browser removed on its machine, its
 *   row gone; the clone and the carry removed; its work items and
 *   workspace rows gone; its session's end recorded as a delete (owed to
 *   its machine, as every session's end is); its checkout kept on disk; it
 *   is not listed as forgotten; one journal line names it, who asked and
 *   `fromDisk=false`.
 * - b. A forgotten project (its trash entry and folder in the trash) with
 *   a checkout, a browser and a session, deleted with `fromDisk`: its trash
 *   entry gone, its checkout removed from the second machine's disk, its
 *   browser removed, its session's end recorded as a transcript delete;
 *   the journal line says `fromDisk=true`.
 * - c. Folders nested between live projects, each deleted with `fromDisk`
 *   (core place-nesting.ts): a project at `/x/a` with another live project
 *   at `/x` deletes, `/x/a` gone and the rest of `/x` kept, and the
 *   forgotten list and a live project's places name `/x`'s project as
 *   holding it; a project at `/x` with another at `/x/a` is refused in
 *   core's words, as is one at the same folder as another; nothing of
 *   theirs is removed.
 * - d. A project whose browser stands on a machine that is not connected:
 *   refused in core's words naming the machine; nothing removed.
 * - e. The machine's own floor (agent remove-folder.ts): its home, a folder
 *   holding it, its root, CawCo's own dirs, a relative path, and a carry
 *   outside the carries dir are refused.
 *
 *   bun scripts/probe-kit/run.ts project-delete
 */
import { Database } from "bun:sqlite";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type MachineFloor,
  removalRefusal,
  removeFolder,
} from "../../../packages/agent/src/remove-folder";
import { PRESENCE_HEADER } from "../../../packages/core/src/browser-gate";
import { refusalWords } from "../../../packages/core/src/hub-refusal";
import {
  fetchHub,
  type HubRequest,
  hubInit,
  hubRequest,
} from "../../../packages/core/src/hub-request";
import {
  type MachinePath,
  machinePath,
} from "../../../packages/core/src/machine-path";
import { projectTrashWords } from "../../../packages/core/src/words/project-trash";
import type { RemoveFolder } from "../../../packages/core/src/workspace/controls";
import type { hubInProcess as inProcess } from "../../../packages/hub/scripts/hub-in-process";
import type { Kit, Spec } from "../kit";

const B = "probe-delete-b";
const AWAY = "probe-delete-away";
const PRESENCE = "probe-presence-del1";

interface Answer {
  status: number;
  text: string;
}

type HubDb = Awaited<ReturnType<typeof inProcess>>["db"];

/** The in-process hub, its second machine's stand-in, and the disk that stand-in holds. */
interface Rig {
  call: (request: HubRequest) => Promise<Answer>;
  /** Every call the stand-in was asked, method first. */
  calls: string[];
  db: HubDb;
  /** The stand-in's disk: its home, and the project folders under `src/`. */
  disk: string;
  floor: MachineFloor;
  journal: string[];
  kit: Kit;
  raw: Database;
  root: (projectId: string) => string;
  trash: () => Promise<string[]>;
}

const there = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  );

const check = (rig: Rig, name: string, ok: boolean, detail: string): void => {
  rig.kit.check(name, ok, detail.slice(0, 700));
};

/** A folder on the stand-in's disk, with a file in it. */
const folder = async (path: string): Promise<string> => {
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "kept.txt"), "probe\n");
  return path;
};

/** The stand-in's answer to one call, as an agent answers it. */
const answerOf = async (
  rig: Pick<Rig, "floor">,
  method: string,
  args: unknown[]
): Promise<unknown> => {
  switch (method) {
    case "removeFolder":
      return await removeFolder(args[0] as RemoveFolder, rig.floor);
    case "workspaceArchive": {
      const { path } = args[0] as { path: string };
      await rm(path, { recursive: true, force: true });
      return { carry: null };
    }
    default:
      return null;
  }
};

/** The second machine: registers over the hub's socket and answers every call, recording each. */
const standIn = async (
  base: string,
  rig: Pick<Rig, "calls" | "floor">
): Promise<WebSocket> => {
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
    rig.calls.push(`${method} ${JSON.stringify(args[0] ?? null)}`);
    answerOf(rig, method, args).then(
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
        home: rig.floor.home,
        auth: { state: "signed-out" },
      },
    })
  );
  return socket;
};

/** A project on the stand-in, its checkout at `path`, set up so its tasks have stages. */
const project = (rig: Rig, name: string, path: MachinePath): string => {
  const id = crypto.randomUUID();
  rig.db.createProject({
    id,
    name,
    checkout: { machineId: B, path },
    remote: null,
  });
  rig.db.setProjectTemplate(id, "code");
  return id;
};

/** An ended session of the project on the stand-in. */
const session = (rig: Rig, projectId: string, cwd: MachinePath): string => {
  const id = crypto.randomUUID();
  rig.db.openInstance({
    id,
    machineId: B,
    cwd,
    sessionId: crypto.randomUUID(),
    harness: "claude",
    origin: "person",
    projectId,
    title: "Probe delete session",
    kind: "mainline",
    permissionMode: "bypassPermissions",
    model: "model-a",
  });
  // Stopped, its machine's word on it in: nothing of the project runs.
  rig.db.endInstance(id, "stop");
  rig.db.confirmInstanceEnd(id);
  return id;
};

/** The project's browser on `machineId`, asleep, as its machine's frame told the hub. */
const browser = (rig: Rig, projectId: string, machineId: string): void => {
  rig.db.browsers.put(machineId, {
    key: `project:${projectId}`,
    name: "Probe delete browser",
    host: "local",
    state: "asleep",
    lastUsedAt: Date.now(),
    projectId,
    takeover: null,
  });
};

/** A workspace of the project on the stand-in, with a work item in it. */
const workspace = async (
  rig: Rig,
  projectId: string,
  instanceId: string,
  repoRoot: MachinePath,
  state: "active" | "archived",
  carry: string | null
): Promise<{ id: string; path: string }> => {
  const id = crypto.randomUUID();
  const path = await folder(join(rig.disk, "workspaces", id));
  rig.db.createWorkspace({
    id,
    machineId: B,
    repoRoot,
    path: machinePath(rig.floor.home, path, B),
    branch: `ws/${id.slice(0, 8)}`,
    createdByInstanceId: instanceId,
    createdAt: new Date(),
    state,
    carry,
  });
  rig.db.createWorkItem({
    id: crypto.randomUUID(),
    workspaceId: id,
    parentInstanceId: instanceId,
    instanceId,
    brief: "Probe delete work",
    title: "Probe delete work",
    harness: "claude",
    createdAt: new Date(),
    projectId,
  });
  return { id, path };
};

/** The row's end intent, as the hub keeps it. */
const endIntent = (rig: Rig, instanceId: string): string | null =>
  (
    rig.raw
      .query("SELECT end_intent FROM instances WHERE id = ?")
      .get(instanceId) as { end_intent: string | null } | null
  )?.end_intent ?? null;

/** How many rows of `table` name `column` = `value`. */
const rowsOf = (
  rig: Rig,
  table: string,
  column: string,
  value: string
): number =>
  (
    rig.raw
      .query(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`)
      .get(value) as { n: number }
  ).n;

/** a: a live project, deleted without `fromDisk`. */
const liveLeg = async (rig: Rig): Promise<void> => {
  const { call } = rig;
  const checkout = await folder(join(rig.disk, "src", "delete-live"));
  const at = machinePath(rig.floor.home, checkout, B);
  const id = project(rig, "Probe delete live", at);
  await call(
    hubRequest("POST /api/projects/:id/tasks", {
      path: { id },
      body: { title: "Delete me" },
    })
  );
  const ended = session(rig, id, at);
  browser(rig, id, B);
  const carry = await folder(join(rig.floor.carries, `carry-${id}`));
  const active = await workspace(rig, id, ended, at, "active", null);
  const archived = await workspace(rig, id, ended, at, "archived", carry);
  const hubFolder = await there(rig.root(id));
  const deleted = await call(
    hubRequest("POST /api/projects/:id/delete", { path: { id } })
  );
  check(
    rig,
    "a. deleted: 200, the project and its folder on the hub gone",
    deleted.status === 200 &&
      hubFolder &&
      rig.db.project(id) === undefined &&
      !(await there(rig.root(id))),
    deleted.text
  );
  check(
    rig,
    "a. its browser removed on its machine, its row gone",
    rig.calls.some(
      (one) => one.startsWith("browser.remove") && one.includes(`project:${id}`)
    ) && rig.db.browsers.get(B, `project:${id}`) === undefined,
    rig.calls.join(" | ")
  );
  check(
    rig,
    "a. its workspace's clone and its carry removed, its work items and workspace rows gone",
    !((await there(active.path)) || (await there(carry))) &&
      rowsOf(rig, "work_items", "project_id", id) === 0 &&
      rowsOf(rig, "workspaces", "id", active.id) === 0 &&
      rowsOf(rig, "workspaces", "id", archived.id) === 0,
    JSON.stringify({
      clone: await there(active.path),
      carry: await there(carry),
    })
  );
  check(
    rig,
    "a. its session's end is a delete, owed to its machine",
    endIntent(rig, ended) === "delete" ||
      rowsOf(rig, "instances", "id", ended) === 0,
    String(endIntent(rig, ended))
  );
  check(
    rig,
    "a. without fromDisk its checkout stays on disk",
    await there(join(checkout, "kept.txt")),
    checkout
  );
  const listed = await call(hubRequest("GET /api/projects/forgotten"));
  const lines = rig.journal.filter((line) =>
    line.startsWith(projectTrashWords.deleteLine(id))
  );
  check(
    rig,
    "a. not listed as forgotten; one journal line names it, who asked and fromDisk=false",
    !listed.text.includes(id) &&
      lines.length === 1 &&
      lines[0]?.includes(`presence=${PRESENCE}`) === true &&
      lines[0].includes("fromDisk=false") &&
      lines[0].includes("outcome=deleted"),
    lines.join(" | ")
  );
};

/** b: a forgotten project, deleted from its trash entry with `fromDisk`. */
const forgottenLeg = async (rig: Rig): Promise<void> => {
  const { call } = rig;
  const checkout = await folder(join(rig.disk, "src", "delete-forgotten"));
  const at = machinePath(rig.floor.home, checkout, B);
  const id = project(rig, "Probe delete forgotten", at);
  await call(
    hubRequest("POST /api/projects/:id/tasks", {
      path: { id },
      body: { title: "Forget me" },
    })
  );
  const ended = session(rig, id, at);
  browser(rig, id, B);
  const forgot = await call(
    hubRequest("DELETE /api/projects/:id", { path: { id } })
  );
  const kept = (await rig.trash()).filter((one) => one.startsWith(`${id}-`));
  check(
    rig,
    "b. forgotten first: its trash entry, folder and record, stands",
    forgot.status === 200 && kept.length === 2,
    JSON.stringify(kept)
  );
  const deleted = await call(
    hubRequest("POST /api/projects/:id/delete", {
      path: { id },
      body: {
        fromDisk: true,
      },
    })
  );
  check(
    rig,
    "b. deleted from the trash with fromDisk: 200, its trash entry gone, its checkout removed from its machine's disk",
    deleted.status === 200 &&
      (await rig.trash()).every((one) => !one.startsWith(`${id}-`)) &&
      !(await there(checkout)),
    deleted.text
  );
  check(
    rig,
    "b. its browser removed, its session's end a transcript delete",
    rig.db.browsers.get(B, `project:${id}`) === undefined &&
      (endIntent(rig, ended) === "delete-transcript" ||
        rowsOf(rig, "instances", "id", ended) === 0),
    String(endIntent(rig, ended))
  );
  const line = rig.journal.find((one) =>
    one.startsWith(projectTrashWords.deleteLine(id))
  );
  check(
    rig,
    "b. its journal line says fromDisk=true",
    line?.includes("fromDisk=true") === true &&
      line.includes("outcome=deleted"),
    String(line)
  );
};

/** c: folders nested between live projects, each deleted with `fromDisk`. */
const nestedLeg = async (rig: Rig): Promise<void> => {
  const at = (path: string) => machinePath(rig.floor.home, path, B);
  // A project at /x/a, another live at /x: it goes, /x stays.
  const wide = await folder(join(rig.disk, "src", "delete-wide"));
  const narrow = await folder(join(wide, "a"));
  const wideId = project(rig, "Probe delete wide", at(wide));
  const narrowId = project(rig, "Probe delete narrow", at(narrow));
  const listed = await rig.call(hubRequest("GET /api/projects"));
  const narrowRow = (
    JSON.parse(listed.text) as {
      id: string;
      places: { kind: string; within: { id: string; name: string }[] }[];
    }[]
  ).find((one) => one.id === narrowId);
  check(
    rig,
    "c. a live project's place inside another's names the wider project",
    JSON.stringify(
      narrowRow?.places.find((one) => one.kind === "checkout")?.within
    ) === JSON.stringify([{ id: wideId, name: "Probe delete wide" }]),
    JSON.stringify(narrowRow?.places)
  );
  await rig.call(
    hubRequest("DELETE /api/projects/:id", { path: { id: narrowId } })
  );
  const forgotten = (
    JSON.parse(
      (await rig.call(hubRequest("GET /api/projects/forgotten"))).text
    ) as {
      id: string;
      places: { kind: string; within: { id: string; name: string }[] }[];
    }[]
  ).find((one) => one.id === narrowId);
  check(
    rig,
    "c. the forgotten list names the wider project beside its place",
    JSON.stringify(
      forgotten?.places.find((one) => one.kind === "checkout")?.within
    ) === JSON.stringify([{ id: wideId, name: "Probe delete wide" }]),
    JSON.stringify(forgotten?.places)
  );
  const inside = await rig.call(
    hubRequest("POST /api/projects/:id/delete", {
      path: { id: narrowId },
      body: {
        fromDisk: true,
      },
    })
  );
  check(
    rig,
    "c. a project at /x/a with another live at /x deletes with its files: /x/a gone, /x kept",
    inside.status === 200 &&
      !(await there(narrow)) &&
      (await there(join(wide, "kept.txt"))) &&
      rig.db.project(wideId) !== undefined,
    inside.text
  );
  // A project at /x, another live at /x/a: refused.
  const outer = await folder(join(rig.disk, "src", "delete-outer"));
  const inner = await folder(join(outer, "a"));
  const outerId = project(rig, "Probe delete outer", at(outer));
  project(rig, "Probe delete inner", at(inner));
  const holds = await rig.call(
    hubRequest("POST /api/projects/:id/delete", {
      path: { id: outerId },
      body: {
        fromDisk: true,
      },
    })
  );
  check(
    rig,
    "c. a project at /x with another live at /x/a: refused in core's words, nothing removed",
    holds.status === 409 &&
      holds.text ===
        projectTrashWords.placeHolds(
          "Probe delete outer",
          at(outer),
          B,
          "Probe delete inner",
          at(inner)
        ) &&
      rig.db.project(outerId) !== undefined &&
      (await there(join(inner, "kept.txt"))) &&
      (await there(join(outer, "kept.txt"))),
    holds.text
  );
  // Two projects at one folder: refused.
  const same = await folder(join(rig.disk, "src", "delete-same"));
  const sameId = project(rig, "Probe delete same", at(same));
  project(rig, "Probe delete twin", at(same));
  const shared = await rig.call(
    hubRequest("POST /api/projects/:id/delete", {
      path: { id: sameId },
      body: {
        fromDisk: true,
      },
    })
  );
  check(
    rig,
    "c. a project at the same folder as another: refused in core's words, nothing removed",
    shared.status === 409 &&
      shared.text ===
        projectTrashWords.placeShared(
          "Probe delete same",
          at(same),
          B,
          "Probe delete twin"
        ) &&
      rig.db.project(sameId) !== undefined &&
      (await there(join(same, "kept.txt"))),
    shared.text
  );
};

/** d: a browser on a machine that is not connected, refused naming it. */
const awayLeg = async (rig: Rig): Promise<void> => {
  rig.db.upsertAgent({
    machineId: AWAY,
    hostname: AWAY,
    os: "linux",
    auth: "unknown",
  });
  const checkout = await folder(join(rig.disk, "src", "delete-away"));
  const id = project(
    rig,
    "Probe delete away",
    machinePath(rig.floor.home, checkout, B)
  );
  browser(rig, id, AWAY);
  const refused = await rig.call(
    hubRequest("POST /api/projects/:id/delete", { path: { id } })
  );
  check(
    rig,
    "d. a machine holding part of it is away: refused in core's words naming it, nothing removed",
    refused.status === 409 &&
      refused.text ===
        projectTrashWords.machinesAway("Probe delete away", [AWAY]) &&
      rig.db.project(id) !== undefined &&
      rig.db.browsers.get(AWAY, `project:${id}`) !== undefined,
    refused.text
  );
};

/** e: the machine's own floor. */
const floorLeg = (rig: Rig): void => {
  const { floor } = rig;
  const refused = [
    { kind: "place", path: floor.home },
    { kind: "place", path: join(floor.home, "..") },
    { kind: "place", path: "/" },
    { kind: "place", path: join(floor.home, ".cawco", "workspaces") },
    { kind: "place", path: "relative/folder" },
    { kind: "carry", path: join(rig.disk, "src") },
  ] satisfies RemoveFolder[];
  const let_through = removalRefusal(
    { kind: "place", path: join(rig.disk, "src", "anything") },
    floor
  );
  check(
    rig,
    "e. the machine refuses its home, a folder holding it, its root, CawCo's dirs, a relative path and a carry outside its dir",
    refused.every((one) => removalRefusal(one, floor) !== undefined) &&
      let_through === undefined,
    JSON.stringify(refused.map((one) => removalRefusal(one, floor)))
  );
};

export default {
  group: "The hub and machines",
  name: "project-delete",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "project-delete-")
    );
    const dbPath = join(scratch, "hub", "hub.db");
    const journal: string[] = [];
    const { log } = console;
    console.log = (...parts: unknown[]) => {
      journal.push(parts.map(String).join(" "));
      log(...parts);
    };
    let socket: WebSocket | undefined;
    try {
      const { hubInProcess } =
        await import("../../../packages/hub/scripts/hub-in-process");
      const { db, hub } = await hubInProcess(dbPath, join(scratch, "home"));
      const { PROJECT_TRASH_DIR, projectRoot } =
        await import("../../../packages/hub/src/project-folder");
      const listening = (
        hub as unknown as {
          listen: (options: object) => { server?: { port?: number } };
        }
      ).listen({ hostname: "127.0.0.1", port: 0 });
      const base = `http://127.0.0.1:${listening.server?.port ?? 0}`;
      // Listening once it answers.
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
          return {
            status: response.status,
            text: response.ok
              ? await response.text()
              : refusalWords(await response.text(), response.status),
          };
        },
        calls: [],
        db,
        disk,
        floor,
        journal,
        kit,
        raw,
        root: projectRoot,
        trash: async () =>
          (await readdir(PROJECT_TRASH_DIR).catch(() => [] as string[])).sort(),
      };
      socket = await standIn(base, rig);
      // Registered once the hub lists it online.
      for (let tries = 0; tries < 50; tries += 1) {
        if (db.listAgents().some((one) => one.machineId === B)) {
          break;
        }
        await Bun.sleep(100);
      }
      try {
        await liveLeg(rig);
        await forgottenLeg(rig);
        await nestedLeg(rig);
        await awayLeg(rig);
        floorLeg(rig);
      } finally {
        raw.close();
      }
    } finally {
      socket?.close();
      console.log = log;
      await rm(scratch, { recursive: true, force: true });
    }
  },
} satisfies Spec;
