/**
 * Deployed-product proof gate, driven once per harness through chrome-devtools
 * MCP after the parent deploys and restarts the fix. No scratch authentication,
 * copied credentials, environment tokens, or alternate sign-in route.
 *
 * Run: bun .context/withdraw/proof.ts .context/withdraw/deployed.json
 * The browser run records the actual UI observations and screenshot paths.
 * Supporting pre-deploy evidence: real Claude A/B cancellation and started
 * receipt passed; real OpenCode busy-tool and pending-send case established.
 */
import { resolve } from "node:path";

interface Probe {
  harness: "claude" | "opencode" | "pi";
  runs: number;
  rerunAfterAgentRestart?: boolean;
  sessionId?: string;
  result: "withdrawn" | "unsupported" | "not run";
  error?: string;
  queued?: boolean;
  editOffered?: boolean;
  composerRestored?: boolean;
  rowRemoved?: boolean;
  sendReachedTurn?: boolean;
  startedReceipt?: boolean;
  startedRowKept?: boolean;
  archived?: boolean;
  screenshots: string[];
}
interface Evidence {
  deployedCommit: string;
  consoleMessages: string[];
  probes: Probe[];
}

const path = process.argv[2] ?? resolve(import.meta.dir, "deployed.json");
if (!(await Bun.file(path).exists())) {
  throw new Error("The deployed browser run has not been supplied. Await the parent's restart, then run one probe per harness.");
}
const evidence = await Bun.file(path).json() as Evidence;
if (!evidence.deployedCommit || evidence.probes.length !== 3) {
  throw new Error("Evidence must name the deployed commit and exactly three harness attempts.");
}
if (evidence.consoleMessages.some((message) => message.includes("each_key_duplicate"))) {
  throw new Error("The deployed browser emitted each_key_duplicate.");
}
for (const harness of ["claude", "opencode", "pi"] as const) {
  const probes = evidence.probes.filter((probe) => probe.harness === harness);
  if (probes.length !== 1 || !(probes[0].runs === 1 || (probes[0].runs === 2 && probes[0].rerunAfterAgentRestart))) {
    throw new Error(`${harness}: one attempt is required, or the parent's explicitly authorised restart-confounded rerun.`);
  }
  const probe = probes[0];
  if (probe.result === "not run") {
    if (harness !== "pi" || !probe.error) {
      throw new Error(`${harness}: only unavailable pi may be not run, with its exact product error.`);
    }
  } else {
    if (!probe.sessionId || !probe.queued || !probe.archived) {
      throw new Error(`${harness}: missing queued-session or archive evidence.`);
    }
    if (harness === "claude") {
      if (!(probe.result === "withdrawn" && probe.editOffered && probe.composerRestored && probe.rowRemoved && probe.startedReceipt && probe.startedRowKept)) {
        throw new Error("Claude withdrawal, restoration and started-row evidence is incomplete.");
      }
    } else if (!(probe.result === "unsupported" && probe.editOffered === false && probe.sendReachedTurn)) {
      throw new Error(`${harness}: unsupported queued sends must have no Edit and still reach the turn.`);
    }
  }
  if (probe.screenshots.length === 0) {
    throw new Error(`${harness}: browser captures are missing.`);
  }
  for (const screenshot of probe.screenshots) {
    if (!(await Bun.file(resolve(screenshot)).exists())) {
      throw new Error(`Missing capture: ${screenshot}`);
    }
  }
}
console.log("PASS");
