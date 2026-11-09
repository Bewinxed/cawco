<script lang="ts">
  import { cawco } from "#lib/cawco/client.svelte.js";
  import ModelsSection from "#lib/cawco/config/models/ModelsSection.svelte";
  import { accountsStore } from "#lib/cawco/stores/accounts.svelte.js";
</script>

<ModelsSection accounts={accountsStore.accounts} machines={cawco.machines} />
