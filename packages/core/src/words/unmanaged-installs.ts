/**
 * What a machine that takes no update by the hub's route says (`unmanaged`,
 * core binary-updates.ts `UnmanagedReason`): its row in Configure › Updates
 * and its entry in the hub's machine list read these.
 */
export const unmanagedInstallWords = {
  /** `source`: a source checkout, which updates by its own git. */
  source: "Runs from source",
  /** `elsewhere`: a release build with no installation record beside it. */
  elsewhere:
    "Takes no updates: this build has no installation record, so it was installed another way. Running Add machine's install command on it again lets it take them.",
  /** `unreadable`: the installation record is there and does not read; `why` is the read's error. */
  unreadable: (why: string) =>
    `Takes no updates: its installation record does not read (${why}). Running Add machine's install command on it again writes a fresh one.`,
  /** `unreported`: the machine's agent has said nothing of its updates. */
  unreported:
    "Takes no updates: its agent reports no update state. Running Add machine's install command on it again lets it take them.",
};
