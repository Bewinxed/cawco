<!--
  A task's to-do list as the Details tab of its pane draws it, fed the way
  TaskPane feeds it. The design is the real TodoList.svelte on this branch;
  Today is the two copies in today/. Where the pane would ask the hub (keep,
  drop, undo, tick, reword, add), this page answers as the hub would answer
  once it writes them: the list it would hand back, at once. That is the
  data seam: TodoList's props (onkeep, ondrop, onrestore, offeredBy), which
  TaskPane wires to project-tasks.ts keepTodos, dropTodo and restoreTodo.

  A state only a press reaches is reached by that press, made on the page
  once the list is drawn: Drop on the second offer, Keep all with the hub
  still writing, Keep on the first refused in the hub's own words.
-->
<script lang="ts">
  import { tick, untrack } from "svelte";
  import TodoList, {
    type Dropped,
  } from "../../../apps/dashboard/src/lib/cawco/tasks/TodoList.svelte";
  import type { Todo } from "../../../apps/dashboard/src/lib/cawco/project-tasks";
  import TodoListLive from "./today/TodoListLive.svelte";
  import TodoListMain from "./today/TodoListMain.svelte";
  import { ATTEMPT, GONE, KEPT_ONE, OFFERED, OFFERED_BY, TODOS } from "./tsk16.js";

  let {
    list,
    data,
    press,
  }: {
    list: "live" | "main" | "design";
    data: "today" | "offered" | "kept-one";
    press?: "drop-second" | "keep-all" | "keep-first-refused";
  } = $props();

  // The state is keyed on the page: a list mounts once per state, from its data.
  const first = untrack(
    () => ({ today: TODOS, offered: OFFERED, "kept-one": KEPT_ONE })[data]
  );
  let todos = $state<Todo[]>(first.map((todo) => ({ ...todo })));
  let root = $state<HTMLElement>();

  const refOf = (todo: Todo) => todo.id ?? todo.path;

  /** What the hub hands back once it has written a change. */
  const answer = (next: Todo[]) => {
    todos = next;
    return Promise.resolve();
  };

  const ontick = (ref: string, done: boolean) =>
    answer(todos.map((todo) => (refOf(todo) === ref ? { ...todo, done } : todo)));
  const onedit = (ref: string, text: string) =>
    answer(todos.map((todo) => (refOf(todo) === ref ? { ...todo, text } : todo)));
  const onadd = (text: string, under?: string) => {
    const at = under ? todos.findIndex((todo) => refOf(todo) === under) : -1;
    const id = `td-${todos.length + 1}`;
    const depth = at === -1 ? 0 : todos[at].depth + 1;
    const added: Todo = {
      id,
      text,
      depth,
      done: false,
      path: String(todos.length + 1),
      promoted: null,
      proposed: false,
    };
    const next = [...todos];
    next.splice(at === -1 ? next.length : at + 1, 0, added);
    return answer(next);
  };
  const onkeep = (refs: string[]) => {
    if (press === "keep-all") {
      // The hub still writing: no answer while this state is on show.
      return new Promise<void>(() => undefined);
    }
    if (press === "keep-first-refused") {
      return Promise.reject(new Error(GONE));
    }
    return answer(
      todos.map((todo) =>
        refs.includes(refOf(todo))
          ? { ...todo, proposed: false, offeredBy: undefined }
          : todo
      )
    );
  };
  const ondrop = (ref: string) => {
    const at = todos.findIndex((todo) => refOf(todo) === ref);
    const end = todos.findIndex(
      (todo, i) => i > at && todo.depth <= todos[at].depth
    );
    return answer(todos.filter((_, i) => i < at || (end !== -1 && i >= end)));
  };
  const onrestore = (dropped: Dropped) => {
    const next = [...todos];
    next.splice(dropped.index, 0, ...dropped.todos);
    return answer(next);
  };
  const offeredBy = (todo: Todo) =>
    todo.offeredBy === ATTEMPT.workItemId
      ? { ...OFFERED_BY, open: () => undefined }
      : null;

  /** The press a state is reached by, once the list is drawn. */
  $effect(() => {
    if (!(press && root)) {
      return;
    }
    const selector = {
      "drop-second": '[data-todo="td-2"] [data-slot="drop"]',
      "keep-all": '[data-slot="keep-all"]',
      "keep-first-refused": '[data-todo="td-1"] [data-slot="keep"]',
    }[press];
    const at = root;
    tick().then(() => at.querySelector<HTMLElement>(selector)?.click());
  });
</script>

<div bind:this={root} class="list" data-list={list}>
  {#if list === "live"}
    <TodoListLive {onadd} {onedit} {ontick} {todos} />
  {:else if list === "main"}
    <TodoListMain {onadd} {onedit} {ontick} {todos} />
  {:else}
    <TodoList
      {offeredBy}
      {onadd}
      {ondrop}
      {onedit}
      {onkeep}
      {onrestore}
      {ontick}
      {todos}
    />
  {/if}
</div>
