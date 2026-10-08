<script lang="ts">
  /**
   * Which account a session runs on, at the start of its row's meta line: a
   * 6px dot in the account's colour, its name in the tooltip. Only with two
   * or more Claude accounts, where the answer can differ from row to row.
   */
  import { accountName } from "@cawco/core";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { cawco } from "../client.svelte";
  import { usage } from "./forecast.svelte";

  let {
    accountId,
    inline = true,
  }: {
    accountId: string | null | undefined;
    /** It leads a line of text, a space before the words; false in a flex row with its own gap. */
    inline?: boolean;
  } = $props();

  const account = $derived(
    accountId && usage.claudeAccounts >= 2
      ? cawco.accounts?.accounts.find((one) => one.id === accountId)
      : undefined
  );
</script>

{#if account}
  {@const name = accountName(account)}
  <Tip label={name}>
    {#snippet children(
      tip
    )}
      <span
        {...tip}
        aria-label="On {name}"
        class={["dot", inline && "inline"]}
        data-account-dot={account.id}
        role="img"
        style:--c="var(--account-{account.hue})"
      ></span>
    {/snippet}
  </Tip>
{/if}

<style>
  .dot {
    display: inline-block;
    flex: none;
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--c);
    vertical-align: 1px;
    transition: background-color var(--dur-toggle) var(--ease-out);
  }
  .dot.inline {
    margin-inline-end: var(--space-1);
  }
</style>
