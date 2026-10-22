/**
 * The journeys' turns on the scratch fleet's mock model: a conversation
 * makes a tool call once, loading it with ToolSearch first when the harness
 * offers it deferred (CawCo's own tools are), judged from the conversation
 * itself, so every conversation that asks for it makes it once.
 */
import type { Reply, Seen, ToolCall } from "../../scratch-fleet";

/** Words alone. */
export const say = (words: string): Reply => ({ everyMs: 20, words: [words] });

/** The name a harness lists a tool under: bare, or behind its MCP prefix. */
export const listedAs = (seen: Seen, tool: string): string | undefined =>
  seen.toolNames.find((name) => name === tool || name.endsWith(`__${tool}`));

/**
 * How many times this conversation called `tool` (bare or behind its MCP
 * prefix): its `tool_use` blocks, never the request's `tools` list, which
 * names every tool offered the same way (`"name":"mcp__cawco__finish_item"`).
 */
export const callCount = (seen: Seen, tool: string): number =>
  (
    seen.body.match(
      new RegExp(`"type":"tool_use"[^}]*"name":"(?:[\\w-]+__)?${tool}"`, "g")
    ) ?? []
  ).length;

/** Whether this conversation already called `tool` (bare or behind its MCP prefix). */
const called = (seen: Seen, tool: string): boolean => callCount(seen, tool) > 0;

/**
 * This conversation's next step towards each of `calls`, in order: the
 * first one it has not made yet (or the ToolSearch that loads it), or `null`
 * once it has made them all.
 */
export function callsInOrder(seen: Seen, calls: ToolCall[]): Reply | null {
  const call = calls.find((one) => !called(seen, one.name));
  if (!call) {
    return null;
  }
  const name = listedAs(seen, call.name);
  if (name) {
    return { everyMs: 20, words: [], tool: { name, input: call.input } };
  }
  if (seen.toolNames.includes("ToolSearch")) {
    return {
      everyMs: 20,
      words: [],
      tool: {
        name: "ToolSearch",
        input: { query: `select:mcp__cawco__${call.name}`, max_results: 1 },
      },
    };
  }
  return say(`${call.name} is not offered here.`);
}
