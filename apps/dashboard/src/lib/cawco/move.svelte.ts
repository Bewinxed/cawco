/**
 * Moving a project to a machine that has no checkout of it (core move.ts;
 * the design in `.design-foundations/plans/2026-10-09-project-move.md`). The
 * hub owns each move as a job; this tab reads what one would take, starts
 * it, and asks the hub to stop or retry it. What a job is doing reaches
 * every screen on the `moves` frame (`cawco.moves`).
 */
import type { MoveEstimate, MoveJob, MoveRequest } from "@cawco/core";
import { cawco } from "./client.svelte";

/** The hub's refusal, in its own words, or the status when it gave none. */
async function refusal(response: Response): Promise<Error> {
  const words = (await response.text()).trim();
  return new Error(words || `The hub answered ${response.status}.`);
}

/**
 * What moving `projectId` to `machineId` takes: whether it is needed, where
 * it goes, what it fetches, why it can't, and what "Move it" does.
 */
export async function moveEstimate(
  projectId: string,
  machineId: string,
  path?: string,
  signal?: AbortSignal
): Promise<MoveEstimate> {
  const query = new URLSearchParams({
    machine: machineId,
    ...(path ? { path } : {}),
  });
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/move-estimate?${query}`,
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
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/moves`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw await refusal(response);
  }
  return (await response.json()) as MoveJob;
}

/** Cancel: the step in flight stops; the job says what it left on disk (`kept`). */
export async function cancelMove(id: string): Promise<MoveJob> {
  const response = await fetch(`/api/moves/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await refusal(response);
  }
  return (await response.json()) as MoveJob;
}

/** Retry: a failed job runs the step it failed at again, and on from there. */
export async function retryMove(id: string): Promise<MoveJob> {
  const response = await fetch(`/api/moves/${encodeURIComponent(id)}/retry`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await refusal(response);
  }
  return (await response.json()) as MoveJob;
}

/** The move whose session is `instanceId`, while the hub keeps it. */
export const moveOf = (instanceId: string): MoveJob | undefined =>
  cawco.moves.find((job) => job.targetInstanceId === instanceId);
