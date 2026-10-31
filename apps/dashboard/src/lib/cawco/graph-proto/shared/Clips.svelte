<script lang="ts">
  /**
   * The kept move's clips, as the live column fired them (T9): one lane per
   * animation, its element and property named, its kind in its own hue
   * (DESIGN.md, A clip's row: `c-clip-*`), its bar at its start and length
   * on the move's ruler, its figures and curve, and the `ink-solid` playhead
   * line where the move stands. Where it stands is the structure's call: the
   * timeline folds it up from the gap, the field opens it from the arrow,
   * the pair folds it under the seam.
   */
  import { designGraphWords } from "@cawco/core/words/design-graph";
  import { graphProtoWords as words } from "@cawco/core/words/graph-proto";
  import KindGlyph from "#lib/cawco/preview/graph/KindGlyph.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconRepeat } from "#lib/icons.js";
  import type { Judge } from "./judge.svelte";
  import { stateOf } from "./review.svelte";

  let { judge }: { judge: Judge } = $props();

  const runner = $derived(judge.runner);
  const span = $derived(Math.max(1, runner.length));
  const pct = (ms: number) => `${(ms / span) * 100}%`;
</script>

<div class="flex min-w-0 flex-col gap-space-1 overflow-x-clip" data-clips>
  {#if judge.move}
    {@const move = judge.move}
    <div class="flex min-h-c-btn-h-sm items-center gap-space-2">
      <span class="min-w-0 flex-1 truncate type-label text-ink-strong"
        >{words.clipsOf(stateOf(move.from).name, stateOf(move.to).name)} · {words.ms(
          runner.length
        )}</span
      >
      <Button
        onclick={() => judge.play(move.from, move.to)}
        size="sm"
        variant="ghost"><IconRepeat />{words.replay}</Button
      >
    </div>
  {/if}
  {#if runner.clips.length === 0}
    <p class="m-0 type-meta text-ink-muted">{words.noClips}</p>
  {:else}
    <ol
      aria-label={designGraphWords.readout(
        Math.round(runner.at),
        Math.round(runner.length)
      )}
      class="relative m-0 flex list-none flex-col gap-space-row p-0"
    >
      {#each runner.clips as clip, index (index)}
        <li
          class="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_max-content] items-center gap-space-2"
          data-clip={clip.kind}
        >
          <span class="flex min-w-0 items-center gap-space-1">
            <KindGlyph kind={clip.kind} />
            <span class="min-w-0 truncate type-meta text-ink-row"
              >{clip.element} · {clip.property}</span
            >
          </span>
          <span class="relative h-c-btn-h-xs rounded-xs bg-surface-recess">
            <span
              class="absolute inset-y-0 rounded-xs border"
              style:background="var(--c-clip-{clip.kind}-wash)"
              style:border-color="var(--c-clip-{clip.kind})"
              style:left={pct(clip.start)}
              style:width="max(2px, {pct(clip.length)})"
            ></span>
            <!-- The playhead: ink, never coral (DESIGN.md, The playhead). -->
            <span
              class="absolute inset-y-0 w-px bg-ink-strong"
              style:left="min({pct(runner.at)}, 100% - 1px)"
            ></span>
          </span>
          <span
            class="max-w-c-graph-label-max-w truncate type-meta whitespace-nowrap text-ink-muted tabular-nums"
            >{Math.round(clip.start)} → {Math.round(clip.start + clip.length)} ms
            · {clip.curve}</span
          >
        </li>
      {/each}
    </ol>
  {/if}
</div>
