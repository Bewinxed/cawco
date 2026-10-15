#!/usr/bin/env bun
/**
 * The Decisions tab, live, for a look before it lands:
 *
 *   bun scripts/decisions-preview/run.ts
 *
 * A scratch fleet (a real hub, agent and sessiond with a mock model, nothing
 * of this machine's own), one project in it with the three decision pages
 * seed.ts writes, and the built dashboard served against its hub. Prints
 * where to open the tab and each page, then stands until Ctrl-C, which
 * stops the fleet and removes its folders.
 */
import { ensureDeps } from "../lib/deps";

await ensureDeps();
const { Run } = await import("../probe-kit/kit");
const { MACHINE } = await import("../scratch-fleet");
const { seedDecisions } = await import("./seed");

const run = new Run();
let stop: () => void = () => undefined;
const stopped = new Promise<void>((done) => {
  stop = done;
});
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

await run.spec(
  {
    name: "decisions-preview",
    async run(kit) {
      const fleet = await kit.fleet(() => ({ everyMs: 20, words: ["Ready."] }));
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.fileAccount();
      fleet.launch("agent");
      await fleet.agentUp();
      await fleet.accountSignedIn();
      const seeded = await seedDecisions(fleet, {
        name: "launch-q4",
        machineId: MACHINE,
        cwd: fleet.repo,
      });
      const base = await fleet.dashboard();
      const tab = `${base}/project/${seeded.projectId}?view=decisions`;
      console.log("\nThe Decisions tab, seeded:");
      console.log(`  list:      ${tab}`);
      console.log(`  picking:   ${tab}&page=landing`);
      console.log(`  decided:   ${tab}&page=pricing`);
      console.log(`  graph:     ${tab}&mode=graph`);
      console.log("\nCtrl-C stops the fleet.");
      await stopped;
    },
  },
  false
);
await run.close();
process.exit(run.failures > 0 ? 1 : 0);
