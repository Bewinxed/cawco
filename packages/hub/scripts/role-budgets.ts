/**
 * `bun run roles:check`: prints each role's listed tools and token count
 * (src/role-budgets.ts), checks every tool a group lists against the names the
 * hub routes to it (delegation-mcp.ts `unrouted`), and checks the decision-page
 * skill's refusal table (src/skill-refusals.ts). Exits 1 when a listed tool
 * routes nowhere or the table lacks a refusal. `--tools <role>` lists that
 * role's tools by their own tokens too, largest first.
 */

import { unroutedTools } from "../src/delegation-mcp";
import { measureRoles } from "../src/role-budgets";
import { missingRefusals, REFUSALS } from "../src/skill-refusals";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["packages/"];

const asked = process.argv.indexOf("--tools");
const listed = asked === -1 ? undefined : process.argv[asked + 1];
const sizes = measureRoles();
for (const { role, tools, tokens, byTool } of sizes) {
  console.log(
    `${role.padEnd(11)} ${String(tools).padStart(3)} tools  ${String(tokens).padStart(6)} tokens`
  );
  if (role === listed) {
    for (const tool of byTool) {
      console.log(`  ${String(tool.tokens).padStart(6)}  ${tool.name}`);
    }
  }
}
const unrouted = unroutedTools();
console.log(
  unrouted.length === 0
    ? "every listed tool routes to the group that lists it"
    : `listed but routed nowhere: ${unrouted.join(", ")}`
);
const missing = await missingRefusals();
console.log(
  `decision-page refuses ${REFUSALS.length - missing.length} of ${REFUSALS.length} in Before you show it`
);
if (unrouted.length > 0) {
  console.error(
    `Listed and refused at the call: ${unrouted.join(", ")}. Add each to the names its group routes (caw.ts's to roles.ts CAW_PROJECT_TOOLS).`
  );
}
if (missing.length > 0) {
  console.error(
    `decision-page's Before you show it table lacks: ${missing.join("; ")}.`
  );
}
if (unrouted.length > 0 || missing.length > 0) {
  process.exit(1);
}
