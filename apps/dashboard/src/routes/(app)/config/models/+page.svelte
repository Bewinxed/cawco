<script lang="ts">
  import { cawco } from "#lib/cawco/client.svelte.js";
  import ModelsSection from "#lib/cawco/config/models/ModelsSection.svelte";
</script>

<ModelsSection accounts={cawco.accounts} machines={cawco.machines} />
