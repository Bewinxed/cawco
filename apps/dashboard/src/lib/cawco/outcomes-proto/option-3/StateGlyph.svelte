<script lang="ts">
  /**
   * Where something stands, as a glyph: done, not yet, not known, true
   * once and no longer checked, or waiting on him. It sits in its row's
   * lead column, a line box tall, so it centres on the first line of the
   * words beside it, which always say the state too (DESIGN.md, Status
   * reads by glyph, then word, then hue). `quiet` draws it in muted ink: on
   * the first view only Needs you takes a hue, so the one thing that needs
   * him is the one thing in colour (designing-first-views, step 4).
   */
  import {
    IconError,
    IconHistory,
    IconNeedsYou,
    IconNotYet,
    IconSuccess,
  } from "#lib/icons.js";

  let {
    state,
    quiet = false,
  }: {
    state: "done" | "notYet" | "unknown" | "was" | "needsYou";
    quiet?: boolean;
  } = $props();
</script>

<span
  aria-hidden="true"
  class="grid h-lh w-icon-sm flex-none place-items-center"
  data-state={state}
>
  {#if state === "needsYou"}
    <IconNeedsYou class="size-icon-sm text-status-attn-glyph" />
  {:else if state === "done"}
    <IconSuccess
      class={[
        "size-icon-sm",
        quiet ? "text-ink-muted" : "text-status-done-glyph",
      ]}
    />
  {:else if state === "notYet"}
    <IconError
      class={[
        "size-icon-sm",
        quiet ? "text-ink-muted" : "text-status-fail-glyph",
      ]}
    />
  {:else if state === "unknown"}
    <IconNotYet class="size-icon-sm text-status-idle-glyph" />
  {:else}
    <IconHistory class="size-icon-sm text-ink-subtle" />
  {/if}
</span>
