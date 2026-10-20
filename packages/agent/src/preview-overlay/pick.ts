/**
 * The pick: a press on an option (`data-option`) inside a choice
 * (`data-cawco-choice`) is heard at the window, in capture, before anything
 * on the page hears it, and written at once: a one-pick choice takes the
 * option, and a press on the option it holds keeps it (a radio's pick is
 * never let go: WAI-ARIA APG, Radio Group, "checks the focused radio button
 * if it is not already checked"), so nothing is written; a several-pick
 * choice (`data-cawco-multiple`) toggles it among its picks. The overlay runs it
 * against the page's doc (page.ts); the probe kit runs this same module
 * against its stand-in bridge (probe-kit decision-embeds.ts).
 */

/** The choice an option belongs to. */
export const choiceOf = (option: Element): Element | null =>
  option.closest("[data-cawco-choice]");

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

/** Hears every press on an option in `at`'s document and writes its pick. */
export function listenForPicks(at: Window, wiring: PickWiring): void {
  at.addEventListener(
    "click",
    (event) => {
      if (!(wiring.interacting() && event.target instanceof Element)) {
        return;
      }
      const option = event.target.closest("[data-option]");
      const holder = option && choiceOf(option);
      const choice = holder?.getAttribute("data-cawco-choice");
      const value = option?.getAttribute("data-option");
      if (!(holder && choice && value)) {
        return;
      }
      const current = wiring.picked(choice);
      if (holder.hasAttribute("data-cawco-multiple")) {
        wiring
          .choose(
            choice,
            current.includes(value)
              ? current.filter((picked) => picked !== value)
              : [...current, value]
          )
          .catch(wiring.refused);
      } else if (!current.includes(value)) {
        wiring.choose(choice, value).catch(wiring.refused);
      }
    },
    true
  );
}
