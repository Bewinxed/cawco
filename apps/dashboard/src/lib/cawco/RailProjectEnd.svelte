<script lang="ts">
  /**
   * A project's end (ProjectEndTray) under a row of the rail that stands
   * for the project: its row in Projects, its group in Recent. The tray's
   * insets are the rail row's.
   */
  import ProjectEndTray from "./ProjectEndTray.svelte";

  let {
    at,
    projectId,
    parks = false,
    opener,
  }: {
    /** This place: an end asked from this row's menu shows here. */
    at: string;
    projectId: string;
    /** This row is where the project's stops park (its row in Projects). */
    parks?: boolean;
    /** The row: the focus goes back to it as the tray is put away. */
    opener: () => HTMLElement | null | undefined;
  } = $props();
</script>

<div
  data-slot="sidebar-end"
  class="contents"
  style:--ask-indent="var(--spacing-space-1)"
  style:--ask-end="var(--spacing-space-1)"
  style:--fault-indent="var(--spacing-space-2)"
  style:--fault-end="var(--spacing-space-2)"
>
  <ProjectEndTray {at} {opener} {parks} {projectId} />
</div>
