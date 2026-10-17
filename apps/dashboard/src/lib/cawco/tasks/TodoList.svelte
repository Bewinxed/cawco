<script lang="ts">
  /**
   * A task's to-dos (WORDS.md: to-do), nested as the file nests them. A tick
   * shows at once and is written behind it; a tick the hub refuses goes back
   * with its reason. A to-do's words edit in place, and any to-do can take
   * one under it. Ticking every to-do does not finish a task: checks and
   * landing do (§5.2), so nothing here moves a stage.
   */
  import { tick } from "svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import type { Todo } from "#lib/cawco/project-tasks.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconPlus } from "#lib/icons.js";

  let {
    todos,
    ontick,
    onedit,
    onadd,
  }: {
    todos: Todo[];
    ontick: (ref: string, done: boolean) => Promise<void>;
    onedit: (ref: string, text: string) => Promise<void>;
    onadd: (text: string, under?: string) => Promise<void>;
  } = $props();

  /** A to-do is named by its id, or by its place when it has none. */
  const refOf = (todo: Todo): string => todo.id ?? todo.path;

  /** Ticks shown before the hub has written them, by ref. */
  let ticking = $state<Record<string, boolean>>({});
  let editing = $state<string | null>(null);
  let editText = $state("");
  /** Where a new to-do goes: `""` at the foot, a ref under that to-do. */
  let addingUnder = $state<string | null>(null);
  let addText = $state("");
  let busy = $state(false);
  let problem = $state<string | null>(null);

  const done = $derived(
    todos.filter((todo) => ticking[refOf(todo)] ?? todo.done).length
  );

  const say = (error: unknown) => {
    problem = failureWords(error);
  };

  async function toggle(todo: Todo, next: boolean) {
    const ref = refOf(todo);
    ticking[ref] = next;
    problem = null;
    try {
      await ontick(ref, next);
    } catch (error) {
      say(error);
    } finally {
      delete ticking[ref];
    }
  }

  async function saveEdit(todo: Todo) {
    const text = editText.trim();
    if (!text || text === todo.text) {
      editing = null;
      return;
    }
    busy = true;
    problem = null;
    try {
      await onedit(refOf(todo), text);
      editing = null;
    } catch (error) {
      say(error);
    } finally {
      busy = false;
    }
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const text = addText.trim();
    if (!text || busy) {
      return;
    }
    busy = true;
    problem = null;
    try {
      await onadd(text, addingUnder || undefined);
      addText = "";
      if (addingUnder) {
        addingUnder = null;
      }
    } catch (error) {
      say(error);
    } finally {
      busy = false;
    }
  }

  /** The field a click just opened takes the keys at once. */
  function focusOnMount(node: HTMLElement) {
    const field = node.querySelector("input");
    if (field) {
      field.focus();
    } else {
      tick().then(() => node.querySelector("input")?.focus());
    }
  }
</script>

{#snippet addForm(under: string, depth: number)}
  <form
    data-slot="add"
    class="flex items-center gap-space-2 min-h-c-btn-h-sm ps-(--indent)"
    onsubmit={add}
    style:--depth={depth}
    style:--indent="calc(var(--depth, 0) * var(--space-6))"
    {@attach under ? focusOnMount : undefined}
  >
    <Input
      aria-label={under ? `Add a to-do under ${under}` : "Add a to-do"}
      autocomplete="off"
      class="flex-auto h-c-btn-h-sm text-label"
      onfocus={() => {
        if (!under) {
          addingUnder = "";
        }
      }}
      oninput={(event) => {
        addingUnder = under;
        addText = event.currentTarget.value;
      }}
      onkeydown={(event) => {
        if (event.key === "Escape" && under) {
          event.stopPropagation();
          addingUnder = null;
          addText = "";
        }
      }}
      placeholder={under ? "A step of it" : "Add a to-do"}
      value={addingUnder === under ? addText : ""}
    />
    <Button
      aria-label="Add to-do"
      disabled={!(addingUnder === under && addText.trim())}
      size="icon-sm"
      type="submit"
      variant="ghost"
    >
      <IconPlus />
    </Button>
  </form>
{/snippet}

<section class="flex flex-col gap-space-2">
  <h3 class="kit-section-head min-h-c-btn-h-xs m-0 px-0">
    To-dos
    {#if todos.length > 0}
      <span data-num data-slot="count" class="count num"
        >{done}/{todos.length}</span
      >
    {/if}
  </h3>
  {#if problem}
    <p class="type-meta text-error-11" role="alert">{problem}</p>
  {/if}
  {#if todos.length > 0}
    <ul class="flex flex-col m-0 p-0 list-none">
      {#each todos as todo (todo.path)}
        {@const ref = refOf(todo)}
        {@const checked = ticking[ref] ?? todo.done}
        <li
          data-slot="todo"
          class="group flex items-center gap-space-2 min-h-c-btn-h-sm ps-(--indent)"
          style:--depth={todo.depth}
          style:--indent="calc(var(--depth, 0) * var(--space-6))"
        >
          <Checkbox
            aria-label={todo.text}
            {checked}
            onCheckedChange={(next) => toggle(todo, next)}
          />
          {#if editing === ref}
            <form
              class="flex-auto"
              onsubmit={(event) => {
                event.preventDefault();
                saveEdit(todo);
              }}
              {@attach focusOnMount}
            >
              <Input
                aria-label="To-do"
                autocomplete="off"
                class="h-c-btn-h-sm text-label"
                disabled={busy}
                onblur={() => saveEdit(todo)}
                onkeydown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    editing = null;
                  }
                }}
                bind:value={editText}
              />
            </form>
          {:else}
            <button
              data-slot="text"
              class="flex flex-auto items-baseline gap-space-2 min-w-0 p-space-1 rounded-xs type-body text-ink-strong text-start hover:bg-surface-hover data-done:text-ink-subtle data-done:line-through data-done:decoration-border-control press-tint focus-inset"
              data-done={checked ? "" : undefined}
              onclick={() => {
                editing = ref;
                editText = todo.text;
              }}
              title="Edit this to-do"
              type="button"
            >
              {#if todo.proposed}
                <span
                  class="flex-none type-meta text-ink-muted"
                  title="Left open in an attempt's plan: offered, not agreed. Rewording it agrees to it."
                  >Proposed</span
                >
              {/if}
              <span>{todo.text}</span>
              {#if todo.promoted}
                <span
                  class="flex-none text-meta font-mono liga-none text-ink-muted"
                  >→ {todo.promoted}</span
                >
              {/if}
            </button>
            <Button
              aria-label="Add a to-do under “{todo.text}”"
              class="flex-none text-ink-muted can-hover:opacity-0 can-hover:transition-[opacity] can-hover:dur-control can-hover:ease-out can-hover:group-hover:opacity-100 can-hover:focus-visible:opacity-100"
              onclick={() => {
                addingUnder = ref;
                addText = "";
              }}
              size="icon-xs"
              variant="ghost"
            >
              <IconPlus />
            </Button>
          {/if}
        </li>
        {#if addingUnder === ref}
          <li>{@render addForm(ref, todo.depth + 1)}</li>
        {/if}
      {/each}
    </ul>
  {:else}
    <p data-slot="todo-list-empty" class="type-body text-ink-subtle">
      Break the task into steps here; a session working on it ticks them as it
      goes.
    </p>
  {/if}
  {@render addForm("", 0)}
</section>
