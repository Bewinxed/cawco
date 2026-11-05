/**
 * An update helper's verdict on a trial, for specs/slow-hub-trial.ts: the
 * helper's own verification (cli binary-apply.ts `verify`), first until the
 * build answers, then held for `CONFIRM_MS`, as its `settle` runs it, with
 * the keeper's handover between the two left out (it touches no probe).
 * Run with the scratch data dir the spec made (`XDG_DATA_HOME`: its
 * `cawco/binary/installation.json` names the hub to probe) and the
 * machine's id (`CAWCO_MACHINE_ID`).
 *
 *   bun scripts/probe-kit/trial-verify-child.ts '<trial marker JSON>'
 *
 * Its last line is `VERDICT confirm` or `VERDICT roll-back <problem JSON>`;
 * every line before it is the helper's own (`update: verify …`).
 */
import { CONFIRM_MS, verify } from "../../packages/cli/src/binary-apply";
import type { TrialMarker } from "../../packages/core/src/binary-installation";

const [marker] = process.argv.slice(2);
if (!marker) {
  throw new Error("usage: trial-verify-child.ts '<trial marker JSON>'");
}
const trial = JSON.parse(marker) as TrialMarker;
const problem = (await verify(trial, 0)) ?? (await verify(trial, CONFIRM_MS));
console.log(
  problem ? `VERDICT roll-back ${JSON.stringify(problem)}` : "VERDICT confirm"
);
process.exit(0);
