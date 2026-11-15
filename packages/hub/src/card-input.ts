/**
 * What a permission card shows of a tool call's input, by field alone: the
 * one rule every copy of an ask that leaves the hub is made by (the pending
 * ledger's card, pending.ts `AskCard`) and what an ask's row keeps of a call
 * (asks.ts; db/asks-inputs.ts, db/parked-inputs.ts). The call's own input is
 * sealed beside it and opened only by an Approve.
 */

import { openUrl } from "@cawco/core/fleet-secrets";
import type { ParkedAsk } from "@cawco/core/frames";
import { redact } from "@cawco/core/permission-presentation";
import { questionsOf } from "@cawco/core/question";

const MCP_SERVERS_WRITE = /^(?:mcp__cawco__|cawco_)?admin_mcp_servers_write$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A connector write's `config.url` with its secret parts cut, as every read says it. */
const withOpenUrl = (
  input: Record<string, unknown>
): Record<string, unknown> => {
  const { config } = input;
  if (!(isRecord(config) && typeof config.url === "string")) {
    return input;
  }
  return { ...input, config: { ...config, url: openUrl(config.url) } };
};

/**
 * A tool call's input as its card shows it, by field alone: each value
 * under a field core `redact` reads as secret by its name (`(hidden)`, an
 * `env` or `headers` map by its keys), and a connector write's `config.url`
 * cut to its open part. A question's input is whole: its answer is written
 * into it. Nothing else is read or cut: a shell command shows as written.
 * What the pending ledger keeps of a parked ask (pending.ts) and an ask's
 * row of a call (asks.ts; db/asks-inputs.ts, db/parked-inputs.ts).
 */
export const cardInput = (
  tool: string,
  input: Record<string, unknown>
): Record<string, unknown> => {
  if (questionsOf(tool, input)) {
    return input;
  }
  const hidden = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, redact(key, value)])
  );
  return MCP_SERVERS_WRITE.test(tool) ? withOpenUrl(hidden) : hidden;
};

/** A parked ask as its card shows it ({@link cardInput}): what the pending ledger holds. */
export const cardOf = (ask: ParkedAsk): ParkedAsk => ({
  ...ask,
  payload: {
    ...ask.payload,
    input: cardInput(ask.payload.toolName, ask.payload.input),
  },
});
