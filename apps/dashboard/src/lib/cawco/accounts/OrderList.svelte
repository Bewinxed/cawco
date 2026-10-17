<script lang="ts">
  /**
   * Fill-first order: the accounts as rows, dragged by the hand into the
   * order new sessions fill them in. The row under the pointer follows it;
   * the others make room on the list's reflow (motion/rows), and the row
   * drops into its place. Up and down arrows move a focused row a place.
   */
  import { type Account, accountsWords } from "@cawco/core";
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

  const words = accountsWords.routingEditor;
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

<div class="flex flex-col">
  <p
    data-slot="order-list-label"
    class="type-meta px-space-1 pt-0 pb-space-2 text-ink-muted"
    id="order-label"
  >
    {words.order}
  </p>
  <!-- literal: 3px -->
  <ol
    data-slot="list"
    aria-labelledby="order-label"
    class="m-0 flex list-none flex-col gap-(--list-gap) p-0"
    style:--list-gap="3px"
    bind:this={list}
    {@attach reflow()}
  >
    {#each rows as account (account.id)}
      <li
        data-slot="slot"
        data-held={held === account.id || undefined}
        class="group relative translate-y-(--carry) data-held:z-2"
        data-flip={held === account.id ? undefined : ""}
        style:--carry={held === account.id ? `${carried}px` : undefined}
      >
        <button
          data-slot="row"
          aria-label={words.place(
            nameOf(account),
            order.indexOf(account.id) + 1,
            order.length
          )}
          aria-roledescription={words.draggable}
          class="type-label relative flex min-h-space-8 w-full cursor-grab touch-none items-center gap-space-3 rounded-sm border-none border-current bg-surface-fill px-space-3 py-0 text-start text-ink-row select-none group-data-held:cursor-grabbing group-data-held:bg-surface-lift group-data-held:shadow-md focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset) coarse:min-h-c-btn-h-lg"
          data-id={account.id}
          onkeydown={(event) => nudge(event, account.id)}
          onpointerdown={(event) => grab(event, account.id)}
          type="button"
          style:--c={hueVar(account.hue)}
        >
          <!-- literal: 10px; radial-gradient dots; 5px tile -->
          <span
            aria-hidden="true"
            class="h-space-4 w-(--handle-w) flex-none bg-(image:--handle-dots) bg-size-(--handle-tile)"
            style:--handle-w="10px"
            style:--handle-dots={"radial-gradient(circle, var(--ink-subtle) 1px, transparent 1.5px)"}
            style:--handle-tile="5px 5px"
          ></span>
          <!-- literal: 8px; 50% -->
          <span
            data-slot="dot"
            aria-hidden="true"
            class="size-(--dot) flex-none rounded-(--dot-radius) bg-(--c)"
            style:--dot="8px"
            style:--dot-radius="50%"
          ></span>
          <AccountName {account} row />
        </button>
      </li>
    {/each}
  </ol>
</div>
