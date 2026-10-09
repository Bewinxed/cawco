<script lang="ts">
  /**
   * What an account is called: its email; with a nickname, the nickname and
   * the email under it (or beside it, `row`). An account not signed in yet
   * has neither, and says so. Where every word must be read (the usage rows
   * and tiles, `wrap`), a long name wraps onto the next line, and in a row
   * the email drops under the nickname when there is no room, rather than
   * ending in an ellipsis.
   */
  import type { Account } from "@cawco/core";
  import { nameOf } from "./model.svelte";

  let {
    account,
    row = false,
    wrap = false,
  }: {
    account: Pick<Account, "email" | "id" | "label"> &
      Partial<Pick<Account, "kind">>;
    row?: boolean;
    wrap?: boolean;
  } = $props();
</script>

<span class={["name", row && "row", wrap && "wrap"]}>
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
  .wrap {
    &.row {
      flex-wrap: wrap;
      row-gap: 0;
    }
    & b,
    & small {
      overflow: visible;
      white-space: normal;
      overflow-wrap: anywhere;
    }
  }
</style>
