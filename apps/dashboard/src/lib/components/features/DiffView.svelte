<script lang="ts">
  /**
   * A diff inline, in a box up to 400px tall, with a button that opens it
   * full size. The library draws nothing until its highlighter has loaded
   * (the first diff of a page waits for it), so the box stands a skeleton at
   * the height the rows will take (the hunks' rows at the library's 20px
   * line, under the cap) and the rows cross-fade in over it once they have
   * drawn; any difference in height tweens. A diff that fails to draw says
   * why in the box, with a retry.
   */
  import {
    type FileContents,
    FileDiff,
    isHighlighterLoaded,
    parseDiffFromFile,
  } from "@pierre/diffs";
  import { fade } from "svelte/transition";
  import {
    crossIn,
    crossOut,
    dur,
    easeOut,
  } from "$lib/cawco/motion/curves.svelte";
  import { morph } from "$lib/cawco/motion/morph.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { IconAlert, IconMaximize } from "$lib/icons";
  import DiffModal from "./DiffModal.svelte";
  import { fileName, languageOf } from "./diff-language";

  interface Props {
    filePath: string;
    newContent: string;
    oldContent: string;
  }

  let { filePath, oldContent, newContent }: Props = $props();
  let showModal = $state(false);
  /**
   * The rows are in the box. With the highlighter loaded (every diff after
   * the page's first) the library draws as it is asked, so there is nothing
   * to stand in for.
   */
  let drawn = $state(isHighlighterLoaded());
  let failure = $state<string | null>(null);
  /** Bumped by Retry: the box is drawn again from scratch. */
  let attempt = $state(0);

  /** The library's row height, the collapsed-context bar between hunks, the box's cap. */
  const ROW = 20;
  const BAR = 32;
  const CAP = 400;

  const files = $derived.by(() => {
    const lang = languageOf(filePath) as FileContents["lang"];
    const name = fileName(filePath);
    return {
      oldFile: { name, contents: oldContent, lang },
      newFile: { name, contents: newContent, lang },
    };
  });

  /** The height the drawn rows will take. */
  const expected = $derived.by(() => {
    const { hunks } = parseDiffFromFile(files.oldFile, files.newFile);
    const rows = hunks.reduce((sum, hunk) => sum + hunk.unifiedLineCount, 0);
    return Math.min(CAP, rows * ROW + hunks.length * BAR);
  });

  /** Draws the diff into the box; `drawn` once it has a height. */
  const draw = (_attempt: number) => (box: HTMLElement) => {
    const diff = new FileDiff({ disableFileHeader: true });
    const sizes = new ResizeObserver(() => {
      if (box.offsetHeight > 0) {
        drawn = true;
        sizes.disconnect();
      }
    });
    try {
      diff.render({ ...files, containerWrapper: box });
      sizes.observe(box);
    } catch (caught) {
      failure = caught instanceof Error ? caught.message : String(caught);
    }
    return () => {
      sizes.disconnect();
      diff.cleanUp();
    };
  };

  function retry() {
    failure = null;
    drawn = false;
    attempt += 1;
  }
</script>

<div
  class="rounded-[var(--radius-md)] overflow-hidden border border-border bg-muted"
>
  <div
    class="flex items-center justify-between px-3 py-2 bg-card border-b border-border font-mono text-meta text-muted-foreground"
  >
    <span class="break-all flex-1 min-w-0">{filePath}</span>
    <Button
      class="h-6 w-6 ml-2 shrink-0"
      disabled={!drawn || failure !== null}
      onclick={() => {
        showModal = true;
      }}
      size="icon-sm"
      title="Expand diff (full view)"
      variant="ghost"
    >
      <IconMaximize class="w-3.5 h-3.5" />
    </Button>
  </div>

  <!-- The skeleton and the rows share one cell: the rows lay out under it
       unseen and fade in where it stood. -->
  <div class="body" {@attach morph()}>
    {#if failure}
      <div
        class="flex items-center justify-center gap-2 p-8 text-label text-error"
        role="alert"
        in:crossIn
        out:crossOut
      >
        <IconAlert class="w-5 h-5 shrink-0" />
        <span>The diff did not draw: {failure}</span>
        <Button onclick={retry} size="sm" variant="outline">Retry</Button>
      </div>
    {:else}
      {#key attempt}
        <div
          class="diff-content overflow-x-auto max-h-[400px]"
          class:veiled={!drawn}
          {@attach draw(attempt)}
        ></div>
      {/key}
      {#if !drawn}
        <div
          aria-label="Loading diff"
          role="status"
          out:fade={{ duration: dur('--dur-control'), easing: easeOut }}
        >
          <Skeleton class="w-full rounded-none" style="height: {expected}px" />
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if showModal}
  <DiffModal
    {filePath}
    {newContent}
    {oldContent}
    onClose={() => {
      showModal = false;
    }}
  />
{/if}

<style>
  .body {
    position: relative;
    display: grid;
  }
  .body > * {
    grid-area: 1 / 1;
    min-width: 0;
  }
  .diff-content {
    @media (prefers-reduced-motion: no-preference) {
      transition: opacity var(--dur-control) var(--ease-out);
    }
  }
  .diff-content.veiled {
    visibility: hidden;
    opacity: 0;
  }
</style>
