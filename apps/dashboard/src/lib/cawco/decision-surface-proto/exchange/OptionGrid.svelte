<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import type { Option } from "./model.js";
  import { WORDS } from "./words.js";

  /**
   * A decision's options as peers: one card each, drawn alike, in columns
   * once the message is wide enough to hold them side by side, stacked on a
   * phone. Each says its words, what it gets and what it costs; advice is
   * the Recommended badge, the pick is the coral edge and keycap (the kit's
   * option chip). A pick holds at once; a second press lets it go.
   */
  let {
    options,
    picked = [],
    multiple = false,
    disabled = false,
    label,
    onpick,
  }: {
    options: Option[];
    picked?: string[];
    multiple?: boolean;
    disabled?: boolean;
    /** The question, as the group's accessible name. */
    label: string;
    onpick?: (next: string[]) => void;
  } = $props();

  /** The group's own value, kept in step with the pick it is given. */
  let value = $derived(picked);

  /** The pick after a press on `id`: held lets it go, otherwise it holds. */
  function next(id: string): string[] {
    if (value.includes(id)) {
      return value.filter((v) => v !== id);
    }
    return multiple ? [...value, id] : [id];
  }

  function press(id: string) {
    value = next(id);
    onpick?.(value);
  }
</script>

<OptionGroup aria-label={label} {disabled} layout="list" {multiple} {value}>
  <!-- Peers side by side once each can stand 190px wide, one under another below. -->
  <div
    class="grid w-full min-w-0 grid-cols-1 gap-space-2 @kinds:grid-cols-fit-c-decision-option-min"
  >
    {#each options as option, i (option.id)}
      <OptionGroupItem
        digit={i + 1}
        onclick={(event) => {
          event.preventDefault();
          press(option.id);
        }}
        value={option.id}
      >
        <Kbd look="keycap">{i + 1}</Kbd>
        <span class="flex min-w-0 flex-col gap-space-1">
          <span class="text-pretty">{option.label}</span>
          {#if option.recommended}
            <span class="mt-space-1"
              ><Badge variant="secondary"
                ><span>{WORDS.recommended}</span></Badge
              ></span
            >
          {/if}
          <span class="mt-space-1 type-meta text-pretty text-ink-strong"
            >{option.line}</span
          >
          <span class="type-meta text-pretty text-ink-muted"
            >Costs: {option.cost}</span
          >
        </span>
      </OptionGroupItem>
    {/each}
  </div>
</OptionGroup>
