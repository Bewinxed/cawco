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
  import { pressVariants } from "#lib/components/ui/button/index.js";
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
  <!-- In the composer's dock the row takes the pointer the composer does not;
       while the canvas stands, it stands in the grown shape over the field,
       above its surface; while an ask holds the composer it steps aside with
       the rest. -->
  <!-- Full-bleed scroller: the row scrolls, so it pads into an equal
       negative margin (DESIGN.md, The 44 Touch Rule), its chips standing
       --space-1 in as they always have. The padding is room inside the
       scroll clip for the remove buttons' whole areas, a corner ✕ standing
       --space-1 past its file's corner: 24px on a fine pointer (the room
       --space-3 holds), 44px on a coarse one (--space-5); the margin gives
       the layout that room back, so nothing moves. -->
  <div
    data-atts
    class="flex flex-wrap gap-space-2 max-h-c-atts-max-h overflow-y-auto p-space-3 -m-space-2 coarse:p-space-5 coarse:-m-space-4 pointer-events-auto transition-fade-show group-data-drawing/dock:relative group-data-drawing/dock:z-2 group-data-asking/dock:opacity-0 group-data-asking/dock:invisible group-data-asking/dock:transition-fade-hide"
    transition:unfold
    {@attach reflow()}
  >
    {#if folded}
      <!-- The canvas, folded: a tap opens it again out of this box. Its open
           and its remove stand --space-2 apart, so their areas stop at the
           midpoint between them (DESIGN.md, The 44 Touch Rule). -->
      <span
        data-slot="canvas-chip"
        class="inline-flex items-center gap-space-2 max-w-full py-space-1 pe-space-1 ps-space-2 border border-border-hairline rounded-sm bg-surface-raised shadow-tile text-size-label font-medium text-ink-strong hit-gap-x-space-2 data-canvas-hidden:invisible"
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
          class={pressVariants({
            press: "scale",
            class:
              "inline-flex items-center gap-space-2 w-auto min-w-0 h-icon-lg p-0 border-none border-current rounded-xs bg-transparent text-ink-strong flex-none mark-line touch-hit pointer-hit",
          })}
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
          class={pressVariants({
            press: "scale",
            class:
              "grid place-items-center size-icon-lg border-none border-current rounded-xs bg-transparent text-ink-muted flex-none hover:bg-surface-recess hover:text-ink-strong touch-hit pointer-hit",
          })}
          onclick={onremovecanvas}
          type="button"
        >
          <IconClose class="size-icon-md" />
        </button>
      </span>
    {/if}
    {#each draft.images as img, i (img.name + i)}
      <span
        class="inline-flex items-center gap-space-2 max-w-full py-space-1 pe-space-1 ps-space-2 border border-border-hairline rounded-sm bg-surface-raised shadow-tile text-size-label font-medium text-ink-strong mark-line"
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
          class={pressVariants({
            press: "scale",
            class:
              "grid place-items-center size-icon-lg border-none border-current rounded-xs bg-transparent text-ink-muted flex-none hover:bg-surface-recess hover:text-ink-strong touch-hit pointer-hit",
          })}
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
          class={pressVariants({
            press: "scale",
            class:
              "absolute -top-space-1 -end-space-1 grid place-items-center size-icon-lg border border-border-hairline hit-edge-hair rounded-xs bg-surface-raised text-ink-muted hover:text-ink-strong touch-hit pointer-hit",
          })}
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
          class={pressVariants({
            press: "scale",
            class:
              "absolute -top-space-1 -end-space-1 grid place-items-center size-icon-lg border border-border-hairline hit-edge-hair rounded-xs bg-surface-raised text-ink-muted hover:text-ink-strong touch-hit pointer-hit",
          })}
          onclick={() => removeFile(f.id)}
          type="button"
        >
          <IconClose class="size-space-4" />
        </button>
      </span>
    {/each}
  </div>
{/if}
