/**
 * The pick: a press on an option (`data-option`) inside a choice
 * (`data-cawco-choice`) is heard at the window, in capture, before anything
 * on the page hears it, and written at once: a one-pick choice takes the
 * option, and a press on the option it holds lets it go (the choice is
 * written with no option: cleared); a several-pick choice
 * (`data-cawco-multiple`) toggles it among its picks. A press that leaves
 * words selected in the choice (a drag over an option's line, a double or
 * triple click on its words) is the person reading them, never a pick. The
 * overlay runs it against the page's doc (page.ts); the probe kit runs this
 * same module against its stand-in bridge (probe-kit decision-embeds.ts).
 *
 * In Comment mode the overlay's layer takes the press, so the page never
 * hears it; the overlay hands a press that lands on an option to the pick
 * `listenForPicks` answers (page.ts `commentAt`): pressing an option picks
 * it, or lets it go, in every mode (the owner: "clicking the pick should
 * click the pick").
 */

/** The choice an option belongs to. */
export const choiceOf = (option: Element): Element | null =>
  option.closest("[data-cawco-choice]");

/** The option `el` stands in, when that option is a choice's: its pick control. */
export const optionOf = (el: Element): Element | null => {
  const option = el.closest("[data-option]");
  return option && choiceOf(option) ? option : null;
};

export interface PickWiring {
  /** Writes a choice's pick: one option, several, or none. */
  choose: (choice: string, option: string | string[] | null) => Promise<void>;
  /** Whether a press reaches the page now (the overlay's Interact mode). */
  interacting: () => boolean;
  /** The options a choice holds picked now. */
  picked: (choice: string) => readonly string[];
  /** A refused write, which the host was already told of. */
  refused: () => void;
}

/** The words selected in `at`'s document, and the range they stand in; none when nothing is. */
function selected(at: Window): { range: Range; words: string } | null {
  const selection = at.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const words = range.toString().trim();
  return words ? { range, words } : null;
}

/** Writes the pick a press on `option` makes: taken, let go, or toggled among its choice's picks. */
function press(option: Element, wiring: PickWiring): void {
  const holder = choiceOf(option);
  const choice = holder?.getAttribute("data-cawco-choice");
  const value = option.getAttribute("data-option");
  if (!(holder && choice && value)) {
    return;
  }
  const current = wiring.picked(choice);
  let next: string[] | string | null;
  if (holder.hasAttribute("data-cawco-multiple")) {
    next = current.includes(value)
      ? current.filter((picked) => picked !== value)
      : [...current, value];
  } else {
    next = current.includes(value) ? null : value;
  }
  wiring.choose(choice, next).catch(wiring.refused);
}

/**
 * Hears every press on an option in `at`'s document and writes its pick.
 * Answers the pick itself, for a press the page never hears (Comment mode's).
 */
export function listenForPicks(
  at: Window,
  wiring: PickWiring
): (option: Element) => void {
  /** The words selected as the press began: a selection the press made is new. */
  let before = "";
  const began = () => {
    before = selected(at)?.words ?? "";
  };
  // A key's press (Space, a digit) begins with its keydown: it selects nothing.
  for (const type of ["pointerdown", "keydown"] as const) {
    at.addEventListener(type, began, { capture: true, passive: true });
  }
  /** Whether the press that ended selected words inside `holder`: a read. */
  const readingIn = (holder: Element) => {
    const now = selected(at);
    return (
      !!now &&
      now.words !== before &&
      (holder.contains(now.range.startContainer) ||
        holder.contains(now.range.endContainer))
    );
  };
  at.addEventListener(
    "click",
    (event) => {
      if (!(wiring.interacting() && event.target instanceof Element)) {
        return;
      }
      const option = optionOf(event.target);
      const holder = option && choiceOf(option);
      if (!(option && holder)) {
        return;
      }
      if (readingIn(holder)) {
        event.preventDefault();
        return;
      }
      press(option, wiring);
    },
    true
  );
  return (option) => press(option, wiring);
}
