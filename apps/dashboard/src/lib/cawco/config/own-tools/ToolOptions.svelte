<script lang="ts" generics="T extends string">
  /**
   * One switch's two sides (core own-tools.ts) as a list of options, each
   * its name over what it gets the person, the recommended one badged: what
   * Configure › Helpers & step lists and the first run's steps both draw.
   * A press is the pick; nothing is picked while `value` is null.
   */
  import {
    type OwnToolOption,
    ownToolsWords as words,
  } from "@cawco/core/words/own-tools";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";

  let {
    label,
    options,
    recommended,
    value,
    onpick,
  }: {
    label: string;
    options: readonly OwnToolOption<T>[];
    recommended: T;
    value: T | null;
    onpick: (value: T) => void;
  } = $props();

  const pick = (next: string[]) => {
    const picked = options.find((option) => option.value === next[0]);
    if (picked && picked.value !== value) {
      onpick(picked.value);
    }
  };
</script>

<OptionGroup
  aria-label={label}
  layout="list"
  bind:value={() => (value === null ? [] : [value]), pick}
>
  {#each options as option, index (option.value)}
    <OptionGroupItem digit={index + 1} value={option.value}>
      <span class="flex min-w-0 flex-col gap-space-1">
        <span class="flex flex-wrap items-center gap-space-2">
          <span class="type-label text-ink-strong">{option.name}</span>
          {#if option.value === recommended}
            <Badge><span>{words.recommended}</span></Badge>
          {/if}
        </span>
        <span class="type-meta text-pretty text-ink-muted">{option.line}</span>
      </span>
    </OptionGroupItem>
  {/each}
</OptionGroup>
