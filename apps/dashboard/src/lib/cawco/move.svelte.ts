/**
 * Moving a project's folder to a machine that has no checkout of its
 * repository (core move.ts;
 * the design in `.design-foundations/plans/2026-10-09-project-move.md`). The
 * hub owns each move as a job; this tab reads what one would take, starts
 * it, and asks the hub to stop or retry it. What a job is doing reaches
 * every screen on the `moves` frame (`movesStore.moves`).
 */

import { type HubRequest, hubRequest } from "@cawco/core/hub-request";
import type { MoveEstimate, MoveJob, MoveRequest } from "@cawco/core/move";
import { hubFetch, hubRefusal } from "#lib/platform/hub-read.js";
import { heardMove, movesStore } from "./stores/moves.svelte";

/** The hub's refusal, in its one sentence (hub-read `hubRefusal`). */
const refusal = (response: Response): Promise<Error> => hubRefusal(response);

/**
 * What moving the project's checkout `from` (a place id) to `machineId`
 * takes: whether it is needed, where it goes, what it fetches, why it
 * can't, and what "Move it" does.
 */
export async function moveEstimate(
  projectId: string,
  machineId: string,
  asked: { from: string; path?: string | undefined },
  signal?: AbortSignal
): Promise<MoveEstimate> {
  const response = await hubFetch(
    hubRequest("GET /api/projects/:id/move-estimate", {
      path: { id: projectId },
      query: {
        machine: machineId,
        from: asked.from,
        ...(asked.path ? { path: asked.path } : {}),
      },
    }),
    { signal }
  );
  if (!response.ok) {
    throw await refusal(response);
  }
  return (await response.json()) as MoveEstimate;
}

/** Move & start: the hub records the job and answers it; it runs from there. */
export async function startMove(
  projectId: string,
  request: MoveRequest
): Promise<MoveJob> {
  const response = await hubFetch(
    hubRequest("POST /api/projects/:id/moves", {
      path: { id: projectId },
      body: request,
    })
  );
  if (!response.ok) {
    throw await refusal(response);
  }
  return (await response.json()) as MoveJob;
}

/**
 * Cancel: the step in flight stops; the job says what it left on disk
 * (`kept`). From any stage, failed included, every screen reads it stopped
 * from the hub's answer on, not from its next frame.
 */
export const cancelMove = (id: string): Promise<MoveJob> =>
  moveAct(hubRequest("DELETE /api/moves/:id", { path: { id } }));

/** Retry: a failed job runs the step it failed at again, and on from there. */
export const retryMove = (id: string): Promise<MoveJob> =>
  moveAct(hubRequest("POST /api/moves/:id/retry", { path: { id } }));

/** One act on a job: the job as the hub answers it, heard at once. */
async function moveAct(request: HubRequest): Promise<MoveJob> {
  const response = await hubFetch(request);
  if (!response.ok) {
    throw await refusal(response);
  }
  const job = (await response.json()) as MoveJob;
  heardMove(job);
  return job;
}

/** The move whose session is `instanceId`, while the hub keeps it. */
export const moveOf = (instanceId: string): MoveJob | undefined =>
  movesStore.moves.find((job) => job.targetInstanceId === instanceId);

/** Whether a move still holds `instanceId`'s row: the move's to cancel, in its pane, not a row to remove. */
export const heldByMove = (instanceId: string): boolean => {
  const job = moveOf(instanceId);
  return !!job && job.stage !== "started" && job.stage !== "cancelled";
};
