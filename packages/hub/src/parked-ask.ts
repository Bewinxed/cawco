import type { Envelope, InstanceRow } from "@cawco/core";

/**
 * `actor`'s call to `toolName` as an ask parked for the person: its
 * `permission_request` frame, with `fields` naming what kind of ask it is.
 */
export const parkedToolAsk = (
  actor: Pick<InstanceRow, "harness" | "id" | "machineId">,
  requestId: string,
  toolName: string,
  input: Record<string, unknown>,
  fields: Record<string, unknown>
): Envelope => ({
  verb: "frames",
  machineId: actor.machineId,
  instanceId: actor.id,
  requestId,
  payload: {
    kind: "permission_request",
    instanceId: actor.id,
    requestId,
    harness: actor.harness,
    requestKind: "tool",
    toolName,
    input,
    ...fields,
  },
});

/** Refuses `instanceId` a second `what` ask while one of its own waits in `waiting` (by request id). */
export const refuseSecondAsk = (
  waiting: ReadonlyMap<string, { instanceId: string }>,
  instanceId: string,
  what: string
): void => {
  const open = [...waiting].find(
    ([, waiter]) => waiter.instanceId === instanceId
  )?.[0];
  if (open) {
    throw new Error(
      `This session already has a ${what} ask open (${open}); its answer comes back to that call.`
    );
  }
};
