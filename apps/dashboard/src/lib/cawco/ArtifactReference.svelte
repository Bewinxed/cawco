<script lang="ts">
  /** A artifact named in written words (`cawco:artifact/…`, core references.ts): its chip (PlaceReference). */
  import PlaceReference from "./PlaceReference.svelte";

  let { id }: { id: string } = $props();
</script>

<PlaceReference {id} kind="artifact" />
