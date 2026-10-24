<script lang="ts">
  /**
   * Option C's answer to a chosen message, in the composer's own lead row
   * (Composer `lead`): whose message and when, as the kit's sunk setting
   * chip, then its verbs as the kit's outline buttons, and the way to put it
   * down (Esc, or the close glyph under a finger). Editing, the row says
   * what sending does to the later path where it happens, with Fork instead
   * beside it. Everything in it stands at the shell's inset, so every
   * corner is the shell's 12px less its inset and edge
   * (`composer-control-r`, The Concentric Rule).
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconClose, IconUser } from "#lib/icons.js";

  let {
    at,
    mode = "selected",
    touch = false,
    onclose,
  }: {
    /** The chosen message's clock, as its speaker line says it. */
    at: string;
    /** Chosen; chosen and failed; or its words in the field being edited. */
    mode?: "selected" | "failed" | "editing";
    /** A touch screen: no Esc to name, the close glyph alone. */
    touch?: boolean;
    onclose?: () => void;
  } = $props();

  const VERBS = {
    selected: ["Edit and resend", "Fork from here", "Copy"],
    failed: ["Retry", "Edit", "Remove"],
    editing: ["Fork instead"],
  } as const;
  const verbs = $derived(VERBS[mode]);
</script>

{#snippet close()}
  <span class="ms-auto flex flex-none items-center gap-space-1">
    {#if !touch}
      <Kbd>Esc</Kbd>
    {/if}
    <Tip keys={touch ? undefined : "Esc"} label="Put the message down">
      {#snippet children(tip)}
        <Button
          {...tip}
          aria-label="Put the message down"
          onclick={onclose}
          shape="inset"
          size="icon-xs"
          variant="ghost"
        >
          <IconClose aria-hidden="true" />
        </Button>
      {/snippet}
    </Tip>
  </span>
{/snippet}

<div
  data-slot="message-chip"
  data-mode={mode}
  class="flex w-full min-w-0 flex-col gap-space-2"
>
  {#if mode === "editing"}
    <div class="flex min-w-0 items-start gap-space-2">
      <p
        data-slot="edit-cost"
        class="min-w-0 text-size-meta font-normal text-ink-muted text-pretty"
      >
        Editing your message from {at}. The agent continues from here; its later
        turns are set aside.
      </p>
      {@render close()}
    </div>
  {:else}
    <div class="flex min-w-0 items-center gap-space-2">
      <span
        class={chipVariants({
          variant: "setting",
          class: "rounded-composer-control",
        })}
        data-slot="message-chip-who"
        data-variant="static"
        ><IconUser aria-hidden="true" /><span data-slot="chip-label"
          >You · {at}</span
        ></span
      >
      {#if mode === "failed"}
        <span class="min-w-0 text-size-meta font-normal text-status-fail-ink"
          >not sent</span
        >
      {/if}
      {@render close()}
    </div>
  {/if}
  <div data-slot="message-verbs" class="flex min-w-0 flex-wrap gap-space-2">
    {#each verbs as verb (verb)}
      <Button shape="inset" size="xs" variant="outline">{verb}</Button>
    {/each}
  </div>
</div>
