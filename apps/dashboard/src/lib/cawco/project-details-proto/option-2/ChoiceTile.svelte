<script lang="ts">
  /**
   * One tile of a tiles OptionGroup on the work path (where tasks are kept,
   * where finished work lands): its name over its outcome, and a spinner
   * beside the name while the pick is with the hub. A press asks for the
   * pick and shows nothing as chosen until the record says so.
   */
  import { OptionGroupItem } from "#lib/components/ui/option-group/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { howItRunsWords as words } from "./words";

  let {
    value,
    name,
    note,
    sending,
    onpick,
  }: {
    value: string;
    name: string;
    note: string;
    /** This pick is with the hub and not yet in force. */
    sending: boolean;
    onpick: () => void;
  } = $props();
</script>

<OptionGroupItem
  onclick={(event) => {
    event.preventDefault();
    onpick();
  }}
  {value}
>
  <span
    class="mark-line flex w-full min-w-0 items-center justify-between gap-space-2"
  >
    <span class="type-label text-ink-strong wrap-anywhere">{name}</span>
    {#if sending}
      <Spinner
        aria-label={words.saving}
        box="small"
        class="flex-none"
        tone="muted"
      />
    {/if}
  </span>
  <span class="type-meta text-pretty text-ink-muted wrap-anywhere">{note}</span>
</OptionGroupItem>
