<script lang="ts">
  /**
   * Fill-first order: the accounts as rows, dragged by the hand into the
   * order new sessions fill them in (motion/hand-order).
   */
  import type { Account } from "@cawco/core/accounts";
  import { accountsWords } from "@cawco/core/words/accounts";
  import { HandOrder } from "../motion/hand-order.svelte";
  import { reflow } from "../motion/rows.svelte";
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
  const hand = new HandOrder();
</script>

<div class="flex flex-col">
  <p
    data-slot="order-list-label"
    class="type-meta px-space-1 pt-0 pb-space-2 text-ink-muted"
    id="order-label"
  >
    {words.order}
  </p>
  <ol
    data-slot="list"
    aria-labelledby="order-label"
    class="flex flex-col gap-space-row"
    bind:this={list}
    {@attach reflow()}
  >
    {#each rows as account (account.id)}
      <li
        data-slot="slot"
        data-held={hand.held === account.id || undefined}
        class="group relative data-held:z-2"
        data-flip={hand.held === account.id ? undefined : ""}
        style:transform={hand.carry(account.id)}
      >
        <button
          data-slot="row"
          aria-label={words.place(
            nameOf(account),
            order.indexOf(account.id) + 1,
            order.length
          )}
          aria-roledescription={words.draggable}
          class="type-label relative flex min-h-space-8 w-full cursor-grab touch-none items-center gap-space-3 rounded-sm border-none border-current bg-surface-fill px-space-3 text-start text-ink-row select-none group-data-held:cursor-grabbing group-data-held:bg-surface-lift group-data-held:shadow-md focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset) coarse:min-h-c-btn-h-lg"
          data-id={account.id}
          onkeydown={(event) =>
            hand.nudge(event, account.id, order, onchange, list)}
          onpointerdown={(event) =>
            hand.grab(event, account.id, order, onchange, list)}
          type="button"
          style:--c={hueVar(account.hue)}
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
    {/each}
  </ol>
</div>
