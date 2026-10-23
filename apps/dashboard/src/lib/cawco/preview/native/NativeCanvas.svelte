<script lang="ts">
  /**
   * A native screen's component canvas in the artifact panel: the head says
   * when its stills were drawn and stands Wire (the section says on which
   * machine); the canvas's
   * section (NativeStills) stands whole in the well, which grows to it.
   */
  import NativeStills from "./NativeStills.svelte";
  import NativeSurface from "./NativeSurface.svelte";

  let wire = $state(false);
</script>

<NativeSurface
  bind:wire
  subtitle="drawn 12 s ago"
  title="CawCo iOS"
  wireControl
>
  <div class="relative bg-surface-page" data-slot="native-canvas">
    <NativeStills drawn={false} {wire} />
  </div>
</NativeSurface>
