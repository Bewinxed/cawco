<script lang="ts">
  /**
   * What an account is called: its email; with a nickname, the nickname and
   * the email under it (or beside it, `row`). An account not signed in yet
   * has neither, and says so. Where every word must be read (the usage rows
   * and tiles, `wrap`), a long name wraps onto the next line, and in a row
   * the email drops under the nickname when there is no room, rather than
   * ending in an ellipsis.
   */
  import { type Account, accountsWords } from "@cawco/core";
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

<!-- Its own mark line (app.css), and a box to the row it stands in. -->
<span
  data-account-name-row={row || undefined}
  data-slot="name"
  data-row={row || undefined}
  data-wrap={wrap || undefined}
  class="group mark-line inline-flex min-w-0 flex-col leading-ui data-row:flex-row data-row:items-baseline data-row:gap-space-2 data-wrap:data-row:flex-wrap data-wrap:data-row:gap-y-0"
  data-box
>
  <b
    class="type-label overflow-clip text-ellipsis whitespace-nowrap text-ink-strong group-data-wrap:overflow-visible group-data-wrap:whitespace-normal group-data-wrap:wrap-anywhere"
    >{account.label || account.email
      ? nameOf(account)
      : accountsWords.notSignedInYet}</b
  >
  {#if account.label && account.email}
    <small
      class="type-meta overflow-clip text-ellipsis whitespace-nowrap text-ink-muted group-data-wrap:overflow-visible group-data-wrap:whitespace-normal group-data-wrap:wrap-anywhere"
      >{account.email}</small
    >
  {/if}
</span>
