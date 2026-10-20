<script lang="ts">
  import WorkflowEditor from "#lib/components/features/workflows/WorkflowEditor.svelte";
  import { page } from "$app/state";
</script>

<svelte:head><title>Workflow editor · CawCo</title></svelte:head>
{#key page.params.id}
  <WorkflowEditor id={page.params.id ?? ""} />
{/key}
