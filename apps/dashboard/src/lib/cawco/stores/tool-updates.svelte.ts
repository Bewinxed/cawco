/**
 * What the fleet does with a machine's copy of a tool at a version CawCo
 * does not run (core `ToolUpdates`: "update", the default, or "ask"), read
 * on connect (`/api/tool-updates`) and written by Configure › Command-line
 * tools' switch: what a harness block reads to say whether CawCo updates a
 * refused CLI by itself or waits on its press, and what every row reads to
 * say where a copy stands (core tool-updates.ts `toolUpdateOf`). Each
 * machine's copy is the `instances` frame's tool cell, kept live by it.
 */
import { TOOL_UPDATES_DEFAULT, type ToolUpdates } from "@cawco/core/tools";
import { hub } from "#lib/platform/hub.js";
import { couldNot, hubData } from "#lib/platform/hub-read.js";
import { load } from "../hub/load";

const toolUpdatesState = $state<{
  releases: Record<string, string>;
  updates: ToolUpdates;
}>({
  releases: {},
  updates: TOOL_UPDATES_DEFAULT,
});

/** The fleet's choice, and the releases CawCo keeps its copies at, as the hub holds them now; the default until it answers. */
export async function readToolUpdates(): Promise<void> {
  const read = await load(hubData(hub.api["tool-updates"].get()));
  if (read) {
    toolUpdatesState.updates = read.updates;
    toolUpdatesState.releases = read.releases;
  }
}

/**
 * Writes the fleet's choice, and holds what the hub answered: no frame says
 * a change of it, so this dashboard takes it from its own write, and every
 * other reads it on its next connect. Refused, it throws the hub's words.
 */
export async function writeToolUpdates(updates: ToolUpdates): Promise<void> {
  const written = await hubData(
    hub.api["tool-updates"].put({ updates }),
    (refused) => couldNot("change the setting", refused)
  );
  toolUpdatesState.updates = written.updates;
  toolUpdatesState.releases = written.releases;
}

/**
 * Update all of each tool: the hub sends every connected machine whose copy
 * is one its CawCo does not run that machine's Update, as a press on its row
 * does. Each machine's cell moves on the `instances` frame. Refused, it
 * throws the first refusal in the hub's words, after every tool was asked.
 */
export async function updateAllOf(toolIds: readonly string[]): Promise<void> {
  const asked = await Promise.allSettled(
    toolIds.map((id) =>
      hubData(hub.api.tools({ id })["update-all"].post(), (refused) =>
        couldNot("update all", refused)
      )
    )
  );
  const first = asked.find((one) => one.status === "rejected");
  if (first) {
    throw first.reason;
  }
}

/** The fleet's choice for a copy of a tool CawCo does not run, and each kept CLI's newest release, as last read. */
export const toolUpdatesStore = {
  get releases(): Record<string, string> {
    return toolUpdatesState.releases;
  },
  get updates(): ToolUpdates {
    return toolUpdatesState.updates;
  },
};
