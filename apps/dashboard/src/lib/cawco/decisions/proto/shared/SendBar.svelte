<script lang="ts">
  /**
   * The panel's one bar, one 44px row (DESIGN.md, The Title Bars Follow
   * Liquid Glass Rule): the request's title leading, Send trailing as the
   * one prominent action, so it is always in reach and never covers a
   * question. After a Send it says when and to whom it went, and a change
   * since re-arms it.
   */
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { DecisionState } from "./decision.svelte";

  let {
    dec,
    title,
    centre,
  }: {
    dec: DecisionState;
    /** The leading words, a button that opens the brief where one does. */
    title?: Snippet;
    /** The view's switch in the bar's centre group. */
    centre?: Snippet;
  } = $props();
</script>

<header
  class="sticky top-0 z-2 flex h-c-top-bar-h flex-none items-center gap-space-3 bg-material-panel px-space-4 backdrop-blur-(--material-blur) backdrop-saturate-(--material-saturate)"
>
  <div class="flex min-w-0 flex-1 items-center gap-space-2">
    {#if title}
      {@render title()}
    {:else}
      <h1
        class="type-label overflow-clip text-ellipsis whitespace-nowrap text-ink-strong"
      >
        {dec.request.title}
      </h1>
    {/if}
  </div>
  {#if centre}
    <div class="flex-none">{@render centre()}</div>
  {/if}
  <div class="flex min-w-0 flex-1 items-center justify-end gap-space-3">
    {#if dec.sentAt}
      <span
        class="type-meta min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-muted"
        aria-live="polite"
      >
        Sent to {dec.request.asker.name} · {dec.sentAt}
      </span>
    {/if}
    {#if dec.sendWord}
      <Button
        size="sm"
        variant={dec.canSend ? "default" : "outline"}
        disabled={!dec.canSend}
        pending={dec.sending}
        label={dec.sendWord}
        pendingLabel="Sending…"
        aria-keyshortcuts="Meta+Enter Control+Enter"
        onclick={() => dec.send()}
      />
    {/if}
  </div>
</header>
