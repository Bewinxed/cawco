/**
 * State the page's script holds, written as words in an attribute on the
 * document's root or body for as long as it is held, so a rule reads it as
 * `:root[data-scrim~="open"]` instead of asking the page with `:has()`.
 *
 * A `:has()` on the root, the body or a floating wrapper made Chromium walk
 * up from every element put in anywhere under them and restyle each such
 * subject on the way: the flag that sends that walk up
 * (AncestorsOrAncestorSiblingsAffectedByHas) is copied from parent to every
 * inserted element and never reset (chromium has_invalidation_flags.h,
 * style_engine.cc `ForInsertion`), whatever depth the argument names. A
 * morph's letters, put in each frame of a swap, restyled the root, the body
 * and their wrapper every time.
 *
 * Several holders can hold the same word (two scrims open, one leaving):
 * each word is counted, and the attribute lists every word held at least
 * once, and is gone when none is.
 */

type Target = "root" | "body";

const counts = new Map<string, number>();

const keyOf = (target: Target, name: string, word: string) =>
  `${target} ${name} ${word}`;

function write(target: Target, name: string): void {
  const node = target === "root" ? document.documentElement : document.body;
  const prefix = `${target} ${name} `;
  const words: string[] = [];
  for (const [key, n] of counts) {
    if (n > 0 && key.startsWith(prefix)) {
      words.push(key.slice(prefix.length));
    }
  }
  const value = words.length > 0 ? words.join(" ") : null;
  if (node.getAttribute(name) === value) {
    return;
  }
  if (value === null) {
    node.removeAttribute(name);
  } else {
    node.setAttribute(name, value);
  }
}

/** Holds `word` in `name` on `target` until the returned release is called. */
export function hold(target: Target, name: string, word: string): () => void {
  const key = keyOf(target, name, word);
  counts.set(key, (counts.get(key) ?? 0) + 1);
  write(target, name);
  let held = true;
  return () => {
    if (!held) {
      return;
    }
    held = false;
    const n = (counts.get(key) ?? 1) - 1;
    if (n > 0) {
      counts.set(key, n);
    } else {
      counts.delete(key);
    }
    write(target, name);
  };
}

/**
 * What `node` says, as words held in `name` on `target` for as long as it is
 * mounted: `read(node)` the words it holds now, read again whenever one of
 * `attributes` changes on it (a primitive's `data-state`, written by the
 * primitive). A node that is not one of the body's own children holds
 * nothing: each rule this replaced asked for one there (`> body > …`), where
 * every kit layer is portalled.
 */
export function mirror(
  node: HTMLElement,
  target: Target,
  name: string,
  attributes: string[],
  read: (node: HTMLElement) => string[]
): () => void {
  let held = new Map<string, () => void>();
  const update = () => {
    const words = node.parentElement === document.body ? read(node) : [];
    const next = new Map<string, () => void>();
    for (const word of words) {
      next.set(word, held.get(word) ?? hold(target, name, word));
    }
    for (const [word, release] of held) {
      if (!next.has(word)) {
        release();
      }
    }
    held = next;
  };
  update();
  const watch = new MutationObserver(update);
  watch.observe(node, { attributeFilter: attributes });
  return () => {
    watch.disconnect();
    for (const release of held.values()) {
      release();
    }
    held = new Map();
  };
}

/** A kit scrim (`scrimVariants`, ui/dialog/dialog-overlay), open or closing, for the screen's edges (ScreenEdges). */
export const scrimMark = (node: HTMLElement) =>
  mirror(node, "root", "data-scrim", ["data-state"], ({ dataset }) =>
    dataset.state === "open" || dataset.state === "closed"
      ? [dataset.state]
      : []
  );
