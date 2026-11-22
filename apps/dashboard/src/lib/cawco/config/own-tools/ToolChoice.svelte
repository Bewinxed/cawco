<script lang="ts" generics="T extends string">
  /**
   * One switch of Configure › Helpers & step lists, in the shape of Models ›
   * Images (ImageDefault): its head with the save line, the two sides in
   * one column, and what the pick means on each agent in the next, down
   * fixed columns (the agent's mark, its name and its own tools, the state
   * glyph alone at one x). Under the `images` container width the agents
   * stand under the sides. A pick saves at once; a refused save puts the
   * hub's choice back and says why under the sides, where the press was.
   *
   * Every value comes in as props (the section reads and saves).
   */
  import { harnessName } from "@cawco/core/harness/kinds";
  import {
    type OwnToolLine,
    type OwnToolOption,
    ownToolsWords as words,
  } from "@cawco/core/words/own-tools";
  import type { Component } from "svelte";
  import SaveFault from "#lib/cawco/config/SaveFault.svelte";
  import SaveLine from "#lib/cawco/config/SaveLine.svelte";
  import HarnessLogo from "#lib/cawco/HarnessLogo.svelte";
  import type { SavePhase } from "#lib/cawco/stores/own-tools.svelte.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMinus, IconTick } from "#lib/icons.js";
  import ToolOptions from "./ToolOptions.svelte";

  let {
    id,
    icon,
    hue,
    heading,
    options,
    recommended,
    value,
    lines,
    phase = "idle",
    fault = null,
    onchoose,
  }: {
    id: string;
    icon: Component;
    hue: string;
    heading: string;
    options: readonly OwnToolOption<T>[];
    recommended: T;
    /** The side shown: the hub's, or the one being saved; null while no person has chosen. */
    value: T | null;
    /** Each agent's line for the side in force. */
    lines: (picked: T) => OwnToolLine[];
    phase?: SavePhase;
    /** Why the last save failed, in words. */
    fault?: string | null;
    onchoose: (value: T) => void;
  } = $props();

  /** A session starts on the recommended side while no person has chosen. */
  const shown = $derived(lines(value ?? recommended));
</script>

<div
  data-slot="group"
  class="@container/tools flex flex-col gap-space-3 border-t border-border-hairline pt-space-5 first:border-t-0 first:pt-0"
>
  <SectionHeader {hue} {icon} label={heading} level={2}>
    {#snippet right()}
      <SaveLine {phase} {words} />
    {/snippet}
  </SectionHeader>

  <div
    class="grid min-w-0 grid-cols-1 items-start gap-space-5 @phone/tools:grid-cols-2 @phone/tools:gap-space-6"
  >
    <div class="flex min-w-0 flex-col gap-space-3">
      <ToolOptions
        label={heading}
        onpick={onchoose}
        {options}
        {recommended}
        {value}
      />
      <SaveFault {fault} />
    </div>

    <div class="flex min-w-0 flex-col gap-space-1">
      <h3 class="m-0 type-label text-ink-muted" id="{id}-agents">
        {words.onEachAgent}
      </h3>
      <ul
        aria-labelledby="{id}-agents"
        class="m-0 flex min-w-0 list-none flex-col p-0"
      >
        {#each shown as line (line.harness)}
          <li
            class="flex min-h-14 items-center gap-x-space-3 border-b border-border-hairline py-space-1 last:border-b-0"
            data-state={line.state}
          >
            <span
              class="grid w-row-compact flex-none place-items-center text-ink-muted"
            >
              <HarnessLogo harness={line.harness} />
            </span>
            <span class="flex min-w-0 flex-auto flex-col">
              <span class="truncate type-label text-ink-strong"
                >{harnessName(line.harness)}</span
              >
              <span class="type-meta text-pretty text-ink-muted"
                >{line.tools}</span
              >
            </span>
            <Tip label={words.states[line.state]} tap>
              {#snippet children(tip)}
                <span
                  {...tip}
                  aria-label={words.states[line.state]}
                  class="mark-line grid min-w-row-compact flex-none place-items-center"
                  role="img"
                >
                  {#if line.state === "allowed"}
                    <IconTick
                      class="size-icon-md text-status-done-glyph"
                      data-box
                    />
                  {:else if line.state === "denied"}
                    <IconMinus class="size-icon-md text-ink-subtle" data-box />
                  {:else}
                    <span class="type-meta text-ink-subtle"
                      >{words.states.none}</span
                    >
                  {/if}
                </span>
              {/snippet}
            </Tip>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</div>
