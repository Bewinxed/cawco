/**
 * A task's attempt starts on a machine that can do the work (hub
 * runs-on.ts, dispatch.ts `placeFor`). On a scratch fleet (real hub, agents
 * and sessiond; Claude Code against the mock model), boundaries included:
 * run it where a workspace boundary can start (not inside another one).
 *
 * Two scratch machines hold a checkout of one project: the fleet's own
 * (Linux, as it reports) and `probe-mac`, whose row the probe sets to report
 * `darwin-arm64` as a Mac's agent does (daemon.ts `os`). Every attempt
 * reports to a session of the project on the Linux machine, so with no
 * runs_on an attempt starts there, the parent's own.
 *
 * (a) A task with runs_on: apple starts on probe-mac.
 * (b) A task with no runs_on, the project naming none, starts on the
 *     parent's Linux machine, as before.
 * (c) runs_on naming no capability and no known machine is refused at
 *     task create, 400, naming the machines the hub knows.
 * (d) The project's runs_on set to apple (its dispatch settings): a task
 *     with none of its own starts on probe-mac; a task naming the Linux
 *     machine by id overrides it and starts there.
 * (e) A retry: a task with no runs_on whose attempt failed on Linux, given
 *     runs_on: apple, retries in a new workspace on probe-mac, never in
 *     the old Linux one.
 * (f) probe-mac offline: a runs_on: apple task's start is refused, 409, with
 *     the one sentence naming what it needs and that it starts nowhere
 *     else; a task left to the project's apple too; neither files a work
 *     item or a workspace.
 *
 *   bun scripts/probe-kit/run.ts runs-on
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const MAC = "probe-mac";
const FINISH = "mcp__cawco__finish_item";
/** Only an attempt's brief opens this way. */
const BRIEF = "Your work item is an attempt at";
/** A task whose attempt fails at once: its title carries this. */
const FAIL = "PROBE-FAIL";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

let failSearched = false;
let failFinished = false;

/** Every session says ok; the failing task's attempt calls finish_item blocked. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (!(request.all.includes(BRIEF) && request.all.includes(FAIL))) {
    return text("ok");
  }
  if (!failFinished && request.toolNames.includes(FINISH)) {
    failFinished = true;
    return useTool(FINISH, {
      headline: "Blocked on purpose.",
      summary: "Blocked on purpose.",
      blocked: { command: "probe", error: "probe blocks this attempt" },
    });
  }
  if (
    !(failFinished || failSearched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    failSearched = true;
    return useTool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("ok");
};

interface Attempt {
  refused?: string;
  task: string;
  workItemId: string | null;
  workspaceId: string | null;
}

const probeOf = (
  fleet: KitFleet,
  projectId: string,
  parent: string,
  /** The machines' workspace records, named when a cut refuses a folder's config. */
  records: () => Promise<string>
) => {
  /** The machine a workspace was cut on. */
  const machineOf = (workspaceId: string | null): string | undefined =>
    workspaceId
      ? fleet.query<{ machine_id: string }>(
          "SELECT machine_id FROM workspaces WHERE id = ?",
          workspaceId
        )[0]?.machine_id
      : undefined;
  const tasksPath = `/api/projects/${projectId}/tasks`;
  const call = async (
    path: string,
    method: string,
    body: object
  ): Promise<{ status: number; text: string }> => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    return { status: response.status, text: await response.text() };
  };
  /** An attempt as the route answers it, or its refusal's words. */
  const attempted = async (task: string, how: "attempts" | "retry") => {
    const answer = await call(`${tasksPath}/${task}/${how}`, "POST", {
      parentInstanceId: parent,
    });
    if (answer.status !== 200) {
      const held = answer.text.includes("cannot have a workspace")
        ? ` [workspace records: ${await records()}]`
        : "";
      return {
        task,
        workItemId: null,
        workspaceId: null,
        refused: `${answer.status} ${answer.text}${held}`,
      } satisfies Attempt;
    }
    const started = JSON.parse(answer.text) as Omit<Attempt, "task">;
    return { task, ...started } satisfies Attempt;
  };
  return {
    machineOf,
    call,
    attempted,
    /** Files a task and answers its id. */
    task: (title: string, fields: object = {}) =>
      fleet
        .api<{ id: string }>(tasksPath, { title, ...fields })
        .then((task) => task.id),
    /** Files a task and starts an attempt at it. */
    start: async (title: string, fields: object = {}): Promise<Attempt> => {
      const task = await fleet.api<{ id: string }>(tasksPath, {
        title,
        ...fields,
      });
      return await attempted(task.id, "attempts");
    },
    /** How many work items the project's attempts have filed, and workspaces the fleet holds (only they cut any). */
    filed: () =>
      fleet.query<{ items: number; spaces: number }>(
        "SELECT (SELECT COUNT(*) FROM work_items WHERE project_id = ?) AS items, (SELECT COUNT(*) FROM workspaces) AS spaces",
        projectId
      )[0],
  };
};

const where = (attempt: Attempt, machine: string | undefined) =>
  attempt.refused ?? `${attempt.task} on ${machine ?? "nothing"}`;

/**
 * Every workspace record a machine keeps (`~/.cawco/workspaces/<id>/`
 * create.json and boundary.json, agent workspace-records.ts), as
 * `<id>: <clone path>`: what a refusal of a place's config was read through.
 */
const recordsOn = async (home: string): Promise<string> => {
  const dir = join(home, ".cawco", "workspaces");
  const ids = await readdir(dir).catch(() => [] as string[]);
  const lines = await Promise.all(
    ids.map(async (id) => {
      const paths = await Promise.all(
        ["create.json", "boundary.json"].map((name) =>
          readFile(join(dir, id, name), "utf8").then(
            (record) =>
              `${name} ${(JSON.parse(record) as { path?: unknown }).path}`,
            () => `${name} none`
          )
        )
      );
      return `${id}: ${paths.join(", ")}`;
    })
  );
  return lines.join("; ") || "none";
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const mac = await fleet.launchMachine(MAC);
  // What a Mac's agent reports at register (daemon.ts `${platform()}-${arch()}`).
  fleet.write(
    "UPDATE agents SET os = 'darwin-arm64' WHERE machine_id = ?",
    MAC
  );

  const home = fleet.env.HOME as string;
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
    name: "Runs on",
    machineId: MACHINE,
    cwd: repo,
  });
  // The same folder is a checkout on the Mac too: every machine runs on this host.
  await fleet.api(`/api/projects/${project.id}/places`, {
    machineId: MAC,
    path: repo,
  });
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  const probe = probeOf(
    fleet,
    project.id,
    parent,
    async () =>
      `${MACHINE} ${await recordsOn(home)} | ${MAC} ${await recordsOn(mac.home)}`
  );

  // (a)
  const apple = await probe.start("Build the iOS app", { runsOn: "apple" });
  const appleOn = probe.machineOf(apple.workspaceId);
  kit.check(
    "a: a runs_on: apple task starts on the machine reporting itself as a Mac",
    appleOn === MAC,
    where(apple, appleOn)
  );

  // (b)
  const plain = await probe.start("Tidy the README");
  const plainOn = probe.machineOf(plain.workspaceId);
  kit.check(
    "b: a task with no runs_on, its project naming none, starts as before, on the parent's machine",
    plainOn === MACHINE,
    where(plain, plainOn)
  );

  // (c)
  const unknown = await probe.call(
    `/api/projects/${project.id}/tasks`,
    "POST",
    { title: "Nowhere", runsOn: "nowhere" }
  );
  kit.check(
    "c: runs_on naming no capability and no known machine is refused at create",
    unknown.status === 400 &&
      unknown.text.includes(
        "runs_on “nowhere” is neither apple nor linux nor a machine this hub knows"
      ),
    `${unknown.status} ${unknown.text}`
  );

  // (d)
  const set = await probe.call(
    `/api/projects/${project.id}/dispatch`,
    "PATCH",
    { runsOn: "apple" }
  );
  const view = JSON.parse(set.text) as { runsOn?: string | null };
  kit.check(
    "d: the project's dispatch settings take runs_on: apple and show it",
    set.status === 200 && view.runsOn === "apple",
    `${set.status} ${set.text.slice(0, 200)}`
  );
  const inherits = await probe.start("Run the simulator suite");
  const inheritsOn = probe.machineOf(inherits.workspaceId);
  kit.check(
    "d: a task with no runs_on of its own starts on the Mac its project names",
    inheritsOn === MAC,
    where(inherits, inheritsOn)
  );
  const overrides = await probe.start("Restart the Linux service", {
    runsOn: MACHINE,
  });
  const overridesOn = probe.machineOf(overrides.workspaceId);
  kit.check(
    "d: a task naming another machine overrides its project's apple",
    overridesOn === MACHINE,
    where(overrides, overridesOn)
  );
  await probe.call(`/api/projects/${project.id}/dispatch`, "PATCH", {
    runsOn: null,
  });

  // (e)
  const failing = await probe.start(`${FAIL} build the widget`);
  const failedOn = probe.machineOf(failing.workspaceId);
  await until(
    "the failing attempt's end",
    () =>
      failing.workItemId
        ? fleet.query<{ state: string }>(
            "SELECT state FROM work_items WHERE id = ?",
            failing.workItemId
          )[0]?.state
        : "never started",
    (state) => state === "failed" || state === "never started",
    300_000
  );
  await probe.call(
    `/api/projects/${project.id}/tasks/${failing.task}`,
    "PATCH",
    { runsOn: "apple" }
  );
  const retried = await probe.attempted(failing.task, "retry");
  const retriedOn = probe.machineOf(retried.workspaceId);
  kit.check(
    "e: a retry of an attempt that failed on Linux, its task now runs_on: apple, runs in a new workspace on the Mac",
    failedOn === MACHINE &&
      retriedOn === MAC &&
      retried.workspaceId !== failing.workspaceId,
    `failed ${where(failing, failedOn)}; retried ${where(retried, retriedOn)}`
  );

  // (f)
  mac.agent.kill("SIGTERM");
  await until(
    "probe-mac offline",
    () =>
      fleet.query<{ status: string }>(
        "SELECT status FROM agents WHERE machine_id = ?",
        MAC
      )[0]?.status,
    (status) => status === "offline",
    60_000
  );
  const before = probe.filed();
  const offline = await probe.start("Ship to TestFlight", { runsOn: "apple" });
  await probe.call(`/api/projects/${project.id}/dispatch`, "PATCH", {
    runsOn: "apple",
  });
  const offlineDefault = await probe.start("Archive the Mac build");
  const after = probe.filed();
  const sentence = (id: string) =>
    new RegExp(
      `^409 ${id} runs on a Mac \\(apple\\), and none is online \\([^)]+ is offline\\), so it starts nowhere else: bring one online\\.$`
    );
  kit.check(
    "f: with the Mac offline, a runs_on: apple task's start is refused with the one sentence",
    sentence(offline.task).test(offline.refused ?? ""),
    offline.refused ?? where(offline, probe.machineOf(offline.workspaceId))
  );
  kit.check(
    "f: a task left to its project's apple is refused the same way",
    sentence(offlineDefault.task).test(offlineDefault.refused ?? ""),
    offlineDefault.refused ??
      where(offlineDefault, probe.machineOf(offlineDefault.workspaceId))
  );
  kit.check(
    "f: neither refusal files a work item or a workspace",
    before?.items === after?.items && before?.spaces === after?.spaces,
    `before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`
  );
};

export default { name: "runs-on", run } satisfies Spec;
