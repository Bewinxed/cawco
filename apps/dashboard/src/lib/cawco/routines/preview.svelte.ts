/**
 * PREVIEW ONLY: the three choices still open on the routines preview, held in
 * this browser so a reload keeps them. Each defaults to the recommended
 * option; what the owner has already picked is the page, not a switch.
 *
 * - S1, where Routines lives: a tab after Pipeline in the project's view
 *   strip, or a page of its own from a button in the project head.
 * - S5, how the Routines page holds its three parts (routines, event sources,
 *   approved actions): tiles that are its tabs, a bento of cards, or a tab
 *   row over one card.
 * - T5, archived tasks: dimmed in place while the strip's Archived is on, or
 *   folded into an Archive rail after the board's last column.
 */
import { browser } from "$app/env";

export interface PreviewPicks {
  archived: "dim" | "rail";
  layout: "strip" | "bento" | "tabs";
  place: "tab" | "page";
}

const KEY = "cawco.preview.routines-picks.v2";
const DEFAULTS: PreviewPicks = {
  place: "tab",
  layout: "bento",
  archived: "dim",
};

function read(): PreviewPicks {
  if (!browser) {
    return { ...DEFAULTS };
  }
  try {
    const kept = JSON.parse(
      localStorage.getItem(KEY) ?? "{}"
    ) as Partial<PreviewPicks>;
    return { ...DEFAULTS, ...kept };
  } catch {
    return { ...DEFAULTS };
  }
}

export const picks = $state<PreviewPicks>(read());

export function pick<K extends keyof PreviewPicks>(
  key: K,
  value: PreviewPicks[K]
) {
  picks[key] = value;
  if (browser) {
    localStorage.setItem(KEY, JSON.stringify(picks));
  }
}
