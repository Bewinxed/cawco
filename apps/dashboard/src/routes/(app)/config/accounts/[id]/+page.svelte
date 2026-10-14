<script lang="ts">
  import { accountsWords } from "@cawco/core";
  import AccountEditor from "#lib/cawco/accounts/AccountEditor.svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import EditorRoute from "#lib/cawco/config/EditorRoute.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { page } from "$app/state";

  const section = sectionOf("accounts");
  const account = $derived(
    cawco.accounts?.accounts.find((one) => one.id === page.params.id) ?? null
  );
</script>

<EditorRoute
  found={account !== null}
  loaded={cawco.accounts !== null}
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
