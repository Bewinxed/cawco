/**
 * The Exchange, Threads: who is asking, as the owner's fleet stood at 14:50
 * on 31 Oct 2026. Three sessions stopped on seven decisions (Small fleet
 * calls, a project conversation is just a session, After the audit), one
 * went ahead on a default, the advisor settled one. On a desk the
 * longest-stopped thread is already open beside the list.
 */
import Exchange from "./Exchange.svelte";
import type { Play } from "./play.js";
import { ALL, caw, cawEnded, OPEN, STRIP } from "./records.js";

export default {
  title: "The Exchange/Threads",
  component: Exchange,
  args: { threads: OPEN, strip: STRIP, view: "threads" },
};

/** Who is asking, stopped longest first: three stopped, one went ahead. */
export const Waiting = { parameters: { viewport: 390 } };

/** The same list at 680: each row's name and state beside its question. */
export const WaitingTablet = { parameters: { viewport: 680 } };

/** At a desk: the list in its column, the longest-stopped thread open beside it. */
export const WaitingDesk = { parameters: { viewport: 1440 } };

/** In the owner's 1540 window: the same columns, the thread's measure held. */
export const WaitingWide = { parameters: { viewport: 1540 } };

/** All: quiet threads too, the advisor's settlement among them. */
export const AllThreads = {
  args: { threads: ALL, filter: "all" },
  parameters: { viewport: 390 },
};

/** All, at a desk. */
export const AllThreadsDesk = {
  args: { threads: ALL, filter: "all" },
  parameters: { viewport: 1440 },
};

/** A session ended with one never picked: it says so, and who takes it. */
export const SessionEnded = {
  args: {
    threads: [...OPEN.filter((t) => t.id !== caw.id), cawEnded],
    filter: "all",
  },
  parameters: { viewport: 390 },
};

/** Nobody is asking: said once the hub has answered, with the day's records a tap away. */
export const NoOneAsking = {
  args: {
    threads: [],
    listLoad: "empty",
    strip: { stopping: 0, sessions: 0, ahead: 0, permissions: 0 },
  },
  parameters: { viewport: 390 },
};

/** Nobody is asking, at a desk: the empty claim stands in the list's column. */
export const NoOneAskingDesk = {
  args: {
    threads: [],
    listLoad: "empty",
    strip: { stopping: 0, sessions: 0, ahead: 0, permissions: 0 },
  },
  parameters: { viewport: 1440 },
};

/** Still reading the hub: skeleton rows at the rows' size. */
export const Loading = {
  args: { listLoad: "loading" },
  parameters: { viewport: 390 },
};

/** Still reading, at a desk: the list and the thread both hold their places. */
export const LoadingDesk = {
  args: { listLoad: "loading", moment: { load: "loading" } },
  parameters: { viewport: 1440 },
};

/** The hub can't be reached: a line over what it last knew, and Try again. */
export const HubUnreachable = {
  args: { listLoad: "unreachable" },
  parameters: { viewport: 390 },
};

/** Unreachable, at a desk. */
export const HubUnreachableDesk = {
  args: { listLoad: "unreachable" },
  parameters: { viewport: 1440 },
};

/** A machine hasn't reported: named over the list, its sessions may be asking more. */
export const MachineNotReporting = {
  args: { silent: { machine: "kestrel", since: "2026-10-31T14:12:00Z" } },
  parameters: { viewport: 390 },
};

/** He opens the newest stopped thread: the thread comes forward with Back. */
export const ThreadOpened = {
  from: "Waiting",
  args: { view: "thread", open: "audit" },
  parameters: { viewport: 390 },
  play: (async ({ canvas, userEvent, update }) => {
    await userEvent.click(
      canvas.getByText("Restart the stopped design surfaces")
    );
    await update({ view: "thread", open: "audit" });
  }) satisfies Play,
};

/** Not now: the thread moves to Set aside, still stopped, and stays open. */
export const SetAside = {
  from: "WaitingDesk",
  args: { open: "fleet", aside: ["fleet"] },
  parameters: { viewport: 1440 },
  play: (async ({ canvas, userEvent, update }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Not now" }));
    await update({ open: "fleet", aside: ["fleet"] });
  }) satisfies Play,
};
