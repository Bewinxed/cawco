<script lang="ts">
  /** A pin named in written words (`cawco:pin/…`, core references.ts): its chip (PlaceReference). */
  import PlaceReference from "./PlaceReference.svelte";

  let { id }: { id: string } = $props();
</script>

<PlaceReference {id} kind="pin" />
