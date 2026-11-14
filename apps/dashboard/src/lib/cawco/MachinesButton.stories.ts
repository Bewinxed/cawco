/**
 * The bar's Machines button (Component Story Format 3, live components), in
 * a glass group at the end of a head's row, as it stands on the desk's bar.
 * It reads the board's machines itself (stores/board.svelte.ts): each
 * story's `beforeEach`
 * imports the board and hands it the machines through its own writer,
 * `holdMachines`, so each frame draws from a board of its own and Needs
 * you's machine exceptions (home-state.svelte.ts) are read off it as the
 * app reads them.
 */

import type { AgentRow } from "@cawco/core/protocol";
import BarHeadFrame from "#lib/components/ui/bar-glass/bar-head-frame.svelte";
import MachinesButton from "./MachinesButton.svelte";

/** When the hub last heard each machine, and when it took their last fleet sync. */
const HEARD = Date.parse("2026-11-14T09:12:00.000Z");

/** A machine on the board as the hub lists it, its fleet in sync, answering unless said. */
const machine = (
  machineId: string,
  hostname: string,
  status = "online"
): AgentRow => ({
  auth: "authenticated",
  fleetSync: { state: "acked", generation: 41, sentAt: HEARD, at: HEARD },
  hostname,
  lastSeenAt: new Date(HEARD).toISOString(),
  machineId,
  os: "linux",
  pausedUntil: null,
  pauseStopped: null,
  status,
});

export default {
  title: "Bar/Machines",
  component: MachinesButton,
  decorators: [() => ({ Component: BarHeadFrame, props: {} })],
  parameters: { viewport: "desk" },
};

/** Three machines, all answering. */
export const AllAnswering = {
  async beforeEach() {
    const board = await import("./stores/board.svelte");
    board.holdMachines([
      machine("m-studio", "studio.local"),
      machine("m-mini", "mini.local"),
      machine("m-air", "air.local"),
    ]);
  },
};

/** The laptop has stopped answering, so the button turns red. */
export const OneUnreachable = {
  async beforeEach() {
    const board = await import("./stores/board.svelte");
    board.holdMachines([
      machine("m-studio", "studio.local"),
      machine("m-air", "air.local", "offline"),
    ]);
  },
};
