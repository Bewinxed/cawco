/**
 * A row's words as Find draws them (find-rows.ts `Run`), written into the
 * element it is attached to: matched runs strong, and each secret the hub
 * named (find-secrets.ts) as dots of one fixed length, never its own, until
 * the person shows that one. The dots sit inside the row's own control: its
 * click (FindRow, FindPeek) reads `data-secret` under the pointer and shows
 * that secret instead of opening, and ↵ on the row shows the first still
 * hidden (Finder). Named for a screen reader as a hidden secret; the row's
 * own words say so too.
 *
 *   <span {@attach said(row.reason.parts, shown, { before: " “", after: "”" })}>
 *
 * The words go in after what the element holds, `before` and `after` round
 * them as text, and are taken out again when it ends. One effect writes them
 * as plain nodes (text through `createTextNode`, never parsed as markup), so
 * a row scrolled into view builds no component, block or effect per run: a
 * fling through find's places built thousands of rows, each a component, a
 * keyed each over its pieces and another over their runs. It writes them
 * again when the runs change or a secret it holds is shown (`shown`, a
 * SvelteSet, tracks each `has`).
 */
import { findSecretWords as words } from "@cawco/core/words/find-secrets";
import type { Attachment } from "svelte/attachments";
import { piecesOf, type Run } from "./find-rows";

const MARK_CLASS = "bg-transparent text-tx font-medium";
const HIDDEN_CLASS =
  "inline-block px-space-1 rounded-xs bg-ui text-tx-2 tracking-caps select-none whitespace-nowrap align-baseline hover:text-tx";
const SHOWN_CLASS = "text-tx";

/** `runs` written into `into`: a matched one a `<mark>`, the rest text. */
function writeRuns(into: Node, runs: readonly Run[]): void {
  for (const run of runs) {
    if (run.matched) {
      const mark = document.createElement("mark");
      mark.className = MARK_CLASS;
      mark.textContent = run.text;
      into.appendChild(mark);
    } else {
      into.appendChild(document.createTextNode(run.text));
    }
  }
}

/** A secret not shown: its dots, named for a screen reader and the pointer. */
function hiddenSecret(key: string): HTMLElement {
  const span = document.createElement("span");
  span.dataset.slot = "secret";
  span.dataset.secret = key;
  span.className = HIDDEN_CLASS;
  span.setAttribute("aria-label", words.hidden);
  span.setAttribute("role", "img");
  span.title = words.hidden;
  span.textContent = words.dots;
  return span;
}

/** A secret the person showed: its runs, drawn strong. */
function shownSecret(key: string, runs: readonly Run[]): HTMLElement {
  const span = document.createElement("span");
  span.dataset.slot = "secret";
  span.dataset.secret = key;
  span.dataset.shown = "";
  span.className = SHOWN_CLASS;
  writeRuns(span, runs);
  return span;
}

/** Text written on either side of the words, inside the same element. */
export interface SaidAround {
  after?: string;
  before?: string;
}

/**
 * `runs` drawn into the element, after what it holds; `shown` names the
 * secrets the person showed, by key.
 */
export const said =
  (
    runs: readonly Run[],
    shown: ReadonlySet<string>,
    around: SaidAround = {}
  ): Attachment<HTMLElement> =>
  (element) => {
    const fragment = document.createDocumentFragment();
    if (around.before) {
      fragment.appendChild(document.createTextNode(around.before));
    }
    for (const piece of piecesOf(runs)) {
      if (piece.secret === null) {
        writeRuns(fragment, piece.runs);
      } else if (shown.has(piece.secret)) {
        fragment.appendChild(shownSecret(piece.secret, piece.runs));
      } else {
        fragment.appendChild(hiddenSecret(piece.secret));
      }
    }
    if (around.after) {
      fragment.appendChild(document.createTextNode(around.after));
    }
    const written = [...fragment.childNodes];
    element.appendChild(fragment);
    return () => {
      for (const node of written) {
        node.remove();
      }
    };
  };
