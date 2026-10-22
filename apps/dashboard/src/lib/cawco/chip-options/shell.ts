/**
 * What both options lay over the kit's inline chip (ui/chip `inline`,
 * merged after it on the element): the spec's new ground, ring and hover
 * (the ground as `--chip-ground`, so a mark's cut can be drawn in it),
 * the cap at `--c-inline-chip-max-w`, a 2px focus ring 1px out, and under a
 * coarse pointer a transparent `::after` reaching `--c-inline-chip-hit-x`
 * past each end. Option B's keycap chips start `space-1` in.
 */
import "./chip-options.css";

export function chipOver(start: "mark" | "keycap" = "mark"): string {
  return [
    "relative max-w-[min(100%,var(--c-inline-chip-max-w))] [--chip-ground:var(--chip-inline-bg)] bg-(color:--chip-ground) inset-ring-(color:--chip-inline-ring) can-hover:enabled:hover:[--chip-ground:var(--chip-inline-hover)] can-hover:enabled:hover:bg-(color:--chip-ground) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring coarse:after:absolute coarse:after:inset-y-0 coarse:after:-inset-x-(--c-inline-chip-hit-x) coarse:after:content-['']",
    start === "keycap" ? "ps-space-1" : "",
  ].join(" ");
}
