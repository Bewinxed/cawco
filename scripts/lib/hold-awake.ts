/**
 * Keeps this machine from idle-sleeping for as long as this process runs
 * (hold-awake.sh `hold_awake`, the one place the platform's primitive is
 * named: `systemd-inhibit --what=idle:sleep --mode=block` on Linux,
 * `caffeinate -i -w` on macOS). Called first by every long run the repo
 * ships: the release, a probe kit run, the stage-2 builds, a scratch fleet.
 *
 * The hold runs as this process's own child, unreferenced so it never keeps
 * the process alive, and ends by itself once this process has ended. A
 * refused hold says why in one line on stderr and the run goes on.
 */
import { join } from "node:path";

const HOLD_AWAKE = join(import.meta.dir, "hold-awake.sh");

/** Whether this process holds its machine awake already: once per process. */
let held = false;

/** Holds idle sleep off until this process ends, for the run `why` names (shown as the lock's reason). */
export const holdAwake = (why: string): void => {
  if (held) {
    return;
  }
  held = true;
  Bun.spawn(
    [
      "bash",
      "-c",
      'source "$0" && hold_awake "$1" "$2"',
      HOLD_AWAKE,
      String(process.pid),
      why,
    ],
    { stdin: "ignore", stdout: "ignore", stderr: "inherit" }
  ).unref();
};
