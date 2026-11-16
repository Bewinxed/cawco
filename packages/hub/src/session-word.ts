/**
 * A word from the hub to a session it runs: the send's envelope, its message
 * the hub's own turn with the origin naming what said it.
 */
import type {
  HubEnvelope,
  SendPayload,
} from "@cawco/core/protocol";

export const sessionWord = (
  row: { id: string; machineId: string },
  content: string,
  origin: SendPayload["message"]["origin"],
  more: { shouldQuery?: boolean } = {}
): HubEnvelope<"send"> => ({
  verb: "send",
  machineId: row.machineId,
  instanceId: row.id,
  payload: {
    instanceId: row.id,
    message: {
      type: "user",
      uuid: crypto.randomUUID(),
      message: { role: "user", content },
      parent_tool_use_id: null,
      origin,
      ...more,
    },
  },
});

/** The hub's `control` to a session's process: `method` with `args`, answered at `requestId`. */
export const sessionControl = (
  row: { id: string; machineId: string },
  requestId: string,
  method: string,
  args: unknown[]
): HubEnvelope<"control"> => ({
  verb: "control",
  machineId: row.machineId,
  instanceId: row.id,
  requestId,
  payload: { instanceId: row.id, requestId, method, args },
});
