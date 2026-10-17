/// <reference lib="dom" />
/**
 * `bun .cutover/i2-selectors.ts [--renamed] <before> <after>`: the proof
 * that a change of selectors left every element's style as it was. Each
 * side is a built stylesheet, or a build's folder of them (chunks paired by
 * name). Without `--renamed` the elements are the same on both sides
 * (apps/dashboard/group-selectors.ts: `before` is the build without the
 * transform, `after` with it); with it, the change renamed the hooks the
 * selectors read, in the markup as in the rules (the hook attributes of
 * integration 2's step 9).
 *
 * 1. Every rule of the two sides, in order, as Chromium reads it: the
 *    at-rules around it and its declarations must be the same, and only
 *    selectors may differ, a component's scope hash aside (Svelte names it
 *    for its stylesheet's text). Each selector that differs is a pair.
 * 2. Each pair's selector is written as elements (a witness): every compound
 *    an element with its classes, attributes and tags, its `:hover`-like
 *    states forced through the CDP, a group's `:is(A *)` an ancestor, a
 *    peer's `:is(P ~ *)` an earlier sibling, a `:has()` its content. Under
 *    several groups, one witness for every way they can stand over one
 *    another. Then one witness for each part taken back (an attribute left
 *    off, a state not forced, a `:not()` met): each group's or peer's anchor
 *    part, and with `--renamed` every part of every compound, the scope
 *    class aside. Without `--renamed` both sides read the before-selector's
 *    witnesses; with it each side its own, and a hook kept beside its new
 *    name (`KEPT`) stays on the after-side's element too.
 * 3. On a page with only the pairs' rules and witnesses, each side's
 *    subject must match its rule in every witness with all its parts and in
 *    none with one taken back, the same on both sides; and where both match,
 *    Chromium's own specificity of the two (CSS.getMatchedStylesForNode)
 *    must be the same.
 * 4. On a page with the whole of each side, every witness's subject (and
 *    its pseudo-element) must compute the same on both, at the desk's and
 *    the phone's width.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type Browser,
  type CDPSession,
  chromium,
  type Page,
} from "playwright-core";

const root = resolve(import.meta.dir, "..");
const appRequire = createRequire(join(root, "apps/dashboard/package.json"));
const parser = (
  await import(
    pathToFileURL(appRequire.resolve("postcss-selector-parser")).href
  )
).default;

// postcss-selector-parser's nodes, as far as the witness reads them.
interface SelNode {
  attribute?: string;
  nodes?: SelNode[];
  operator?: string;
  type: string;
  value?: string;
}

/** An element of a witness. */
interface El {
  attrs: Record<string, string>;
  classes: string[];
  force: string[];
  kids: El[];
  /** Elements after it under the same parent (a `:has(~ x)`, a `:last-child` taken back). */
  next: El[];
  /** Elements before it under the same parent (a `:first-child` taken back). */
  prev: El[];
  /** The subject's pseudo-element, when the selector ends in one. */
  pseudo?: string;
  subject?: boolean;
  tag: string;
}

/**
 * A renamed hook whose element keeps its old attribute beside it (a kit
 * part keeps its `data-slot`; DelegateTail's row keeps `data-kind`): the
 * old attribute and its value, `null` for the new one's.
 */
const KEPT: Record<string, [string, string | null]> = {
  "data-ff-tab": ["data-slot", "ff-tab"],
  "data-hit": ["data-slot", "hit"],
  "data-editor": ["data-slot", "editor"],
  "data-thinking-step-icon": ["data-slot", "thinking-step-icon"],
  "data-delegate-tail-kind": ["data-kind", null],
};

const FORCED = new Set([
  ":hover",
  ":active",
  ":focus",
  ":focus-visible",
  ":focus-within",
  ":visited",
  ":target",
]);
const PSEUDO_ELEMENT =
  /^::?(before|after|placeholder|selection|marker|backdrop|first-line|first-letter|file-selector-button|-webkit-[a-z-]+)$/;
const LISTS = new Set([":is", ":where", ":matches", ":any"]);
const SIBLINGS = new Set(["~", "+"]);
const AROUND = new Set([" ", "~", "+"]);
const OTHER_TAG = ["div", "span"];
const SCOPE = /^svelte-[a-z0-9]+$/;
const SCOPE_ANYWHERE = /svelte-[a-z0-9]+/g;
const FIELD = /:(.*)/s;

/** A selector list's selectors: its commas outside brackets, strings and escapes. */
function selectorsOf(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let from = 0;
  for (let i = 0; i < list.length; i += 1) {
    const ch = list[i];
    if (ch === "\\") {
      i += 1;
    } else if (quote) {
      quote = ch === quote ? "" : quote;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(" || ch === "[") {
      depth += 1;
    } else if (ch === ")" || ch === "]") {
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      out.push(list.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(list.slice(from).trim());
  return out;
}

const el = (): El => ({
  attrs: {},
  classes: [],
  force: [],
  kids: [],
  next: [],
  prev: [],
  tag: "div",
});

const unsupported = new Map<string, number>();
const note = (what: string) =>
  unsupported.set(what, (unsupported.get(what) ?? 0) + 1);

/** A group's `:is(A *)` or a peer's `:is(P ~ *)`: its anchor and combinator; null for any other node. */
function anchorOf(
  node: SelNode
): { nodes: SelNode[]; combinator: string } | null {
  if (
    node.type !== "pseudo" ||
    node.value !== ":is" ||
    node.nodes?.length !== 1
  ) {
    return null;
  }
  const argument = node.nodes[0].nodes ?? [];
  const last = argument.at(-1);
  const joint = argument.at(-2);
  if (
    argument.length < 3 ||
    last?.type !== "universal" ||
    joint?.type !== "combinator" ||
    !AROUND.has(joint.value ?? "")
  ) {
    return null;
  }
  return { nodes: argument.slice(0, -2), combinator: joint.value ?? "" };
}

const isCompound = (nodes: SelNode[]) =>
  nodes.every((n) => n.type !== "combinator");

/** A component's scope (its class, or `:where()` of it), a pseudo-element, a universal or `&`: no part to take back. */
function isFixed(node: SelNode): boolean {
  if (node.type === "class") {
    return SCOPE.test(node.value ?? "");
  }
  if (node.type === "pseudo") {
    const args = node.nodes ?? [];
    return (
      PSEUDO_ELEMENT.test(node.value ?? "") ||
      (node.value === ":where" &&
        args.length === 1 &&
        args[0].nodes?.length === 1 &&
        isFixed(args[0].nodes[0]))
    );
  }
  return node.type === "universal" || node.type === "nesting";
}

/** A selector's compounds and the combinators between them. */
function split(nodes: SelNode[]): {
  compounds: SelNode[][];
  joints: string[];
} {
  const compounds: SelNode[][] = [[]];
  const joints: string[] = [];
  for (const node of nodes) {
    if (node.type === "combinator") {
      joints.push(node.value ?? " ");
      compounds.push([]);
    } else {
      compounds.at(-1)?.push(node);
    }
  }
  return { compounds, joints };
}

/** Context a compound's `:is()` and `:has()` ask of the tree around its element. */
interface Needs {
  /** Ancestor chains, outermost first, each above the whole witness. */
  above: El[][];
  /** Earlier siblings of the element. */
  before: El[];
}

/** Makes `target` meet one simple selector, or not meet it when `off`. */
function meet(target: El, node: SelNode, needs: Needs, off: boolean): void {
  const name = (node.value ?? "").toLowerCase();
  switch (node.type) {
    case "class":
      if (!off) {
        target.classes.push(node.value ?? "");
      }
      return;
    case "id":
      if (!off) {
        target.attrs.id = node.value ?? "";
      }
      return;
    case "tag":
      // Taken back, the element is another.
      target.tag = off ? OTHER_TAG[name === "div" ? 1 : 0] : name;
      return;
    case "attribute":
      if (!off) {
        target.attrs[node.attribute ?? ""] = node.value ?? "";
      }
      return;
    case "universal":
    case "nesting":
      return;
    case "pseudo":
      meetPseudo(target, node, name, needs, off);
      return;
    default:
      note(`node ${node.type}`);
  }
}

/** A list's first selector, met on the element, or the context it asks for around it. */
function meetList(target: El, node: SelNode, needs: Needs): void {
  const first = node.nodes?.[0]?.nodes ?? [];
  const anchor = anchorOf(node);
  if (anchor) {
    placeAnchor(anchor, needs);
  } else if (isCompound(first)) {
    for (const part of first) {
      meet(target, part, needs, false);
    }
  } else {
    // `:is(X > *)`: X the element's parent, written as an ancestor above all.
    const { compounds } = split(first);
    needs.above.push(compounds.slice(0, -1).map((c) => built(c, needs)));
  }
}

/** A `:not()`: nothing to meet; taken back, its argument met (what stands left of its subject as ancestors). */
function meetNot(target: El, node: SelNode, needs: Needs, off: boolean): void {
  if (!off) {
    return;
  }
  const { compounds } = split(node.nodes?.[0]?.nodes ?? []);
  for (const part of compounds.at(-1) ?? []) {
    meet(target, part, needs, false);
  }
  if (compounds.length > 1) {
    needs.above.push(compounds.slice(0, -1).map((c) => built(c, needs)));
  }
}

function meetPseudo(
  target: El,
  node: SelNode,
  name: string,
  needs: Needs,
  off: boolean
): void {
  if (PSEUDO_ELEMENT.test(name)) {
    target.pseudo = name.startsWith("::") ? name : `:${name}`;
  } else if (name === ":not") {
    meetNot(target, node, needs, off);
  } else if (off) {
    // Taken back, a forced state is left unforced, a list or `:has()` unmet.
    meetElementState(target, name, true);
  } else if (FORCED.has(name)) {
    target.force.push(name.slice(1));
  } else if (LISTS.has(name)) {
    meetList(target, node, needs);
  } else if (name === ":has") {
    hasContent(target, node.nodes?.[0]?.nodes ?? []);
  } else {
    meetElementState(target, name, false);
  }
}

function meetElementState(target: El, name: string, off: boolean): void {
  switch (name) {
    case ":disabled":
      target.tag = "button";
      if (!off) {
        target.attrs.disabled = "";
      }
      return;
    case ":enabled":
      target.tag = "button";
      if (off) {
        target.attrs.disabled = "";
      }
      return;
    case ":checked":
      target.tag = "input";
      target.attrs.type = "checkbox";
      if (!off) {
        target.attrs.checked = "";
      }
      return;
    case ":open":
      target.tag = "details";
      if (!off) {
        target.attrs.open = "";
      }
      return;
    case ":placeholder-shown":
      target.tag = "input";
      if (!off) {
        target.attrs.placeholder = "x";
      }
      return;
    case ":first-child":
      if (off) {
        target.prev.push(el());
      }
      return;
    case ":last-child":
    case ":only-child":
      if (off) {
        target.next.push(el());
      }
      return;
    case ":empty":
      if (off) {
        target.kids.push(el());
      }
      return;
    // Met elsewhere (`meetPseudo`); taken back, they are simply not met.
    case ":hover":
    case ":active":
    case ":focus":
    case ":focus-visible":
    case ":focus-within":
    case ":visited":
    case ":target":
    case ":is":
    case ":where":
    case ":matches":
    case ":any":
    case ":has":
      return;
    default:
      note(`pseudo ${name}`);
  }
}

/** A `:has()`'s argument as the element's content or later siblings. */
function hasContent(target: El, nodes: SelNode[]): void {
  const lead = nodes[0]?.type === "combinator" ? (nodes[0].value ?? " ") : " ";
  const rest = nodes[0]?.type === "combinator" ? nodes.slice(1) : nodes;
  const tree = witness(rest, { orders: [], off: -1, order: -1, every: false });
  if (SIBLINGS.has(lead)) {
    target.next.push(tree.top);
  } else {
    target.kids.push(tree.top);
  }
}

/** A group's anchor above the witness, a peer's before its element. */
function placeAnchor(
  anchor: { nodes: SelNode[]; combinator: string },
  needs: Needs
): void {
  const { compounds } = split(anchor.nodes);
  const chain = compounds.map((c) => built(c, needs));
  if (anchor.combinator === " ") {
    needs.above.push(chain);
  } else {
    needs.before.push(...chain);
  }
}

function built(compound: SelNode[], needs: Needs): El {
  const out = el();
  for (const node of compound) {
    meet(out, node, needs, false);
  }
  return out;
}

/**
 * How a witness is written: `orders` the orderings of the subject's groups
 * and `order` the one that stands (-1 under none); `off` the part taken back
 * (-1 for none), counted over the anchors' parts, and with `every` over
 * every compound's own parts first.
 */
interface Plan {
  every: boolean;
  off: number;
  order: number;
  orders: number[][][];
}

/** A non-group anchor: its compounds as elements, the part `taken` back. */
function anchorChain(parts: SelNode[], taken: boolean[], needs: Needs): El[] {
  const { compounds } = split(parts);
  const chain = compounds.map(() => el());
  let k = 0;
  compounds.forEach((c, ci) => {
    for (const p of c) {
      meet(chain[ci], p, needs, taken[k]);
      k += 1;
    }
    // the combinator after it
    k += 1;
  });
  return chain;
}

/** The subject's groups, one element for each block of the ordering that stands. */
function groupChain(
  groups: { part: SelNode; off: boolean }[][],
  plan: Plan,
  needs: Needs
): El[] {
  const ordering = plan.orders[plan.order] ?? [groups.map((_, g) => g)];
  return ordering.map((block) => {
    const one = el();
    for (const g of block) {
      for (const { part, off } of groups[g]) {
        meet(one, part, needs, off);
      }
    }
    return one;
  });
}

/** An anchor's parts: a group's kept for its ordering, any other's written above or before. */
function placeParts(
  anchor: { nodes: SelNode[]; combinator: string },
  plan: Plan,
  needs: Needs,
  count: { part: number },
  groups: { part: SelNode; off: boolean }[][]
): void {
  const parts = anchor.nodes;
  const taken = parts.map((_, j) => count.part + j === plan.off);
  count.part += parts.length;
  if (anchor.combinator !== " ") {
    needs.before.push(...anchorChain(parts, taken, needs));
  } else if (isCompound(parts) && plan.order >= 0) {
    groups.push(parts.map((p, j) => ({ part: p, off: taken[j] })));
  } else {
    needs.above.push(anchorChain(parts, taken, needs));
  }
}

/** A compound's element, its anchors' context put in `needs`; `count` the parts counted so far. */
function compoundElement(
  compound: SelNode[],
  plan: Plan,
  needs: Needs,
  count: { part: number }
): El {
  const target = el();
  const groups: { part: SelNode; off: boolean }[][] = [];
  for (const node of compound) {
    const anchor = anchorOf(node);
    if (anchor) {
      placeParts(anchor, plan, needs, count, groups);
    } else {
      const counted = plan.every && !isFixed(node);
      meet(target, node, needs, counted && count.part === plan.off);
      count.part += counted ? 1 : 0;
    }
  }
  if (groups.length > 0) {
    needs.above.push(groupChain(groups, plan, needs));
  }
  return target;
}

/** A selector's witness, as `plan` writes it. */
function witness(nodes: SelNode[], plan: Plan): { top: El; subject: El } {
  const { compounds, joints } = split(nodes);
  const needs: Needs = { above: [], before: [] };
  const levels: El[][] = [];
  const count = { part: 0 };
  const elements = compounds.map((compound, i) => {
    const target = compoundElement(compound, plan, needs, count);
    if (i === 0 || !SIBLINGS.has(joints[i - 1])) {
      levels.push([target]);
    } else {
      levels.at(-1)?.push(target);
    }
    return target;
  });
  const subject = elements.at(-1) as El;
  levels
    .at(-1)
    ?.splice(levels.at(-1)?.indexOf(subject) ?? 0, 0, ...needs.before);
  const all = [
    ...needs.above.flatMap((chain) => chain.map((e) => [e])),
    ...levels,
  ];
  for (let i = all.length - 2; i >= 0; i -= 1) {
    const spine = all[i].at(-1) as El;
    spine.kids.push(...all[i + 1]);
  }
  const top = el();
  top.kids.push(...all[0]);
  return { top, subject };
}

/** Every non-empty subset of `items`, the whole last (as group-selectors.ts). */
function subsets<T>(items: T[]): T[][] {
  const all: T[][] = [[]];
  for (const item of items) {
    for (const some of all.slice()) {
      all.push([...some, item]);
    }
  }
  return all.slice(1);
}

/** Every way n anchors can stand over one another: blocks, outermost first, all on one element last. */
function orderings(n: number): number[][][] {
  const go = (items: number[]): number[][][] =>
    items.length === 0
      ? [[]]
      : subsets(items).flatMap((block) =>
          go(items.filter((item) => !block.includes(item))).map((tail) => [
            block,
            ...tail,
          ])
        );
  return go(Array.from({ length: n }, (_, i) => i));
}

interface Witness {
  key: string;
  on: boolean;
  pair: number;
  top: El;
}

interface Pair {
  after: string;
  before: string;
  path: string;
}

/**
 * A selector's parts that can be taken back, each with the anchor it is in
 * (-1 for a compound's own), and how many groups stand on its subject.
 */
function shape(
  nodes: SelNode[],
  every: boolean
): { parts: { text: string; anchor: number }[]; groups: number } {
  const own: { text: string; anchor: number }[] = [];
  const anchored: { text: string; anchor: number }[] = [];
  let groups = 0;
  nodes.forEach((node, at) => {
    const anchor = anchorOf(node);
    if (!anchor) {
      if (every && node.type !== "combinator" && !isFixed(node)) {
        own.push({ text: String(node).trim(), anchor: -1 });
      }
      return;
    }
    anchored.push(
      ...anchor.nodes.map((p) => ({ text: String(p).trim(), anchor: at }))
    );
    if (anchor.combinator === " " && isCompound(anchor.nodes)) {
      groups += 1;
    }
  });
  // `witness` counts in document order: a compound's own parts and its
  // anchors' interleave as they stand.
  const parts: { text: string; anchor: number }[] = [];
  let o = 0;
  let a = 0;
  for (const node of nodes) {
    const anchor = anchorOf(node);
    if (anchor) {
      parts.push(...anchored.slice(a, a + anchor.nodes.length));
      a += anchor.nodes.length;
    } else if (every && node.type !== "combinator" && !isFixed(node)) {
      parts.push(own[o]);
      o += 1;
    }
  }
  return { parts, groups };
}

const nodesOf = (selector: string): SelNode[] =>
  parser().astSync(selector).nodes[0].nodes;

/**
 * A pair's witnesses on one side: one for every ordering of its groups with
 * all its parts met, then one for each part taken back, every group on one
 * element (an anchor on an element of its own would still be met by
 * another's element carrying the same parts). A part another anchor shares
 * cannot be taken back alone and is left.
 */
function witnessesOf(selector: string, i: number, every: boolean): Witness[] {
  const out: Witness[] = [];
  const nodes = nodesOf(selector);
  const { parts, groups } = shape(nodes, every);
  const orders =
    groups > 1
      ? orderings(groups)
      : [[Array.from({ length: groups }, (_, g) => g)]];
  const one = groups > 0 ? orders.length - 1 : -1;
  const make = (key: string, on: boolean, off: number, order: number) => {
    const { top, subject } = witness(nodes, { every, off, order, orders });
    subject.subject = true;
    out.push({ key: `${i}:${key}`, pair: i, on, top });
  };
  orders.forEach((_, o) => {
    make(`on${o}`, true, -1, groups > 0 ? o : -1);
  });
  parts.forEach((part, off) => {
    const shared = parts.some(
      (twin) =>
        twin.anchor >= 0 &&
        twin.anchor !== part.anchor &&
        twin.text === part.text
    );
    if (!shared) {
      make(`off${off}`, false, off, one);
    }
  });
  return out;
}

/** Puts back on each after-side element the old hook a kept one stands beside. */
function keep(spec: El): void {
  for (const [name, [old, value]] of Object.entries(KEPT)) {
    if (name in spec.attrs && !(old in spec.attrs)) {
      spec.attrs[old] = value ?? spec.attrs[name];
    }
  }
  for (const kid of [...spec.kids, ...spec.next, ...spec.prev]) {
    keep(kid);
  }
}

// --- Chromium -------------------------------------------------------------

interface Flat {
  path: string;
  selector: string | null;
  text: string;
}

/** Every rule of a sheet, depth first, as Chromium parsed it. */
function rulesOf(page: Page, css: string): Promise<Flat[]> {
  return page.evaluate((text) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    const out: { path: string; selector: string | null; text: string }[] = [];
    const walk = (list: CSSRuleList, path: string) => {
      for (const rule of list) {
        if (rule instanceof CSSStyleRule) {
          out.push({
            path,
            selector: rule.selectorText,
            text: rule.style.cssText,
          });
          // A nested rule's path is its at-rules: its parent's selector is
          // compared as the parent's own.
          if (rule.cssRules.length > 0) {
            walk(rule.cssRules, `${path} > &`);
          }
        } else if ("cssRules" in rule && !(rule instanceof CSSKeyframesRule)) {
          const head = rule.cssText.slice(0, rule.cssText.indexOf("{")).trim();
          walk((rule as CSSGroupingRule).cssRules, `${path} > ${head}`);
        } else {
          out.push({ path, selector: null, text: rule.cssText });
        }
      }
    };
    walk(sheet.cssRules, "");
    return out;
  }, css);
}

/**
 * Builds the witnesses in the page, each in its own box, and forces their
 * states; answers the document's node, which later reads go through (asking
 * for the document again would drop the forced states).
 */
async function mount(
  page: Page,
  cdp: CDPSession,
  list: Witness[]
): Promise<number> {
  await page.evaluate((items) => {
    const SVG_NS = "http://www.w3.org/2000/svg";
    const svg = new Set([
      "svg",
      "path",
      "use",
      "circle",
      "rect",
      "g",
      "line",
      "polyline",
      "polygon",
      "ellipse",
      "text",
      "defs",
      "symbol",
      "mask",
      "clippath",
    ]);
    const make = (spec: El, key: string): Element => {
      const node = svg.has(spec.tag)
        ? document.createElementNS(SVG_NS, spec.tag)
        : document.createElement(spec.tag);
      for (const c of spec.classes) {
        node.classList.add(c);
      }
      for (const [k, v] of Object.entries(spec.attrs)) {
        node.setAttribute(k, v);
      }
      if (spec.force.length > 0) {
        node.setAttribute("data-i2-force", spec.force.join(" "));
      }
      if (spec.subject) {
        node.setAttribute("data-i2-subject", key);
        if (spec.pseudo) {
          node.setAttribute("data-i2-pseudo", spec.pseudo);
        }
      }
      fill(node, spec.kids, key);
      return node;
    };
    const fill = (parent: Element, kids: El[], key: string) => {
      for (const kid of kids) {
        for (const before of kid.prev) {
          parent.append(make(before, key));
        }
        parent.append(make(kid, key));
        for (const after of kid.next) {
          parent.append(make(after, key));
        }
      }
    };
    document.body.replaceChildren(
      ...items.map((w) => {
        const box = document.createElement("section");
        box.setAttribute("data-i2-witness", w.key);
        fill(box, w.top.kids, w.key);
        return box;
      })
    );
  }, list);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root: doc } = await cdp.send("DOM.getDocument", { depth: 0 });
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
    nodeId: doc.nodeId,
    selector: "[data-i2-force]",
  });
  await Promise.all(
    nodeIds.map(async (nodeId) => {
      const { attributes } = await cdp.send("DOM.getAttributes", { nodeId });
      const at = attributes.indexOf("data-i2-force");
      await cdp.send("CSS.forcePseudoState", {
        nodeId,
        forcedPseudoClasses: attributes[at + 1].split(" "),
      });
    })
  );
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      if (a instanceof CSSTransition) {
        a.finish();
      } else {
        a.pause();
        a.currentTime = 0;
      }
    }
  });
  return doc.nodeId;
}

/** Each subject's computed style (and its pseudo-element's), as one string. */
function computed(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    // By name: a page lists its custom properties in an order of its own.
    const text = (style: CSSStyleDeclaration) =>
      [...style]
        .sort()
        .map((name) => `${name}:${style.getPropertyValue(name)}`)
        .join("\n");
    for (const node of document.querySelectorAll("[data-i2-subject]")) {
      const key = node.getAttribute("data-i2-subject") ?? "";
      const pseudo = node.getAttribute("data-i2-pseudo");
      out[key] = text(getComputedStyle(node));
      if (pseudo) {
        out[`${key}${pseudo}`] = text(getComputedStyle(node, pseudo));
      }
    }
    return out;
  });
}

/** Each subject's match of its own pair's rule (`--i2-<side>-<pair>`, 1 or 0). */
function matchesOf(page: Page, side: string): Promise<Record<string, string>> {
  return page.evaluate((prop) => {
    const out: Record<string, string> = {};
    for (const node of document.querySelectorAll("[data-i2-subject]")) {
      const key = node.getAttribute("data-i2-subject") ?? "";
      const style = getComputedStyle(node, node.getAttribute("data-i2-pseudo"));
      out[key] = style
        .getPropertyValue(`--i2-${prop}-${key.split(":")[0]}`)
        .trim();
    }
    return out;
  }, side);
}

/** Chromium's specificity of the rule setting `prop` that matched the subject `key`. */
async function weightOf(
  cdp: CDPSession,
  doc: number,
  key: string,
  prop: string
): Promise<string | null> {
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: doc,
    selector: `[data-i2-subject="${key}"]`,
  });
  const styles = await cdp.send("CSS.getMatchedStylesForNode", { nodeId });
  const all = [
    ...(styles.matchedCSSRules ?? []),
    ...(styles.pseudoElements ?? []).flatMap((p) => p.matches),
  ];
  const m = all.find((r) =>
    r.rule.style.cssProperties.some((c) => c.name === prop)
  );
  const s = m?.rule.selectorList.selectors[m.matchingSelectors[0]]?.specificity;
  return s ? `${s.a},${s.b},${s.c}` : null;
}

/** A side's sheets: a file, or a folder's `.css` files by chunk name. */
function sheetsOf(path: string): Map<string, string> {
  const files = statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((f) => f.endsWith(".css"))
        .map((f) => join(path, f))
    : [path];
  return new Map(
    files.map((f) => [basename(f).split(".")[0], readFileSync(f, "utf8")])
  );
}

const unscoped = (text: string) => text.replaceAll(SCOPE_ANYWHERE, "svelte-*");
/** A rule's place and declarations, its selector aside. */
const keyOf = (r: Flat) =>
  `${unscoped(r.path)}\u0000${r.selector === null ? "@" : "s"}\u0000${unscoped(r.text)}`;
const PROPERTY = /(?:^|;)\s*([-\w]+)\s*:/g;
const propertiesOf = (text: string) =>
  new Set([...text.matchAll(PROPERTY)].map((m) => m[1]));

/**
 * The two sides' rules lined up by place and declarations: in order where
 * they stand the same, by the longest common run where they do not; a rule
 * found on both sides outside it moved.
 */
function align(b: Flat[], a: Flat[]) {
  const kb = b.map(keyOf);
  const ka = a.map(keyOf);
  if (kb.length === ka.length && kb.every((k, at) => k === ka[at])) {
    return {
      same: kb.map((_, at): [number, number] => [at, at]),
      moved: [],
      lone: [],
    };
  }
  const { same, leftB, leftA } = commonRun(kb, ka);
  const moved: [number, number][] = [];
  const lone: string[] = [];
  for (const bi of leftB) {
    const at = leftA.findIndex((aj) => ka[aj] === kb[bi]);
    if (at === -1) {
      lone.push(`before ${bi}: ${b[bi].selector ?? b[bi].text.slice(0, 120)}`);
    } else {
      moved.push([bi, leftA[at]]);
      leftA.splice(at, 1);
    }
  }
  for (const aj of leftA) {
    lone.push(`after ${aj}: ${a[aj].selector ?? a[aj].text.slice(0, 120)}`);
  }
  return { same, moved, lone };
}

/** The longest common run of two key lists, and what each side has outside it. */
function commonRun(kb: string[], ka: string[]) {
  const n = kb.length;
  const m = ka.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        kb[i] === ka[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const same: [number, number][] = [];
  const leftB: number[] = [];
  const leftA: number[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && kb[i] === ka[j]) {
      same.push([i, j]);
      i += 1;
      j += 1;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      leftA.push(j);
      j += 1;
    } else {
      leftB.push(i);
      i += 1;
    }
  }
  return { same, leftB, leftA };
}

/** A chunk's rules on both sides: its selector pairs, and what else differs (logged). */
function chunkPairs(chunk: string, b: Flat[], a: Flat[]) {
  const pairs: Pair[] = [];
  let other = 0;
  let crossed = 0;
  const { same, moved, lone } = align(b, a);
  for (const line of lone) {
    other += 1;
    console.log(`OTHER ${chunk} ${line}`);
  }
  for (const [bi, ai] of [...same, ...moved]) {
    const bs = selectorsOf(b[bi].selector ?? "");
    const as = selectorsOf(a[ai].selector ?? "");
    if (bs.length === as.length) {
      bs.forEach((s, j) => {
        if (unscoped(s) !== unscoped(as[j])) {
          pairs.push({
            before: s,
            after: as[j],
            path: `${chunk} ${b[bi].path}`,
          });
        }
      });
    } else {
      other += 1;
      console.log(`LIST ${chunk}: ${b[bi].selector} | ${a[ai].selector}`);
    }
  }
  // A moved rule changed places only with the rules it crossed: none may
  // set a property it sets.
  for (const [bi, ai] of moved) {
    const props = propertiesOf(b[bi].text);
    const crossing = same.filter(([sb, sa]) => sb < bi !== sa < ai);
    for (const [xb, xa] of crossing) {
      const shared = [...propertiesOf(b[xb].text)].filter((p) => props.has(p));
      if (shared.length > 0) {
        crossed += 1;
        console.log(
          `CROSSED ${chunk}: ${b[bi].selector} past ${b[xb].selector} (after ${xa}), both setting ${shared.join(", ")}`
        );
      }
    }
    console.log(`MOVED ${chunk}: ${b[bi].selector} | ${a[ai].selector}`);
  }
  return { pairs, other, moved: moved.length, crossed };
}

/** 1. The sides differ in selectors alone, and in the order of rules no element could take a property from both of. */
async function pairsOf(
  page: Page,
  beforeSheets: Map<string, string>,
  afterSheets: Map<string, string>
): Promise<Pair[]> {
  const chunks = await Promise.all(
    [...beforeSheets].map(async ([chunk, beforeCss]) => {
      const afterCss = afterSheets.get(chunk);
      if (afterCss === undefined) {
        console.log(`CHUNK ${chunk}: none after`);
        return { rules: 0, pairs: [], other: 1, moved: 0, crossed: 0 };
      }
      const [b, a] = await Promise.all([
        rulesOf(page, beforeCss),
        rulesOf(page, afterCss),
      ]);
      return { rules: b.length, ...chunkPairs(chunk, b, a) };
    })
  );
  const sum = (key: "rules" | "other" | "moved" | "crossed") =>
    chunks.reduce((total, chunk) => total + chunk[key], 0);
  const pairs = chunks.flatMap((chunk) => chunk.pairs);
  console.log(
    `rules ${sum("rules")} in ${beforeSheets.size} sheets; selectors changed ${pairs.length}; rules that moved ${sum("moved")}, past a rule setting a property they set ${sum("crossed")}; anything else differing ${sum("other")}`
  );
  return pairs;
}

/** 2. The witnesses, each side's. */
function witnessLists(pairs: Pair[], renamed: boolean) {
  let offsLeft = 0;
  const beforeList: Witness[] = [];
  const afterList: Witness[] = [];
  pairs.forEach((pair, i) => {
    const b = witnessesOf(pair.before, i, renamed);
    if (!renamed) {
      beforeList.push(...b);
      afterList.push(...b);
      return;
    }
    const a = witnessesOf(pair.after, i, true);
    for (const w of a) {
      keep(w.top);
    }
    const keys = (list: Witness[]) => list.map((w) => w.key).join(" ");
    if (keys(a) === keys(b)) {
      beforeList.push(...b);
      afterList.push(...a);
    } else {
      // Parts that do not line up are not taken back: both sides' all-parts witnesses only.
      offsLeft += 1;
      beforeList.push(...b.filter((w) => w.on));
      afterList.push(...a.filter((w) => w.on));
    }
  });
  return { beforeList, afterList, offsLeft };
}

/** One side's page with only the pairs' rules, its witnesses mounted, and each subject's match. */
async function onlyThePairs(
  browser: Browser,
  pairs: Pair[],
  side: "b" | "a",
  list: Witness[]
) {
  const props = pairs
    .map(
      (_, i) =>
        `@property --i2-${side}-${i} { syntax: "<integer>"; inherits: false; initial-value: 0; }`
    )
    .join("\n");
  const sheet = pairs
    .map(
      (pair, i) =>
        `${side === "b" ? pair.before : pair.after} { --i2-${side}-${i}: 1; }`
    )
    .join("\n");
  const page = await browser.newPage();
  await page.setContent(`<style>${props}\n${sheet}</style>`);
  const cdp = await page.context().newCDPSession(page);
  const doc = await mount(page, cdp, list);
  return { cdp, doc, matched: await matchesOf(page, side) };
}

/** 3. Each pair's rules alone: the same match and the same weight in every witness. */
async function checkMatches(
  browser: Browser,
  pairs: Pair[],
  lists: ReturnType<typeof witnessLists>
): Promise<void> {
  const { beforeList, afterList, offsLeft } = lists;
  const [sideB, sideA] = await Promise.all([
    onlyThePairs(browser, pairs, "b", beforeList),
    onlyThePairs(browser, pairs, "a", afterList),
  ]);
  let mismatched = 0;
  let unexercised = 0;
  let stillOn = 0;
  const weighing: Witness[] = [];
  for (const w of beforeList) {
    const b = sideB.matched[w.key] ?? "?";
    const a = sideA.matched[w.key] ?? "?";
    const pair = pairs[w.pair];
    if (b !== a) {
      mismatched += 1;
      console.log(
        `MATCH ${w.key}: before ${b} after ${a} | ${pair.before} | ${pair.after}`
      );
    } else if (w.on && b !== "1") {
      unexercised += 1;
      console.log(`UNEXERCISED ${w.key}: ${pair.before}`);
    } else if (!w.on && b === "1") {
      stillOn += 1;
      console.log(`OFF STILL MATCHES ${w.key}: ${pair.before}`);
    } else if (w.on) {
      weighing.push(w);
    }
  }
  const weights = await Promise.all(
    weighing.map((w) =>
      Promise.all([
        weightOf(sideB.cdp, sideB.doc, w.key, `--i2-b-${w.pair}`),
        weightOf(sideA.cdp, sideA.doc, w.key, `--i2-a-${w.pair}`),
      ])
    )
  );
  let heavier = 0;
  weights.forEach(([wb, wa], at) => {
    if (!(wb && wa) || wb !== wa) {
      heavier += 1;
      const { key, pair } = weighing[at];
      console.log(
        `WEIGHT ${key}: before ${wb} after ${wa} | ${pairs[pair].before} | ${pairs[pair].after}`
      );
    }
  });
  console.log(
    `witnesses ${beforeList.length} (${beforeList.filter((w) => w.on).length} with every part, ${beforeList.filter((w) => !w.on).length} with one taken back; ${offsLeft} pairs whose parts do not line up kept to the first); match differs ${mismatched}; an all-parts witness its rule missed ${unexercised}; a taken-back one still matched ${stillOn}; weighed ${weighing.length}, weight differs or unread ${heavier}`
  );
}

/** One side's whole sheets at one width, its witnesses mounted: each subject's computed style. */
async function wholeSide(
  browser: Browser,
  sheets: Map<string, string>,
  list: Witness[],
  width: number
): Promise<Record<string, string>> {
  const css = [...sheets.keys()]
    .sort()
    .map((k) => sheets.get(k))
    .join("\n");
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.setContent(`<style>${css}</style>`);
  await mount(page, await page.context().newCDPSession(page), list);
  const styles = await computed(page);
  await page.close();
  return styles;
}

/** 4. The whole sides: every subject computes the same, at two widths. */
async function checkStyles(
  browser: Browser,
  sheets: [Map<string, string>, Map<string, string>],
  lists: ReturnType<typeof witnessLists>
): Promise<void> {
  const widths = [1280, 390];
  const read = await Promise.all(
    widths.map((width) =>
      Promise.all([
        wholeSide(browser, sheets[0], lists.beforeList, width),
        wholeSide(browser, sheets[1], lists.afterList, width),
      ])
    )
  );
  let differ = 0;
  let count = 0;
  read.forEach(([before, after], at) => {
    for (const [key, value] of Object.entries(before)) {
      count += 1;
      if (unscoped(after[key] ?? "") !== unscoped(value)) {
        differ += 1;
        const fields = (text: string) =>
          Object.fromEntries(text.split("\n").map((d) => d.split(FIELD)));
        const b = fields(value);
        const a = fields(after[key] ?? "");
        const names = Object.keys({ ...b, ...a }).filter((n) => b[n] !== a[n]);
        console.log(
          `STYLE ${widths[at]} ${key}: ${names
            .map((n) => `${n} ${b[n]} → ${a[n]}`)
            .join("; ")
            .slice(0, 400)}`
        );
      }
    }
  });
  console.log(
    `computed styles read ${count} (subjects and their pseudo-elements, 1280 and 390 wide); differ ${differ}`
  );
}

const args = process.argv.slice(2);
const hooksRenamed = args[0] === "--renamed";
const [beforePath, afterPath] = hooksRenamed ? args.slice(1) : args;
if (!(beforePath && afterPath)) {
  throw new Error(
    "usage: bun .cutover/i2-selectors.ts [--renamed] <before> <after>"
  );
}
const sides: [Map<string, string>, Map<string, string>] = [
  sheetsOf(beforePath),
  sheetsOf(afterPath),
];
const chrome = await chromium.launch();
const found = await pairsOf(await chrome.newPage(), ...sides);
const witnessed = witnessLists(found, hooksRenamed);
await checkMatches(chrome, found, witnessed);
await checkStyles(chrome, sides, witnessed);
console.log(
  `not written as elements: ${
    [...unsupported].map(([k, n]) => `${k} ×${n}`).join(", ") || "none"
  }`
);
await chrome.close();
