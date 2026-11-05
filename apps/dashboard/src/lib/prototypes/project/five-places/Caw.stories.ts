/**
 * Caw, the fifth place (Component Story Format 3, live components): docked
 * beside the board at 1440, a drawer over it at 900, a full screen on a
 * phone, on the hub's own records (records.ts). The meta's args are every
 * story's; a story's own args are what it changes.
 */
import FivePlaces from "./FivePlaces.svelte";
import { QUIET, SWING } from "./records";
import { at, DESK, MID, PHONE, press } from "./story-kit";

export default {
  title: "Five places/Caw",
  component: FivePlaces,
  args: { records: SWING, place: "tasks", caw: true },
};

/** Caw working: his sentence, the newest conversation, the project's sessions and its starters. */
export const Docked = at(DESK);

/** Caw pressed in the row: his pane docks beside the board, the row's Caw item chosen. */
export const Docking = {
  ...at(DESK),
  from: "Closed",
  play: press("button", /^Caw/u),
};

/** The board without Caw, the poster's start. */
export const Closed = at(DESK, { caw: false });

/** He stays while the place changes: Routines beside his pane. */
export const BesideRoutines = {
  ...at(DESK, { place: "routines" }),
  from: "Docked",
  play: press("button", /^Routines/u),
};

/** A starter pressed: it fills the field; nothing sends. */
export const StarterFilled = {
  ...at(DESK, { cawDraft: SWING.caw.starters[0] }),
  from: "Docked",
  play: press("button", /^Plan the next release/u),
};

/** Spin off a session pressed: machine and checkout, harness, delegate type, and what comes along. */
export const SpinningOff = {
  ...at(DESK, { spinning: true }),
  from: "Docked",
  play: press("button", /^Spin off a session$/u),
};

/** A quiet project: a fresh conversation, starters for it, no sessions yet. */
export const Fresh = at(DESK, { records: QUIET });

/** Caw is off: why, and Turn on Caw; the field waits. */
export const Off = at(DESK, {
  records: { ...SWING, caw: { ...SWING.caw, status: "off" } },
});

/** His machine stopped answering: what happened and the way back. */
export const Unreachable = at(DESK, {
  records: { ...SWING, caw: { ...SWING.caw, status: "unreachable" } },
});

/** The sessions' read failed while the conversation is live. */
export const SessionsStale = at(DESK, { sessionsStale: true });

/** The first read: his status and last turn as skeletons. */
export const Loading = at(DESK, { read: "loading" });

/** 900: his pane comes over the board as a drawer from the right. */
export const OverBoardMid = at(MID);

/** A phone: Caw full screen with Back, the bottom bar's Caw chosen. */
export const FullScreenPhone = at(PHONE);

/** A phone, Caw pressed in the bottom bar from Tasks. */
export const OpeningPhone = {
  ...at(PHONE),
  from: "ClosedPhone",
  play: press("button", /^Caw/u),
};

/** A phone on Tasks, Caw closed. */
export const ClosedPhone = at(PHONE, { caw: false });
