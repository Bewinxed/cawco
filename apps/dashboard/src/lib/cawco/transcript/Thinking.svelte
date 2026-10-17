<script lang="ts">
  import { untrack } from "svelte";
  import {
    CURVE,
    dur,
    easeOut,
    lifting,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { ThinkingIndicator } from "#lib/components/ui/thinking-indicator/index.js";
  import {
    ThinkingStep,
    ThinkingSteps,
    ThinkingStepsContent,
    ThinkingStepsHeader,
  } from "#lib/components/ui/thinking-steps/index.js";
  import { IconCpu } from "#lib/icons.js";

  let {
    text,
    live = false,
    announce = false,
    fades = false,
    folding = false,
  }: {
    text: string;
    live?: boolean;
    announce?: boolean;
    /** New reasoning is shown arriving: each new step, each streamed chunk. */
    fades?: boolean;
    /**
     * This block is the live reasoning the reader just watched, settled into
     * its row. It is the same object, so it arrives as it was — open — and
     * then folds shut, with the fold's own height tween.
     */
    folding?: boolean;
  } = $props();
  const FENCE = /^\s*(```|~~~)/;
  /** Emphasis, code ticks and heading marks: noise in a three-line glimpse. */
  const MARKUP = /[*_`#>]/g;
  const TAIL_CHARS = 240;

  /**
   * One step per block: blocks part on blank lines, except inside a fenced
   * code block, where a blank line is part of the code.
   */
  function splitBlocks(source: string): string[] {
    const blocks: string[] = [];
    let current: string[] = [];
    let fenced = false;
    for (const line of source.split("\n")) {
      if (FENCE.test(line)) {
        fenced = !fenced;
      }
      if (!fenced && line.trim() === "") {
        if (current.length) {
          blocks.push(current.join("\n"));
        }
        current = [];
        continue;
      }
      current.push(line);
    }
    if (current.some((line) => line.trim())) {
      blocks.push(current.join("\n"));
    }
    return blocks;
  }

  const paragraphs = $derived(splitBlocks(text));
  /** A running block starts open; a finished one folds to its tail. */
  let expanded = $state(untrack(() => live || folding));
  /**
   * The live block the reader just watched arrives as it was — its live
   * label too — and becomes "Reasoning" as it folds shut: the two labels
   * cross-fade in one place (--dur-control), the one leaving out of the flow
   * so the new one's width is the header's at once. The same swap plays when
   * a branch's block stops being live under the reader.
   */
  let settling = $state(untrack(() => folding));
  $effect(() => {
    if (untrack(() => folding)) {
      expanded = false;
      settling = false;
    }
  });
  const liveLabel = $derived(live || settling);
  function faceIn(_node: Element) {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
  }
  function faceOut(node: HTMLElement) {
    return lifting(
      node,
      () => ({ position: "absolute", "inset-inline-start": "0" }),
      {
        duration: dur("--dur-control"),
        easing: easeOut,
        css: (t: number) => `opacity: ${t}`,
      }
    );
  }
  /**
   * The chevron after the label travels with the label's width instead of
   * jumping to it: the cell's width tweens from the old label's to the new
   * one's, clipping on its inline axis as it goes.
   */
  let cell = $state<HTMLElement>();
  let cellWas = 0;
  $effect.pre(() => {
    // biome-ignore lint/complexity/noVoid: the swap this reads the old width for
    void liveLabel;
    cellWas = untrack(() => cell?.getBoundingClientRect().width ?? 0);
  });
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: the swap this tweens the width of
    void liveLabel;
    untrack(() => {
      if (!(cell && cellWas && motionOk.current)) {
        return;
      }
      const now = cell.getBoundingClientRect().width;
      if (Math.abs(now - cellWas) < 0.5) {
        return;
      }
      cell.animate(
        [
          { width: `${cellWas}px`, overflowX: "clip" },
          { width: `${now}px`, overflowX: "clip" },
        ],
        { duration: dur("--dur-control"), easing: CURVE.out }
      );
    });
  });
  /**
   * Folding shut, the last thought's end rises into the header as the body
   * closes up under it, on the fold's own length (--dur-exit); opened, it
   * fades out of the way (--dur-control). Never on a first render.
   */
  function tailIn(_node: Element) {
    const rise = motionOk.current;
    return {
      duration: dur("--dur-exit"),
      easing: easeOut,
      css: (t: number) =>
        `opacity: ${t}${rise ? `; translate: 0 ${((1 - t) * 0.5).toFixed(3)}lh` : ""}`,
    };
  }
  function tailOut(_node: Element) {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
  }
  /**
   * Steps drawn in the first render are the block as it was when it mounted —
   * history, or the live block a reader just opened. Only steps that appear
   * after that are new reasoning, and only those are shown arriving.
   */
  let drawn = $state(false);
  $effect(() => {
    drawn = true;
  });
  /**
   * What a folded block shows past its chevron: the end of its last thought on
   * one line. The line is pinned to its right edge and fades out on the left,
   * so the latest words read and the rest trails off behind the label.
   */
  const tail = $derived(
    (paragraphs.at(-1) ?? "")
      .replace(MARKUP, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(-TAIL_CHARS)
  );
</script>

<!-- literal: 70ch -->
<div
  data-slot="rail-row"
  class="rail-row max-w-(--measure)"
  style:--measure="70ch"
>
  <ThinkingSteps
    onOpenChange={(value) => {
      expanded = value;
    }}
    open={expanded}
    size="default"
  >
    <ThinkingStepsHeader class="w-full" disabled={!text.trim()}>
      {#snippet after()}
        {#if !expanded && tail}
          <span
            data-slot="tail"
            class="flex justify-end flex-auto min-w-0 overflow-hidden text-ink-muted text-size-meta font-normal whitespace-nowrap"
            in:tailIn
            out:tailOut><span class="flex-none">{tail}</span></span
          >
        {/if}
      {/snippet}
      <span
        data-slot="thinking-label"
        class="relative flex flex-none items-center"
        bind:this={cell}
      >
        {#if liveLabel}
          <span
            class="flex items-center inset-y-0 whitespace-nowrap"
            in:faceIn
            out:faceOut
            ><ThinkingIndicator
              aria-live={announce ? "polite" : "off"}
              class="p-0 gap-(--indicator-gap)"
              style="--indicator-gap: calc(var(--x-text) - var(--x-glyph) - var(--w-glyph)); --thinking-icon-size: var(--w-glyph)"
            /></span
          >
        {:else}
          <span
            class="flex items-center inset-y-0 whitespace-nowrap rail-line text-size-label font-medium"
            in:faceIn
            out:faceOut
            ><span data-slot="rail-cell" class="rail-cell"
              ><IconCpu class="size-icon-md" /></span
            ><span>Reasoning</span></span
          >
        {/if}
      </span>
    </ThinkingStepsHeader>
    <ThinkingStepsContent>
      {#each paragraphs as paragraph, i (i)}
        <ThinkingStep
          description={paragraph}
          enters={drawn && fades}
          {fades}
          isLast={i === paragraphs.length - 1}
          markdown
          status={live && i === paragraphs.length - 1 ? "active" : "complete"}
        />
      {/each}
    </ThinkingStepsContent>
  </ThinkingSteps>
</div>

<style>
  /* residual: unmapped */
  /* One line past the chevron, pinned to its end so the newest words show;
     the start fades out rather than cutting. Quieter than a tool row's text,
     so the fold reads as an aside and not as the next step. */
  [data-slot="tail"] {
    mask-image: linear-gradient(to right, transparent, var(--mask-opaque) 30%);
  }
</style>
