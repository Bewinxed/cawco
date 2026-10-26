<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  /**
   * A tray's live line under the state's object: its mark (the live dot
   * while it waits, a tick once it landed), its words, and its one text
   * action. The action wraps under the words; with `wrap` the words wrap
   * beside their mark instead, never off it, and the tick pops in (reflow's
   * data-flip "pop"). Further attributes and attachments go to the line.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconSuccess } from "#lib/icons.js";
  import type { Meta } from "./words";

  let {
    meta,
    center = false,
    wrap = false,
    ...rest
  }: HTMLAttributes<HTMLParagraphElement> & {
    meta: Meta;
    /** The line stands centred, under centred words. */
    center?: boolean;
    wrap?: boolean;
  } = $props();
</script>

{#snippet tick()}
  <IconSuccess aria-hidden="true" class="size-icon-sm text-status-done-ink" />
{/snippet}

<p
  {...rest}
  class={[
    "mark-line m-0 flex min-w-0",
    !wrap && "flex-wrap",
    "items-start",
    center && "justify-center",
    "gap-x-space-2",
    !wrap && "gap-y-space-1",
    "type-meta text-ink-muted",
  ]}
>
  <span class="mark-cell">
    {#if meta.live}
      <LiveDot />
    {:else if wrap}
      <span class="grid" data-flip="pop">{@render tick()}</span>
    {:else}
      {@render tick()}
    {/if}
  </span>
  <span class={["mark-text min-w-0", wrap && "flex-1"]}
    ><MorphText text={meta.text} {wrap} /></span
  >
  {#if meta.action}
    <Button
      data-box
      label={meta.action.label}
      onclick={meta.action.act}
      size="xs"
      variant="link"
    />
  {/if}
</p>
