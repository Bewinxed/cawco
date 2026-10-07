<script lang="ts">
  /** Tasks on a calendar by one of their dates: the project's Calendar view. */
  import type { ViewTask } from "@cawco/core";
  import type { A2uiComponentProps } from "svelte-a2ui";
  import ViewCalendar from "../ViewCalendar.svelte";
  import { viewContext } from "./context";

  let { date, rows }: A2uiComponentProps = $props();
  const view = viewContext();
  const field = $derived(String(date ?? "").replace(/^dates\./, ""));
  const tasks = $derived(
    Array.isArray(rows) ? (rows as ViewTask[]) : view.data.tasks
  );
</script>

<ViewCalendar {field} onopen={view.onopen} {tasks} />
