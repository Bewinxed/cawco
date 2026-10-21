<script lang="ts">
  /** A decision named in written words (`cawco:decision/…`, core references.ts): its chip (PlaceReference). */
  import PlaceReference from "./PlaceReference.svelte";

  let { id }: { id: string } = $props();
</script>

<PlaceReference {id} kind="decision" />
