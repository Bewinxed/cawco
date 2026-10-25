<script lang="ts" module>
  import type { Todo } from "#lib/cawco/project-tasks.js";
  import type { MarkStatus } from "../TreeMark.svelte";

  /**
   * The attempt that offered a to-do, as the pane joins the to-do's
   * `offeredBy` to the task's attempts: its session's mark, title and row
   * link, and when it offered it.
   */
  export interface OfferedBy {
    /** When it offered it (its attempt ended), ms epoch. */
    at: number;
    /** Its session's row, the hint's link. */
    href: string;
    /** Opens its session beside the task, as its row under Sessions does. */
    open: () => void;
    /** Where its session works, for its mark's hue. */
    place: string;
    /** Its session's id, for its mark's sprite. */
    session: string;
    status: MarkStatus;
    /** Its session's title. */
    title: string;
  }

  /** An offer dropped from the file, held where it stood until the pane goes: what Undo puts back. */
  export interface Dropped {
    /** Where its first line stood among the task's to-dos, in file order. */
    index: number;
    /** The offer and what was nested under it, as the file had them. */
    todos: Todo[];
  }
</script>

<script lang="ts">
  /**
   * A task's to-dos (WORDS.md: to-do), nested as the file nests them, in one
   * list: the agreed ones first, then the ones an attempt only offered under
   * an Offered head, then the field that adds one. A tick shows at once and
   * is written behind it; a tick the hub refuses goes back with its reason.
   * A to-do's words edit in place, and an agreed to-do can take one under it.
   * Ticking every to-do does not finish a task: checks and landing do
   * (§5.2), so nothing here moves a stage.
   *
   * Offered (core `todoGroups`): left open in an attempt's plan, not agreed.
   * Its box is a dashed square that is no control, its words muted, and a
   * line under them names the attempt that offered it (a press opens that
   * session beside the task). Keep agrees to it and Drop takes it out of the
   * file, each one press, both always drawn; Keep all keeps every offer in
   * one write. Editing an offer's words keeps it offered. Only the agreed
   * to-dos are the count.
   *
   * A keep moves the row up to the foot of the agreed rows and a drop turns
   * it into one line saying so, with Undo, where it stood: every row is one
   * element in one keyed list (`reflow`, `data-flip`), so the kept row is
   * the one that travels, its box swaps on the same clock, and its edge
   * folds the hint; the list's box follows on that clock (`morph` rows).
   */
  import { todoGroups } from "@cawco/core/plan";
  import { tick } from "svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import { IconClose, IconPlus, IconTick } from "#lib/icons.js";
  import {
    formatDistanceToNow,
    formatDistanceToNowLong,
  } from "#lib/utils/time.js";
  import { page } from "$app/state";
  import { dur, motionOk } from "../motion/curves.svelte";
  import { morph } from "../motion/morph.svelte";
  import { reflow } from "../motion/rows.svelte";
  import SessionMark from "../SessionMark.svelte";

  let {
    todos,
    ontick,
    onedit,
    onadd,
    onkeep,
    ondrop,
    onrestore,
    offeredBy,
  }: {
    todos: Todo[];
    ontick: (ref: string, done: boolean) => Promise<void>;
    onedit: (ref: string, text: string) => Promise<void>;
    onadd: (text: string, under?: string) => Promise<void>;
    /** Keeps offers, by ref, in one write. */
    onkeep: (refs: string[]) => Promise<void>;
    /** Drops an offer, and what is nested under it. */
    ondrop: (ref: string) => Promise<void>;
    /** Puts a dropped offer back where it stood. */
    onrestore: (dropped: Dropped) => Promise<void>;
    /** The attempt that offered it; null when its line names none. */
    offeredBy: (todo: Todo) => OfferedBy | null;
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
  /** The keep or drop the hub is writing: `keep:<ref>`, `drop:<ref>`, `undo:<ref>` or `keep-all`. */
  let writing = $state<string | null>(null);
  /** Offers dropped while the pane stands, each drawn as its undo line once the file has lost it. */
  let dropped = $state<Dropped[]>([]);
  /** The list, for putting the focus where an act leaves it. */
  let list = $state<HTMLElement>();

  const groups = $derived(todoGroups(todos));
  const done = $derived(
    groups.agreed.filter((todo) => ticking[refOf(todo)] ?? todo.done).length
  );
  /** The offers themselves: what is nested under one is kept or dropped with it. */
  const offers = $derived(groups.offered.filter((todo) => todo.proposed));

  type Entry =
    | { kind: "todo"; key: string; todo: Todo }
    | { kind: "head"; key: string }
    | { kind: "dropped"; key: string; dropped: Dropped };

  /**
   * The list in order: the agreed rows, the Offered head while any offer
   * stands, the offered rows, and each drop's undo line where its row stood.
   * An undo line takes its row's key, so the row's element becomes the line
   * and the line becomes the row again on Undo.
   */
  const entries = $derived.by((): Entry[] => {
    const shownRefs = new Set(todos.map(refOf));
    const lines = dropped.filter((one) => !shownRefs.has(refOf(one.todos[0])));
    const tail: Entry[] = groups.offered.map((todo) => ({
      kind: "todo",
      key: refOf(todo),
      todo,
    }));
    for (const one of lines) {
      // Before the first offered row that stood after it in the file.
      const at = tail.findIndex(
        (entry) =>
          entry.kind === "todo" && todos.indexOf(entry.todo) >= one.index
      );
      const line: Entry = {
        kind: "dropped",
        key: refOf(one.todos[0]),
        dropped: one,
      };
      tail.splice(at === -1 ? tail.length : at, 0, line);
    }
    return [
      ...groups.agreed.map((todo): Entry => ({
        kind: "todo",
        key: refOf(todo),
        todo,
      })),
      ...(offers.length > 0 ? [{ kind: "head", key: "offered" } as const] : []),
      ...tail,
    ];
  });

  /** A row's slot: an undo line, an offer (or what is nested under one), or an agreed to-do. */
  const slotOf = (entry: Entry): string => {
    if (entry.kind === "dropped") {
      return "dropped";
    }
    return entry.kind === "todo" && groups.offered.includes(entry.todo)
      ? "offered"
      : "todo";
  };

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

  /** The focus to `selector` inside the list, once the act's change is drawn. */
  async function focusIn(selector: string) {
    await tick();
    list?.querySelector<HTMLElement>(selector)?.focus();
  }

  /**
   * A keep, a drop or an undo: the hub writes it, the list shows it when the
   * hub answers, and a refusal is said on the problem line with the row as
   * it was. `refused` opens that line in the act's words.
   */
  async function write(
    what: string,
    act: () => Promise<void>,
    refused: string
  ): Promise<boolean> {
    writing = what;
    problem = null;
    try {
      await act();
      return true;
    } catch (error) {
      problem = `${refused}: ${failureWords(error)}`;
      return false;
    } finally {
      writing = null;
    }
  }

  async function keep(todo: Todo) {
    const ref = refOf(todo);
    if (
      await write(
        `keep:${ref}`,
        () => onkeep([ref]),
        `Couldn't keep “${todo.text}”`
      )
    ) {
      await focusIn(`[data-todo="${CSS.escape(ref)}"] [data-slot="text"]`);
    }
  }

  async function keepAll() {
    const refs = offers.map(refOf);
    await write("keep-all", () => onkeep(refs), "Couldn't keep all");
  }

  async function drop(todo: Todo) {
    const ref = refOf(todo);
    const index = todos.indexOf(todo);
    const nested = groups.offered.slice(groups.offered.indexOf(todo) + 1);
    const end = nested.findIndex((one) => one.depth <= todo.depth);
    const line: Dropped = {
      index,
      todos: [todo, ...(end === -1 ? nested : nested.slice(0, end))],
    };
    // Held now and drawn once the file has lost the row: the same element.
    dropped = [...dropped, line];
    if (
      await write(
        `drop:${ref}`,
        () => ondrop(ref),
        `Couldn't drop “${todo.text}”`
      )
    ) {
      await focusIn(`[data-todo="${CSS.escape(ref)}"] [data-slot="undo"]`);
    } else {
      dropped = dropped.filter((one) => one !== line);
    }
  }

  async function undo(line: Dropped) {
    const [todo] = line.todos;
    const ref = refOf(todo);
    if (
      await write(
        `undo:${ref}`,
        () => onrestore(line),
        `Couldn't put “${todo.text}” back`
      )
    ) {
      dropped = dropped.filter((one) => one !== line);
      await focusIn(`[data-todo="${CSS.escape(ref)}"] [data-slot="text"]`);
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

{#snippet words(todo: Todo, ref: string, checked: boolean, offer: boolean)}
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
      aria-describedby={offer ? `offered-${ref}` : undefined}
      data-slot="text"
      class="select-none flex flex-auto items-baseline gap-space-2 min-w-0 p-space-1 rounded-xs type-body text-ink-strong text-start wrap-anywhere hover:bg-surface-hover data-done:not-data-offered:text-ink-subtle data-done:line-through data-done:decoration-border-control data-offered:text-ink-muted press-tint focus-inset"
      data-done={checked ? "" : undefined}
      data-offered={offer ? "" : undefined}
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
  {/if}
{/snippet}

{#snippet agreed(todo: Todo, ref: string)}
  {@const checked = ticking[ref] ?? todo.done}
  <div class="flex items-center gap-space-2 min-h-c-btn-h">
    <Checkbox
      aria-label={todo.text}
      {checked}
      data-flip="pop"
      onCheckedChange={(next) => toggle(todo, next)}
    />
    {@render words(todo, ref, checked, false)}
    {#if editing !== ref}
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
  </div>
{/snippet}

{#snippet offered(todo: Todo, ref: string)}
  {@const by = offeredBy(todo)}
  <!-- Its words' line as tall as the words: the hint stands the same step
       under one line of words as under two. -->
  <div class="flex items-center gap-space-2">
    <!-- Its box: drawn, never a control (Keep agrees to it). Its dashes in
         the strong control edge, 3:1 on the ground by day and at night: the
         row's one mark of being offered. -->
    <span
      aria-hidden="true"
      data-flip="pop"
      data-slot="offer-box"
      class="flex-none size-icon-md rounded-xs border border-dashed border-border-control-strong"
    ></span>
    {@render words(todo, ref, false, true)}
    <span id="offered-{ref}" class="sr-only">offered, not agreed</span>
    {#if editing !== ref && todo.proposed}
      <span
        data-slot="decide"
        class="flex flex-none items-center gap-space-1 coarse:gap-space-7 coarse:ps-space-3"
      >
        <Button
          aria-label="Keep “{todo.text}”"
          data-slot="keep"
          icon={IconTick}
          onclick={() => keep(todo)}
          pending={writing === `keep:${ref}`}
          size="icon-xs"
          title="Keep this to-do"
          tone="muted"
          variant="ghost"
        />
        <Button
          aria-label="Drop “{todo.text}”"
          data-slot="drop"
          icon={IconClose}
          onclick={() => drop(todo)}
          pending={writing === `drop:${ref}`}
          size="icon-xs"
          title="Drop this to-do"
          tone="muted"
          variant="ghost"
        />
      </span>
    {/if}
  </div>
  {#if todo.proposed}
    <!-- Where it came from: the attempt's session, one press away. -->
    <div data-slot="offered-by" class="flex gap-space-2 pb-space-1">
      <!-- Under the words: as wide as the box above and its gap. Under a
           finger the link stands a control's height for its touch area, its
           line at the top, so it sits as close under the words as by day. -->
      <span aria-hidden="true" class="flex-none w-icon-md"></span>
      {#if by}
        {@const long = formatDistanceToNowLong(new Date(by.at))}
        <a
          aria-label="Offered by {by.title}, {long}. Open that session"
          class="mark-line touch-hit inline-flex flex-wrap items-center gap-x-space-1 min-w-0 coarse:min-h-c-btn-h coarse:content-start px-space-1 rounded-xs type-meta text-ink-muted no-underline wrap-anywhere hover:bg-surface-hover press-tint focus-inset"
          href={by.href}
          onclick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            event.preventDefault();
            by.open();
          }}
          title="Offered by {by.title}, {long}. Open that session"
        >
          <span
            data-box
            class="flex flex-none"
            style:--mark-size="var(--icon-sm)"
          >
            <SessionMark id={by.session} place={by.place} status={by.status} />
          </span>
          <span>{by.title}</span>
          <span aria-hidden="true">·</span>
          <time datetime={new Date(by.at).toISOString()}
            >{formatDistanceToNow(new Date(by.at))}</time
          >
        </a>
      {:else}
        <span class="px-space-1 type-meta text-ink-muted"
          >Offered by an earlier attempt</span
        >
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet undoLine(line: Dropped)}
  {@const [todo] = line.todos}
  <!-- One line where the row stood: the words it dropped cut to the line
       (the whole sentence its title), Undo at the end. -->
  <p
    class="flex items-center gap-space-2 min-h-c-btn-h m-0 ps-space-1 type-meta text-ink-muted"
  >
    <span
      data-slot="dropped-words"
      class="flex min-w-0 whitespace-nowrap"
      title="Dropped “{todo.text}”."
      ><span class="flex-none">Dropped “</span><span class="min-w-0 truncate"
        >{todo.text}</span
      ><span class="flex-none">”.</span></span
    >
    <Button
      aria-label="Undo: put “{todo.text}” back"
      class="ms-auto"
      data-slot="undo"
      onclick={() => undo(line)}
      pending={writing === `undo:${refOf(todo)}`}
      size="xs"
      variant="ghost">Undo</Button
    >
  </p>
{/snippet}

{#snippet addForm(under: string, depth: number)}
  <form
    data-slot="add"
    data-flip={under ? undefined : ""}
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

<section data-slot="todos" {@attach morph({ rows: true })}>
  <div class="flex flex-col gap-space-2" {@attach reflow()}>
    <h3 class={sectionHeadVariants({ inset: "flush" })}>
      To-dos
      {#if groups.agreed.length > 0}
        <span
          data-flip="pop"
          data-num
          data-slot="count"
          class="num ms-auto type-meta text-ink-subtle"
          >{done}/{groups.agreed.length}</span
        >
      {/if}
    </h3>
    {#if problem}
      <p
        data-flip
        data-slot="problem"
        class="type-meta text-error-11"
        role="alert"
      >
        {problem}
      </p>
    {/if}
    {#if entries.length > 0}
      <ul bind:this={list} class="flex flex-col m-0 p-0 list-none">
        {#each entries as entry (entry.key)}
          {#if entry.kind === "head"}
            <li
              data-flip
              data-slot="offered-head"
              class="pt-space-3 first:pt-0"
            >
              <div class={sectionHeadVariants({ inset: "flush" })}>
                <h4
                  title="Steps an attempt left open in its plan: offered, not agreed. Keep or drop each."
                >
                  Offered
                </h4>
                <span
                  data-num
                  data-slot="offered-count"
                  class="num ms-auto type-meta text-ink-subtle"
                  >{offers.length}</span
                >
                <Button
                  aria-label="Keep all {offers.length} offered to-dos"
                  data-slot="keep-all"
                  icon={IconTick}
                  data-box
                  label="Keep all"
                  onclick={keepAll}
                  pending={writing === "keep-all"}
                  pendingLabel="Keeping…"
                  size="xs"
                  variant="ghost"
                />
              </div>
            </li>
          {:else}
            {@const ref = entry.key}
            {@const todo =
              entry.kind === "todo" ? entry.todo : entry.dropped.todos[0]}
            <li
              data-flip="box"
              data-slot={slotOf(entry)}
              data-todo={ref}
              data-linked={marked === ref || undefined}
              class="group flex flex-col ps-(--indent) rounded-sm transition-[background-color] duration-(--dur-fade) ease-out data-linked:bg-selected-bg"
              style:--depth={todo.depth}
              style:--indent="calc(var(--depth, 0) * var(--space-6))"
            >
              {#if entry.kind === "dropped"}
                {@render undoLine(entry.dropped)}
              {:else if groups.offered.includes(entry.todo)}
                {@render offered(entry.todo, ref)}
              {:else}
                {@render agreed(entry.todo, ref)}
              {/if}
            </li>
            {#if entry.kind === "todo" && addingUnder === ref}
              <li>{@render addForm(ref, entry.todo.depth + 1)}</li>
            {/if}
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
  </div>
</section>
