/**
 * Rig driver for the boundary handover: runs the agent's start-up pass over
 * every held workspace (`rearmHooks`, packages/agent/src/boundary.ts)
 * against the sessiond `CAWCO_SESSIOND_ENDPOINT` names, then stays up for
 * SECONDS, so its look at the older boundaries runs: that look's timer keeps
 * no process alive on its own. Run from a checkout:
 *
 *   bun artifacts/srt-eval/rig-rearm.ts SECONDS
 */
import { rearmHooks } from "../../packages/agent/src/boundary";

if (!process.env.CAWCO_SESSIOND_ENDPOINT) {
  throw new Error("name the rig's sessiond in CAWCO_SESSIOND_ENDPOINT");
}
const seconds = Number(process.argv[2] ?? "30");
await rearmHooks();
await Bun.sleep(seconds * 1000);
process.exit(0);
