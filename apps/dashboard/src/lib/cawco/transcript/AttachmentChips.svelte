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
  import { IconArtifactCanvas, IconClose } from "#lib/icons.js";
  import type { ComposerDraft } from "./composer-draft.svelte";
  import DocThumb from "./DocThumb.svelte";

  let {
    draft,
    canvasChip = $bindable(),
    canvasHidden = false,
    onopencanvas,
    onremovecanvas,
  }: {
    draft: ComposerDraft;
    /** The folded canvas's chip, which the canvas folds into and opens out of. */
    canvasChip?: HTMLElement;
    /** Drawn but not shown: the canvas is flying into it. */
    canvasHidden?: boolean;
    onopencanvas?: () => void;
    onremovecanvas?: () => void;
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

{#if folded || draft.images.length || draft.texts.length || draft.files.length}
  <!-- The row scrolls, so on a coarse pointer it takes 8px more padding into
       an equal negative margin: the remove buttons' touch areas fit inside
       its clip, nothing moves. -->
  <!-- literal: 180px, -8px -->
  <div
    data-slot="atts"
    style:--hit-gap-x="var(--space-2)"
    style:--hit-gap-y="var(--space-2)"
    style:--atts-max-h="180px"
    style:--atts-pad-coarse="calc(var(--space-1) + 8px)"
    style:--atts-m-coarse="-8px"
    class="atts flex flex-wrap gap-space-2 max-h-(--atts-max-h) overflow-y-auto p-space-1 coarse:p-(--atts-pad-coarse) coarse:m-(--atts-m-coarse)"
    transition:unfold
    {@attach reflow()}
  >
    {#if folded}
      <!-- The canvas, folded: a tap opens it again out of this box. -->
      <span
        data-slot="canvas-chip"
        class="inline-flex items-center gap-space-2 max-w-full py-space-1 pr-space-1 pl-space-2 border border-border-hairline rounded-sm bg-surface-raised shadow-tile text-size-label font-medium text-ink-strong data-canvas-hidden:invisible"
        data-artifact={folded.id}
        data-canvas-hidden={canvasHidden || undefined}
        data-flip="pop"
        bind:this={canvasChip}
      >
        <!-- The canvas's chip opens the canvas from its picture and name;
             the picture box holds the pen glyph until the picture is drawn. -->
        <button
          data-slot="canvas-open"
          aria-label="Open the canvas"
          class="inline-flex place-items-center gap-space-2 w-auto min-w-0 h-icon-lg p-0 border-0 rounded-xs bg-transparent text-ink-strong cursor-pointer flex-none mark-line touch-hit"
          onclick={onopencanvas}
          type="button"
        >
          {#if folded.thumb}
            <img
              alt=""
              class="size-icon-lg rounded-xs object-cover flex-none"
              src="data:image/png;base64,{folded.thumb}"
            />
          {:else}
            <IconArtifactCanvas
              aria-hidden="true"
              class="size-icon-md flex-none text-ink-muted"
            />
          {/if}
          <!-- The name carries the ellipsis, so the chip itself does not
               clip its remove button's touch area. -->
          <span
            data-slot="att-name"
            class="min-w-0 overflow-clip whitespace-nowrap text-ellipsis"
            >Canvas</span
          >
        </button>
        <button
          aria-label="Remove the canvas"
          class="grid place-items-center size-icon-lg border-0 rounded-xs bg-transparent text-ink-muted cursor-pointer flex-none hover:bg-surface-recess hover:text-ink-strong touch-hit"
          onclick={onremovecanvas}
          type="button"
        >
          <IconClose class="size-icon-md" />
        </button>
      </span>
    {/if}
    {#each draft.images as img, i (img.name + i)}
      <span
        class="inline-flex items-center gap-space-2 max-w-full py-space-1 pr-space-1 pl-space-2 border border-border-hairline rounded-sm bg-surface-raised shadow-tile text-size-label font-medium text-ink-strong mark-line"
        data-flip="pop"
      >
        <img
          alt=""
          class="size-icon-lg rounded-xs object-cover flex-none"
          src="data:{img.mediaType};base64,{img.data}"
        />
        <span
          data-slot="att-name"
          class="min-w-0 overflow-clip whitespace-nowrap text-ellipsis"
          >{img.name}</span
        >
        <button
          aria-label={`Remove ${img.name}`}
          class="grid place-items-center size-icon-lg border-0 rounded-xs bg-transparent text-ink-muted cursor-pointer flex-none hover:bg-surface-recess hover:text-ink-strong touch-hit"
          data-box
          onclick={() => removeImage(i)}
          type="button"
        >
          <IconClose class="size-icon-md" />
        </button>
      </span>
    {/each}
    <!-- A file looks here as it will in the sent turn: its DocThumb, which
       previews it the same way, with its remove on the corner, clear of the
       name. The row pads by --space-1, so the corner sits inside its clip. -->
    {#each draft.texts as t, i (t.name + i)}
      <span class="relative inline-flex max-w-full" data-flip="pop">
        <DocThumb content={t.content} name={t.name} />
        <button
          aria-label={`Remove ${t.name}`}
          style:--hit-edge="1px"
          class="absolute -top-space-1 -end-space-1 grid place-items-center size-icon-lg border border-border-hairline rounded-xs bg-surface-raised text-ink-muted cursor-pointer hover:text-ink-strong touch-hit"
          onclick={() => removeText(i)}
          type="button"
        >
          <IconClose class="size-space-4" />
        </button>
      </span>
    {/each}
    {#each draft.files as f (f.id)}
      <span class="relative inline-flex max-w-full" data-flip="pop">
        <DocThumb
          failed={f.error}
          name={f.name}
          onretry={() => draft.upload(f.id)}
          progress={f.ref || f.error ? undefined : f.progress}
          size={f.size}
        />
        <button
          aria-label={`Remove ${f.name}`}
          style:--hit-edge="1px"
          class="absolute -top-space-1 -end-space-1 grid place-items-center size-icon-lg border border-border-hairline rounded-xs bg-surface-raised text-ink-muted cursor-pointer hover:text-ink-strong touch-hit"
          onclick={() => removeFile(f.id)}
          type="button"
        >
          <IconClose class="size-space-4" />
        </button>
      </span>
    {/each}
  </div>
{/if}

<style>
  /* residual: unmapped: the step-aside transition token has no utility;
     the class also anchors Composer's `:global(.atts)` rules. */
  .atts {
    transition: var(--step-aside);
  }
  [data-slot="canvas-open"] {
    font: inherit;
  }
</style>
