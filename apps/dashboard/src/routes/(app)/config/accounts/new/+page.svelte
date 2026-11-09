<script lang="ts">
  /**
   * Adding an account: the stepped setup, once the accounts and the
   * providers the fleet knows have been read (its first step lists them).
   */
  import { accountsWords } from "@cawco/core/words/accounts";
  import AccountSetup from "#lib/cawco/accounts/AccountSetup.svelte";

  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { accountsStore } from "#lib/cawco/stores/accounts.svelte.js";
</script>

{#if accountsStore.accounts !== null && accountsStore.accountProviders !== null}
  <AccountSetup />
{:else}
  <SectionFrame ready={false} section={{ label: accountsWords.setup.title }}>
    <span></span>
  </SectionFrame>
{/if}
