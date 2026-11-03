/**
 * A setup page's name (the decision library's `Setup`): the page's title,
 * renamed where it stands (SetupTitle), and the Send that names it
 * (Decisions: "Set up <name>"), read from one place. Kept through the
 * page's bridge under `name` a moment after typing rests.
 */
import { bridge } from "./page.svelte.js";

export const setupName = $state<{ now: string }>({ now: "" });

let timer: ReturnType<typeof setTimeout> | undefined;

/** The name as typed: drawn at once, kept once typing rests. */
export function renameTo(next: string): void {
  setupName.now = next;
  clearTimeout(timer);
  timer = setTimeout(() => bridge()?.set("name", next.trim()), 400);
}
