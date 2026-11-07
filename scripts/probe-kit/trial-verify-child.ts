/**
 * An update helper's verdict on a trial, for specs/slow-hub-trial.ts and
 * specs/trial-sleep.ts: the helper's own verification (cli binary-apply.ts
 * `verify`), first until the build answers, then held for `CONFIRM_MS`, as
 * its `settle` runs it, with the keeper's handover between the two left out
 * (it touches no probe), on one awake clock (core awake-time.ts), the trial
 * read again between the two as `settle` reads it. Run with the scratch data
 * dir the spec made (`XDG_DATA_HOME`: its `cawco/binary/installation.json`
 * names the hub to probe) and the machine's id (`CAWCO_MACHINE_ID`).
 *
 *   bun scripts/probe-kit/trial-verify-child.ts '<trial marker JSON>'
 *
 * Its last lines are `DECIDED <ms since the epoch>`, `TRIAL <the trial as
 * it stands, JSON>` and `VERDICT confirm` or `VERDICT roll-back <problem
 * JSON>`; every line before them is the helper's own (`update: verify …`).
 */
import { CONFIRM_MS, verify } from "../../packages/cli/src/binary-apply";
import { AwakeTime } from "../../packages/core/src/awake-time";
import {
  readTrial,
  type TrialMarker,
  trialPath,
  writeJsonAtomic,
} from "../../packages/core/src/binary-installation";

const [marker] = process.argv.slice(2);
if (!marker) {
  throw new Error("usage: trial-verify-child.ts '<trial marker JSON>'");
}
const trial = JSON.parse(marker) as TrialMarker;
await writeJsonAtomic(trialPath(), trial);
const awake = new AwakeTime().start();
const problem =
  (await verify(trial, 0, awake)) ??
  (await verify((await readTrial()) ?? trial, CONFIRM_MS, awake));
awake.stop();
console.log(`DECIDED ${Date.now()}`);
console.log(`TRIAL ${JSON.stringify((await readTrial()) ?? trial)}`);
console.log(
  problem ? `VERDICT roll-back ${JSON.stringify(problem)}` : "VERDICT confirm"
);
process.exit(0);
