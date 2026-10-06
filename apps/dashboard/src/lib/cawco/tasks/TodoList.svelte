<script lang="ts">
  /**
   * A task's to-dos (WORDS.md: to-do), nested as the file nests them. A tick
   * shows at once and is written behind it; a tick the hub refuses goes back
   * with its reason. A to-do's words edit in place, and any to-do can take
   * one under it. Ticking every to-do does not finish a task: checks and
   * landing do (§5.2), so nothing here moves a stage.
   */
  import { tick } from "svelte";
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
    problem = error instanceof Error ? error.message : String(error);
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

{#snippet addForm(
  under: string,
  depth: number
)}
  <form
    class="add"
    onsubmit={add}
    style:--depth={depth}
    {@attach under ? focusOnMount : undefined}
  >
    <Input
      aria-label={under ? `Add a to-do under ${under}` : "Add a to-do"}
      autocomplete="off"
      class="h-[var(--c-btn-h-sm)] text-label"
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

<section class="part">
  <h3 class="kit-section-head">
    To-dos
    {#if todos.length > 0}
      <span class="count num">{done}/{todos.length}</span>
    {/if}
  </h3>
  {#if problem}
    <p class="problem" role="alert">{problem}</p>
  {/if}
  {#if todos.length > 0}
    <ul class="todos">
      {#each todos as todo (todo.path)}
        {@const ref = refOf(todo)}
        {@const checked = ticking[ref] ?? todo.done}
        <li class="todo" style:--depth={todo.depth}>
          <Checkbox
            aria-label={todo.text}
            {checked}
            onCheckedChange={(next) => toggle(todo, next)}
          />
          {#if editing === ref}
            <form
              class="edit"
              onsubmit={(event) => {
                event.preventDefault();
                saveEdit(todo);
              }}
              {@attach focusOnMount}
            >
              <Input
                aria-label="To-do"
                autocomplete="off"
                class="h-[var(--c-btn-h-sm)] text-label"
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
              class="text press-tint focus-inset"
              data-done={checked ? "" : undefined}
              onclick={() => {
                editing = ref;
                editText = todo.text;
              }}
              title="Edit this to-do"
              type="button"
            >
              <span>{todo.text}</span>
              {#if todo.promoted}
                <span class="promoted">→ {todo.promoted}</span>
              {/if}
            </button>
            <Button
              aria-label="Add a to-do under “{todo.text}”"
              class="under"
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
          <li class="todo-add">{@render addForm(ref, todo.depth + 1)}</li>
        {/if}
      {/each}
    </ul>
  {:else}
    <p class="empty">
      Break the task into steps here; a session working on it ticks them as it
      goes.
    </p>
  {/if}
  {@render addForm("", 0)}
</section>

<style>
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .part :global(.kit-section-head) {
    min-block-size: var(--c-btn-h-xs);
    margin: 0;
    padding-inline: 0;
  }
  .todos {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .todo,
  .add {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--c-btn-h-sm);
    padding-inline-start: calc(var(--depth, 0) * var(--space-6));
  }
  .text {
    display: flex;
    flex: 1 1 auto;
    align-items: baseline;
    gap: var(--space-2);
    min-inline-size: 0;
    padding: var(--space-1) var(--space-1);
    border-radius: var(--radius-xs);
    font: var(--type-body);
    color: var(--ink-strong);
    text-align: start;
  }
  .text[data-done] {
    color: var(--ink-subtle);
    text-decoration: line-through;
    text-decoration-color: var(--border-control);
  }
  @media (hover: hover) and (pointer: fine) {
    .text:hover {
      background: var(--surface-hover);
    }
  }
  .promoted {
    flex: none;
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-muted);
  }
  /* The add-under control stays out of the way until its row is pointed at
     or focused; on touch it is always there. */
  .todo :global(.under) {
    flex: none;
    color: var(--ink-muted);
  }
  @media (hover: hover) and (pointer: fine) {
    .todo :global(.under) {
      opacity: 0;
      transition: opacity var(--dur-control) var(--ease-out);
    }
    .todo:hover :global(.under),
    .todo :global(.under:focus-visible) {
      opacity: 1;
    }
  }
  .edit {
    flex: 1 1 auto;
  }
  .add :global(input) {
    flex: 1 1 auto;
  }
  .empty {
    font: var(--type-body);
    color: var(--ink-subtle);
  }
  .problem {
    font: var(--type-meta);
    color: var(--error-11);
  }
</style>
