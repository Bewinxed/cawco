/**
 * `fetch` is the platform's own, everywhere a caller of the hub reads it: no
 * module or function binds the name to another sender (`const fetch =
 * provenFetch`, `import { provenFetch as fetch }`). A sender that carries a
 * credential (the agent's `provenFetch`, a machine's `machineFetch`) is called by its own name, so a call that reads
 * `fetch` sends without one, and a reader sees that it does.
 *
 * The agent's update loop bound `fetch` to `provenFetch` this way; moved onto
 * core's door, whose sender defaulted to the platform's `fetch`, its calls
 * went out with no machine proof, and a hub requiring paired devices refused
 * them as anonymous (the nightly from 886030601). core's `fetchHub` now takes
 * its sender at every call; this keeps the name from meaning two things.
 *
 * A parameter named `fetch` stands (a SvelteKit load's own, handed in), and
 * so does an assignment to `globalThis.fetch` or a property named `fetch`.
 * golar.config.ts runs it over the same files as house/hub-path-by-hand;
 * scripts/lint/fixtures/fetch-alias.ts holds what it must report.
 */
import { defineRule } from "golar/unstable";
import {
  isIdentifier,
  isImportSpecifier,
  isVariableDeclaration,
  type Node,
  type SourceFile,
} from "golar/unstable-tsgo";

const MESSAGE =
  "`fetch` bound to another sender: call a credentialed sender by its own name (provenFetch, machineFetch), so a call that reads `fetch` is the platform's and sends no credential.";

export const noFetchAlias = defineRule({
  name: "house/no-fetch-alias",
  setup(context) {
    const file: SourceFile = context.sourceFile;
    const visit = (node: Node): void => {
      const bound =
        (isVariableDeclaration(node) && node.name) ||
        (isImportSpecifier(node) && node.propertyName && node.name);
      if (bound && isIdentifier(bound) && bound.text === "fetch") {
        context.report({
          message: MESSAGE,
          range: { begin: bound.getStart(file), end: bound.end },
        });
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  },
});
