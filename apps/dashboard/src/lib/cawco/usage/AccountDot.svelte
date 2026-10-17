<script lang="ts">
  /**
   * Which account a session runs on, at the start of its row's meta line: a
   * 6px dot in the account's colour, its name in the tooltip. Only where its
   * provider has two or more accounts, so the answer can differ from row to
   * row. While the session moves to another account (its menu's Account), the
   * dot is already the account it moves to, its colour turning as the board
   * state pill's tint does.
   */
  import { accountName } from "@cawco/core";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { cawco } from "../client.svelte";

  let {
    accountId,
    inline = true,
  }: {
    accountId: string | null | undefined;
    /** It leads a line of text, a space before the words; false in a flex row with its own gap. */
    inline?: boolean;
  } = $props();

  const account = $derived.by(() => {
    const found = accountId
      ? cawco.accounts?.accounts.find((one) => one.id === accountId)
      : undefined;
    const siblings = found
      ? (cawco.accounts?.accounts ?? []).filter(
          (one) => one.provider === found.provider
        ).length
      : 0;
    return siblings >= 2 ? found : undefined;
  });
</script>

{#if account}
  {@const name = accountName(account)}
  <Tip label={name}>
    {#snippet children(tip)}
      <!-- literal: 6px, 50% -->
      <span
        data-account-dot-dot
        {...tip}
        aria-label="On {name}"
        class="inline-block size-(--dot) flex-none rounded-(--dot-r) bg-(color:--c) align-middle transition-[background-color] dur-panel ease-out data-inline:me-space-1"
        data-account-dot={account.id}
        data-box
        data-inline={inline || undefined}
        role="img"
        style:--c="var(--account-{account.hue})"
        style:--dot="6px"
        style:--dot-r="50%"
      ></span>
    {/snippet}
  </Tip>
{/if}
