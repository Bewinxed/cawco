/**
 * A `group-*` or `peer-*` variant's state is an ancestor's or an earlier
 * sibling's, and Chrome keys a rule's invalidation to the compound right of
 * that state. Tailwind writes a positive one with the utility there,
 * `:is(:where(.group)[state] .x)` (since 4.3.4, tailwindlabs/tailwindcss
 * #20513, "Improve style invalidation performance of `group-*` and `peer-*`
 * variants"), so the state coming or going restyles only what carries `.x`.
 *
 * A negated one (`not-group-*`: `X:not(:is(A *))`) still stands on a
 * universal, and Chrome keyed it to the universal: a session row made
 * current restyled every element in it, a tab chosen every element in the
 * tab (tab-return 1c's pointerup: "Invalidation set invalidates subtree on
 * DIV.group/session-row (by [data-current])", "… on SPAN.group/ff-tab (by
 * [data-tab-item-selected])"). So, where the rules enter the build
 * (vite.config.ts `groupNegationsByClass`), its universal is written as the
 * compound's own class, weightless: `X:not(:is(A :where(.x)))`. It matches
 * what it matched (X carries `.x`, so "not under A" and "not under A with
 * `.x`" are the same for it) at the same weight, and Chrome keys it to `.x`.
 * The compound's class is its own, or, where a positive group variant
 * wrapped the compound (`:is(G .x):not(:is(A *))`), the one its `:is()`
 * ends on.
 *
 * A group's or peer's `:is()` on a universal anywhere else fails the build,
 * as does a sheet with no negated one: Tailwind writing them another way
 * would leave them all.
 */
import postcss from "postcss";
import parser from "postcss-selector-parser";

/** What a selector holds: its simple selectors and combinators. */
type Node = parser.Selector["nodes"][number];

const AROUND = new Set([" ", "~", "+"]);
const KEYFRAMES = /keyframes$/iu;
const IS = ":is(";

/** The universal a group's `:is(A *)` or a peer's `:is(P ~ *)` stands on; null for any other node. */
function universalOf(node: Node): parser.Universal | null {
  if (
    node.type !== "pseudo" ||
    node.value !== ":is" ||
    node.nodes.length !== 1
  ) {
    return null;
  }
  const argument = node.nodes[0]?.nodes ?? [];
  const last = argument.at(-1);
  const joint = argument.at(-2);
  return argument.length >= 3 &&
    last?.type === "universal" &&
    joint?.type === "combinator" &&
    AROUND.has(joint.value)
    ? last
    : null;
}

/** A selector's compounds, the combinators between them left out. */
const compoundsOf = (selector: parser.Selector): Node[][] =>
  selector.nodes.reduce<Node[][]>(
    (compounds, node) => {
      if (node.type === "combinator") {
        compounds.push([]);
      } else {
        compounds.at(-1)?.push(node);
      }
      return compounds;
    },
    [[]]
  );

/**
 * The class a compound's element carries: its own, else the one a positive
 * group's or peer's `:is(G .x)` in it ends on.
 */
function classOf(compound: Node[]): parser.ClassName | undefined {
  const own = compound.find((node) => node.type === "class");
  if (own?.type === "class") {
    return own;
  }
  for (const node of compound) {
    if (node.type !== "pseudo" || node.value !== ":is") {
      continue;
    }
    const [only] = node.nodes;
    const subject = only ? compoundsOf(only).at(-1) : undefined;
    const found = subject?.find((one) => one.type === "class");
    if (only && node.nodes.length === 1 && found?.type === "class") {
      return found;
    }
  }
}

/** The universal of each group's or peer's `:is()` a `:not()` in the compound negates on its own. */
const negatedUniversals = (compound: Node[]): parser.Universal[] =>
  compound.flatMap((node) =>
    node.type === "pseudo" && node.value === ":not"
      ? node.nodes.flatMap((argument) => {
          const [only] = argument.nodes;
          const universal =
            only && argument.nodes.length === 1 ? universalOf(only) : null;
          return universal ? [universal] : [];
        })
      : []
  );

/**
 * Each group's or peer's `:is()` a `:not()` in the selector negates, its
 * universal written as its compound's class, weightless; how many. Throws
 * for one in a compound with no class, and for a group's or peer's `:is()`
 * on a universal outside a `:not()`.
 */
function namedNegations(selector: parser.Selector): number {
  let named = 0;
  for (const compound of compoundsOf(selector)) {
    if (compound.some((node) => universalOf(node))) {
      throw new Error(
        `a group's or peer's :is() on a universal outside a :not(), which Tailwind writes on the utility since 4.3.4: ${selector}`
      );
    }
    const universals = negatedUniversals(compound);
    const own = universals.length > 0 ? classOf(compound) : undefined;
    if (universals.length > 0 && !own) {
      throw new Error(
        `a group's or peer's negated :is() in a compound with no class to key it to: ${selector}`
      );
    }
    for (const universal of universals) {
      const name = parser.selector({ value: "" });
      if (own) {
        name.append(own.clone());
      }
      const where = parser.pseudo({ value: ":where" });
      where.append(name);
      universal.replaceWith(where);
      named += 1;
    }
  }
  return named;
}

/** `css` with every negated group's and peer's `:is()` keyed to its compound's class, and how many selectors changed. */
export function groupNegationsKeyed(
  css: string,
  from: string
): { css: string; rewritten: number } {
  const root = postcss.parse(css, { from });
  let rewritten = 0;
  const rewrite = parser((selectors) => {
    selectors.each((selector) => {
      rewritten += namedNegations(selector);
    });
  });
  root.walkRules((rule) => {
    const { parent } = rule;
    if (
      !rule.selector.includes(IS) ||
      (parent?.type === "atrule" &&
        "name" in parent &&
        KEYFRAMES.test(String(parent.name)))
    ) {
      return;
    }
    const next = rewrite.processSync(rule.selector);
    if (next !== rule.selector) {
      rule.selector = next;
    }
  });
  return { css: root.toString(), rewritten };
}
