/**
 * Whether a connection's tool writes, as its server says of it: the
 * annotations its `tools/list` sends ({@link readsOnly}), never a list of
 * tool names kept here. A tool reads only when it says `readOnlyHint: true`
 * and does not say `destructiveHint: true`; anything else, no annotation
 * included, writes. That is GitLab's own reading of its server's tools: "Each
 * tool is sorted into an action category based on the annotations it
 * declares … `destructiveHint: true` Delete, `readOnlyHint: true` Read,
 * `readOnlyHint: false` Write, Neither annotation Delete … the most
 * restrictive declaration wins" (docs.gitlab.com/user/ai-governance/tool-governance).
 *
 * A session's write tool goes out as the hub calls it (connections.ts
 * `callAs`), with the connection's own credential.
 */
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Whether a connection's tool only reads, as its server's annotations say:
 * `readOnlyHint: true` and no `destructiveHint: true`. The one reading every
 * check of a connection tool goes by (read-only sessions, polls).
 */
export const readsOnly = (tool: Pick<Tool, "annotations">): boolean =>
  tool.annotations?.readOnlyHint === true &&
  tool.annotations.destructiveHint !== true;
