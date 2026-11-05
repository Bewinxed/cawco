<script lang="ts">
  /**
   * Fill-first order: the accounts as rows, dragged by the hand into the
   * order new sessions fill them in (drag/DragProvider): the row lifts and
   * follows the pointer, the others make room as it passes, and the order
   * is written once it is let go. Up and down arrows move a focused row a
   * place; Space picks it up to carry it with the arrows.
   */
  import type { Account } from "@cawco/core/accounts";
  import { accountsWords } from "@cawco/core/words/accounts";
  import { tick } from "svelte";
  import DragProvider from "../drag/DragProvider.svelte";
  import { LiveOrder } from "../drag/live-order.svelte";
  import Sortable from "../drag/Sortable.svelte";
  import AccountName from "./AccountName.svelte";
  import { hueVar, nameOf } from "./model.svelte";

  let {
    accounts,
    order,
    onchange,
  }: {
    accounts: Account[];
    /** Account ids, first filled first. */
    order: string[];
    onchange: (order: string[]) => void;
  } = $props();

  const words = accountsWords.routingEditor;
  const rows = $derived(
    order
      .map((id) => accounts.find((one) => one.id === id))
      .filter((one): one is Account => one !== undefined)
  );

  let list = $state<HTMLElement | null>(null);
  /** The rows as they stand while one is in the air: the others make room as it passes. */
  const held = new LiveOrder();
  const shownRows = $derived(
    held.shown(order).flatMap((id) => rows.find((one) => one.id === id) ?? [])
  );

  function nudge(event: KeyboardEvent, id: string, carried: boolean) {
    const by = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    // Picked up with Space, the arrows are the drag's (DragProvider).
    if (by === undefined || carried) {
      return;
    }
    event.preventDefault();
    const from = order.indexOf(id);
    const to = from + by;
    if (to < 0 || to >= order.length) {
      return;
    }
    const ids = [...order];
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    onchange(ids);
    tick().then(() =>
      list?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus()
    );
  }
</script>

<div class="flex flex-col">
  <p
    data-slot="order-list-label"
    class="type-meta px-space-1 pt-0 pb-space-2 text-ink-muted"
    id="order-label"
  >
    {words.order}
  </p>
  <DragProvider
    onDragEnd={(event) => {
      const move = held.end(order, event);
      if (move) {
        const ids = [...order];
        const [id] = ids.splice(move.from, 1);
        if (id !== undefined) {
          ids.splice(move.to, 0, id);
          onchange(ids);
        }
      }
    }}
    onDragOver={(event) => held.over(event)}
    onDragStart={() => held.start(order)}
  >
    <ol
      data-slot="list"
      aria-labelledby="order-label"
      class="flex flex-col gap-space-row"
      bind:this={list}
    >
      {#each shownRows as account, index (account.id)}
        <Sortable
          id={account.id}
          {index}
          label={nameOf(account)}
          of={order.length}
        >
          {#snippet children(thing)}
            <li data-slot="slot" class="group relative" {@attach thing.attach}>
              <button
                data-slot="row"
                aria-label={words.place(
                  nameOf(account),
                  order.indexOf(account.id) + 1,
                  order.length
                )}
                aria-roledescription={words.draggable}
                class="type-label relative flex min-h-space-8 w-full cursor-grab items-center gap-space-3 rounded-sm border-none border-current bg-surface-fill px-space-3 text-start text-ink-row select-none group-data-dnd-dragging:bg-surface-lift focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset) coarse:min-h-c-btn-h-lg"
                data-id={account.id}
                onkeydown={(event) =>
                  nudge(event, account.id, thing.isDragging)}
                type="button"
                style:--c={hueVar(account.hue)}
                {@attach thing.attachHandle}
              >
                <span
                  aria-hidden="true"
                  class="h-space-4 w-c-drag-dots-w flex-none drag-dots"
                ></span>
                <span
                  data-slot="dot"
                  aria-hidden="true"
                  class="size-space-2 flex-none rounded-pill bg-(--c)"
                ></span>
                <AccountName {account} row />
              </button>
            </li>
          {/snippet}
        </Sortable>
      {/each}
    </ol>
  </DragProvider>
</div>
