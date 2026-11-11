/**
 * `bun scripts/type-starting-set-check.ts`: a project's delegate type file
 * (hub project-delegate-types.ts `typeFileProblem`) names its starting set
 * as `starting_set:` with `skills` and `servers` lists on indented lines
 * under it, and a set that does not read is refused with the sentence that
 * says what to fix.
 *
 * - Inline lists, a block sequence and either list left out make a whole type.
 * - A value on the `starting_set:` line itself, or nothing under it, is
 *   refused naming the indented form.
 * - A field other than skills and servers, a list that does not close, and
 *   a blank name (core `startingSetProblem`) are each refused by name.
 *
 * Run by `bun run check` (scripts/check.ts); it fails naming each file
 * whose answer differs.
 */
import { delegateTypesWords } from "../packages/core/src/words/delegate-types";
import { typeFileProblem } from "../packages/hub/src/project-delegate-types";

const typeFile = (startingSet: string) =>
  `---\nharness: claude\nmodel: claude-opus-5-5\n${startingSet}---\nBuilds what its brief names.\n`;

/** Each file's starting set, and a phrase its refusal carries (undefined: a whole type). */
const CASES: [name: string, startingSet: string, refusal?: string][] = [
  [
    "inline lists",
    'starting_set:\n  skills: [grill, "mattpocock-skills:tdd"]\n  servers: [exa]\n',
  ],
  [
    "a block sequence",
    "starting_set:\n  skills:\n    - grill\n    - show\n  servers: []\n",
  ],
  ["servers left out", "starting_set:\n  skills: [grill]\n"],
  [
    "a value on its line",
    "starting_set: [grill]\n",
    delegateTypesWords.problemStartingSetForm,
  ],
  [
    "a flow mapping",
    "starting_set: { skills: [grill] }\n",
    delegateTypesWords.problemStartingSetForm,
  ],
  [
    "nothing under it",
    "starting_set:\n",
    delegateTypesWords.problemStartingSetForm,
  ],
  [
    "an unknown field",
    "starting_set:\n  skils: [grill]\n",
    "“skils” is not a field of starting_set",
  ],
  ["an unclosed list", "starting_set:\n  skills: [grill\n", "skills is a list"],
  [
    "a blank name",
    'starting_set:\n  skills: [grill, " "]\n',
    delegateTypesWords.problemStartingSetBlank,
  ],
];

const wrong: string[] = [];
for (const [name, startingSet, refusal] of CASES) {
  const problem = typeFileProblem(
    "delegates/builder.md",
    typeFile(startingSet)
  );
  const right = refusal
    ? problem?.startsWith("starting_set") && problem.includes(refusal)
    : problem === undefined;
  if (!right) {
    wrong.push(
      `${name}: expected ${refusal ? `a refusal naming “${refusal}”` : "a whole type"}, got ${problem ? `“${problem}”` : "a whole type"}`
    );
  }
}

if (wrong.length > 0) {
  console.error(`type-starting-set-check: ${wrong.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `type-starting-set-check: ${CASES.length} type files, ${CASES.filter(([, , refusal]) => refusal).length} refused as they should be, the rest whole`
);
