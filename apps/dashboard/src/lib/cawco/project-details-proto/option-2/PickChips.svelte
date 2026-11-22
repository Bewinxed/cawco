<script lang="ts" generics="T extends string">
  /**
   * One pick among a few, compact: the house's option chips (OptionGroup,
   * its marked look: each chip led by its radio mark, the pick's strong
   * edge gliding to the chosen one), each sized to its name, with what
   * picking it does in its house tooltip (as Who decides' lines are), so a
   * section shows its value in one line. Every section's choice is this one
   * control (Task sync, Git LFS, where code goes, the usage limit, who
   * marks tasks done).
   */
  import type { Snippet } from "svelte";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";

  let {
    value,
    options,
    label,
    labelledby,
    glyph,
    disabled = false,
    onpick,
  }: {
    value: T | null;
    options: readonly { id: T; name: string; note: string }[];
    /** The group, as a screen reader names it, where no label on the page names it. */
    label?: string;
    /** The label on the page that names it. */
    labelledby?: string;
    /** Each option's identity mark, by its id (a tracker's logo). */
    glyph?: Snippet<[T]>;
    disabled?: boolean;
    onpick: (next: T) => void;
  } = $props();
</script>

<OptionGroup
  aria-label={labelledby ? undefined : label}
  aria-labelledby={labelledby}
  bind:value={
    () => (value === null ? [] : [value]),
    (next) => {
      const id = options.find((option) => option.id === next[0])?.id;
      if (id !== undefined && id !== value) {
        onpick(id);
      }
    }
  }
  {disabled}
  glide="mark"
>
  {#each options as option (option.id)}
    <Tip label={option.note} tap>
      {#snippet children(props)}
        <OptionGroupItem {...props} value={option.id}>
          <span class="mark-line flex min-w-0 items-center gap-x-space-2">
            {#if glyph}
              <span class="flex-none" data-box>{@render glyph(option.id)}</span>
            {/if}
            <span>{option.name}</span>
          </span>
        </OptionGroupItem>
      {/snippet}
    </Tip>
  {/each}
</OptionGroup>
