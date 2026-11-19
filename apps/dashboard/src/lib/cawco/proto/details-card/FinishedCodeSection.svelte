<script lang="ts">
  /**
   * Finished code: what happens to finished code when a task says nothing.
   * Four option rows, each its glyph, its name and its line, all in view. A
   * press is the change: no confirm, since the next finished piece of work
   * is the first thing it touches and it can be changed back. The pressed
   * row waits with the old one still chosen; the hub's yes moves the pick.
   */
  import { LANDS_MODES, type LandsMode } from "@cawco/core/injected";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconBolt,
    IconBranchingLinear,
    IconCompare,
    IconDocument,
  } from "#lib/icons.js";
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import type { Choice, Pending, Read } from "./details";
  import OptionLine from "./OptionLine.svelte";
  import { pickOne } from "./pick-one";
  import Section from "./Section.svelte";
  import { cardWords, finishedWords, sectionWords } from "./words";

  let {
    finished,
    pending,
    sunk = false,
    onpick,
    ontry,
  }: {
    finished: Read<LandsMode>;
    pending?: Pending;
    sunk?: boolean;
    onpick: (pick: Choice) => void;
    ontry: () => void;
  } = $props();

  const GLYPHS = {
    main: IconBolt,
    branch: IconBranchingLinear,
    pr: IconCompare,
    none: IconDocument,
  } as const;
  const chosen = $derived(finished.state === "read" ? finished.value : null);
  const pick = pickOne(
    () => chosen,
    (value) => onpick({ section: "finished", value })
  );
</script>

<Section
  key="finished"
  line={sectionWords.finished.line}
  name={sectionWords.finished.name}
>
  {#if finished.state === "reading"}
    <div class="flex flex-col gap-space-2">
      {#each LANDS_MODES as mode (mode)}
        <Skeleton height="item" />
      {/each}
    </div>
  {:else if finished.state === "failed"}
    <RowFault
      again={ontry}
      reason="{cardWords.couldntRead} {finished.reason}"
    />
  {:else}
    <div in:reveal>
      <OptionGroup
        aria-label={sectionWords.finished.name}
        bind:value={pick.get, pick.set}
        disabled={sunk}
        layout="list"
      >
        {#each LANDS_MODES as mode (mode)}
          <OptionGroupItem title={finishedWords[mode].line} value={mode}>
            <OptionLine
              glyph={GLYPHS[mode]}
              line={chosen === mode ? finishedWords[mode].line : undefined}
              name={finishedWords[mode].name}
              waiting={pending?.value === mode && !pending.refused}
            />
          </OptionGroupItem>
          {#if pending?.value === mode && pending.refused}
            <RowFault
              again={() => onpick({ section: "finished", value: mode })}
              reason={pending.refused}
            />
          {/if}
        {/each}
      </OptionGroup>
    </div>
  {/if}
</Section>
