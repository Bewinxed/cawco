<script lang="ts">
  /**
   * Attach: a press opens the system's picker (files, and on a phone its
   * photos and camera), and what is picked joins the draft
   * (`ComposerDraft.add`). A session's composer and New session's first
   * prompt both carry it. Its box is the composer's control size,
   * `--c-composer-field`, concentric with a shell inset by
   * `--c-composer-inset`.
   */
  import { IconPlus } from "#lib/icons.js";
  import type { ComposerDraft } from "./composer-draft.svelte";

  let { draft }: { draft: ComposerDraft } = $props();

  let input = $state<HTMLInputElement>();

  function onpick(event: Event): void {
    const picker = event.currentTarget as HTMLInputElement;
    if (picker.files?.length) {
      // Copied first: `picker.files` is live, and clearing the input below
      // empties it while the reads are still walking it — a pick of several
      // files kept only the first.
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — the file input clears synchronously below, independent of the read.
      void draft.add([...picker.files]);
    }
    picker.value = "";
  }
</script>

<input
  class="hidden-file"
  multiple
  onchange={onpick}
  type="file"
  bind:this={input}
>
<button
  aria-label="Attach a file or image"
  class="att-btn touch-hit"
  onclick={() => input?.click()}
  type="button"
>
  <IconPlus />
</button>

<style>
  .hidden-file {
    display: none;
  }
  .att-btn {
    --hit-edge: 1px;
    width: var(--c-composer-field);
    height: var(--c-composer-field);
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    cursor: pointer;
    /* Concentric with the shell: outer radius less the inset that seats it. */
    border-radius: calc(var(--radius-lg) - var(--c-composer-inset));
    border: 1px solid var(--border-control);
    background: var(--surface-raised);
    color: var(--ink-muted);
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out);
    @media (prefers-reduced-motion: no-preference) {
      transition:
        background-color var(--dur-control) var(--ease-out),
        color var(--dur-control) var(--ease-out),
        transform var(--dur-control) var(--ease-out);
    }
  }
  .att-btn :global(svg) {
    width: 16px;
    height: 16px;
  }
  @media (hover: hover) and (pointer: fine) {
    .att-btn:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .att-btn:active {
      transform: scale(var(--press-scale));
    }
  }
</style>
