<script lang="ts">
  import { page } from "$app/state";
  import WorkflowRunView from "$lib/components/features/workflows/WorkflowRunView.svelte";
  import "$lib/components/features/workflows/workflows.css";
</script>
<svelte:head><title>Workflow run · CawCo</title></svelte:head>
{#key page.params.run}
  <WorkflowRunView runId={page.params.run ?? ''} />
{/key}
