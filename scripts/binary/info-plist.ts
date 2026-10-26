/**
 * Writes CawCo Agent.app's Info.plist (packages/core/src/agent-bundle.ts
 * `AGENT_INFO_PLIST`) to OUTFILE, from the checkout it runs in:
 *
 *   bun scripts/binary/info-plist.ts OUTFILE
 *
 * release.ts runs it in the release commit's build tree, so the plist every
 * darwin bundle signs is that commit's, whichever checkout runs the release.
 */
import { AGENT_INFO_PLIST } from "../../packages/core/src/agent-bundle";

const [outfile] = process.argv.slice(2);
if (!outfile) {
  console.error("usage: bun scripts/binary/info-plist.ts OUTFILE");
  process.exit(2);
}
await Bun.write(outfile, AGENT_INFO_PLIST);
