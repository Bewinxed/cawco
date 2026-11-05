<script lang="ts">
  /**
   * The task screen in a frame of its own, for its states files: the
   * tooltip provider the app's shell gives every page, around the screen
   * with its props passed through as they come, so each story's args reach
   * the live instance.
   */
  import type { ComponentProps } from "svelte";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import TaskRecord from "./TaskRecord.svelte";

  const props: ComponentProps<typeof TaskRecord> = $props();
</script>

<TooltipProvider>
  <TaskRecord {...props} />
</TooltipProvider>
