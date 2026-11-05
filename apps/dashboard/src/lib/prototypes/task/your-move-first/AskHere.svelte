<script lang="ts">
  /**
   * Asking in the page (DESIGN.md, Asking in the page): the question
   * unfolds in the page's flow under the control that asked it, a raised
   * tile holding its title in the label role and the consequence in meta,
   * what it needs filled in, then Cancel at one end and the verb at the
   * other. The verb stays pending until the hub answers; a refusal stays
   * under the question in the hub's words, and only a move that went closes
   * the tile. It takes the focus on Cancel as it opens.
   */
  import type { Snippet } from "svelte";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";

  let {
    title,
    consequence,
    cancel,
    verb,
    pendingLabel,
    pending = false,
    refusal = null,
    destructive = false,
    oncancel,
    onconfirm,
    children,
  }: {
    title: string;
    consequence: string;
    cancel: string;
    verb: string;
    pendingLabel: string;
    pending?: boolean;
    /** The hub's refusal, in its words; null while there is none. */
    refusal?: string | null;
    /** The verb ends something (Drop task): the destructive edge and ink. */
    destructive?: boolean;
    oncancel: () => void;
    onconfirm: () => void;
    children?: Snippet;
  } = $props();

  const focusCancel = (node: HTMLElement) => {
    node.focus({ preventScroll: true });
  };
</script>

<div
  class="flex flex-col gap-space-3 rounded-md border border-border-control bg-surface-raised p-space-4 shadow-raised"
  data-slot="ask-here"
  in:unfold
  out:unfold
>
  <div class="flex flex-col gap-space-1">
    <p class="m-0 type-label text-ink-strong">{title}</p>
    <p class="m-0 type-meta text-ink-muted text-pretty">{consequence}</p>
  </div>
  {#if children}
    {@render children()}
  {/if}
  {#if refusal}
    <p
      class="m-0 rounded-sm bg-status-fail-bg px-space-3 py-space-2 type-body text-status-fail-ink text-pretty"
      role="alert"
    >
      {refusal}
    </p>
  {/if}
  <div class="flex items-center justify-between gap-space-8">
    <Button
      hit="always"
      size="sm"
      variant="ghost"
      onclick={oncancel}
      {@attach focusCancel}>{cancel}</Button
    >
    <Button
      hit="always"
      label={verb}
      {pending}
      {pendingLabel}
      failed={refusal !== null}
      size="sm"
      variant={destructive ? "destructive" : "outline"}
      onclick={onconfirm}
    />
  </div>
</div>
