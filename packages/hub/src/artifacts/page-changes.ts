/**
 * What a revision of a page changed, read by the hub at that revision and
 * written into the doc's `meta.changes` (core comments.ts `ArtifactChanges`):
 * the panel rings each changed thing (`c-change-ring`) until the person has
 * looked at it (PRD §5.7, "Pointing and what changed").
 *
 * An HTML page's is a diff of its body before and after, element by
 * element, whitespace and attribute order ignored, scripts and styles left
 * out. A change is told at the nearest element that names itself (an id that
 * isn't minted, a test id, a decision card's choice: core
 * `ANCHOR_IDENTITIES`) or holds a pin's anchor, the change's own element
 * when none does; an element put in is told at itself; one taken out, at the
 * nearest such element still there that held it, else as a removed stop with
 * its first words. Each is named by the selector the page's overlay names
 * elements by (overlay page.ts `selectorOf`), so the overlay finds it.
 *
 * A decision page's is its cards: each card added or rewritten, by its
 * `#decision-<id>`, and each taken out, a removed stop with its question.
 */
import { createHash } from "node:crypto";
import type { CanvasElement, CanvasEntry } from "@cawco/core/canvas";
import {
  ANCHOR_IDENTITIES,
  CHANGE_WORDS_MOST,
  CHANGES_LIMIT,
  type ChangedItem,
  generatedId,
} from "@cawco/core/comments";
import type { DecisionCard } from "@cawco/core/decisions";
import { elementName } from "@cawco/core/pin-name";

/** Elements whose insides are no part of what the person sees. */
const UNSEEN = new Set(["script", "style", "template", "noscript", "head"]);
/** Words a label keeps. Our call. */
const LABEL_CHARS = 60;
const SPACES = /\s+/gu;

/** One element of a page, as the diff reads it. */
interface Node {
  attrs: [string, string][];
  children: Node[];
  /** What names it alone, by identity, in its page; null when nothing does. */
  identity: string | null;
  parent: Node | null;
  /** Its fingerprint: its tag, attributes, words and children's, so equal ones read the same. */
  sig: string;
  tag: string;
  /** Its own words, each run of spaces one. */
  text: string;
}

/** An identifier as a CSS selector writes it (CSSOM `CSS.escape`, for the characters ids and attribute values carry). */
export function cssEscape(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charAt(i);
    const code = value.charCodeAt(i);
    if (code === 0) {
      out += "�";
    } else if (
      (code >= 0x01 && code <= 0x1f) ||
      code === 0x7f ||
      (i === 0 && code >= 0x30 && code <= 0x39) ||
      (i === 1 && code >= 0x30 && code <= 0x39 && value.charAt(0) === "-")
    ) {
      out += `\\${code.toString(16)} `;
    } else if (i === 0 && ch === "-" && value.length === 1) {
      out += `\\${ch}`;
    } else if (
      code >= 0x80 ||
      ch === "-" ||
      ch === "_" ||
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    ) {
      out += ch;
    } else {
      out += `\\${ch}`;
    }
  }
  return out;
}

/** The body of `html` as a tree, scripts and styles left out; null when it has none. */
function bodyOf(html: string): Node | null {
  const root: Node = {
    tag: "#root",
    attrs: [],
    children: [],
    identity: null,
    parent: null,
    sig: "",
    text: "",
  };
  const stack: Node[] = [root];
  /** Inside an element whose insides are unseen: how deep. */
  let unseen = 0;
  new HTMLRewriter()
    .on("*", {
      element(el) {
        const tag = el.tagName.toLowerCase();
        const opens = el.canHaveContent && !el.selfClosing;
        if (unseen > 0 || UNSEEN.has(tag)) {
          if (opens) {
            unseen += 1;
            el.onEndTag(() => {
              unseen -= 1;
            });
          }
          return;
        }
        const parent = stack.at(-1) as Node;
        const node: Node = {
          tag,
          attrs: [...el.attributes]
            .map(([name, value]): [string, string] => [
              name.toLowerCase(),
              value.replace(SPACES, " ").trim(),
            ])
            .sort(([a], [b]) => a.localeCompare(b)),
          children: [],
          identity: null,
          parent,
          sig: "",
          text: "",
        };
        parent.children.push(node);
        if (opens) {
          stack.push(node);
          el.onEndTag(() => {
            // An element left open closes with its parent's end.
            const at = stack.lastIndexOf(node);
            if (at > 0) {
              stack.length = at;
            }
          });
        }
      },
      text(chunk) {
        if (unseen === 0) {
          const node = stack.at(-1) as Node;
          node.text += chunk.text;
        }
      },
    })
    .transform(html);
  const find = (node: Node, tag: string): Node | null => {
    if (node.tag === tag) {
      return node;
    }
    for (const child of node.children) {
      const found = find(child, tag);
      if (found) {
        return found;
      }
    }
    return null;
  };
  const body = find(root, "body");
  if (!body) {
    return null;
  }
  body.parent = null;
  settle(body);
  identify(body);
  return body;
}

/** Each element's words made even and its fingerprint taken, from its leaves up. */
function settle(node: Node): void {
  node.text = node.text.replace(SPACES, " ").trim();
  for (const child of node.children) {
    settle(child);
  }
  node.sig = JSON.stringify([
    node.tag,
    node.attrs,
    node.text,
    node.children.map((child) => child.sig),
  ]);
}

/** What names `node` by identity, as the overlay's `identityOf` does: its id, else an identity attribute, when it names only it. */
function identify(body: Node): void {
  const all: Node[] = [];
  const walk = (node: Node) => {
    all.push(node);
    for (const child of node.children) {
      walk(child);
    }
  };
  walk(body);
  const attr = (node: Node, name: string) =>
    node.attrs.find(([key]) => key === name)?.[1] ?? null;
  const counts = new Map<string, number>();
  const candidates = new Map<Node, string[]>();
  for (const node of all) {
    const id = attr(node, "id");
    const named = [
      ...(id && !generatedId(id) ? [`#${cssEscape(id)}`] : []),
      ...ANCHOR_IDENTITIES.flatMap((name) => {
        const value = attr(node, name);
        return value ? [`[${name}="${cssEscape(value)}"]`] : [];
      }),
    ];
    candidates.set(node, named);
    for (const one of named) {
      counts.set(one, (counts.get(one) ?? 0) + 1);
    }
  }
  for (const node of all) {
    node.identity =
      candidates.get(node)?.find((one) => counts.get(one) === 1) ?? null;
  }
}

/** `node`'s selector in its page, as the overlay's `selectorOf` writes it. */
function selectorOf(node: Node): string {
  const path: string[] = [];
  for (let at: Node | null = node; at; at = at.parent) {
    if (at.identity) {
      path.unshift(at.identity);
      break;
    }
    if (!at.parent) {
      path.unshift(at.tag);
      break;
    }
    const index =
      at.parent.children
        .slice(0, at.parent.children.indexOf(at))
        .filter((sibling) => sibling.tag === at?.tag).length + 1;
    path.unshift(`${cssEscape(at.tag)}:nth-of-type(${index})`);
  }
  return path.join(" > ");
}

/** All of an element's words, its own and its children's, for a label. */
function wordsOf(node: Node): string {
  const words = [node.text, ...node.children.map(wordsOf)]
    .filter(Boolean)
    .join(" ")
    .replace(SPACES, " ")
    .trim();
  return words;
}

/**
 * A changed element's words whole, as a change line reads them before and
 * after (core `ChangedItem.before`, `after`): every word it says, up to core
 * `CHANGE_WORDS_MOST`; empty for one that says nothing.
 */
const wholeWordsOf = (node: Node): string => {
  const words = wordsOf(node);
  return words.length > CHANGE_WORDS_MOST
    ? `${words.slice(0, CHANGE_WORDS_MOST - 1).trimEnd()}…`
    : words;
};

/** A changed element's label: its first words, else what it is. */
const labelOf = (node: Node): string => {
  const words = wordsOf(node);
  if (!words) {
    return node.tag;
  }
  return words.length > LABEL_CHARS
    ? `${words.slice(0, LABEL_CHARS - 1).trimEnd()}…`
    : words;
};

/** The places of `before` and `after` that read the same, in order: their longest common run by fingerprint. */
function commonRun(before: Node[], after: Node[]): [number, number][] {
  const n = before.length;
  const m = after.length;
  const runs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  const at = (i: number, j: number) => (runs[i] as number[])[j] as number;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      (runs[i] as number[])[j] =
        before[i]?.sig === after[j]?.sig
          ? at(i + 1, j + 1) + 1
          : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const same: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (before[i]?.sig === after[j]?.sig) {
      same.push([i, j]);
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return same;
}

/** Between two untouched elements: one of the same tag in its place is the same element, changed; the rest went or came. */
function pairGap(
  gapBefore: Node[],
  gapAfter: Node[],
  into: { added: Node[]; pairs: [Node, Node][]; removed: Node[] }
): void {
  let left = gapBefore;
  for (const node of gapAfter) {
    const at = left.findIndex(
      (was) => was.tag === node.tag && !was.identity && !node.identity
    );
    if (at === -1) {
      into.added.push(node);
      continue;
    }
    into.removed.push(...left.slice(0, at));
    into.pairs.push([left[at] as Node, node]);
    left = left.slice(at + 1);
  }
  into.removed.push(...left);
}

/**
 * The pairs of `before` and `after` that are the same element: one that
 * names itself by the same identity, then the same fingerprint in order
 * (their longest common run), then, between those, one of the same tag in
 * its place. What pairs with nothing was taken out, or put in.
 */
function pair(
  before: Node[],
  after: Node[]
): { added: Node[]; pairs: [Node, Node][]; removed: Node[] } {
  const out = {
    pairs: [] as [Node, Node][],
    added: [] as Node[],
    removed: [] as Node[],
  };
  const byIdentity = new Map(
    before.filter((node) => node.identity).map((node) => [node.identity, node])
  );
  const taken = new Set<Node>();
  for (const node of after) {
    const was = node.identity ? byIdentity.get(node.identity) : undefined;
    if (was) {
      out.pairs.push([was, node]);
      taken.add(was);
      taken.add(node);
    }
  }
  const restBefore = before.filter((node) => !taken.has(node));
  const restAfter = after.filter((node) => !taken.has(node));
  const bounds: [number, number][] = [
    [-1, -1],
    ...commonRun(restBefore, restAfter),
    [restBefore.length, restAfter.length],
  ];
  for (let k = 0; k < bounds.length - 1; k += 1) {
    const [i0, j0] = bounds[k] as [number, number];
    const [i1, j1] = bounds[k + 1] as [number, number];
    if (k > 0) {
      out.pairs.push([restBefore[i0] as Node, restAfter[j0] as Node]);
    }
    pairGap(restBefore.slice(i0 + 1, i1), restAfter.slice(j0 + 1, j1), out);
  }
  return out;
}

/** An element by name, as a change line says it (core pin-name.ts `elementName`). */
const nameOf = (node: Node): string => {
  const attr = (name: string) =>
    node.attrs.find(([key]) => key === name)?.[1] ?? "";
  const id = attr("id");
  return elementName({
    id: id && !generatedId(id) ? id : null,
    classes: attr("class").split(" ").filter(Boolean),
    tag: node.tag,
  });
};

/** The words of the element `node` comes after among its siblings; empty when it comes first. */
const neighbourWords = (node: Node): string => {
  const siblings = node.parent?.children ?? [];
  const before = siblings[siblings.indexOf(node) - 1];
  return before ? labelOf(before) : "";
};

/**
 * The pairs of `old`'s and `node`'s children that changed their order: in
 * the new order, those off the longest run that keeps the old order. An
 * element put in or taken out moves no other.
 */
function reordered(
  old: Node,
  node: Node,
  pairs: readonly [Node, Node][]
): [Node, Node][] {
  const sorted = [...pairs].sort(
    (a, b) => node.children.indexOf(a[1]) - node.children.indexOf(b[1])
  );
  const rank = sorted.map(([a]) => old.children.indexOf(a));
  // Longest increasing run of old places, by patience sorting.
  const tails: number[] = [];
  const back = new Array<number>(rank.length).fill(-1);
  for (let i = 0; i < rank.length; i += 1) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if ((rank[tails[mid] as number] as number) < (rank[i] as number)) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    back[i] = lo > 0 ? (tails[lo - 1] as number) : -1;
    tails[lo] = i;
  }
  const kept = new Set<number>();
  for (let i = tails.at(-1) ?? -1; i !== -1; i = back[i] as number) {
    kept.add(i);
  }
  return sorted.filter((_, i) => !kept.has(i));
}

/**
 * What changed from the page `before` to the page `after`, each told at its
 * nearest element that names itself or holds a pin's anchor (`anchors`, the
 * selectors pins stand on), else its own, in the new page's order. Nothing
 * when the body is the same; one stop for the page as a whole when either
 * has no body.
 */
export function htmlChanges(
  before: string,
  after: string,
  anchors: readonly string[]
): ChangedItem[] {
  const was = bodyOf(before);
  const now = bodyOf(after);
  if (!(was && now)) {
    return was === now
      ? []
      : [{ kind: "element", anchor: "body", label: "Whole page" }];
  }
  if (was.sig === now.sig) {
    return [];
  }
  const pinned = new Set(anchors);
  const bounds = (at: Node) =>
    !!at.identity || (pinned.size > 0 && pinned.has(selectorOf(at)));
  /** The nearest of `node` (of the new page) and its ancestors that names itself or holds a pin; null when only the body holds it. */
  const holderOf = (node: Node): Node | null => {
    for (let at: Node | null = node; at?.parent; at = at.parent) {
      if (bounds(at)) {
        return at;
      }
    }
    return null;
  };
  /** Where a change in `node` is told: its holder, else itself. */
  const toldAt = (node: Node): Node => holderOf(node) ?? node;
  const changed = new Set<Node>();
  const removed: ChangedItem[] = [];
  /** Each element of the new page by the one it was in the old. */
  const oldOf = new Map<Node, Node>([[now, was]]);
  /** Each element that moved: the words of the one it came after then and now. */
  const moves = new Map<Node, { after: string; before: string }>();
  const compare = (old: Node, node: Node) => {
    oldOf.set(node, old);
    if (old.sig === node.sig) {
      return;
    }
    const own =
      old.tag !== node.tag ||
      old.text !== node.text ||
      JSON.stringify(old.attrs) !== JSON.stringify(node.attrs);
    if (own) {
      changed.add(toldAt(node));
    }
    const paired = pair(old.children, node.children);
    // One taken out here and put in there, reading the same, moved.
    const gone = [...paired.removed];
    for (const added of paired.added) {
      const at = gone.findIndex((one) => one.sig === added.sig);
      if (at === -1) {
        changed.add(toldAt(added));
        continue;
      }
      const [then] = gone.splice(at, 1);
      oldOf.set(added, then as Node);
      moved(then as Node, added);
    }
    for (const out of gone) {
      const holder = holderOf(node);
      if (holder) {
        changed.add(holder);
      } else {
        removed.push({
          kind: "removed",
          anchor: `removed:${selectorOf(node)}:${labelOf(out)}`,
          label: labelOf(out),
        });
      }
    }
    for (const [a, b] of reordered(old, node, paired.pairs)) {
      moved(a, b);
    }
    for (const [a, b] of paired.pairs) {
      compare(a, b);
    }
  };
  /** `node` (of the new page), `old` in the old, stands after another element than it did: told where it stands, with both neighbours' words. */
  const moved = (old: Node, node: Node) => {
    const at = toldAt(node);
    changed.add(at);
    if (at === node) {
      moves.set(node, {
        before: neighbourWords(old),
        after: neighbourWords(node),
      });
    }
  };
  compare(was, now);
  // In the new page's order; one inside another already told is told once.
  const order: Node[] = [];
  const walk = (node: Node) => {
    order.push(node);
    for (const child of node.children) {
      walk(child);
    }
  };
  walk(now);
  const told = order.filter((node) => changed.has(node));
  const items: ChangedItem[] = told.map((node) => {
    if (!node.parent) {
      return { kind: "element", anchor: "body", label: "Whole page" };
    }
    const old = oldOf.get(node);
    const move = moves.get(node);
    return {
      kind: "element",
      anchor: selectorOf(node),
      label: labelOf(node),
      after: wholeWordsOf(node) || labelOf(node),
      element: nameOf(node),
      ...(old ? { before: wholeWordsOf(old) || labelOf(old) } : {}),
      ...(move ? { moved: move } : {}),
    };
  });
  return [...items, ...removed].slice(0, CHANGES_LIMIT);
}

/** An element's fields that move with no change the person would see: its version stamps. */
const STAMPS = new Set(["version", "versionNonce", "updated", "seed"]);

/** An element as the scene diff compares it: everything but its stamps. */
const sceneSig = (el: CanvasElement): string =>
  JSON.stringify(
    Object.entries(el)
      .filter(([key]) => !STAMPS.has(key))
      .sort(([a], [b]) => a.localeCompare(b))
  );

/** Words an element type is called by, where it has no words of its own. */
const SCENE_WORDS: Record<string, string> = {
  arrow: "Arrow",
  diamond: "Diamond",
  ellipse: "Ellipse",
  frame: "Frame",
  freedraw: "Drawing",
  image: "Picture",
  line: "Line",
  rectangle: "Rectangle",
  text: "Text",
};

/**
 * What an agent's update to a canvas changed, from the scene before and
 * after it (core canvas.ts `CanvasEntry`), by element id: each element put
 * in or changed, told at the shape a changed label stands in, and each
 * taken out, a removed stop with its words. Its stamps moving alone is no
 * change.
 */
export function sceneChanges(
  before: readonly CanvasEntry[],
  after: readonly CanvasEntry[]
): ChangedItem[] {
  const live = (entries: readonly CanvasEntry[]) =>
    new Map(
      entries
        .filter((entry) => !entry.el.isDeleted)
        .map((entry) => [entry.el.id, entry.el])
    );
  const was = live(before);
  const now = live(after);
  /** An element's words: its own text, its label's, else what it is. */
  const elementWords = (el: CanvasElement, all: Map<string, CanvasElement>) => {
    const label = el.boundElements?.find((one) => one.type === "text");
    const words = (
      el.text ??
      (label ? all.get(label.id)?.text : undefined) ??
      ""
    )
      .replace(SPACES, " ")
      .trim();
    if (!words) {
      return SCENE_WORDS[el.type] ?? "Element";
    }
    return words.length > LABEL_CHARS
      ? `${words.slice(0, LABEL_CHARS - 1).trimEnd()}…`
      : words;
  };
  const told = new Set<string>();
  const items: ChangedItem[] = [];
  for (const [id, el] of now) {
    const old = was.get(id);
    if (old && sceneSig(old) === sceneSig(el)) {
      continue;
    }
    // A label's change is its shape's.
    const at = el.containerId && now.has(el.containerId) ? el.containerId : id;
    if (told.has(at)) {
      continue;
    }
    told.add(at);
    const shown = now.get(at) ?? el;
    const then = was.get(at);
    items.push({
      kind: "canvas",
      anchor: at,
      label: elementWords(shown, now),
      element: SCENE_WORDS[shown.type] ?? "Element",
      ...(then ? { before: elementWords(then, was) } : {}),
    });
  }
  for (const [id, el] of was) {
    if (!(now.has(id) || (el.containerId && was.has(el.containerId)))) {
      items.push({
        kind: "removed",
        anchor: `removed:${id}`,
        label: elementWords(el, was),
      });
    }
  }
  return items.slice(0, CHANGES_LIMIT);
}

/** A file's bytes as a fingerprint: what tells a picture drawn again from the same one. */
export const bytesHash = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/**
 * What a decision page's revision changed in its pictures: each Image file
 * whose bytes are new under its address (`files/<n>-<name>`, hub
 * decision-program.ts), at the picture that shows it (its `src` ends with
 * that address). `before` is each address's fingerprint as the page stood.
 */
export function pictureChanges(
  before: ReadonlyMap<string, string>,
  after: readonly { bytes: Uint8Array; path: string }[]
): ChangedItem[] {
  return after
    .filter((file) => before.get(file.path) !== bytesHash(file.bytes))
    .map((file) => ({
      kind: "element",
      anchor: `img[src$="${file.path.replace(CSS_STRING, "\\$&")}"]`,
      label: file.path.split("/").at(-1)?.replace(INDEXED, "") ?? file.path,
    }));
}

/** What would end a CSS string early. */
const CSS_STRING = /["\\]/gu;
/** A file's place in its page (`<n>-`), before its name. */
const INDEXED = /^\d+-/u;

/** What a decision page's revision changed: each card put in or rewritten, by its `#decision-<id>`, and each taken out. */
export function cardChanges(
  before: readonly DecisionCard[],
  after: readonly DecisionCard[]
): ChangedItem[] {
  const was = new Map(before.map((card) => [card.id, card]));
  const now = new Set(after.map((card) => card.id));
  const items: ChangedItem[] = after
    .filter((card) => JSON.stringify(was.get(card.id)) !== JSON.stringify(card))
    .map((card) => {
      const then = was.get(card.id);
      return {
        kind: "card",
        anchor: `#decision-${cssEscape(card.id)}`,
        label: card.question,
        element: "Card",
        ...(then ? { before: then.question } : {}),
      };
    });
  for (const card of before) {
    if (!now.has(card.id)) {
      items.push({
        kind: "removed",
        anchor: `removed:#decision-${cssEscape(card.id)}`,
        label: card.question,
      });
    }
  }
  return items.slice(0, CHANGES_LIMIT);
}
