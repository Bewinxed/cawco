/**
 * A project with no checkout (an "own" project: its one place its folder on
 * the hub) runs its work there: a routine's delegate run and a task's
 * attempt each cut their workspace from that folder, on the hub's machine,
 * as a plain delegate in it always has (hub work-place.ts `workPlace`, the
 * one rule dispatch.ts `placementOf`, routines.ts `placeOf`, work-items.ts
 * `onProjectAccount` and caw.ts read). On a scratch fleet of one machine
 * (real hub, agent and sessiond; Claude Code against the mock model). Its
 * work cuts workspaces, whose boundary is user namespaces: it runs on the
 * host.
 *
 * The incident (2026-11-05, project Private office): every routine run was
 * skipped with "no checkout of Private office is on a machine that is
 * online", and `delegate` naming its task was refused: "No checkout of
 * Private office is on a machine that is online, so there is nowhere to cut
 * this task's workspace." Its plain delegates ran.
 *
 * - o1. A delegate routine of the project, run now: its run is not skipped,
 *   and its work item's workspace is cut on the hub's machine from the
 *   project's folder on the hub.
 * - o2. A task of the project, an attempt started at it by a session of the
 *   project: the start is taken, and its workspace is cut from that folder
 *   too.
 *
 *   bun scripts/probe-kit/run.ts own-place
 */
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

interface Cut {
  machine_id: string;
  repo_root: string;
}

/** Where work item `workItemId`'s workspace was cut, once it has one. */
const cutOf = (fleet: KitFleet, workItemId: string): Promise<Cut | undefined> =>
  until(
    "the work item's workspace",
    () =>
      fleet.query<Cut>(
        "SELECT w.machine_id, w.repo_root FROM work_items i JOIN workspaces w ON w.id = i.workspace_id WHERE i.id = ?",
        workItemId
      )[0],
    (row) => row !== undefined,
    120_000
  ).catch(() => undefined);

/** Whether `cut` is the project's folder on the hub, on the hub's machine. */
const fromHubFolder = (cut: Cut | undefined, projectId: string): boolean =>
  cut?.machine_id === MACHINE && cut.repo_root.endsWith(`/${projectId}`);

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "own-place",
  host: "its routine run and attempt cut workspaces, whose boundary is user namespaces",
  run: async (kit: Kit) => {
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
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Own office",
      caw: false,
    });
    const places = fleet.query<{ kind: string }>(
      "SELECT kind FROM project_places WHERE project_id = ?",
      project.id
    );

    // o1. A routine's delegate run.
    const routine = await fleet.api<{ id: string }>("/api/routines", {
      projectId: project.id,
      name: "Weekly listings scan",
      cron: "0 9 * * 1",
      timeZone: "UTC",
      target: "delegate",
      prompt: "Say ok.",
      lands: "none",
    });
    await fleet.api(`/api/routines/${routine.id}/run`, {});
    const run = await until(
      "the routine's run started or was skipped",
      () =>
        fleet.query<{
          reason: string | null;
          state: string;
          work_item_id: string | null;
        }>(
          "SELECT state, reason, work_item_id FROM routine_runs WHERE routine_id = ? ORDER BY rowid DESC LIMIT 1",
          routine.id
        )[0],
      (row) =>
        row !== undefined && (row.state === "skipped" || !!row.work_item_id),
      150_000
    ).catch(() => undefined);
    const runCut = run?.work_item_id
      ? await cutOf(fleet, run.work_item_id)
      : undefined;
    check(
      "o1: a project whose one place is its folder on the hub runs a routine's delegate run, its workspace cut from that folder on the hub's machine",
      places.length === 1 &&
        places[0]?.kind === "hub" &&
        run?.state !== "skipped" &&
        fromHubFolder(runCut, project.id),
      `places ${JSON.stringify(places)}; run ${JSON.stringify(run)}; cut ${JSON.stringify(runCut)}`
    );

    // o2. A task's attempt, started by a session of the project.
    const parent = await fleet.spawn("claude", "Office lead", fleet.repo, {
      projectId: project.id,
    });
    const task = await fleet.api<{ id: string }>(
      `/api/projects/${project.id}/tasks`,
      { title: "Shortlist three offices near the station" }
    );
    const started = await fleet
      .api<{ workItemId: string | null; workspaceId: string | null }>(
        `/api/projects/${project.id}/tasks/${task.id}/attempts`,
        { parentInstanceId: parent }
      )
      .catch((error: unknown) =>
        error instanceof Error ? error.message : String(error)
      );
    const attemptCut =
      typeof started !== "string" && started.workItemId
        ? await cutOf(fleet, started.workItemId)
        : undefined;
    check(
      "o2: an attempt at that project's task starts, its workspace cut from its folder on the hub on the hub's machine",
      typeof started !== "string" && fromHubFolder(attemptCut, project.id),
      `${typeof started === "string" ? `refused: ${started}` : JSON.stringify(started)}; cut ${JSON.stringify(attemptCut)}`
    );
  },
};

export default spec;
