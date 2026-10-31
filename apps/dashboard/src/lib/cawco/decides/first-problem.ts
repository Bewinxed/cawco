/**
 * The first problem a press found, shown: once it draws, the first
 * `[data-problem]` under `host` comes into view and the invalid field of its
 * row (`[data-row]`, SetupRow) takes the focus. A member's settings and Add a
 * kind both call it when their press finds one.
 */
import { bringIntoView } from "@cawco/core/bring-into-view";
import { tick } from "svelte";

export const showFirstProblem = (host: HTMLElement | null): void => {
  tick().then(() => {
    const at = host?.querySelector<HTMLElement>("[data-problem]");
    if (at) {
      bringIntoView(at);
    }
    at?.closest("[data-row]")
      ?.querySelector<HTMLElement>("[aria-invalid='true']")
      ?.focus({ preventScroll: true });
  });
};
