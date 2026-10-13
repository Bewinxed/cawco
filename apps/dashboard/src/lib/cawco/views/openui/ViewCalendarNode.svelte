<script lang="ts">
  /** Tasks on a calendar by one of their dates, a week or a month at once: the project's Calendar view. */
  import ViewCalendar from "../ViewCalendar.svelte";
  import { rowsOf, type ViewTaskRow, viewContext } from "./context";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let {
    props,
  }: OpenUIRenderProps<{ rows: unknown; date: unknown; range?: unknown }> =
    $props();
  const view = viewContext();
  const field = $derived(String(props.date ?? "").replace(/^dates\./, ""));
</script>

<ViewCalendar
  {field}
  onopen={view.onopen}
  range={props.range === "month" ? "month" : "week"}
  tasks={rowsOf<ViewTaskRow>(props.rows)}
/>
