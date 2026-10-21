/**
 * A machine row's corners in the machines popover (MachinesChip): a chosen
 * row beside a chosen neighbour squares the corners they share, so a run of
 * chosen machines reads as one block; every other corner is the row's own,
 * `glide-row-r`, concentric with the popover's surface (The Concentric Rule).
 * `border-radius` shorthand: top-left top-right bottom-right bottom-left.
 */
export function machineRowRadius(
  on: boolean,
  prev: boolean,
  next: boolean
): string {
  const r = "var(--glide-row-r)";
  return `${on && prev ? "0 0" : `${r} ${r}`} ${on && next ? "0 0" : `${r} ${r}`}`;
}
