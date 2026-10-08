<script lang="ts">
  /**
   * What an account is called: its email; with a nickname, the nickname and
   * the email under it (or beside it, `row`). An account not signed in yet
   * has neither, and says so.
   */
  import type { Account } from "@cawco/core";
  import { nameOf } from "./model.svelte";

  let {
    account,
    row = false,
  }: {
    account: Pick<Account, "email" | "id" | "label">;
    row?: boolean;
  } = $props();
</script>

<span class={["name", row && "row"]}>
  <b
    >{account.label || account.email ? nameOf(account) : "Not signed in yet"}</b
  >
  {#if account.label && account.email}
    <small>{account.email}</small>
  {/if}
</span>

<style>
  .name {
    display: inline-flex;
    flex-direction: column;
    min-width: 0;
    line-height: var(--leading-ui);
  }
  .name.row {
    flex-direction: row;
    align-items: baseline;
    gap: var(--space-2);
  }
  b,
  small {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  b {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  small {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
</style>
