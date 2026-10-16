/**
 * The Apple build gate (hub apple-gate.ts, work-items.ts `appleGate`): a
 * project with it on lands an item whose diff touches the iOS app's
 * sources only once the iOS build compiles on an online Mac, at the item's
 * last commit. On a scratch fleet (real hub, agents and sessiond; Claude
 * Code against the mock model), boundaries included: run it where a
 * workspace boundary can start (not inside another one).
 *
 * Two scratch machines hold a checkout of one project: the fleet's own
 * (Linux) and `probe-mac`, whose row the probe sets to report `darwin-arm64`
 * as a Mac's agent does. The project's repository carries a stub
 * `apps/apple/scripts/build-both.sh` that prints what it was asked and
 * leaves a mark in the folder it ran in; the real one needs Xcode.
 *
 * (a) A new project's gate is off; PATCH /api/projects/:id turns it on and
 *     answers it on.
 * (b) A delegate that commits apps/apple/Probe.swift, its brief's one check
 *     `true`: the item is done and landed, its report lists the gate's
 *     check `iOS build compiles` passing beside its own, and the stub ran on
 *     probe-mac, in the item's check workspace there, with
 *     `ios --compile-only`.
 * (c) A delegate that commits only apps/dashboard/probe.ts: done and landed,
 *     its report lists its own check alone, and no check workspace was cut
 *     for it on any machine.
 * (d) probe-mac offline, a delegate that commits apps/apple/Other.swift:
 *     finish_item answers the one sentence (it changes that file, so it
 *     lands only once the iOS build compiles on a Mac, and no apple-capable
 *     machine is online, naming probe-mac as offline: its hostname is the
 *     host's, which every scratch machine shares, so its id follows; and to
 *     wait for one with
 *     wait_item); the delegate does, and the item is not done: still
 *     running and waiting, nothing landed or reported.
 *
 *   bun scripts/probe-kit/run.ts apple-gate
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const MAC = "probe-mac";
const FINISH = "mcp__cawco__finish_item";
const TAG = /PROBE-GATE-([ADC])/;
/** The file each delegate commits. */
const FILES = {
  A: "apps/apple/Probe.swift",
  D: "apps/dashboard/probe.ts",
  C: "apps/apple/Other.swift",
} as const;
type Tag = keyof typeof FILES;
const GATE = "iOS build compiles";
/** What the stub build leaves in the folder it ran in. */
const MARK = ".stub-mac-build";
const STUB = `#!/usr/bin/env bash
echo "STUB-MAC-BUILD $*"
echo "$*" > ${MARK}
`;
/** The refusal as finish_item answers it with no Mac online. */
const REFUSAL =
  /This item changes apps\/apple\/Other\.swift, so it lands only once the iOS build compiles on a Mac, and no apple-capable machine is online \((?:\S+ \(probe-mac\)|probe-mac) is offline\): wait for one with wait_item and call finish_item again, or call it with blocked\./;
const WAIT = "mcp__cawco__wait_item";

const steps: Partial<
  Record<
    Tag,
    {
      finish?: boolean;
      searched?: boolean;
      waitSearched?: boolean;
      waited?: boolean;
    }
  >
> = {};
/** What finish_item answered C, once the mock model has read it. */
let refusedC: string | undefined;

const commitCommand = (tag: Tag) =>
  [
    `mkdir -p "$(dirname ${FILES[tag]})"`,
    `echo '// made by ${tag}' > ${FILES[tag]}`,
    `git add ${FILES[tag]}`,
    `git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
    `echo DONE-COMMIT-${tag}`,
  ].join(" && ");

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  const tag = request.tools
    ? (TAG.exec(request.all)?.[1] as Tag | undefined)
    : undefined;
  if (!tag) {
    return text("ok");
  }
  steps[tag] ??= {};
  const step = steps[tag];
  const tool = (name: string, input: object): Reply => ({
    everyMs: 5,
    words: [],
    tool: { name, input },
  });
  if (!request.all.includes(`DONE-COMMIT-${tag}`)) {
    return tool("Bash", { command: commitCommand(tag), description: "Commit" });
  }
  if (!step.finish && request.toolNames.includes(FINISH)) {
    step.finish = true;
    return tool(FINISH, {
      headline: `Committed ${FILES[tag]}.`,
      summary: `Committed ${FILES[tag]}.`,
    });
  }
  if (
    !(step.finish || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  if (tag === "C" && step.finish) {
    refusedC ??= REFUSAL.exec(request.all)?.[0];
  }
  // As the sentence says: C waits for a Mac with wait_item.
  if (tag === "C" && refusedC && !step.waited) {
    if (request.toolNames.includes(WAIT)) {
      step.waited = true;
      return tool(WAIT, {
        minutes: 30,
        reason: "waiting for a Mac to come online",
      });
    }
    if (!step.waitSearched && request.toolNames.includes("ToolSearch")) {
      step.waitSearched = true;
      return tool("ToolSearch", { query: `select:${WAIT}`, max_results: 1 });
    }
  }
  return text("done");
};

interface ItemRow {
  error: string | null;
  result: string | null;
  state: string;
  workspace_id: string;
}

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
  const scripts = join(repo, "apps", "apple", "scripts");
  await mkdir(scripts, { recursive: true });
  await writeFile(join(scripts, "build-both.sh"), STUB);
  await chmod(join(scripts, "build-both.sh"), 0o755);
  await writeFile(join(repo, ".gitignore"), `${MARK}\n`);
  await Bun.$`git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string; appleGate: boolean }>(
    "/api/projects",
    { name: "Apple gate", machineId: MACHINE, cwd: repo }
  );
  // The same folder is a checkout on the Mac too: every machine runs on this host.
  await fleet.api(`/api/projects/${project.id}/places`, {
    machineId: MAC,
    path: repo,
  });

  // (a)
  const turned = await fetch(`${fleet.base}/api/projects/${project.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appleGate: true }),
  });
  const on = (await turned.json()) as { appleGate?: boolean };
  check(
    "a: a new project's gate is off; PATCH turns it on and answers it on",
    project.appleGate === false &&
      turned.status === 200 &&
      on.appleGate === true,
    `created ${project.appleGate}, PATCH ${turned.status} ${JSON.stringify(on.appleGate)}`
  );

  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  const itemOf = (id: string) =>
    fleet.query<ItemRow>(
      "SELECT state, error, result, workspace_id FROM work_items WHERE id = ?",
      id
    )[0];
  const checkSpaces = (workspaceId: string) =>
    fleet.query<{ machine_id: string; path: string }>(
      "SELECT machine_id, path FROM workspaces WHERE checks_for = ?",
      workspaceId
    );
  const delegate = (tag: Tag) =>
    fleet.api<{ workItemId: string; workspaceId: string }>("/api/work-items", {
      parentInstanceId: parent,
      title: `Commit ${tag}`,
      prompt: `PROBE-GATE-${tag}: commit a file.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: repo,
      checks: [{ name: "Probe check", command: "true" }],
    });
  const ended = (tag: Tag, id: string) =>
    until(
      `work item ${tag} ended`,
      () => itemOf(id),
      (row) =>
        row !== undefined &&
        ["done", "failed", "cancelled"].includes(row.state),
      600_000
    );

  // (b)
  const a = await delegate("A");
  // The parent's preview of its server holds A's workspace once its work
  // lands (hub work-items.ts `settle`), and with it its check workspace,
  // which the mark below is read in.
  const shownAt = Date.now();
  fleet.write(
    "INSERT INTO artifacts (id, instance_id, project_id, kind, name, machine_id, source_port, source_workspace, revision, seq, delivered_seq, created_at, updated_at, shown_at) VALUES (?, ?, ?, 'preview', 'gate-preview', ?, 5199, ?, 1, 0, 0, ?, ?, ?)",
    crypto.randomUUID(),
    parent,
    project.id,
    MACHINE,
    a.workspaceId,
    shownAt,
    shownAt,
    shownAt
  );
  const aRow = await ended("A", a.workItemId);
  const aSpaces = checkSpaces(a.workspaceId);
  const aMark = aSpaces[0] ? join(aSpaces[0].path, MARK) : "";
  const aRan = aMark && existsSync(aMark) ? await Bun.file(aMark).text() : "";
  check(
    "b: an item touching apps/apple is done and landed, its report listing the gate's check passing beside its own",
    aRow.state === "done" &&
      (aRow.result ?? "").includes(`- ${GATE}: pass (`) &&
      (aRow.result ?? "").includes("- Probe check: pass (") &&
      (aRow.result ?? "").includes("Landed on main at"),
    `${aRow.state} ${aRow.error ?? ""}\n${(aRow.result ?? "").slice(0, 1500)}`
  );
  check(
    "b: the stub ran on probe-mac, in the item's check workspace there, with ios --compile-only",
    aSpaces.length === 1 &&
      aSpaces[0]?.machine_id === MAC &&
      aRan.trim() === "ios --compile-only",
    `${JSON.stringify(aSpaces)}; mark: ${JSON.stringify(aRan)}`
  );

  // (c)
  const d = await delegate("D");
  const dRow = await ended("D", d.workItemId);
  check(
    "c: an item touching only apps/dashboard is done and landed with its own check alone",
    dRow.state === "done" &&
      !(dRow.result ?? "").includes(GATE) &&
      (dRow.result ?? "").includes("- Probe check: pass (") &&
      (dRow.result ?? "").includes("Landed on main at"),
    `${dRow.state} ${dRow.error ?? ""}\n${(dRow.result ?? "").slice(0, 1500)}`
  );
  check(
    "c: no check workspace was cut for it on any machine",
    checkSpaces(d.workspaceId).length === 0,
    JSON.stringify(checkSpaces(d.workspaceId))
  );

  // (d)
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
  const c = await delegate("C");
  await until(
    "C read finish_item's answer",
    () => refusedC,
    (said) => said !== undefined,
    300_000
  );
  check(
    "d: with the Mac offline, finish_item answers the one sentence, naming probe-mac",
    refusedC !== undefined,
    refusedC ?? "no refusal read"
  );
  await afterWait(kit, fleet, c.workItemId);
};

/**
 * (d) The item, checked once its delegate declared its wait and 20 s more: past the
 * turns that would end it quietly (three "still open" nudges answered at
 * once took seconds when nothing waited).
 */
const afterWait = async (
  kit: Kit,
  fleet: KitFleet,
  itemId: string
): Promise<void> => {
  await until(
    "C declared its wait",
    () =>
      fleet.query<{ wait_reason: string | null }>(
        "SELECT wait_reason FROM work_items WHERE id = ?",
        itemId
      )[0]?.wait_reason ?? undefined,
    (reason) => reason !== undefined,
    300_000
  );
  const waited = Date.now();
  await until(
    "20 s past C's wait",
    () => Date.now(),
    (now) => now - waited > 20_000,
    30_000
  );
  const [row] = fleet.query<ItemRow>(
    "SELECT state, error, result, workspace_id FROM work_items WHERE id = ?",
    itemId
  );
  kit.check(
    "d: the item is not done: still running, waiting for a Mac, nothing landed or reported",
    row?.state === "running" && row.result === null,
    `${row?.state} ${row?.error ?? ""} ${row?.result?.slice(0, 400) ?? ""}`
  );
};

export default { name: "apple-gate", run } satisfies Spec;
