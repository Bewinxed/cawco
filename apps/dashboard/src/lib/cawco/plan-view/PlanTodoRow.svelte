<script lang="ts">
  import type { PlanEdit } from "@cawco/core/plan";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    IconArrowDown,
    IconArrowUp,
    IconComment,
    IconPen,
    IconTrash,
  } from "#lib/icons.js";
  import PlanNoteList from "./PlanNoteList.svelte";
  import { todoIndentClass } from "./style-maps.js";
  import type { DerivedPlanTodo } from "./types.js";

  let {
    todo,
    onEdit,
    onResolveOffer,
    onInspectTask,
  }: {
    onEdit: (edit: PlanEdit) => void;
    onInspectTask?: (taskId: string) => void;
    onResolveOffer?: (todoId: string, accept: boolean) => void;
    todo: DerivedPlanTodo;
  } = $props();

  let rewording = $state(false);
  let draftText = $state("");
  let noting = $state(false);
  let noteDraft = $state("");
  let toolsOpen = $state(false);

  function todoTextTone(item: DerivedPlanTodo): string {
    if (item.done) {
      return "text-ink-subtle line-through";
    }
    if (item.inProgress) {
      return "font-medium text-ink-strong";
    }
    return "text-ink-row";
  }

  function startReword() {
    draftText = todo.text;
    rewording = true;
    noting = false;
  }

  function commitReword() {
    const clean = draftText.trim();
    if (clean && clean !== todo.text) {
      onEdit({ kind: "reword", step: todo.handle, content: clean });
    }
    rewording = false;
  }

  function commitNote() {
    const clean = noteDraft.trim();
    if (clean) {
      onEdit({ kind: "comment", step: todo.handle, text: clean });
      noteDraft = "";
    }
    noting = false;
  }
</script>

<div
  class={[
    "group/todo relative flex flex-col gap-space-1 rounded-xs px-space-2 py-space-1 transition-control",
    todo.inProgress
      ? "bg-surface-raised shadow-xs"
      : "can-hover:hover:bg-surface-hover",
    todoIndentClass(todo.depth),
  ]}
  data-slot="plan-todo"
>
  {#if todo.depth > 0}
    <span
      aria-hidden="true"
      class="pointer-events-none absolute start-space-2 top-0 h-4 w-space-2 rounded-es-xs border-b border-s border-nest-ink"
    ></span>
  {/if}

  {#if rewording}
    <form
      class="flex flex-wrap items-center gap-space-2 py-space-1"
      onsubmit={(e) => {
        e.preventDefault();
        commitReword();
      }}
    >
      <div class="min-w-44 flex-1">
        <Input aria-label="Reword to-do" look="cell" bind:value={draftText} />
      </div>
      <Button
        label="Save wording"
        size="xs"
        type="submit"
        variant="secondary"
      />
      <Button
        label="Cancel edit"
        onclick={() => {
          rewording = false;
        }}
        size="xs"
        tone="muted"
        variant="ghost"
      />
    </form>
  {:else}
    <div class="flex min-w-0 items-start gap-space-2">
      <div class="mt-0.5 flex shrink-0 items-center" data-box>
        <Checkbox
          aria-label={todo.done
            ? `Untick to-do: ${todo.text}`
            : `Tick to-do: ${todo.text}`}
          checked={todo.done}
          disabled={todo.proposed}
          onCheckedChange={(next) => {
            onEdit({
              kind: "tick",
              step: todo.handle,
              done: Boolean(next),
            });
          }}
        />
      </div>

      <div class="flex min-w-0 flex-1 flex-col gap-space-1">
        <div
          class="flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1"
        >
          {#if todo.inProgress && !todo.done}
            <span
              aria-hidden="true"
              class="size-1.5 shrink-0 rounded-pill bg-status-live-glyph loops breathe"
            ></span>
            <span class="sr-only">Working on this to-do now</span>
          {/if}

          <span class={["min-w-0 break-word type-body", todoTextTone(todo)]}>
            {todo.text}
          </span>

          {#if todo.promoted && onInspectTask}
            <Button
              label="Open split-out task"
              onclick={() => {
                if (todo.promoted) {
                  onInspectTask(todo.promoted);
                }
              }}
              size="xs"
              variant="link"
            />
          {/if}

          {#if todo.wait && !todo.done}
            <Badge variant="attn">
              <span>{todo.wait.label}</span>
            </Badge>
          {/if}
        </div>

        {#if todo.comments.length > 0}
          <div class="pt-space-1">
            <PlanNoteList comments={todo.comments} surface="raised" />
          </div>
        {/if}
      </div>

      {#if todo.proposed && onResolveOffer}
        <div class="flex shrink-0 flex-wrap items-center gap-space-1" data-box>
          <Button
            answer="approve"
            label="Agree to-do"
            onclick={() => onResolveOffer(todo.todoId, true)}
            size="xs"
          />
          <Button
            label="Dismiss offer"
            onclick={() => onResolveOffer(todo.todoId, false)}
            size="xs"
            tone="muted"
            variant="ghost"
          />
        </div>
      {:else if !todo.proposed}
        <div class="flex shrink-0 items-center gap-space-1" data-box>
          <Button
            aria-expanded={toolsOpen}
            label={toolsOpen ? "Hide actions" : "Edit to-do"}
            onclick={() => {
              toolsOpen = !toolsOpen;
            }}
            reveal={toolsOpen ? undefined : "row-hover"}
            size="xs"
            tone="quiet"
            variant="ghost"
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if toolsOpen && !rewording && !todo.proposed}
    <div
      class="flex flex-wrap items-center gap-space-1 border-t border-border-hairline ps-space-6 pt-space-1"
    >
      <Button
        icon={IconPen}
        label="Reword to-do"
        onclick={startReword}
        size="xs"
        tone="quiet"
        variant="ghost"
      />
      <Button
        icon={IconComment}
        label="Add note"
        onclick={() => {
          noting = !noting;
        }}
        size="xs"
        tone="quiet"
        variant="ghost"
      />
      <Button
        disabled={!todo.canMoveUp}
        icon={IconArrowUp}
        label="Move up"
        onclick={() => onEdit({ kind: "move", step: todo.handle, by: -1 })}
        size="xs"
        tone="quiet"
        variant="ghost"
      />
      <Button
        disabled={!todo.canMoveDown}
        icon={IconArrowDown}
        label="Move down"
        onclick={() => onEdit({ kind: "move", step: todo.handle, by: 1 })}
        size="xs"
        tone="quiet"
        variant="ghost"
      />
      <Button
        icon={IconTrash}
        label="Remove from plan"
        onclick={() => onEdit({ kind: "remove", step: todo.handle })}
        size="xs"
        tone="destructive"
        variant="ghost"
      />
    </div>
  {/if}

  {#if noting}
    <form
      class="flex flex-wrap items-center gap-space-2 ps-space-6 pt-space-1"
      onsubmit={(e) => {
        e.preventDefault();
        commitNote();
      }}
    >
      <div class="min-w-44 flex-1">
        <Input
          aria-label="Note on to-do for session"
          look="cell"
          placeholder="Write a note on this to-do…"
          bind:value={noteDraft}
        />
      </div>
      <Button label="Save note" size="xs" type="submit" variant="secondary" />
      <Button
        label="Cancel note"
        onclick={() => {
          noting = false;
        }}
        size="xs"
        tone="muted"
        variant="ghost"
      />
    </form>
  {/if}
</div>
