/**
 * `bun run roles:check`: each role's listed tools against its token budget
 * (src/role-budgets.ts). Prints every role; exits 1 when one is over.
 */
import { measureRoles } from "../src/role-budgets";

const sizes = measureRoles();
for (const { role, tools, tokens, budget } of sizes) {
  console.log(
    `${role.padEnd(11)} ${String(tools).padStart(3)} tools  ${String(tokens).padStart(6)} tokens  budget ${budget}${tokens > budget ? "  OVER" : ""}`
  );
}
const over = sizes.filter((size) => size.tokens > size.budget);
if (over.length > 0) {
  console.error(
    `Over budget: ${over.map((size) => size.role).join(", ")}. Trim a description or split a tool, or raise ROLE_TOOL_BUDGET with a reason.`
  );
  process.exit(1);
}
