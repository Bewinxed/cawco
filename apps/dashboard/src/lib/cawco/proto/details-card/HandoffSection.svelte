<script lang="ts">
  /**
   * Code handoff: what happens to finished code when a task says nothing.
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
  import { cardWords, handoffWords, sectionWords } from "./words";

  let {
    handoff,
    pending,
    sunk = false,
    onpick,
    ontry,
  }: {
    handoff: Read<LandsMode>;
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
  const chosen = $derived(handoff.state === "read" ? handoff.value : null);
  const pick = pickOne(
    () => chosen,
    (value) => onpick({ section: "handoff", value })
  );
</script>

<Section
  key="handoff"
  line={sectionWords.handoff.line}
  name={sectionWords.handoff.name}
>
  {#if handoff.state === "reading"}
    <div class="flex flex-col gap-space-2">
      {#each LANDS_MODES as mode (mode)}
        <Skeleton height="item" />
      {/each}
    </div>
  {:else if handoff.state === "failed"}
    <RowFault again={ontry} reason="{cardWords.couldntRead} {handoff.reason}" />
  {:else}
    <div in:reveal>
      <OptionGroup
        aria-label={sectionWords.handoff.name}
        bind:value={pick.get, pick.set}
        disabled={sunk}
        layout="list"
      >
        {#each LANDS_MODES as mode (mode)}
          <OptionGroupItem value={mode}>
            <OptionLine
              glyph={GLYPHS[mode]}
              line={handoffWords[mode].line}
              name={handoffWords[mode].name}
              waiting={pending?.value === mode && !pending.refused}
            />
          </OptionGroupItem>
          {#if pending?.value === mode && pending.refused}
            <RowFault
              again={() => onpick({ section: "handoff", value: mode })}
              reason={pending.refused}
            />
          {/if}
        {/each}
      </OptionGroup>
    </div>
  {/if}
</Section>
