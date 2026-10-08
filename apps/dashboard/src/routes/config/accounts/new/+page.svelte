<script lang="ts">
  /**
   * Adding an account. `?setup` with exactly one account is the second
   * account's setup, in steps; otherwise it is signed in and named. Which
   * one is decided when the accounts are first read here, so the account
   * the setup makes does not change it halfway.
   */
  import type { Account } from "@cawco/core";
  import AccountSetup from "#lib/cawco/accounts/AccountSetup.svelte";
  import { accountsOf } from "#lib/cawco/accounts/model.svelte.js";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { page } from "$app/state";

  let mode = $state<{ existing: Account | null } | null>(null);
  $effect.pre(() => {
    if (mode === null && cawco.accounts !== null) {
      const accounts = accountsOf();
      mode = {
        existing:
          page.url.searchParams.has("setup") && accounts.length === 1
            ? accounts[0]
            : null,
      };
    }
  });
</script>

{#if mode}
  <AccountSetup existing={mode.existing} />
{:else}
  <SectionFrame
    purpose="Sign it in on a machine, then name it."
    ready={false}
    title="Add a Claude account"
  >
    <span></span>
  </SectionFrame>
{/if}
