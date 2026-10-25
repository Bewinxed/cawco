<!--
  Today, as main draws it: TodoList.svelte at origin/main (446cd86ce),
  copied whole by `git show origin/main:apps/dashboard/src/lib/cawco/tasks/TodoList.svelte`;
  its one relative import (../motion/curves.svelte) named by #lib instead.
  Offers stand under an Offered head, out of the count.
-->
<script lang="ts">
  /**
   * A task's to-dos (WORDS.md: to-do), nested as the file nests them. A tick
   * shows at once and is written behind it; a tick the hub refuses goes back
   * with its reason. A to-do's words edit in place, and any to-do can take
   * one under it. Ticking every to-do does not finish a task: checks and
   * landing do (§5.2), so nothing here moves a stage. The agreed to-dos come
   * first and are the count; the ones an attempt only offered stand under
   * them as Offered, out of the count until someone agrees (core
   * `todoGroups`).
   */
  import { todoGroups } from "@cawco/core/plan";
  import { tick } from "svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import type { Todo } from "#lib/cawco/project-tasks.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import { IconPlus } from "#lib/icons.js";
  import { page } from "$app/state";
  import { dur, motionOk } from "#lib/cawco/motion/curves.svelte";

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

  /*
   * The to-do a link named (`?todo=td-3`, a to-do's chip): brought into view
   * and marked for a moment once it is drawn, once per link.
   */
  const linked = $derived(page.url.searchParams.get("todo"));
  let broughtFor: string | null = null;
  let marked = $state<string | null>(null);
  $effect(() => {
    const ref = linked;
    if (
      !ref ||
      broughtFor === ref ||
      !todos.some((one) => refOf(one) === ref)
    ) {
      return;
    }
    broughtFor = ref;
    tick().then(() => {
      document
        .querySelector(`[data-todo="${CSS.escape(ref)}"]`)
        ?.scrollIntoView({
          block: "center",
          behavior: motionOk.current ? "smooth" : "auto",
        });
      marked = ref;
      setTimeout(
        () => {
          marked = null;
        },
        dur("--dur-fade") * 4
      );
    });
  });

  /** Ticks shown before the hub has written them, by ref. */
  let ticking = $state<Record<string, boolean>>({});
  let editing = $state<string | null>(null);
  let editText = $state("");
  /** Where a new to-do goes: `""` at the foot, a ref under that to-do. */
  let addingUnder = $state<string | null>(null);
  let addText = $state("");
  let busy = $state(false);
  let problem = $state<string | null>(null);

  const groups = $derived(todoGroups(todos));
  const done = $derived(
    groups.agreed.filter((todo) => ticking[refOf(todo)] ?? todo.done).length
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

{#snippet row(todo: Todo)}
  {@const ref = refOf(todo)}
  {@const checked = ticking[ref] ?? todo.done}
  <li
    data-slot="todo"
    data-todo={ref}
    data-linked={marked === ref || undefined}
    class="group flex items-center gap-space-2 min-h-c-btn-h ps-(--indent) rounded-sm transition-[background-color] duration-(--dur-fade) ease-out data-linked:bg-selected-bg"
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
          text="label"
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
        class="select-none flex flex-auto items-baseline gap-space-2 min-w-0 p-space-1 rounded-xs type-body text-ink-strong text-start hover:bg-surface-hover data-done:text-ink-subtle data-done:line-through data-done:decoration-border-control press-tint focus-inset"
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
          <span class="flex-none type-meta font-mono liga-none text-ink-muted"
            >→ {todo.promoted}</span
          >
        {/if}
      </button>
      <Button
        aria-label="Add a to-do under “{todo.text}”"
        class="flex-none"
        reveal="row-hover"
        tone="muted"
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
{/snippet}

{#snippet addForm(under: string, depth: number)}
  <form
    data-slot="add"
    class="flex items-center gap-space-2 min-h-c-btn-h ps-(--indent)"
    onsubmit={add}
    style:--depth={depth}
    style:--indent="calc(var(--depth, 0) * var(--space-6))"
    {@attach under ? focusOnMount : undefined}
  >
    <Input
      aria-label={under ? `Add a to-do under ${under}` : "Add a to-do"}
      autocomplete="off"
      class="flex-auto"
      text="label"
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
      size="icon"
      type="submit"
      variant="ghost"
    >
      <IconPlus />
    </Button>
  </form>
{/snippet}

<section class="flex flex-col gap-space-2">
  <h3 class={sectionHeadVariants({ inset: "flush" })}>
    To-dos
    {#if groups.agreed.length > 0}
      <span
        data-num
        data-slot="count"
        class="num ms-auto type-meta text-ink-subtle"
        >{done}/{groups.agreed.length}</span
      >
    {/if}
  </h3>
  {#if problem}
    <p class="type-meta text-error-11" role="alert">{problem}</p>
  {/if}
  {#if groups.agreed.length > 0}
    <ul class="flex flex-col m-0 p-0 list-none">
      {#each groups.agreed as todo (todo.path)}
        {@render row(todo)}
      {/each}
    </ul>
  {:else if groups.offered.length === 0}
    <p data-slot="todo-list-empty" class="type-body text-ink-subtle">
      Break the task into steps here; a session working on it ticks them as it
      goes.
    </p>
  {/if}
  {@render addForm("", 0)}
  {#if groups.offered.length > 0}
    <section data-slot="offered" class="flex flex-col gap-space-2">
      <h4
        class={sectionHeadVariants({ inset: "flush" })}
        title="Left open in an attempt's plan, not agreed. Rewording one agrees to it."
      >
        Offered
      </h4>
      <ul class="flex flex-col m-0 p-0 list-none">
        {#each groups.offered as todo (todo.path)}
          {@render row(todo)}
        {/each}
      </ul>
    </section>
  {/if}
</section>
