<script lang="ts">
  /**
   * Another task, opened from a wait in the waits' place: its title, its
   * stage and kind, and its brief; the head's Back returns to the waits.
   * While the hub reads it, its skeleton in place; a task that is not in
   * the project says so, and the wait it came from is one to re-point or
   * remove.
   */
  import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
  import Markdown from "#lib/components/ui/markdown/markdown.svelte";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import type { OtherTask } from "./model";

  let { id, task }: { id: string; task: OtherTask | null } = $props();
</script>

<div class="grid gap-space-group">
  {#if task === null}
    <div class="grid gap-space-3" aria-busy="true">
      <Skeleton line="title" width="title" radius="text" />
      <Skeleton line="label" width="label" radius="text" />
      <Skeleton height="block" radius="card" />
    </div>
  {:else if task.missing}
    <div
      class="grid gap-space-2 rounded-lg bg-surface-recess p-space-4"
      role="alert"
    >
      <p class="m-0 type-label text-ink-strong">{words.notInProject}</p>
      <code class="justify-self-start type-code text-ink-muted">{id}</code>
    </div>
  {:else}
    <h3 class="m-0 type-title text-balance text-ink-strong">{task.title}</h3>
    <p class="m-0 flex items-center gap-space-2 type-label">
      <span class="text-ink-strong">{task.stage}</span>
      <span class="type-meta text-ink-muted">{words.kind[task.kind]}</span>
      <code class="type-code text-ink-muted">{task.id}</code>
    </p>
    <Markdown source={task.description} />
  {/if}
</div>
