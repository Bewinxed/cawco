/**
 * `bun scripts/type-roles-check.ts`: a project's delegate type file
 * (hub project-delegate-types.ts `typeFileProblem`) may name every session
 * role but `curator` and `trimmer`. Those are the memory curator's run's and
 * the unused skills and servers routine's run's alone: the hub starts each
 * itself, and each denies shell, edit and web tools, so a type that took
 * one would give its sessions no shell.
 *
 * - `role: curator` is refused with core words/delegate-types.ts
 *   `problemCuratorRole`, word for word; `role: trimmer` with
 *   `problemTrimmerRole`.
 * - Every other role in core `SESSION_ROLES` makes a whole type.
 *
 * Run by `bun run check` (scripts/check.ts); it fails naming each role
 * whose answer differs.
 */
import { SESSION_ROLES } from "../packages/core/src/delegate-types";
import { delegateTypesWords } from "../packages/core/src/words/delegate-types";
import { typeFileProblem } from "../packages/hub/src/project-delegate-types";

const typeFile = (role: string) =>
  `---\nharness: claude\nmodel: claude-opus-5-5\nrole: ${role}\n---\nReads the project's mail.\n`;

const wrong: string[] = [];
for (const role of SESSION_ROLES) {
  const problem = typeFileProblem("delegates/keeper.md", typeFile(role));
  const expected = {
    curator: delegateTypesWords.problemCuratorRole,
    trimmer: delegateTypesWords.problemTrimmerRole,
  }[role as string];
  if (problem !== expected) {
    wrong.push(
      `role ${role}: expected ${expected ? `“${expected}”` : "a whole type"}, got ${problem ? `“${problem}”` : "a whole type"}`
    );
  }
}

if (wrong.length > 0) {
  console.error(`type-roles-check: ${wrong.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `type-roles-check: ${SESSION_ROLES.length} roles, curator and trimmer refused, the rest whole`
);
