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
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { IconArtifactCanvas, IconClose, IconPen } from "#lib/icons.js";
  import type { InkWaiting } from "../preview/ink.svelte";
  import type { ComposerDraft } from "./composer-draft.svelte";
  import DocThumb from "./DocThumb.svelte";

  let {
    draft,
    canvasChip = $bindable(),
    canvasHidden = false,
    onopencanvas,
    onremovecanvas,
    ink,
  }: {
    draft: ComposerDraft;
    /** The folded canvas's chip, which the canvas folds into and opens out of. */
    canvasChip?: HTMLElement;
    /** Drawn but not shown: the canvas is flying into it. */
    canvasHidden?: boolean;
    onopencanvas?: () => void;
    onremovecanvas?: () => void;
    /**
     * The person's unsent ink on the session's artifact (preview/ink.svelte.ts):
     * the next Send carries it, its picture this chip's thumbnail.
     */
    ink?: InkWaiting;
  } = $props();
  const folded = $derived(draft.canvas?.folded ? draft.canvas : null);

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

{#if folded || ink || draft.images.length || draft.texts.length || draft.files.length}
  <div class="atts" transition:unfold {@attach reflow()}>
    {#if folded}
      <!-- The canvas, folded: a tap opens it again out of this box. -->
      <span
        class="att canvas-chip"
        data-artifact={folded.id}
        data-flip="pop"
        bind:this={canvasChip}
        style:visibility={canvasHidden ? "hidden" : null}
      >
        <button
          aria-label="Open the canvas"
          class="canvas-open mark-line touch-hit"
          onclick={onopencanvas}
          type="button"
        >
          {#if folded.thumb}
            <img alt="" src="data:image/png;base64,{folded.thumb}" />
          {:else}
            <IconArtifactCanvas aria-hidden="true" />
          {/if}
          <span class="att-name">Canvas</span>
        </button>
        <button
          aria-label="Remove the canvas"
          class="touch-hit"
          onclick={onremovecanvas}
          type="button"
        >
          <IconClose />
        </button>
      </span>
    {/if}
    {#if ink}
      <!-- The person's ink on the artifact: the next Send carries its pins
           and the page with the ink on it. It is the artifact's, so it has
           no remove here; Erase in the stroke's menu takes it away. -->
      <span
        aria-label={ink.pins > 0
          ? `Ink, ${ink.pins} ${ink.pins === 1 ? "pin" : "pins"}`
          : "Ink"}
        class="att ink-chip mark-line"
        data-artifact={ink.artifactId}
        data-flip="pop"
        role="img"
      >
        {#if ink.thumb}
          <img alt="" src="data:image/png;base64,{ink.thumb}" />
        {:else}
          <IconPen aria-hidden="true" />
        {/if}
        <span class="att-name">Ink</span>
      </span>
    {/if}
    {#each draft.images as img, i (img.name + i)}
      <span class="att mark-line" data-flip="pop">
        <img alt="" src="data:{img.mediaType};base64,{img.data}" />
        <span class="att-name">{img.name}</span>
        <button
          aria-label={`Remove ${img.name}`}
          class="touch-hit"
          data-box
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
    overflow: clip;
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
  /* The canvas's chip opens the canvas from its picture and name; the
     picture box holds the pen glyph until the picture is drawn. */
  .att .canvas-open {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    width: auto;
    min-width: 0;
    height: 20px;
    padding: 0;
    color: var(--ink-strong);
    font: inherit;

    & :global(svg) {
      flex: 0 0 auto;
      color: var(--ink-muted);
    }
    &:hover {
      background: none;
      color: var(--ink-strong);
    }
  }
</style>
