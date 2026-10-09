<script lang="ts">
  /**
   * Adding an account: the stepped setup, once the accounts and the
   * providers the fleet knows have been read (its first step lists them).
   */
  import AccountSetup from "#lib/cawco/accounts/AccountSetup.svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
</script>

{#if cawco.accounts !== null && cawco.accountProviders !== null}
  <AccountSetup />
{:else}
  <SectionFrame ready={false} title="Add account">
    <span></span>
  </SectionFrame>
{/if}
