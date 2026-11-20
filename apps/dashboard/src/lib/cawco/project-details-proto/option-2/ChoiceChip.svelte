<script lang="ts">
  /**
   * One option chip on the work path whose words are the whole choice (Wait
   * for reset, Only you move to done): its words, and a spinner beside them
   * while the pick is with the hub. A press asks for the pick and shows
   * nothing as chosen until the record says so.
   */
  import { OptionGroupItem } from "#lib/components/ui/option-group/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { howItRunsWords as words } from "./words";

  let {
    value,
    label,
    sending,
    onpick,
  }: {
    value: string;
    label: string;
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
  <span class="mark-line flex min-w-0 items-center gap-x-space-2">
    <span>{label}</span>
    {#if sending}
      <Spinner
        aria-label={words.saving}
        box="small"
        class="flex-none"
        tone="muted"
      />
    {/if}
  </span>
</OptionGroupItem>
