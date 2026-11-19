<script lang="ts">
  /**
   * Finished code: what happens to finished code when a task says nothing.
   * Four tiles, two across and two down, each its glyph, its name and its
   * line, always in view. A press is the change: no confirm, since the next
   * finished piece of work is the first thing it touches and it can be
   * changed back. The pressed tile waits with the old one still chosen; the
   * hub's yes moves the pick, and the chosen tile's mark glides there (the
   * option group's `glide`). A refusal stands under the tiles with Try
   * again.
   */
  import { LANDS_MODES, type LandsMode } from "@cawco/core/injected";
  import {
    cardWords,
    finishedWords,
    sectionWords,
  } from "@cawco/core/words/project-details";
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
    IconFileCode,
  } from "#lib/icons.js";
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import type { Choice, Pending, Read } from "./details";
  import OptionLine from "./OptionLine.svelte";
  import { pickOne } from "./pick-one";
  import Section from "./Section.svelte";

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
  const TILES =
    "--tiles-cols: repeat(2, minmax(0, 1fr)); --tiles-cols-phone: minmax(0, 1fr)";
  const chosen = $derived(finished.state === "read" ? finished.value : null);
  const pick = pickOne(
    () => chosen,
    (value) => onpick({ section: "finished", value })
  );
  const refusedMode = $derived(
    LANDS_MODES.find((mode) => mode === pending?.value)
  );
</script>

<Section
  hue="var(--color-mark-6)"
  icon={IconFileCode}
  key="finished"
  line={sectionWords.finished.line}
  name={sectionWords.finished.name}
>
  {#if finished.state === "reading"}
    <div class="grid grid-cols-2 gap-space-2">
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
    <div class="flex flex-col gap-space-2" in:reveal>
      <OptionGroup
        aria-label={sectionWords.finished.name}
        bind:value={pick.get, pick.set}
        disabled={sunk}
        glide
        layout="tiles"
        style={TILES}
      >
        {#each LANDS_MODES as mode (mode)}
          <OptionGroupItem value={mode}>
            <OptionLine
              glyph={GLYPHS[mode]}
              line={finishedWords[mode].line}
              name={finishedWords[mode].name}
              tile
              waiting={pending?.value === mode && !pending.refused}
            />
          </OptionGroupItem>
        {/each}
      </OptionGroup>
      {#if refusedMode && pending?.refused}
        <RowFault
          again={() => onpick({ section: "finished", value: refusedMode })}
          reason={pending.refused}
        />
      {/if}
    </div>
  {/if}
</Section>
