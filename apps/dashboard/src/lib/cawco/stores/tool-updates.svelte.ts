/**
 * What the fleet does with a machine's copy of a tool at a version CawCo
 * does not run (core `ToolUpdates`: "update", the default, or "ask"), read
 * on connect (`/api/tool-updates`): what a harness block reads to say
 * whether CawCo updates a refused CLI by itself or waits on its press (core
 * tool-updates.ts `toolUpdateOf`). Each machine's copy is the `instances`
 * frame's tool cell, kept live by it.
 */
import { TOOL_UPDATES_DEFAULT, type ToolUpdates } from "@cawco/core/tools";
import { hub } from "#lib/platform/hub.js";
import { hubData } from "#lib/platform/hub-read.js";
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

/** The fleet's choice for a copy of a tool CawCo does not run, and each kept CLI's newest release, as last read. */
export const toolUpdatesStore = {
  get releases(): Record<string, string> {
    return toolUpdatesState.releases;
  },
  get updates(): ToolUpdates {
    return toolUpdatesState.updates;
  },
};
