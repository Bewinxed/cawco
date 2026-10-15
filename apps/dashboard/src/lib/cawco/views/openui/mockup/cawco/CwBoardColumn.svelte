<script lang="ts">
  /**
   * BoardColumn for a mockup: the board's own TaskColumn, its cards the
   * column's TaskCard children as made-up tasks; inert.
   */
  import type { ElementNode } from "@openuidev/lang-core";
  import type { StageKind } from "#lib/cawco/project-tasks.js";
  import TaskColumn from "#lib/cawco/tasks/TaskColumn.svelte";
  import type { OpenUIRenderProps } from "../../OpenUiRenderer.svelte";
  import { textOf } from "../context";
  import { type MockTaskProps, mockTask } from "./task";

  let {
    props,
  }: OpenUIRenderProps<{ name: unknown; kind: string; children: unknown[] }> =
    $props();
  const name = $derived(textOf(props.name));
  const cards = $derived(
    (Array.isArray(props.children) ? props.children : [])
      .filter(
        (child): child is ElementNode =>
          typeof child === "object" &&
          child !== null &&
          (child as ElementNode).typeName === "TaskCard"
      )
      .map((child, index) =>
        mockTask(child.props as unknown as MockTaskProps, name, index)
      )
  );
  const nothing = (): void => undefined;
</script>

<div class="column" data-mk="BoardColumn" inert>
  <TaskColumn
    {cards}
    hrefOf={() => "#mockup"}
    kind={props.kind as StageKind}
    kindOf={() => undefined}
    label={name}
    onopen={nothing}
  />
</div>

<style>
  .column {
    display: flex;
    min-inline-size: 0;
  }
</style>
