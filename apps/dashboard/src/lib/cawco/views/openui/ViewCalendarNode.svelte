<script lang="ts">
  /** Tasks on a calendar by one of their dates: the project's Calendar view. */
  import ViewCalendar from "../ViewCalendar.svelte";
  import { rowsOf, type ViewTaskRow, viewContext } from "./context";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ rows: unknown; date: unknown }> = $props();
  const view = viewContext();
  const field = $derived(String(props.date ?? "").replace(/^dates\./, ""));
</script>

<ViewCalendar
  {field}
  onopen={view.onopen}
  tasks={rowsOf<ViewTaskRow>(props.rows)}
/>
