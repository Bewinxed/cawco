/**
 * Needs you's row for the hub's `.local` name typed in a browser (core
 * local-name.ts, Component Story Format 3, live components): while Linux
 * keeps port 80 from the hub, its line over its one step, the command that
 * lets it to copy; once the hub holds the port, its tick. The meta's args
 * are every story's; a story's own args are what it changes.
 */
import { lowPortsCommand } from "@cawco/core/stream-relay";
import { localNameWords } from "@cawco/core/words/local-name";
import type { NeedsItem } from "./home-state.svelte";
import NeedsCardSheet from "./NeedsCardSheet.svelte";

/** The row as home-state.svelte.ts lists it, for `state`. */
const row = (state: "needs" | "serving", name = "cawco.local"): NeedsItem => ({
  kind: "local-name",
  key: "local-name:port-80",
  localName: {
    host: "obelisk-of-light",
    name,
    dashboardPort: 3000,
    state,
    ...(state === "needs" ? { command: lowPortsCommand(80) } : {}),
  },
  done: state === "serving",
  title: localNameWords.title(name),
  place: "Onboarding",
  raisedAt: undefined,
});

export default {
  title: "Needs you/Local name",
  component: NeedsCardSheet,
  args: { stale: false, onchoose: () => undefined },
  parameters: { viewport: 400 },
};

/** Port 80 below the floor: the line, then the step with its command. */
export const Needs = { args: { item: row("needs") } };

/** Hostile, at 320: a second hub's name and the command wrap in the panel. */
export const NeedsNarrow = {
  args: { item: row("needs", "cawco-2.local") },
  parameters: { viewport: 320 },
};

/** The command run: the row's tick, for a moment, then it leaves. */
export const Ticked = { args: { item: row("serving") } };
