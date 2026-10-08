<script lang="ts">
  /**
   * Fill-first order: the accounts as rows, dragged by the hand into the
   * order new sessions fill them in. The row under the pointer follows it;
   * the others make room on the list's reflow (motion/rows), and the row
   * drops into its place. Up and down arrows move a focused row a place.
   */
  import type { Account } from "@cawco/core";
  import { tick } from "svelte";
  import { dur, ease, motionOk } from "../motion/curves.svelte";
  import { REFLOW_REREAD, reflow } from "../motion/rows.svelte";
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

  const rows = $derived(
    order
      .map((id) => accounts.find((one) => one.id === id))
      .filter((one): one is Account => one !== undefined)
  );

  let list = $state<HTMLElement | null>(null);
  /** The row in the hand, and how far it has been carried from its place. */
  let held = $state<string | null>(null);
  let carried = $state(0);

  function grab(event: PointerEvent, id: string) {
    if (event.button !== 0 || !list) {
      return;
    }
    event.preventDefault();
    const row = event.currentTarget as HTMLElement;
    const items = [...list.children] as HTMLElement[];
    const step =
      items.length > 1
        ? items[1].offsetTop - items[0].offsetTop
        : row.offsetHeight;
    const from = order.indexOf(id);
    let at = from;
    const y0 = event.clientY;
    row.setPointerCapture(event.pointerId);
    held = id;
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - y0;
      const next = Math.max(
        0,
        Math.min(order.length - 1, Math.round(from + dy / step))
      );
      if (next !== at) {
        const ids = order.filter((one) => one !== id);
        ids.splice(next, 0, id);
        at = next;
        onchange(ids);
      }
      carried = dy - (at - from) * step;
    };
    const drop = async () => {
      row.removeEventListener("pointermove", move);
      row.removeEventListener("pointerup", drop);
      row.removeEventListener("pointercancel", drop);
      const left = carried;
      held = null;
      carried = 0;
      if (motionOk.current && left !== 0) {
        row.animate(
          [{ transform: `translateY(${left}px)` }, { transform: "none" }],
          { duration: dur("--dur-exit"), easing: ease("--ease-out") }
        );
      }
      await tick();
      list?.dispatchEvent(new Event(REFLOW_REREAD));
    };
    row.addEventListener("pointermove", move);
    row.addEventListener("pointerup", drop);
    row.addEventListener("pointercancel", drop);
  }

  function nudge(event: KeyboardEvent, id: string) {
    const by = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (by === undefined) {
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

<div class="order">
  <p class="label" id="order-label">Order: drag to change it</p>
  <ol
    aria-labelledby="order-label"
    class="list"
    bind:this={list}
    {@attach reflow()}
  >
    {#each rows as account (account.id)}
      <li
        class={["slot", held === account.id && "held"]}
        data-flip={held === account.id ? undefined : ""}
        style:transform={held === account.id
          ? `translateY(${carried}px)`
          : undefined}
      >
        <button
          aria-label="{nameOf(account)}, place {order.indexOf(account.id) +
            1} of {order.length}. Arrow keys move it."
          aria-roledescription="draggable"
          class="row"
          data-id={account.id}
          onkeydown={(event) => nudge(event, account.id)}
          onpointerdown={(event) => grab(event, account.id)}
          type="button"
          style:--c={hueVar(account.hue)}
        >
          <span aria-hidden="true" class="handle"></span>
          <span aria-hidden="true" class="dot"></span>
          <AccountName {account} row />
        </button>
      </li>
    {/each}
  </ol>
</div>

<style>
  .order {
    display: flex;
    flex-direction: column;
  }
  .label {
    padding: 0 var(--space-1) var(--space-2);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: 32px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    text-align: start;
    background: var(--surface-fill);
    font: var(--type-label);
    color: var(--ink-row);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .row:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-inset);
  }
  .slot {
    position: relative;
  }
  .slot.held {
    z-index: 2;
  }
  .held .row {
    background: var(--surface-lift);
    box-shadow: var(--shadow-md);
    cursor: grabbing;
  }
  .handle {
    flex: none;
    width: 10px;
    height: 14px;
    background:
      radial-gradient(circle, var(--ink-subtle) 1px, transparent 1.5px) 0 0 /
      5px 5px;
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }
  @media (pointer: coarse) {
    .row {
      min-height: var(--c-btn-h-lg);
    }
  }
</style>
