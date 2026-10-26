// house/group-not-needs-ancestor: a `group-not-`/`peer-not-` variant
// matches only where its group or peer is.
//
// `group-not-x/name:` is `:is(:where(.group/name):not(x) *)`: it holds only
// inside a `group/name` element whose x is off, so with no such ancestor it
// never matches. `not-group-x/name:` (`:not(:is(.group/name x *))`) holds
// there too. The same for `peer-not-` against a preceding `peer/name`.
// Moved from ESLint (apps/dashboard/eslint-plugin-house.mjs) to Golar, on
// Svelte's own AST: a snippet's elements stand where it is rendered.
import { isTag, readerFor, sitesOf, tagSites } from "./classes.mjs";
import { eachNode, parentOf } from "./model.mjs";
import { ds } from "./tailwind.mjs";

const NOT_RELATION = /^(group|peer)-not-.*?(?:\/([\w-]+))?$/u;
const MAX_HOPS = 8;

const relations = new Map();
/** A class's `group-not-`/`peer-not-` variants, with the class each needs. */
function relationsOf(name) {
  if (!relations.has(name)) {
    let parsed = null;
    try {
      [parsed] = ds.parseCandidate(name);
    } catch {
      parsed = null;
    }
    const found = (parsed?.variants ?? []).flatMap((v) => {
      const variant = ds.printVariant(v);
      const match = variant.match(NOT_RELATION);
      if (!match) {
        return [];
      }
      const [, kind, modifier] = match;
      const marker = modifier ? `${kind}/${modifier}` : kind;
      return [{ variant, kind, marker }];
    });
    relations.set(name, found);
  }
  return relations.get(name);
}

/** The fragments a block or a tag holds. */
function fragmentsOf(node) {
  switch (node?.type) {
    case "Fragment":
      return [node];
    case "IfBlock":
      return [node.consequent, node.alternate];
    case "EachBlock":
      return [node.body, node.fallback];
    case "AwaitBlock":
      return [node.pending, node.then, node.catch];
    case "KeyBlock":
      return [node.fragment];
    default:
      return [];
  }
}

/** The tags a node renders at its own level, through blocks only. */
function tagsWithin(node) {
  if (isTag(node)) {
    return [node];
  }
  return fragmentsOf(node)
    .filter(Boolean)
    .flatMap((f) =>
      f.type === "Fragment" ? f.nodes.flatMap(tagsWithin) : tagsWithin(f)
    );
}

/** The name a `{@render name(…)}` calls. */
function renderedName(tag) {
  const call =
    tag.expression?.type === "ChainExpression"
      ? tag.expression.expression
      : tag.expression;
  return call?.callee?.type === "Identifier" ? call.callee.name : null;
}

/**
 * Where a snippet stands when rendered: each `{@render name()}` in the file.
 * A snippet passed to a component (`{#snippet children()}` inside its tag)
 * stands where it is written, so none.
 */
function renderSites(model, snippet, renders) {
  const holder = parentOf(model, parentOf(model, snippet));
  if (isTag(holder)) {
    return [];
  }
  const name = snippet.expression?.name;
  return renders.filter((tag) => renderedName(tag) === name);
}

/** The ancestor tags of a node, one list per way it is rendered. */
function ancestorPaths(model, node, renders, hops = 0) {
  const out = [];
  for (let n = parentOf(model, node); n; n = parentOf(model, n)) {
    if (isTag(n)) {
      out.push(n);
    }
    const sites =
      n.type === "SnippetBlock" && hops < MAX_HOPS
        ? renderSites(model, n, renders)
        : [];
    if (sites.length) {
      return sites.flatMap((site) =>
        ancestorPaths(model, site, renders, hops + 1).map((way) => [
          ...out,
          ...way,
        ])
      );
    }
  }
  return [out];
}

/** The tags before a node under the same parent tag, one list per way it is rendered. */
function precedingPaths(model, start, renders, hops = 0) {
  const out = [];
  let node = start;
  for (
    let parent = parentOf(model, node);
    parent;
    parent = parentOf(model, node)
  ) {
    if (parent.type === "Fragment") {
      const at = parent.nodes.indexOf(node);
      out.push(...parent.nodes.slice(0, Math.max(0, at)).flatMap(tagsWithin));
    }
    if (isTag(parent)) {
      break;
    }
    const sites =
      parent.type === "SnippetBlock" && hops < MAX_HOPS
        ? renderSites(model, parent, renders)
        : [];
    if (sites.length) {
      return sites.flatMap((site) =>
        precedingPaths(model, site, renders, hops + 1).map((way) => [
          ...out,
          ...way,
        ])
      );
    }
    node = parent;
  }
  return [out];
}

const alone = (entry, relation) =>
  `"${entry.name}" uses ${relation.variant}, which matches only ${
    relation.kind === "group"
      ? "inside an ancestor"
      : "after a preceding sibling"
  } carrying "${relation.marker}"; this file renders none there, so on its own it never matches. If the condition should not require the ${relation.kind}, write not-${relation.kind}-… instead.`;

/** The findings of house/group-not-needs-ancestor in a file. */
export function groupNotNeedsAncestor(model) {
  const findings = [];
  const read = readerFor(model);
  const carried = new WeakMap();
  const inMarkup = new Set();
  const tags = [];
  const renders = [];
  eachNode(model, (node) => {
    if (isTag(node)) {
      tags.push(node);
    } else if (node.type === "RenderTag") {
      renders.push(node);
    }
  });
  const classesOf = (tag) => {
    if (!carried.has(tag)) {
      const [own] = tagSites(tag, read);
      carried.set(tag, new Set(own.entries.map((entry) => entry.name)));
    }
    return carried.get(tag);
  };
  const backed = (tag, relation) => {
    const ways =
      relation.kind === "group"
        ? ancestorPaths(model, tag, renders)
        : precedingPaths(model, tag, renders);
    return ways.every((way) =>
      way.some((el) => classesOf(el).has(relation.marker))
    );
  };
  const finding = (entry, relation) => ({
    start: entry.start,
    end: entry.end,
    message: alone(entry, relation),
  });
  // Elements are judged once every render site is known. A class string no
  // markup in this file carries (a recipe, a helper call in a .ts module)
  // stands on no element here.
  for (const tag of tags) {
    const entries = tagSites(tag, read).flatMap((site) => site.entries);
    for (const entry of entries) {
      inMarkup.add(entry.start);
      const unbacked = relationsOf(entry.name).filter((r) => !backed(tag, r));
      findings.push(...unbacked.map((r) => finding(entry, r)));
    }
  }
  const scripted = sitesOf(model)
    .filter((site) => !site.tag)
    .flatMap((site) => site.entries)
    .filter((entry) => !inMarkup.has(entry.start));
  for (const entry of scripted) {
    findings.push(...relationsOf(entry.name).map((r) => finding(entry, r)));
  }
  return findings;
}
