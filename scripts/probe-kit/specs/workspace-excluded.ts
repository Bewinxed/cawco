/**
 * A workspace is never retired over work git does not see (hub
 * work-items.ts `settle` and `archive`, `pointedAt`; agent workspace.ts
 * `excludedIn`). On 2026-10-17 two workspaces were retired after their
 * items finished: one held a design page's source kept out of its landing
 * by `.git/info/exclude`, the other two live test projects' folders in its
 * TMPDIR, and both went with them. On a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model), boundaries included: run it
 * where a workspace boundary can start (not inside another one), as
 * workspace-retire does.
 *
 * The project's repository commits a `.gitignore` naming `node_modules/` and
 * `dist/`. Each delegate commits a file and calls finish_item; the hub lands
 * its commit.
 *
 * (a) X also writes `design-X.html` and `harness-X/page.ts` and lists both
 *     only in its clone's `.git/info/exclude`. Its work lands, and its
 *     workspace is held, not retired: both stand, GET held says "1 excluded
 *     file, 1 excluded folder" and names them, the parent's delegate_list
 *     lists it under held with them, and POST archive answers 409 naming
 *     them, nothing deleted.
 * (b) Y also writes `node_modules/pkg/index.js` and `dist/out.js`, which the
 *     committed `.gitignore` covers. Its work lands and its workspace
 *     retires as ever: row archived, clone gone.
 * (c) X's excluded file and folder removed, POST archive on it answers 200:
 *     row archived, clone gone.
 * (d) Z's TMPDIR holds a folder the hub knows as a project's checkout. Its
 *     work lands and its session sleeps, and its workspace stays active, a
 *     sweep naming that project; POST archive answers 409 naming it, even
 *     with discard, the folder standing. Once the project is deleted, the
 *     next sweep retires it.
 *
 *   bun scripts/probe-kit/run.ts workspace-excluded
 */
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** One request given `ms` to answer: its status and text. */
const requestWithin = async (
  ms: number,
  url: string,
  init: RequestInit
): Promise<{ status: number; text: string }> => {
  const read = await readWithin(ms, async (signal) => {
    const response = await fetch(url, { ...init, signal });
    return { status: response.status, text: await response.text() };
  });
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(
        `${init.method ?? "GET"} ${url} did not answer within ${read.after} ms (${read.reason})`
      );
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

const TAG = /PROBE-EXCL-([XYZ])/;
const FINISH = "mcp__cawco__finish_item";
/** How long a workspace takes to settle once its item ends: its session's sleep, then its machine's archive. */
const SETTLE_MS = 120_000;
const COMMIT =
  "git -c user.name=Delegate -c user.email=d@probe.test commit -qm";
/** What X keeps out of git through its clone's own excludes alone. */
const X_FILE = "design-X.html";
const X_FOLDER = "harness-X/";

/** What each delegate runs in its workspace before its commit. */
const extra: Record<string, string> = {
  X: `printf 'page\\n' > ${X_FILE} && mkdir -p harness-X && printf 'src\\n' > harness-X/page.ts && mkdir -p .git/info && printf '/${X_FILE}\\n${X_FOLDER}\\n' >> .git/info/exclude`,
  Y: "mkdir -p node_modules/pkg dist && printf 'x\\n' > node_modules/pkg/index.js && printf 'x\\n' > dist/out.js",
  Z: "true",
};

const commitCommand = (tag: string): string =>
  [
    extra[tag],
    `echo 'made by ${tag}' > excl-${tag}.txt`,
    `git add excl-${tag}.txt`,
    `${COMMIT} 'Delegate commit ${tag}'`,
    `echo DONE-COMMIT-${tag}`,
  ].join(" && ");

const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

const steps: Record<string, { finish?: boolean; searched?: boolean }> = {};

const respond = (request: Seen): Reply => {
  const tag = request.tools ? TAG.exec(request.all)?.[1] : undefined;
  if (!tag) {
    return text("ok");
  }
  steps[tag] ??= {};
  const step = steps[tag];
  if (!request.all.includes(`DONE-COMMIT-${tag}`)) {
    return tool("Bash", { command: commitCommand(tag), description: "Commit" });
  }
  if (!step.finish && request.toolNames.includes(FINISH)) {
    step.finish = true;
    return tool(FINISH, {
      headline: `Committed excl-${tag}.txt.`,
      summary: `Committed excl-${tag}.txt.`,
    });
  }
  if (
    !(step.finish || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

interface Workspace {
  id: string;
  path: string;
  state: string;
  tmp: string | null;
}

interface Sweep {
  failed: { workspaceId: string; reason: string }[];
  held: { workspaceId: string }[];
  kept: { workspaceId: string; hold: string }[];
  retired: { workspaceId: string }[];
}

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** A delegate this spec started, and how its item ended. */
interface Delegated {
  instanceId: string;
  item: { state: string; error: string | null };
  workItemId: string;
  workspaceId: string;
}

/** What the phases share: the fleet, the parent and the reads every phase makes. */
interface Scene {
  /** An archive asked over HTTP: its status and its answer's text. */
  archiveOver: (
    id: string,
    body?: object
  ) => Promise<{ status: number; text: string }>;
  /** The parent's session credential, for its tools. */
  credential: string;
  delegate: (
    tag: "X" | "Y" | "Z",
    onStart?: (workspace: Workspace) => Promise<void>
  ) => Promise<Delegated>;
  fleet: Fleet;
  home: string;
  /** The parent's session id. */
  parent: string;
  /** The workspace's row once it is no longer active, or as it stands when that does not come. */
  settled: (id: string) => Promise<Workspace>;
  workspaceOf: (id: string) => Workspace;
}

const spec: Spec = {
  name: "workspace-excluded",
  run: async (kit: Kit) => {
    for (const tag of Object.keys(steps)) {
      delete steps[tag];
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
    await mkdir(src, { recursive: true });
    await Bun.write(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`sh -c ${"git init -q -b main && echo excluded > README.md && printf 'node_modules/\\ndist/\\n' > .gitignore && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Excluded",
      machineId: MACHINE,
      cwd: src,
    });
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });
    const credential =
      (await Bun.file(`/proc/${await fleet.sessionPid(parent)}/environ`).text())
        .split("\0")
        .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
        ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";

    const workspaceOf = (id: string) =>
      fleet.query<Workspace>(
        "SELECT id, path, state, tmp FROM workspaces WHERE id = ?",
        id
      )[0] as Workspace;
    const settled = (id: string) =>
      until(
        `workspace ${id} settled`,
        () => workspaceOf(id),
        (row) => row.state !== "active",
        SETTLE_MS
      ).catch(() => workspaceOf(id));
    const archiveOver = (id: string, body?: object) =>
      requestWithin(120_000, `${fleet.base}/api/workspaces/${id}/archive`, {
        method: "POST",
        ...(body && {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      });
    const delegate = async (
      tag: "X" | "Y" | "Z",
      onStart?: (workspace: Workspace) => Promise<void>
    ) => {
      const started = await fleet.api<{
        instanceId: string;
        workItemId: string;
        workspaceId: string;
      }>("/api/work-items", {
        parentInstanceId: parent,
        title: `Commit and end ${tag}`,
        prompt: `PROBE-EXCL-${tag}: commit a file.`,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: src,
      });
      await onStart?.(workspaceOf(started.workspaceId));
      const item = await until(
        `work item ${tag} ended`,
        () =>
          fleet.query<{ state: string; error: string | null }>(
            "SELECT state, error FROM work_items WHERE id = ?",
            started.workItemId
          )[0],
        (row) =>
          row !== undefined &&
          ["done", "failed", "cancelled"].includes(row.state),
        300_000
      );
      return { ...started, item };
    };

    const scene: Scene = {
      archiveOver,
      credential,
      delegate,
      fleet,
      home,
      parent,
      settled,
      workspaceOf,
    };
    await excludedPhase(kit, scene);
    await scratchPhase(kit, scene);
  },
};

/** (a) Excluded files hold a landed workspace, (b) what a committed `.gitignore` covers goes, (c) the archive goes once they are removed. */
const excludedPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const { fleet, parent, credential, workspaceOf, settled, archiveOver } =
    scene;
  const x = await scene.delegate("X");
  const wx = workspaceOf(x.workspaceId);
  const heldX = await settled(wx.id);
  const xFile = join(wx.path, X_FILE);
  const xFolder = join(wx.path, "harness-X", "page.ts");
  check(
    "(a) X's work lands, and its workspace is held, not retired: its excluded file and folder stand",
    x.item.state === "done" &&
      heldX.state === "held" &&
      existsSync(xFile) &&
      existsSync(xFolder),
    `${x.item.state} ${x.item.error ?? ""}; ${heldX.state}; ${X_FILE} ${existsSync(xFile) ? "stands" : "gone"}; harness-X/page.ts ${existsSync(xFolder) ? "stands" : "gone"}`
  );
  const words = await fleet
    .api<{ holds: string; excluded?: string[] }>(
      `/api/workspaces/${wx.id}/held`
    )
    .catch((error: unknown) => ({ holds: String(error), excluded: [] }));
  check(
    '(a) GET held on X says "1 excluded file, 1 excluded folder" and names both',
    words.holds === "1 excluded file, 1 excluded folder" &&
      JSON.stringify([...(words.excluded ?? [])].sort()) ===
        JSON.stringify([X_FILE, X_FOLDER]),
    JSON.stringify(words)
  );
  const listed = await requestWithin(
    300_000,
    `${fleet.base}/api/delegation/call/${parent}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${credential}`,
      },
      body: JSON.stringify({ name: "delegate_list", arguments: {} }),
    }
  );
  check(
    "(a) the parent's delegate_list lists X under held, naming its excluded paths",
    listed.status === 200 &&
      listed.text.includes(wx.id) &&
      listed.text.includes("1 excluded file, 1 excluded folder") &&
      listed.text.includes(X_FILE) &&
      listed.text.includes(X_FOLDER),
    `${listed.status} ${listed.text.slice(0, 1500)}`
  );
  const refused = await archiveOver(wx.id);
  check(
    "(a) POST archive on X answers 409 naming its excluded file and folder; nothing deleted",
    refused.status === 409 &&
      refused.text.includes("holds 1 excluded file, 1 excluded folder (") &&
      refused.text.includes(X_FILE) &&
      refused.text.includes(X_FOLDER) &&
      refused.text.includes("nothing was deleted") &&
      existsSync(xFile) &&
      existsSync(xFolder) &&
      workspaceOf(wx.id).state === "held",
    `${refused.status} ${refused.text}; ${workspaceOf(wx.id).state}`
  );

  const y = await scene.delegate("Y");
  const wy = workspaceOf(y.workspaceId);
  const retiredY = await settled(wy.id);
  check(
    "(b) Y's work lands with only node_modules/ and dist/ output beside it, and its workspace retires: row archived, clone gone",
    y.item.state === "done" &&
      retiredY.state === "archived" &&
      !existsSync(wy.path),
    `${y.item.state} ${y.item.error ?? ""}; ${retiredY.state}; clone ${existsSync(wy.path) ? "stands" : "gone"}`
  );

  // (c) once the excluded work is gone, the archive goes.
  await rm(xFile, { force: true });
  await rm(join(wx.path, "harness-X"), { recursive: true, force: true });
  const archived = await archiveOver(wx.id);
  check(
    "(c) X's excluded file and folder removed, POST archive answers 200: row archived, clone gone",
    archived.status === 200 &&
      workspaceOf(wx.id).state === "archived" &&
      !existsSync(wx.path),
    `${archived.status} ${archived.text.slice(0, 600)}; ${workspaceOf(wx.id).state}; clone ${existsSync(wx.path) ? "stands" : "gone"}`
  );
};

/** (d) A project's folder in a workspace's TMPDIR holds it until the project goes. */
const scratchPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const { fleet, home, workspaceOf, archiveOver } = scene;
  let scratch = "";
  let scratchProject = "";
  const z = await scene.delegate("Z", async (workspace) => {
    scratch = join(workspace.tmp ?? "", "proj-Z");
    await mkdir(scratch, { recursive: true });
    await Bun.$`sh -c ${"git init -q -b main && echo z > README.md && git add -A && git commit -qm z"}`
      .cwd(scratch)
      .env({ ...process.env, HOME: home })
      .quiet();
    scratchProject = (
      await fleet.api<{ id: string }>("/api/projects", {
        name: "Scratch Z",
        machineId: MACHINE,
        cwd: scratch,
      })
    ).id;
  });
  const wz = workspaceOf(z.workspaceId);
  await until(
    "Z's session asleep",
    () => fleet.instance(z.instanceId)?.status,
    (now) => now === "sleeping",
    SETTLE_MS
  ).catch(() => undefined);
  const swept = await fleet.api<Sweep>("/api/workspaces/retire", {});
  const hold = swept.kept.find((one) => one.workspaceId === wz.id)?.hold ?? "";
  check(
    "(d) Z's work lands and its session sleeps, and its workspace stays active, a sweep naming the project whose folder is in its TMPDIR",
    z.item.state === "done" &&
      workspaceOf(wz.id).state === "active" &&
      existsSync(scratch) &&
      hold.includes("Scratch Z") &&
      hold.includes(scratch),
    `${z.item.state} ${z.item.error ?? ""}; ${workspaceOf(wz.id).state}; ${scratch} ${existsSync(scratch) ? "stands" : "gone"}; ${JSON.stringify(swept)}`
  );
  const [kept, discarded] = [
    await archiveOver(wz.id),
    await archiveOver(wz.id, { discard: true }),
  ];
  check(
    "(d) POST archive on Z answers 409 naming that project, with discard too; its folder stands",
    [kept, discarded].every(
      (one) =>
        one.status === 409 &&
        one.text.includes("Scratch Z") &&
        one.text.includes("nothing was deleted")
    ) &&
      existsSync(scratch) &&
      workspaceOf(wz.id).state === "active",
    `${kept.status} ${kept.text}; ${discarded.status} ${discarded.text}; ${workspaceOf(wz.id).state}`
  );
  const forgot = await requestWithin(
    60_000,
    `${fleet.base}/api/projects/${scratchProject}`,
    { method: "DELETE" }
  );
  const again = await fleet.api<Sweep>("/api/workspaces/retire", {});
  check(
    "(d) the project deleted, the next sweep retires Z: row archived, clone and TMPDIR gone",
    forgot.status === 200 &&
      again.retired.some((one) => one.workspaceId === wz.id) &&
      workspaceOf(wz.id).state === "archived" &&
      !existsSync(wz.path) &&
      !existsSync(wz.tmp ?? scratch),
    `DELETE ${forgot.status} ${forgot.text.slice(0, 300)}; ${JSON.stringify(again)}; ${workspaceOf(wz.id).state}`
  );
};

export default spec;
