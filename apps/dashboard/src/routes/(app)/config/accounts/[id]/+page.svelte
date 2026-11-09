<script lang="ts">
  import { accountsWords } from "@cawco/core/words/accounts";
  import AccountEditor from "#lib/cawco/accounts/AccountEditor.svelte";

  import EditorRoute from "#lib/cawco/config/EditorRoute.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { accountsStore } from "#lib/cawco/stores/accounts.svelte.js";
  import { page } from "$app/state";

  const section = sectionOf("accounts");
  const account = $derived(
    accountsStore.accounts?.accounts.find((one) => one.id === page.params.id) ??
      null
  );
</script>

<EditorRoute
  found={account !== null}
  loaded={accountsStore.accounts !== null}
  problem={null}
  saveLabel={accountsWords.editor.save}
  {section}
  what={accountsWords.editor.what}
>
  {#if account}
    {#key account.id}
      <AccountEditor {account} />
    {/key}
  {/if}
</EditorRoute>
