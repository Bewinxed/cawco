import type { AgentRow } from "@cawco/core/protocol";

/** A machine's row as the API answers it: when it was last seen, the ISO string it is sent as. */
export const machineOut = (row: AgentRow) => ({
  ...row,
  lastSeenAt:
    row.lastSeenAt === null ? null : new Date(row.lastSeenAt).toISOString(),
});
