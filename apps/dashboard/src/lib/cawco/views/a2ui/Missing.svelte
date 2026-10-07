<script lang="ts">
  /**
   * A component the view names that CawCo's catalog does not have: reported
   * by name, never invented (PRD §5.2).
   */
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";

  let { component }: { component: string; id: string } = $props();
</script>

<Alert variant="warning">
  <AlertDescription
    >This view uses {component}, which CawCo's views do not have, so it is left
    out.</AlertDescription
  >
</Alert>
