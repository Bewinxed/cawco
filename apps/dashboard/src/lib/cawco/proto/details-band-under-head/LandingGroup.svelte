<script lang="ts">
  /**
   * Finished work goes, when a task doesn't say: four equal tiles, a glyph
   * and one short word each (Main, Branch, PR, None), each with what the
   * person finds afterwards. Only for a project that holds code.
   */
  import { LANDS_MODES, type LandsMode } from "@cawco/core/injected";
  import type { Component } from "svelte";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import {
    IconArrowDownDuotone,
    IconCompare,
    IconFork,
    IconMinus,
  } from "#lib/icons.js";
  import BandGroup from "./BandGroup.svelte";
  import TileFace from "./TileFace.svelte";
  import { bandWords } from "./words";

  let {
    lands,
    onlands,
  }: {
    lands: LandsMode;
    onlands: (lands: LandsMode) => void;
  } = $props();

  const words = bandWords.landing;
  const GLYPHS: Record<LandsMode, Component> = {
    main: IconArrowDownDuotone,
    branch: IconFork,
    pr: IconCompare,
    none: IconMinus,
  };
</script>

<BandGroup aside={words.when} title={words.title}>
  <OptionGroup
    aria-label={words.title}
    layout="tiles"
    style="--tiles-cols: repeat(2, minmax(0, 1fr)); --tiles-cols-phone: repeat(2, minmax(0, 1fr))"
    bind:value={
      () => [lands],
      (next) => {
        const picked = LANDS_MODES.find((one) => one === next[0]);
        if (picked) {
          onlands(picked);
        }
      }
    }
  >
    {#each LANDS_MODES as one (one)}
      {@const Glyph = GLYPHS[one]}
      <OptionGroupItem value={one}>
        <TileFace name={words.names[one]} note={words.notes[one]}>
          {#snippet mark()}
            <Glyph aria-hidden="true" class="size-icon-md text-ink-muted" />
          {/snippet}
        </TileFace>
      </OptionGroupItem>
    {/each}
  </OptionGroup>
</BandGroup>
