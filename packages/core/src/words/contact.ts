/**
 * A machine CawCo has lost (hub machine-contact.ts): the one person-facing
 * "didn't answer" there is. A read a machine was slow to answer is logged
 * and said to whoever asked, never pushed; only a machine the hub has heard
 * nothing from for {@link MACHINE_LOST_MS}, with sessions on it, is Needs
 * you's item and its push, the same rule for every machine, the hub's own
 * included. It comes down when the machine is heard from again.
 *
 * Our call (no source sets it): two minutes is eight of a machine's 15 s
 * heartbeats (agent daemon.ts `HEARTBEAT_INTERVAL`) missed in a row, far
 * past one slow moment on a loaded machine (2026-10-23, obelisk: reads of
 * the hub's own machine missed their 10 s deadline for an hour while it
 * answered its heartbeats).
 */
export const MACHINE_LOST_MS = 120_000;

export const contactWords = {
  /** Needs you's item, and its push's title. */
  lostTitle: (machine: string) => `${machine} stopped answering`,
  /** Its line: what happened, what is safe, what to do, what happens next. */
  lostLine: (machine: string, minutes: number) =>
    `CawCo hasn't heard from ${machine} for ${minutes} min. Its sessions hold their place. Check that the machine is awake and CawCo runs there: it goes on once it answers.`,
  /** The item's meta line. */
  lostMeta: "Machine",
  /** The hub's log, as a machine is lost and as it answers again (hub machine-contact.ts). */
  lostLogged: "it is lost, and you are told once",
  backLogged: "answered again after",
  /**
   * An OpenCode session's reattach that OpenCode never said it runs, within
   * its budget (agent opencode.ts `#recover`): the session settles asleep,
   * what was last asked of OpenCode after it, then {@link reattachSilentNext}.
   */
  reattachSilent: (seconds: number) =>
    `CawCo couldn't take this session back after a restart: OpenCode didn't say within ${seconds} s whether it still runs it`,
  reattachSilentNext: "Start it again once OpenCode answers.",
};
