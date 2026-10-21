/**
 * Copying words that hold chips (the transcript's SkillChip, and the
 * composer's chips when a copy reaches past its field, MentionField) puts
 * on the clipboard what each chip stands for, its `data-copies` (a skill's
 * `/name`), where the chip shows its label. A chip is one atom: any part of
 * it copied is all of what it stands for.
 *
 * The selection is read as the browser itself copies it (`toString()` for
 * the text, its contents for a rich paste), within the copy event: each
 * chip's label words are swapped for what it stands for and the chip is
 * laid out as words (`display: inline`: both engines part a flex box from
 * the words around it with line breaks), an edge of the selection inside
 * a chip is widened to the whole chip, and then the chips, their words and
 * the selection are put back as they were before the event returns, so
 * nothing is drawn between. (A detached clone's `innerText` lost the space
 * before a code span in WebKit.)
 *
 * One listener on the document, added once the first such chip is drawn.
 * A copy something else already answered (the composer's field writes its
 * own string, MentionField) is left as it is, as is one holding no chip.
 */

/** A chip that copies as something other than its label: what it stands for. */
const COPIES = "data-copies";

let listening = false;

/** Listens from now on: called as a chip that copies is drawn. */
export function copyChips(): void {
  if (listening || typeof document === "undefined") {
    return;
  }
  listening = true;
  document.addEventListener("copy", oncopy);
}

/** The chip a point of the selection stands in, if any. */
const chipAt = (node: Node): Element | null =>
  (node instanceof Element ? node : node.parentElement)?.closest(
    `[${COPIES}]`
  ) ?? null;

/** A chip without the display the read gave it, and no `style` left empty. */
function unstyle(chip: HTMLElement): void {
  chip.style.removeProperty("display");
  if (!chip.getAttribute("style")) {
    chip.removeAttribute("style");
  }
}

function oncopy(event: ClipboardEvent): void {
  const picked = getSelection();
  if (
    event.defaultPrevented ||
    !event.clipboardData ||
    !picked?.rangeCount ||
    picked.isCollapsed
  ) {
    return;
  }
  const range = picked.getRangeAt(0);
  const root = range.commonAncestorContainer;
  // The words picked lie inside one chip: they copy as all it stands for.
  const inside = chipAt(root);
  if (inside) {
    event.preventDefault();
    event.clipboardData.setData(
      "text/plain",
      inside.getAttribute(COPIES) ?? ""
    );
    return;
  }
  const scope = root instanceof Element ? root : root.parentElement;
  const chips = [...(scope?.querySelectorAll(`[${COPIES}]`) ?? [])].filter(
    (chip) => range.intersectsNode(chip)
  );
  if (chips.length === 0) {
    return;
  }
  const start = [range.startContainer, range.startOffset] as const;
  const end = [range.endContainer, range.endOffset] as const;
  const from = chipAt(range.startContainer);
  const to = chipAt(range.endContainer);
  const swapped: [Text, string][] = [];
  for (const chip of chips) {
    (chip as HTMLElement).style.setProperty("display", "inline");
    const words = chip.querySelector('[data-slot="label"]')?.firstChild;
    if (words instanceof Text) {
      swapped.push([words, words.data]);
      words.data = chip.getAttribute(COPIES) ?? words.data;
    }
  }
  const whole = document.createRange();
  if (from) {
    whole.setStartBefore(from);
  } else {
    whole.setStart(...start);
  }
  if (to) {
    whole.setEndAfter(to);
  } else {
    whole.setEnd(...end);
  }
  picked.removeAllRanges();
  picked.addRange(whole);
  const text = picked.toString();
  const holder = document.createElement("div");
  holder.append(whole.cloneContents());
  for (const [words, was] of swapped) {
    words.data = was;
  }
  // The display was the read's alone: neither the page's chips nor the
  // markup pasted elsewhere keep it.
  for (const chip of [
    ...chips,
    ...holder.querySelectorAll<HTMLElement>(`[${COPIES}]`),
  ]) {
    unstyle(chip as HTMLElement);
  }
  const back = document.createRange();
  back.setStart(...start);
  back.setEnd(...end);
  picked.removeAllRanges();
  picked.addRange(back);
  event.preventDefault();
  event.clipboardData.setData("text/plain", text);
  event.clipboardData.setData("text/html", holder.innerHTML);
}
