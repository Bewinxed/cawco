<script lang="ts">
  import ModelsSection from "#lib/cawco/config/models/ModelsSection.svelte";
  import { accountsStore } from "#lib/cawco/stores/accounts.svelte.js";
  import { boardStore } from "#lib/cawco/stores/board.svelte.js";
</script>

<ModelsSection
  accounts={accountsStore.accounts}
  machines={boardStore.machines}
/>
