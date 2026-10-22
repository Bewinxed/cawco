<script lang="ts">
  /**
   * The agent's speaker line as Who.svelte draws it (its mark in solid
   * brand, the name at the body step, the clock held back until the turn is
   * hovered), drawn from props with Who's own classes: Who formats ages
   * through utils/time, which brings the whole core package into the canvas
   * page.
   */
  import { IconAgent } from "#lib/icons.js";

  let { name, clock }: { name: string; clock: string } = $props();
</script>

<h2
  class="mark-line mb-space-2 flex items-center gap-space-2 font-medium text-ink-muted text-size-label"
  data-turn-who
>
  <span
    aria-hidden="true"
    class="flex size-(--row-mark-box) flex-none items-center justify-center rounded-xs bg-brand-solid text-on-brand leading-0"
    data-box
    data-slot="dot"
  >
    <IconAgent class="block size-icon-sm" />
  </span>
  <span class="font-medium text-ink-strong text-size-label" data-slot="role"
    >{name}</span
  >
  <time
    class="ms-auto text-ink-muted tabular-nums font-normal text-size-meta opacity-0 group-hover/turn:opacity-100 group-focus-within/turn:opacity-100 no-hover:opacity-100 coarse:opacity-100 motion-safe:transition-[opacity] motion-safe:duration-(--dur-control) motion-safe:ease-out"
    data-slot="when">{clock}</time
  >
</h2>
