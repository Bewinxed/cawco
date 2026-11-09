/**
 * A word from the hub to a session it runs: the send's envelope, its message
 * the hub's own turn with the origin naming what said it.
 */
import type { Envelope, SendPayload } from "@cawco/core/protocol";

export const sessionWord = (
  row: { id: string; machineId: string },
  content: string,
  origin: SendPayload["message"]["origin"]
): Envelope<SendPayload> => ({
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
    },
  },
});
