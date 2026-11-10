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
 * The project is made as New project makes one (`caw: false`, so no
 * conversation answers for it) and set up as an "own" setup is: its Send
 * writes nothing, and the project's session writes stages.md after it with
 * `folder_write` (the project-setup skill's step 6, setup-send's leg 2).
 * Before that a task is refused: "The project is not set up yet, so it has
 * no stages" (r443).
 *
 * - o1. A delegate routine of the project: the test run every new routine
 *   fires once as it is made (routines.ts `create`, slot `test:<at>`) is not
 *   skipped, and its work item's workspace is cut on the hub's machine from
 *   the project's folder on the hub. Only that one run: a run asked for
 *   while it goes is skipped as "the test run is still going" (r443).
 * - o2. A task of the project, filed in its first stage, and an attempt
 *   started at it by a session of the project: the start is taken, and its
 *   workspace is cut from that folder too.
 *
 *   bun scripts/probe-kit/run.ts own-place
 */

import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../spec";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The stages an "own" setup's session writes after its Send, as setup-send's leg 2 writes them. */
const STAGES_MD = `---
found      todo
your-call  you
done       done
moves
  * → *    you
views
  board    by stage
---
`;

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
    await fleet.up();
    const project = await fleet.api((hub) =>
      hub.api.projects.post({
        name: "Own office",
        caw: false,
      })
    );
    const places = fleet.query<{ kind: string }>(
      "SELECT kind FROM project_places WHERE project_id = ?",
      project.id
    );
    // The project's session sets it up as an own setup's does after its
    // Send; it is the parent of o2's attempt too.
    const parent = await fleet.spawn("claude", "Office lead", fleet.repo, {
      projectId: project.id,
    });
    const wrote = await toolWords(
      {
        base: fleet.base,
        id: parent,
        credential: await fleet.sessionCredential(parent),
      },
      "folder_write",
      { path: "stages.md", content: STAGES_MD }
    );
    const stages = await fleet.api((hub) =>
      hub.api.projects({ id: project.id }).stages.get()
    );
    check(
      "o0: the own project is set up: its session's stages.md is its stages",
      !wrote.refused && stages.source === "file",
      `wrote: ${wrote.text.slice(0, 200)}; stages from ${stages.source}`
    );

    // o1. A routine's delegate run: the test run its making fires.
    const routine = await fleet.api((hub) =>
      hub.api.routines.post({
        projectId: project.id,
        name: "Weekly listings scan",
        cron: "0 9 * * 1",
        timeZone: "UTC",
        target: "delegate",
        prompt: "Say ok.",
        lands: "none",
      })
    );
    const run = await until(
      "the routine's test run started or was skipped",
      () =>
        fleet.query<{
          reason: string | null;
          state: string;
          work_item_id: string | null;
        }>(
          "SELECT state, reason, work_item_id FROM routine_runs WHERE routine_id = ? AND slot LIKE 'test:%'",
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

    // o2. A task's attempt, started by the project's session; filed in its
    // first stage, `found`.
    const task = await fleet.api((hub) =>
      hub.api
        .projects({ id: project.id })
        .tasks.post({ title: "Shortlist three offices near the station" })
    );
    const started = await fleet
      .api((hub) =>
        hub.api
          .projects({ id: project.id })
          .tasks({ taskId: task.id })
          .attempts.post({ parentInstanceId: parent })
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
