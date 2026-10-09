<script lang="ts">
  /**
   * A draft's attachments, as chips in one row: a picture with its name, a
   * text or a file as its DocThumb (the file's size, a ring filling while it
   * uploads, "Couldn't upload" and a press to try again), each with its
   * remove. The row folds open with its first chip and shut with its last;
   * the chips in it are a list (motion/rows.svelte.ts): one added pops in,
   * one removed shrinks to the pop scale as it fades, and the rest slide
   * together. A session's composer and New session's first prompt both draw
   * it.
   */
  import type { Snippet } from "svelte";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { IconClose } from "#lib/icons.js";
  import type { ComposerDraft } from "./composer-draft.svelte";
  import DocThumb from "./DocThumb.svelte";

  let {
    draft,
    notes,
    hasNotes = false,
  }: {
    draft: ComposerDraft;
    /** Chips that lead the row, the composer's element notes. */
    notes?: Snippet;
    /** Whether `notes` has any to show. */
    hasNotes?: boolean;
  } = $props();

  const removeImage = (i: number) => {
    draft.images = draft.images.filter((_, n) => n !== i);
  };
  const removeText = (i: number) => {
    draft.texts = draft.texts.filter((_, n) => n !== i);
  };
  const removeFile = (id: string) => {
    draft.files = draft.files.filter((file) => file.id !== id);
  };
</script>

{#if hasNotes ||
  draft.images.length ||
  draft.texts.length ||
  draft.files.length}
  <div class="atts" transition:unfold {@attach reflow()}>
    {@render notes?.()}
    {#each draft.images as img, i (img.name + i)}
      <span class="att" data-flip="pop">
        <img alt="" src="data:{img.mediaType};base64,{img.data}">
        <span class="att-name">{img.name}</span>
        <button
          aria-label={`Remove ${img.name}`}
          class="touch-hit"
          onclick={() => removeImage(i)}
          type="button"
        >
          <IconClose />
        </button>
      </span>
    {/each}
    <!-- A file looks here as it will in the sent turn: its DocThumb, which
       previews it the same way, with its remove on the corner. -->
    {#each draft.texts as t, i (t.name + i)}
      <span class="doc-att" data-flip="pop">
        <DocThumb content={t.content} name={t.name} />
        <button
          aria-label={`Remove ${t.name}`}
          class="doc-remove touch-hit"
          onclick={() => removeText(i)}
          type="button"
        >
          <IconClose />
        </button>
      </span>
    {/each}
    {#each draft.files as f (f.id)}
      <span class="doc-att" data-flip="pop">
        <DocThumb
          failed={f.error}
          name={f.name}
          onretry={() => draft.upload(f.id)}
          progress={f.ref || f.error ? undefined : f.progress}
          size={f.size}
        />
        <button
          aria-label={`Remove ${f.name}`}
          class="doc-remove touch-hit"
          onclick={() => removeFile(f.id)}
          type="button"
        >
          <IconClose />
        </button>
      </span>
    {/each}
  </div>
{/if}

<style>
  /* The row scrolls, so on a coarse pointer it takes 8px more padding into
     an equal negative margin: the remove buttons' touch areas fit inside its
     clip, nothing moves. */
  .atts {
    --hit-gap-x: var(--space-2);
    --hit-gap-y: var(--space-2);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    max-height: 180px;
    overflow-y: auto;
    padding: var(--space-1);
    transition: var(--step-aside);

    @media (pointer: coarse) {
      padding: calc(var(--space-1) + 8px);
      margin: -8px;
    }
  }
  .att {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    max-width: 100%;
    padding: var(--space-1) var(--space-1) var(--space-1) var(--space-2);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  /* The name carries the ellipsis, so the chip itself does not clip its
     remove button's touch area. */
  .att-name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .att img {
    width: 20px;
    height: 20px;
    border-radius: var(--radius-xs);
    object-fit: cover;
    flex: 0 0 auto;
  }
  .att button {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    flex: 0 0 auto;
  }
  .att button:hover {
    background: var(--surface-recess);
    color: var(--ink-strong);
  }
  /* A file's DocThumb with its remove sat on the corner, clear of the name. */
  .doc-att {
    position: relative;
    display: inline-flex;
    max-width: 100%;
  }
  .doc-remove {
    --hit-edge: 1px;
    position: absolute;
    /* The row pads by --space-1, so the corner sits inside its clip. */
    inset-block-start: calc(var(--space-1) * -1);
    inset-inline-end: calc(var(--space-1) * -1);
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-xs);
    background: var(--surface-raised);
    color: var(--ink-muted);
    cursor: pointer;

    & :global(svg) {
      inline-size: 14px;
      block-size: 14px;
    }
    &:hover {
      color: var(--ink-strong);
    }
  }
  .att button :global(svg) {
    inline-size: 16px;
    block-size: 16px;
  }
</style>
