/**
 * A word from the hub to a session it runs: the send's envelope, its message
 * the hub's own turn with the origin naming what said it.
 */
import type { ControlArgs, ControlName } from "@cawco/core/control-table";
import type { HubEnvelope } from "@cawco/core/envelopes";
import type { SendPayload } from "@cawco/core/protocol";

/**
 * The system origin name of the hub's word to a session's process about its
 * move: that it may go on at its account's limit (at-limit.ts
 * `CARRY_ON_ORIGIN`), or that it answers its refused first turn on the
 * hub's next model (start-model-moves.ts). What the move ended has its own
 * (hub-words.ts `MOVE_ENDED_ORIGIN`).
 */
export const LIMIT_ORIGIN = "limit";

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
export const sessionControl = <K extends ControlName>(
  row: { id: string; machineId: string },
  requestId: string,
  method: K,
  args: ControlArgs<K>
): HubEnvelope<"control"> => ({
  verb: "control",
  machineId: row.machineId,
  instanceId: row.id,
  requestId,
  payload: { instanceId: row.id, requestId, method, args },
});
