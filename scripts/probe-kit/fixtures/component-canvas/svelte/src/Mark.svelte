<script lang="ts">
  // An asset imported by its address, as the dashboard's Caw imports its .riv files.
  import mark from "./mark.riv?url";

  let { label = "Caw" }: { label?: string } = $props();
</script>

<a class="mark" href={mark}>{label}</a>

<style>
  .mark {
    display: inline-block;
    padding: 4px 8px;
    font: 500 13px/1.4 system-ui, sans-serif;
  }
</style>
