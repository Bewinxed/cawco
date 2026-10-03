<script lang="ts">
  import { untrack } from "svelte";
  import {
    CURVE,
    dur,
    easeOut,
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
    node.style.position = "absolute";
    node.style.insetInlineStart = "0";
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
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

<div class="think rail-row">
  <ThinkingSteps
    onOpenChange={(value) => { expanded = value; }}
    open={expanded}
    size="default"
  >
    <ThinkingStepsHeader disabled={!text.trim()}>
      {#snippet after()}
        {#if !expanded && tail}
          <span class="tail" in:tailIn out:tailOut><span>{tail}</span></span>
        {/if}
      {/snippet}
      <span class="label" bind:this={cell}>
        {#if liveLabel}
          <span class="face" in:faceIn out:faceOut
            ><ThinkingIndicator
              aria-live={announce ? 'polite' : 'off'}
              class="rail-indicator"
            /></span
          >
        {:else}
          <span class="face identity rail-line" in:faceIn out:faceOut
            ><span class="icon rail-cell"><IconCpu /></span>Reasoning</span
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
  .think {
    max-inline-size: 70ch;

    /* The live face: its mark in the rail cell, its word at the text column. */
    & :global(.rail-indicator) {
      padding: 0;
      gap: calc(var(--x-text) - var(--x-glyph) - var(--w-glyph));
      --thinking-icon-size: var(--w-glyph);
    }
    /* The header spans the row so the tail has the width to read into. */
    & :global(.thinking-header) {
      inline-size: 100%;
    }
  }
  /* The label's cell: a label leaving is drawn over it, out of the flow. */
  .label {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
  }
  .face {
    display: flex;
    align-items: center;
    inset-block: 0;
    white-space: nowrap;
  }
  .identity {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
  }
  .icon {
    & :global(svg) {
      inline-size: 16px;
      block-size: 16px;
    }
  }
  /* One line past the chevron, pinned to its end so the newest words show;
     the start fades out rather than cutting. Quieter than a tool row's text,
     so the fold reads as an aside and not as the next step. */
  .tail {
    display: flex;
    justify-content: flex-end;
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    white-space: nowrap;
    mask-image: linear-gradient(to right, transparent, oklch(0% 0 0) 30%);

    & > span {
      flex: 0 0 auto;
    }
  }
</style>
