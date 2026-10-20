/**
 * Tailwind writes a `group-*` variant as `X:is(:where(.group)[state] *)`
 * and a `peer-*` one as `X:is(:where(.peer)[state] ~ *)`: the state is an
 * ancestor's or an earlier sibling's of a universal. Chrome keys a rule's
 * invalidation to the compound right of the state, and here that is the
 * universal: the state coming or going restyled every element the group
 * holds, or every sibling after the peer ("Invalidation set invalidates
 * subtree"). The converted tree wrote 427 rules that way where main's
 * component styles named their element, and a tab switch restyled up to
 * twice what main's did. Tailwind writes the shape on purpose and has no
 * setting for another (tailwindlabs/tailwindcss#16214: "It is not currently
 * possible to override these for labelled group/peer variants or for the
 * `group-*` or `peer-*` implementations as a whole").
 *
 * So, where the rules enter the build (vite.config.ts `groupsByCombinator`),
 * each such `:is()` is written as the combinator it stands for: `X:is(A *)`
 * as `A X`, `X:is(P ~ *)` as `P ~ X`. They match the same elements at the
 * same weight (an `:is()` weighs what its argument weighs), and Chrome keys
 * them to X: one element restyled where Tailwind's shape restyled 202, in a
 * group of 200. A compound under several groups (`X:is(A *):is(B *)`) holds
 * where one ancestor is A and one is B, one over the other either way or the
 * same element, so it is written as every such chain, `:is(A B, B A,
 * A:is(B)) X`, each A's weight and B's. A peer's ancestors are its
 * sibling's, so a group over a peer is `A P ~ X`, and a group on a compound
 * after a sibling combinator (`S ~ X:is(A *)`) goes before them all
 * (`A S ~ X`).
 *
 * A group's or peer's `:is()` anywhere else fails the build, as does a sheet
 * with none: Tailwind writing them another way would leave them all.
 */
import postcss, { type AtRule } from "postcss";
import parser from "postcss-selector-parser";

/** What a selector holds: its simple selectors and combinators. */
type Node = parser.Selector["nodes"][number];

const DESCENDANT = " ";
const SIBLING = new Set(["~", "+"]);
const AROUND = new Set([DESCENDANT, ...SIBLING]);
const KEYFRAMES = /keyframes$/i;
const IS = ":is(";

/** What a group's `:is(A *)` or a peer's `:is(P ~ *)` stands on: A or P, and the combinator. */
interface Anchor {
  combinator: string;
  nodes: Node[];
}

/** A group's or a peer's `:is()`'s anchor; null for any other node. */
function anchorOf(node: Node): Anchor | null {
  if (
    node.type !== "pseudo" ||
    node.value !== ":is" ||
    node.nodes.length !== 1
  ) {
    return null;
  }
  const argument = node.nodes[0].nodes;
  const last = argument.at(-1);
  const joint = argument.at(-2);
  if (
    argument.length < 3 ||
    last?.type !== "universal" ||
    joint?.type !== "combinator" ||
    !AROUND.has(joint.value)
  ) {
    return null;
  }
  return { combinator: joint.value, nodes: argument.slice(0, -2) };
}

const isCompound = (nodes: Node[]): boolean =>
  nodes.every((node) => node.type !== "combinator");
const copy = (nodes: Node[]): Node[] => nodes.map((node) => node.clone());
const descendant = (): Node => parser.combinator({ value: DESCENDANT });

/** `:is(…)` of one complex selector. */
function wrapped(nodes: Node[]): Node {
  const inner = parser.selector({ value: "" });
  for (const node of copy(nodes)) {
    inner.append(node);
  }
  const pseudo = parser.pseudo({ value: ":is" });
  pseudo.append(inner);
  return pseudo;
}

/** Every non-empty subset of `items`, the whole last. */
function subsets<T>(items: T[]): T[][] {
  const all: T[][] = [[]];
  for (const item of items) {
    for (const some of all.slice()) {
      all.push([...some, item]);
    }
  }
  return all.slice(1);
}

/**
 * Every way anchors can stand over one another: chains of blocks, the
 * outermost first, a block's anchors on one element.
 */
function orderings<T>(items: T[]): T[][][] {
  if (items.length === 0) {
    return [[]];
  }
  return subsets(items).flatMap((block) =>
    orderings(items.filter((item) => !block.includes(item))).map((tail) => [
      block,
      ...tail,
    ])
  );
}

/** One element under every anchor of a block: the first as written when it is a compound, the others as `:is()`. */
function onOneElement(block: Node[][]): Node[] {
  const [first, ...others] = block;
  const head = isCompound(first) ? copy(first) : [wrapped(first)];
  return [...head, ...others.map(wrapped)];
}

/** The groups' anchors before X: `A ` for one, `:is(A B, B A, A:is(B)) ` for several. */
function groupsBefore(groups: Node[][]): Node[] {
  if (groups.length === 0) {
    return [];
  }
  if (groups.length === 1) {
    return [...copy(groups[0]), descendant()];
  }
  const chains = parser.pseudo({ value: ":is" });
  for (const chain of orderings(groups)) {
    const inner = parser.selector({ value: "" });
    chain.forEach((block, i) => {
      if (i > 0) {
        inner.append(descendant());
      }
      for (const node of onOneElement(block)) {
        inner.append(node);
      }
    });
    chains.append(inner);
  }
  return [chains, descendant()];
}

/** The peer's anchor before X: `P ~ `, as `:is(P) ~ ` under a group when P is not a compound. */
function peerBefore(peer: Anchor | undefined, grouped: boolean): Node[] {
  if (!peer) {
    return [];
  }
  const nodes =
    grouped && !isCompound(peer.nodes)
      ? [wrapped(peer.nodes)]
      : copy(peer.nodes);
  return [...nodes, parser.combinator({ value: peer.combinator })];
}

/** A selector's compounds and the combinators between them. */
function compoundsOf(selector: parser.Selector): {
  compounds: Node[][];
  joints: parser.Combinator[];
} {
  const compounds: Node[][] = [[]];
  const joints: parser.Combinator[] = [];
  for (const node of selector.nodes) {
    if (node.type === "combinator") {
      joints.push(node);
      compounds.push([]);
    } else {
      compounds.at(-1)?.push(node);
    }
  }
  return { compounds, joints };
}

/**
 * The selector with its groups' and peer's `:is()` as combinators; null when
 * it has none. Throws where they cannot be written so.
 */
function unwrapped(selector: parser.Selector): Node[] | null {
  const { compounds, joints } = compoundsOf(selector);
  const at = compounds.findIndex((compound) => compound.some(anchorOf));
  if (at === -1) {
    return null;
  }
  const groups: Node[][] = [];
  const peers: Anchor[] = [];
  const own: Node[] = [];
  for (const node of compounds[at]) {
    const anchor = anchorOf(node);
    if (!anchor) {
      own.push(node);
    } else if (anchor.combinator === DESCENDANT) {
      groups.push(anchor.nodes);
    } else {
      peers.push(anchor);
    }
  }
  const placed =
    compounds.every((compound, i) => i === at || !compound.some(anchorOf)) &&
    joints.slice(0, at).every((joint) => SIBLING.has(joint.value)) &&
    peers.length <= 1 &&
    (peers.length === 0 || at === 0);
  if (!placed) {
    throw new Error(
      `a group's or peer's :is() where no combinator can stand for it: ${selector}`
    );
  }
  const subject = own.length > 0 ? copy(own) : [parser.universal()];
  const rest = compounds.flatMap((compound, i) => [
    ...(i > 0 ? [joints[i - 1].clone()] : []),
    ...(i === at ? subject : copy(compound)),
  ]);
  return [
    ...groupsBefore(groups),
    ...peerBefore(peers[0], groups.length > 0),
    ...rest,
  ];
}

/** `css` with every group's and peer's `:is()` written as its combinator, and how many selectors changed. */
export function groupsAsCombinators(
  css: string,
  from: string
): { css: string; rewritten: number } {
  const root = postcss.parse(css, { from });
  let rewritten = 0;
  const rewrite = parser((selectors) => {
    selectors.each((selector) => {
      const nodes = unwrapped(selector);
      if (!nodes) {
        return;
      }
      selector.removeAll();
      for (const node of nodes) {
        selector.append(node);
      }
      rewritten += 1;
    });
  });
  root.walkRules((rule) => {
    const { parent } = rule;
    if (
      !rule.selector.includes(IS) ||
      (parent?.type === "atrule" && KEYFRAMES.test((parent as AtRule).name))
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
