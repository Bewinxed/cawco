<script lang="ts" module>
  /**
   * The dashboard's Caw on a fault face (fault/caw.ts): his file's still,
   * whole, or his head beside a line's words.
   */
  import Caw from "./Caw.svelte";
  import CawFace from "./CawFace.svelte";

  export { animatedCaw };
</script>

{#snippet animatedCaw(pose: import("../fault/caw").FaultCawPose)}
  {#if pose.head}
    <CawFace size={pose.size} status="needs-you" />
  {:else}
    <Caw size={pose.size} status={pose.again ? "trying" : "needs-you"} still />
  {/if}
{/snippet}
