<script lang="ts">
  /**
   * A component that throws as it mounts, as a component whose records the
   * states file gets wrong does: the design graph's mount failure, drawn
   * in the stage's place.
   */
  let { members }: { members: { name: string }[] } = $props();
  const first = members[0]?.name.toUpperCase();
</script>

<p>{first}</p>
