/**
 * Caw, the fifth place (Component Story Format 3, live components): docked
 * beside the board at 1440, a drawer over it at 900, a full screen on a
 * phone, on the hub's own records (records.ts). The meta's args are every
 * story's; a story's own args are what it changes.
 */
import FivePlaces from "./FivePlaces.svelte";
import { QUIET, SWING } from "./records";
import { press } from "./story-kit";

export default {
  title: "Five places/Caw",
  component: FivePlaces,
  args: { records: SWING, place: "tasks", caw: true },
};

/** Caw working: his sentence, the newest conversation, the project's sessions and its starters. */
export const Docked = {
  args: { place: "tasks", height: 920 },
  parameters: { viewport: 1440 },
};

/** Caw pressed in the row: his pane docks beside the board, the row's Caw item chosen. */
export const Docking = {
  args: { place: "tasks", height: 920 },
  parameters: { viewport: 1440 },
  from: "Closed",
  play: press("button", /^Caw/u),
};

/** The board without Caw, the poster's start. */
export const Closed = {
  args: { place: "tasks", height: 920, caw: false },
  parameters: { viewport: 1440 },
};

/** A quiet project: a fresh conversation, starters for it, no sessions yet. */
export const Fresh = {
  args: { place: "tasks", height: 920, records: QUIET },
  parameters: { viewport: 1440 },
};

/** Caw is off: why, and Turn on Caw; the field waits. */
export const Off = {
  args: {
    height: 920,
    records: { ...SWING, caw: { ...SWING.caw, status: "off" } },
  },
  parameters: { viewport: 1440 },
};

/** His machine stopped answering: what happened and the way back. */
export const Unreachable = {
  args: {
    height: 920,
    records: { ...SWING, caw: { ...SWING.caw, status: "unreachable" } },
  },
  parameters: { viewport: 1440 },
};

/** The sessions' read failed while the conversation is live. */
export const SessionsStale = {
  args: { place: "tasks", height: 920, sessionsStale: true },
  parameters: { viewport: 1440 },
};

/** The first read: his status and last turn as skeletons. */
export const Loading = {
  args: { place: "tasks", height: 920, read: "loading" },
  parameters: { viewport: 1440 },
};

/** 900: his pane comes over the board as a drawer from the right. */
export const OverBoardMid = {
  args: { place: "tasks", height: 920 },
  parameters: { viewport: 900 },
};

/** A phone: Caw full screen with Back, the bottom bar's Caw chosen. */
export const FullScreenPhone = {
  args: { place: "tasks", height: 844 },
  parameters: { viewport: 390 },
};
