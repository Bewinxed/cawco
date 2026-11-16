/**
 * WHAT A PI HOST SAYS OF ITSELF: its answer to the agent's `snapshot`
 * command, read off the host's line (agent pi-sessiond.ts). The host is a
 * child the agent started, so its answer is JSON until this parse reads it.
 * A host started by an earlier build may lack the fields later builds added;
 * each of those is optional.
 */

import {
  array,
  boolean,
  type InferOutput,
  nullable,
  number,
  object,
  optional,
  safeParse,
  string,
} from "valibot";

const PI_HOST_STATE = object({
  /**
   * The shell commands a send moved to the background that still run, by
   * task id (agent pi-runtime `PiShells`): stopping the host ends them.
   * Absent from a host started before hosts reported them.
   */
  background: optional(array(string())),
  busy: boolean(),
  /**
   * The gate form the host's file tools were started on, for a workspace
   * session; absent on a host started before hosts recorded one, whose file
   * tools may be unjudged.
   */
  gateForm: optional(string()),
  /**
   * The MCP gateway port the host reaches CawCo's tools on, as its agent
   * named it at its start (`CAWCO_MCP_PORT`, agent `spawnPi`); absent on a
   * host started before hosts said it (agent `hostGateway`).
   */
  gatewayPort: optional(number()),
  held: array(string()),
  sessionId: nullable(string()),
});

/** A pi host's state ({@link PI_HOST_STATE}). */
export type PiHostState = InferOutput<typeof PI_HOST_STATE>;

/** A pi host's answer to `snapshot` as its state; one in no such shape throws, naming why. */
export const piHostState = (value: unknown): PiHostState => {
  const read = safeParse(PI_HOST_STATE, value);
  if (!read.success) {
    throw new Error(
      `The pi host answered its state in a shape this agent does not read: ${read.issues.map((issue) => issue.message).join("; ")}`
    );
  }
  return read.output;
};
