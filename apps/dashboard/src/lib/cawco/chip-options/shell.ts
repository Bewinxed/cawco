/**
 * What both options lay over the kit's inline chip (ui/chip `inline`,
 * merged after it on the element): the spec's new ground, ring and hover,
 * the cap at `--c-inline-chip-max-w`, a 2px focus ring 1px out, and under a
 * coarse pointer a transparent `::after` reaching `--c-inline-chip-hit-x`
 * past each end. Option B's keycap chips start `space-1` in.
 */
import "./chip-options.css";

export function chipOver(start: "mark" | "keycap" = "mark"): string {
  return [
    "relative max-w-[min(100%,var(--c-inline-chip-max-w))] bg-(color:--chip-inline-bg) inset-ring-(color:--chip-inline-ring) can-hover:enabled:hover:bg-(color:--chip-inline-hover) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring coarse:after:absolute coarse:after:inset-y-0 coarse:after:-inset-x-(--c-inline-chip-hit-x) coarse:after:content-['']",
    start === "keycap" ? "ps-space-1" : "",
  ].join(" ");
}
