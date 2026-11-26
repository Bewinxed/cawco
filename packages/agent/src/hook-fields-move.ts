/**
 * The machine's own copies of the fleet's hooks rewritten, once, to the
 * handler shape Claude Code's settings read, as the agent starts: the fleet
 * harness set (fleet-harness-set.ts, core paths/fleet.ts
 * `fleetHarnessSetFile`) and each place's set (fleet-place-set.ts, core
 * `fleetPlacesDir`). An MCP tool handler's `mcp_server_name` and
 * `tool_name` become `server` and `tool`; an agent handler's `agent`, which
 * Claude Code never read, goes (hub migration 0438 does the same to the
 * hub's rows).
 *
 * Their readers parse the new shape alone, and one written in the old fails
 * whole: until the fleet's next converge wrote it again, a session would
 * start with no fleet hook, the boundary's guard among them. So this runs
 * before anything can start a session, and a copy already in the new shape
 * is left as it is; from then on nothing reads the old one. A file that is
 * not JSON is left to its reader, which says so.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { unlessGone } from "@cawco/core/absent";
import { isRecord } from "@cawco/core/is-record";
import { fleetHarnessSetFile, fleetPlacesDir } from "@cawco/core/paths/fleet";
import { writeStateFile } from "@cawco/core/state-file";
import { Effect } from "effect";
import { fromPromise } from "./rejected";

/** `handler` in the shape Claude Code's settings read; null when it is in it already. */
const moved = (
  handler: Record<string, unknown>
): Record<string, unknown> | null => {
  if (handler.type === "mcp_tool" && !("server" in handler)) {
    const { mcp_server_name: server, tool_name: tool, ...rest } = handler;
    return { ...rest, server, tool };
  }
  if (handler.type === "agent" && "agent" in handler) {
    const { agent: _agent, ...rest } = handler;
    return rest;
  }
  return null;
};

/** The set at `file` with each hook's handler moved; null when none needed it, or the file is not there or not JSON. */
const movedSet = async (file: string): Promise<unknown> => {
  const text = await readFile(file, "utf8").catch(unlessGone(undefined));
  if (text === undefined) {
    return null;
  }
  let set: unknown;
  try {
    set = JSON.parse(text);
  } catch {
    return null;
  }
  if (!(isRecord(set) && isRecord(set.hooks))) {
    return null;
  }
  let changed = false;
  const hooks = Object.fromEntries(
    Object.entries(set.hooks).map(([id, hook]) => {
      const handler =
        isRecord(hook) && isRecord(hook.handler) ? hook.handler : undefined;
      const next = handler ? moved(handler) : null;
      if (!(next && isRecord(hook))) {
        return [id, hook];
      }
      changed = true;
      return [id, { ...hook, handler: next }];
    })
  );
  return changed ? { ...set, hooks } : null;
};

/** Each of the machine's copies of the fleet's hooks in the shape Claude Code's settings read ({@link moved}); said for each one rewritten. */
export const moveHookFields = Effect.fn("moveHookFields")(function* () {
  const places = yield* fromPromise(() =>
    readdir(fleetPlacesDir()).catch(unlessGone<string[]>([]))
  );
  const files = [
    fleetHarnessSetFile(),
    ...places
      .filter((name) => name.endsWith(".json"))
      .map((name) => join(fleetPlacesDir(), name)),
  ];
  for (const file of files) {
    const set = yield* fromPromise(() => movedSet(file));
    if (set !== null) {
      yield* fromPromise(() =>
        writeStateFile(file, JSON.stringify(set, null, 2))
      );
      yield* Effect.logInfo(
        `[fleet] ${file}: its hooks rewritten in the shape Claude Code's settings read`
      );
    }
  }
});
