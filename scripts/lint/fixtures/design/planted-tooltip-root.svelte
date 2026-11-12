<!--
  A planted tree root for house/tooltip-provider-at-root (on the rule's root
  list): its one provider around everything it draws, which the rule leaves
  alone. bits-ui's provider stands for the kit's, as in planted-tooltip.svelte.
-->
<script lang="ts">
  import { Tooltip } from "bits-ui";
</script>

<Tooltip.Provider>
  <p>Rooted</p>
</Tooltip.Provider>
