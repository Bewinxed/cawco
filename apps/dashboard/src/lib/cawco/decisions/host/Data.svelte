<!--
  A piece of data another component reads (a Setup's Stage and Delegate):
  it draws nothing where it stands; its parent draws it.
-->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";

  let { props: _ }: OpenUIRenderProps<Record<string, unknown>> = $props();
</script>
