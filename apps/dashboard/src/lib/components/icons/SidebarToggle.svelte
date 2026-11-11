<script lang="ts">
  // The desk's sidebar toggle (Shell `rail-toggle`): Solar Linear's
  // panel-left, one glyph whose frame stands still while its chevron turns.
  // The paths are Solar's own (panel-left-close-linear: the frame, the
  // divider and the chevron pointing into the panel, Hide sidebar); `away`
  // turns the chevron half a turn about its own centre to point out of the
  // panel, which is panel-left-open-linear's chevron exactly (Show
  // sidebar). The turn is a transform on the chevron's group alone, on the
  // clock its host sets (`--turn-dur`, on `--ease-drawer`); with less
  // motion it turns at once. 24px grid, 1.5 linear stroke, round caps, a
  // bar's symbol beside Solar's linear bar icons.
  import type { SVGAttributes } from "svelte/elements";

  let {
    away = false,
    ...rest
  }: SVGAttributes<SVGSVGElement> & {
    /** The sidebar is away: the chevron points out of the panel. */
    away?: boolean;
  } = $props();
</script>

<svg
  aria-hidden="true"
  fill="none"
  height="1.2em"
  viewBox="0 0 24 24"
  width="1.2em"
  xmlns="http://www.w3.org/2000/svg"
  {...rest}
>
  <g stroke="currentColor" stroke-linecap="round" stroke-width="1.5">
    <path
      d="M14 21H10C6.22876 21 4.34315 21 3.17157 19.8284C2 18.6569 2 16.7712 2 13V11C2 7.22876 2 5.34315 3.17157 4.17157C4.34315 3 6.22876 3 10 3H14C17.7712 3 19.6569 3 20.8284 4.17157C22 5.34315 22 7.22876 22 11V13C22 16.7712 22 18.6569 20.8284 19.8284C19.6569 21 17.7712 21 14 21Z"
    />
    <path d="M9 21L9 3" />
  </g>
  <g
    class="transform-fill origin-center transition-transform duration-(--turn-dur) ease-drawer data-away:rotate-180 motion-reduce:transition-none"
    data-away={away || undefined}
    data-slot="chevron"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="1.5"
  >
    <path d="M16.7832 9L14.2118 12L16.7832 15" />
  </g>
</svg>
