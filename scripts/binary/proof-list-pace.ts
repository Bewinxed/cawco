/**
 * packages/sessiond/src/list-pace.ts as the stage 2 proof's builds have it
 * (scripts/build-binary.ts puts it in that module's place when `stubHarness`
 * is set; no published binary carries it). `CAWCO_PROOF_RETIRING_LIST_MS`,
 * set by prove-stage2.sh in its machines' service manager, is how late a
 * retiring keeper (one the machine's `keeper` link no longer names, still
 * holding what it started before a handover) answers a `list`: 3000, as late
 * as a keeper on a loaded machine answered one, past the agent's 2000 ms
 * wait for it. Unset, and for the machine's own keeper, at once.
 */
import { basename } from "node:path";
import { readKeeperVersion } from "../../packages/core/src/binary-installation";
import { MACHINE_ENDPOINT } from "../../packages/core/src/keepers";
import { runtimeVersion } from "../../packages/core/src/runtime";
import { sessiondEndpoint } from "../../packages/core/src/sessiond";

const asked = Number(process.env.CAWCO_PROOF_RETIRING_LIST_MS);
const RETIRING_LIST_MS = Number.isFinite(asked) && asked > 0 ? asked : 0;

/** The endpoint this keeper listens on, as sessiond main.ts reads it. */
const endpoint = process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint();

const retiring = async (): Promise<boolean> =>
  basename(endpoint) !== MACHINE_ENDPOINT &&
  ((await readKeeperVersion()) ?? runtimeVersion) !== runtimeVersion;

export const paceList = (answer: () => void): void => {
  if (RETIRING_LIST_MS === 0) {
    answer();
    return;
  }
  // Every list on a connection waits as long, so they answer in the order asked.
  retiring().then(
    (late) => (late ? setTimeout(answer, RETIRING_LIST_MS) : answer()),
    () => answer()
  );
};
