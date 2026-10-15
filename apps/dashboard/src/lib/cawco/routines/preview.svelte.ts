/**
 * PREVIEW ONLY: the two choices still open on the routines preview, held in
 * this browser so a reload keeps them. Each defaults to the recommended
 * option; what the owner has already picked is the page, not a switch.
 *
 * - S1, where Routines lives: a tab after Pipeline in the project's view
 *   strip, or a page of its own from a button in the project head.
 * - T5, archived tasks: dimmed in place while the strip's Archived is on, or
 *   folded into an Archive rail at the board's trailing edge.
 */
import { browser } from "$app/env";

export interface PreviewPicks {
  archived: "dim" | "rail";
  place: "tab" | "page";
}

const KEY = "cawco.preview.routines-picks.v3";
const DEFAULTS: PreviewPicks = {
  place: "tab",
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
