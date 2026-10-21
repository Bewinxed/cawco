<script lang="ts">
  /**
   * A draft's attachments, as chips in one row: one chip for every kind, the
   * house's pill (the tray chip's height), its 20px lead (a picture's thumb,
   * a text's or a file's glyph, the ring while a file uploads), its name,
   * what it is after the name (a file's size, a text's lines, "Couldn't
   * upload"), and its remove inline at the trailing end. A text opens in the
   * lightbox from its body; a failed upload tries again from its body. The
   * folded canvas leads the row in the same pill.
   *
   * The row folds open with its first chip and shut with its last; the chips
   * in it are a list (motion/rows.svelte.ts): one added pops in, one removed
   * shrinks to the pop scale as it fades, and the rest slide together. A
   * session's composer, New session's first prompt and the comment composer
   * draw it.
   */
  import { humanSize } from "@cawco/core";
  import type { Component } from "svelte";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { pressVariants } from "#lib/components/ui/button/index.js";
  import { IconArtifactCanvas, IconClose } from "#lib/icons.js";
  import { lightbox } from "../lightbox/lightbox-state.svelte";
  import type { ComposerDraft } from "./composer-draft.svelte";
  import { glyphOf, linesLine, nameParts } from "./doc-face";
  import UploadRing from "./UploadRing.svelte";

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

  /** One attachment as its chip draws it. */
  interface Chip {
    failed?: string;
    key: string;
    /** The lead: a picture's thumb, the kind's glyph, or the upload's ring. */
    lead:
      | { kind: "thumb"; src: string }
      | { kind: "glyph"; glyph: Component }
      | { kind: "ring"; progress: number };
    /** What it is, after its name; none for a picture. */
    meta?: string;
    name: string;
    onremove: () => void;
    /** The body's press: open it, or try its upload again; none where the body does nothing. */
    press?: { label: string; run: () => void };
  }

  const share = $props.id();
  const chips = $derived<Chip[]>([
    ...draft.images.map((img, i) => ({
      key: `image:${img.name}:${i}`,
      name: img.name,
      lead: { kind: "thumb" as const, src: `data:${img.mediaType};base64,${img.data}` },
      onremove: () => {
        draft.images = draft.images.filter((_, n) => n !== i);
      },
    })),
    ...draft.texts.map((t, i) => ({
      key: `text:${t.name}:${i}`,
      name: t.name,
      lead: { kind: "glyph" as const, glyph: glyphOf(t.name) },
      meta: linesLine(t.content),
      press: {
        label: `Open ${t.name}`,
        run: () => lightbox.open({ kind: "text", name: t.name, content: t.content, share: `${share}:${i}` }),
      },
      onremove: () => {
        draft.texts = draft.texts.filter((_, n) => n !== i);
      },
    })),
    ...draft.files.map((f) => {
      const uploading = !(f.ref || f.error);
      return {
        key: `file:${f.id}`,
        name: f.name,
        lead: uploading
          ? { kind: "ring" as const, progress: f.progress }
          : { kind: "glyph" as const, glyph: glyphOf(f.name) },
        meta: f.error ? "Couldn't upload" : humanSize(f.size),
        failed: f.error,
        press: f.error
          ? { label: `Couldn't upload ${f.name}: ${f.error} Try again`, run: () => draft.upload(f.id) }
          : undefined,
        onremove: () => {
          draft.files = draft.files.filter((file) => file.id !== f.id);
        },
      };
    }),
  ]);

  const REMOVE = pressVariants({
    press: "scale",
    class:
      "select-none grid place-items-center size-icon-lg border-none border-current rounded-xs bg-transparent text-ink-muted flex-none hover:bg-surface-recess hover:text-ink-strong touch-hit pointer-hit",
  });
  const CHIP =
    "inline-flex items-center gap-space-2 max-w-full h-c-tray-chip ps-space-1 pe-space-1 border border-border-hairline rounded-sm bg-surface-raised shadow-tile text-size-label font-medium text-ink-strong mark-line hit-gap-x-space-2 coarse:hit-gap-x-space-3";
  const BODY =
    "select-none inline-flex items-center gap-space-2 min-w-0 h-full p-0 border-none bg-transparent text-start text-ink-strong rounded-xs touch-hit pointer-hit";
</script>

{#snippet face(chip: Chip)}
  <span
    aria-hidden="true"
    class="grid place-items-center size-icon-lg flex-none text-ink-muted"
    data-box
  >
    {#if chip.lead.kind === "thumb"}
      <img alt="" class="size-icon-lg rounded-xs object-cover" src={chip.lead.src} />
    {:else if chip.lead.kind === "ring"}
      <UploadRing class="size-icon-md" progress={chip.lead.progress} />
    {:else}
      {@const Glyph = chip.lead.glyph}
      <Glyph class="size-icon-md" />
    {/if}
  </span>
  {@const parts = nameParts(chip.name)}
  <span class="flex min-w-0 items-baseline gap-space-1">
    <span data-slot="att-name" class="flex min-w-0 whitespace-nowrap"
      ><span class="min-w-0 truncate">{parts.head}</span><span class="flex-none"
        >{parts.tail}</span
      ></span
    >
    {#if chip.meta}
      <span
        data-slot="att-meta"
        class={[
          "flex-none whitespace-nowrap text-size-meta font-normal tabular-nums",
          chip.failed ? "text-status-fail-ink" : "text-ink-muted",
        ]}>{chip.meta}</span
      >
    {/if}
  </span>
{/snippet}

{#if folded || chips.length > 0}
  <!-- In the composer's dock the row takes the pointer the composer does not;
       while the canvas stands, it stands in the grown shape over the field,
       above its surface; while an ask holds the composer it steps aside with
       the rest. Its chips' removes stand inline, so the row pads only above
       and below, room in its scroll clip for their touch areas, and the
       negative margin gives the layout that room back. -->
  <div
    data-atts
    class="flex flex-wrap gap-c-tray-gap max-h-c-atts-max-h overflow-y-auto py-space-2 -my-space-2 pointer-events-auto transition-fade-show group-data-drawing/dock:relative group-data-drawing/dock:z-2 group-data-asking/dock:opacity-0 group-data-asking/dock:invisible group-data-asking/dock:transition-fade-hide"
    transition:unfold
    {@attach reflow()}
  >
    {#if folded}
      <!-- The canvas, folded: a tap opens it again out of this box. -->
      <span
        data-slot="canvas-chip"
        class={[CHIP, "data-canvas-hidden:invisible"]}
        data-artifact={folded.id}
        data-canvas-hidden={canvasHidden || undefined}
        data-flip="pop"
        bind:this={canvasChip}
      >
        <button
          data-slot="canvas-open"
          aria-label="Open the canvas"
          class={pressVariants({ press: "scale", class: BODY })}
          onclick={onopencanvas}
          type="button"
        >
          <span aria-hidden="true" class="grid place-items-center size-icon-lg flex-none text-ink-muted">
            {#if folded.thumb}
              <img
                alt=""
                class="size-icon-lg rounded-xs object-cover"
                src="data:image/png;base64,{folded.thumb}"
              />
            {:else}
              <IconArtifactCanvas class="size-icon-md" />
            {/if}
          </span>
          <span data-slot="att-name" class="min-w-0 truncate">Canvas</span>
        </button>
        <button
          aria-label="Remove the canvas"
          class={REMOVE}
          onclick={onremovecanvas}
          type="button"
        >
          <IconClose class="size-icon-md" />
        </button>
      </span>
    {/if}
    {#each chips as chip (chip.key)}
      <span
        class={CHIP}
        aria-busy={chip.lead.kind === "ring" || undefined}
        data-flip="pop"
        title={chip.failed ? `${chip.name}: ${chip.failed}` : chip.name}
      >
        {#if chip.press}
          <button
            aria-label={chip.press.label}
            class={pressVariants({ press: "scale", class: [BODY, "press-tint hover:bg-surface-hover"] })}
            onclick={chip.press.run}
            type="button"
          >
            {@render face(chip)}
          </button>
        {:else if chip.lead.kind === "ring"}
          <span
            aria-label={`Uploading ${chip.name}`}
            class="inline-flex items-center gap-space-2 min-w-0"
            role="status"
          >
            {@render face(chip)}
          </span>
        {:else}
          <span class="inline-flex items-center gap-space-2 min-w-0">
            {@render face(chip)}
          </span>
        {/if}
        <button
          aria-label={`Remove ${chip.name}`}
          class={REMOVE}
          onclick={chip.onremove}
          type="button"
        >
          <IconClose class="size-icon-md" />
        </button>
      </span>
    {/each}
  </div>
{/if}
