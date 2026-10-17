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
    type FileDiffMetadata,
    isHighlighterLoaded,
    parseDiffFromFile,
  } from "@pierre/diffs";
  import { fade } from "svelte/transition";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import {
    crossIn,
    crossOut,
    dur,
    easeOut,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconAlert, IconMaximize } from "#lib/icons.js";
  import DiffModal from "./DiffModal.svelte";
  import { fileName, languageOf } from "./diff-language";
  import { houseDiff } from "./diff-theme.svelte";

  interface Props {
    /** How tall the rows stand before they scroll, as a CSS length; the transcript's cap when not given. */
    cap?: string;
    fileDiff?: FileDiffMetadata;
    filePath: string;
    newContent: string;
    oldContent: string;
  }

  let {
    filePath,
    oldContent,
    newContent,
    fileDiff,
    cap = "var(--tx-diff-cap)",
  }: Props = $props();
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
    const { hunks } =
      fileDiff ?? parseDiffFromFile(files.oldFile, files.newFile);
    const rows = hunks.reduce((sum, hunk) => sum + hunk.unifiedLineCount, 0);
    return Math.min(CAP, rows * ROW + hunks.length * BAR);
  });

  /** Draws the diff into the box; `drawn` once it has a height. */
  const draw = (_attempt: number) => (box: HTMLElement) => {
    const diff = houseDiff({ disableFileHeader: true });
    const sizes = new ResizeObserver(() => {
      if (box.offsetHeight > 0) {
        drawn = true;
        sizes.disconnect();
      }
    });
    try {
      diff.render({
        ...(fileDiff ? { fileDiff } : files),
        containerWrapper: box,
      });
      sizes.observe(box);
    } catch (caught) {
      failure = failureWords(caught);
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
  class="rounded-md overflow-hidden border border-border bg-neutral-2"
>
  <div
    class="flex items-center justify-between px-3 py-2 bg-card border-b border-border font-mono text-meta text-ink-muted"
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
      <IconMaximize class="w-space-4 h-space-4" />
    </Button>
  </div>

  <!-- The skeleton and the rows share one cell: the rows lay out under it
       unseen and fade in where it stood. -->
  <div data-slot="body" class="relative grid" {@attach morph()}>
    {#if failure}
      <div
        class="mark-line row-start-1 col-start-1 min-w-0 flex items-center justify-center gap-2 p-space-8 text-label text-error-9"
        role="alert"
        in:crossIn
        out:crossOut
      >
        <IconAlert class="w-icon-lg h-icon-lg shrink-0" />
        <span>The diff did not draw: {failure}</span>
        <Button data-box onclick={retry} size="sm" variant="outline"
          >Retry</Button
        >
      </div>
    {:else}
      {#key attempt}
        <div
          class="row-start-1 col-start-1 min-w-0 overflow-auto max-h-(--cap) motion-safe:transition-[opacity] motion-safe:dur-control motion-safe:ease-out data-veiled:invisible data-veiled:opacity-0"
          style:--cap={cap}
          data-veiled={!drawn || undefined}
          {@attach draw(attempt)}
        ></div>
      {/key}
      {#if !drawn}
        <div
          class="row-start-1 col-start-1 min-w-0"
          aria-label="Loading diff"
          role="status"
          out:fade={{ duration: dur("--dur-control"), easing: easeOut }}
        >
          <Skeleton
            class="w-full h-(--skeleton-h) rounded-none"
            style="--skeleton-h: {expected}px"
          />
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if showModal}
  <DiffModal
    {fileDiff}
    {filePath}
    {newContent}
    {oldContent}
    onClose={() => {
      showModal = false;
    }}
  />
{/if}
