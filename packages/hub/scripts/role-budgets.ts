/**
 * `bun run roles:check`: each role's listed tools against its token budget
 * (src/role-budgets.ts), and the decision-page skill's refusal table
 * (src/skill-refusals.ts). Prints every role and the table; exits 1 when a
 * role is over or the table lacks a refusal.
 */
import { measureRoles } from "../src/role-budgets";
import { missingRefusals, REFUSALS } from "../src/skill-refusals";

const sizes = measureRoles();
for (const { role, tools, tokens, budget } of sizes) {
  console.log(
    `${role.padEnd(11)} ${String(tools).padStart(3)} tools  ${String(tokens).padStart(6)} tokens  budget ${budget}${tokens > budget ? "  OVER" : ""}`
  );
}
const missing = await missingRefusals();
console.log(
  `decision-page refuses ${REFUSALS.length - missing.length} of ${REFUSALS.length} in Before you show it`
);
const over = sizes.filter((size) => size.tokens > size.budget);
if (over.length > 0) {
  console.error(
    `Over budget: ${over.map((size) => size.role).join(", ")}. Trim a description or split a tool, or raise ROLE_TOOL_BUDGET with a reason.`
  );
}
if (missing.length > 0) {
  console.error(
    `decision-page's Before you show it table lacks: ${missing.join("; ")}.`
  );
}
if (over.length > 0 || missing.length > 0) {
  process.exit(1);
}
