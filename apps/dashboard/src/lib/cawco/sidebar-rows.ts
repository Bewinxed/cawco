/**
 * A count on one of the rail's nav rows (Sidebar.svelte `NAV_ROW`, as tall
 * as `--c-nav-h`): centred on the row whatever its height. The kit's badge
 * sits a fixed 6px from the top (`peer-data-[size=default]/menu-button:top-1.5`),
 * which centres it on a 32px row only; this takes that same rule's place
 * (the class merge keeps the later of one variant's two `top`s).
 */
export const NAV_BADGE =
  "peer-data-[size=default]/menu-button:top-1/2 -translate-y-1/2";
