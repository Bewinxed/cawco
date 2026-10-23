/**
 * The line a workspace's srt host says when srt refuses to build its
 * sandbox (agent boundary-host.ts): srt throws its reasons (a profile past
 * bwrap's cap, `LinuxSandboxProfileError`; its dependencies missing) where
 * they would reach stderr alone, and the agent names a boundary that did not
 * start by the lines it heard on stdout (boundary.ts `ready`), so the host
 * says srt's own words there, after this. Dependency-free: the boundary's
 * srt host imports it.
 */

/** What starts the line, before srt's own message. */
export const SRT_REFUSED = "cawco: srt refused to build the sandbox";

/** The line for srt's refusal `error`, in srt's own words. */
export const srtRefusedLine = (error: unknown): string =>
  `${SRT_REFUSED}: ${error instanceof Error ? error.message : String(error)}`;
