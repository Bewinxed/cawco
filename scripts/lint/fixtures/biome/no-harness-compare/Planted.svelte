<script lang="ts">
  declare const harness: string;
  const compared = harness === "claude";
</script>

{#if harness === "opencode"}<p>{compared}</p>{/if}
<p class={harness !== "pi" ? "a" : "b"}>x</p>
