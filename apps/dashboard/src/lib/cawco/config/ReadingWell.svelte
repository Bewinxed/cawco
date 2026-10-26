<script lang="ts">
  /**
   * Text read back to the operator (a rule or hook's sentence), on the kit
   * Alert's default row (DESIGN.md, Alert: "a compact tinted row … default
   * (recess)"). Core marks the code in it with backticks (a command), set in
   * the code face by Coded, never shown as raw backticks.
   */
  import Coded from "#lib/cawco/Coded.svelte";
  import * as Alert from "#lib/components/ui/alert/index.js";

  let { text }: { text: string } = $props();
</script>

<Alert.Root aria-live="polite" class="max-w-c-measure" data-slot="well">
  <Alert.Description><Coded {text} /></Alert.Description>
</Alert.Root>
