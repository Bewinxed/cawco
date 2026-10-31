<script lang="ts">
  import { designGraphWords } from "@cawco/core/words/design-graph";
  import { graphProtoWords as words } from "@cawco/core/words/graph-proto";
  import { SYMBOL } from "#lib/cawco/preview/graph/symbol.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { IconTuning } from "#lib/icons.js";
  import type { Judge } from "./judge.svelte";

  /** Adjust (T7): the kept state's count of real records and their order; a state with no list says so. */
  let { judge }: { judge: Judge } = $props();
</script>

<Popover.Root>
  <Popover.Trigger aria-label={words.adjust} class={SYMBOL} title={words.adjust}
    ><IconTuning /></Popover.Trigger
  >
  <Popover.Content align="end" width="wide">
    <div class="flex flex-col gap-space-3 p-space-1" data-adjust>
      <span class="type-meta text-ink-muted"
        >{words.records} · {judge.keptState.name}</span
      >
      {#if judge.list}
        {@const list = judge.list}
        <label class="flex flex-col gap-space-1">
          <span class="flex items-baseline justify-between gap-space-2">
            <span class="type-label text-ink-strong">{words.tasksShown}</span>
            <output class="type-code text-ink-strong tabular-nums"
              >{designGraphWords.countOf(list.count, list.of)}</output
            >
          </span>
          <input
            aria-valuetext={designGraphWords.countOf(list.count, list.of)}
            class="w-full accent-ink-strong"
            max={list.of}
            min={1}
            oninput={(event) => {
              judge.count = Number(event.currentTarget.value);
            }}
            step={1}
            type="range"
            value={list.count}
          />
        </label>
        <label class="flex items-center justify-between gap-space-3">
          <span class="type-label text-ink-strong"
            >{designGraphWords.longestFirst}</span
          >
          <Switch bind:checked={judge.longest} size="sm" />
        </label>
      {:else}
        <p class="m-0 type-body text-ink-muted">
          {words.noList(judge.keptState.name)}
        </p>
      {/if}
    </div>
  </Popover.Content>
</Popover.Root>
