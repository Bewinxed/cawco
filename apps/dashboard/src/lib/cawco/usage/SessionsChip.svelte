<script lang="ts">
  /**
   * The sessions an account carries, on its dial's corner: a 16px count in
   * the kit badge's paint (its delegates' sessions among them: each is a
   * hub row whose `accountId` is the account), read out "2 sessions on
   * design", reaching 44px under a finger. Resting a fine pointer on
   * it, or a tap, opens the list in a kit popover: each session's status
   * glyph, title and project, a link that opens it and puts the usage
   * popover away (`onopen`).
   *
   * Hover timing is the rail's session card's (SessionHover): it opens after
   * 350ms of rest and closes 300ms after the pointer leaves both it and the
   * list, so a pointer crossing the gap keeps it open.
   *
   * The list hangs a pitch under the row the chip sits on (its nearest
   * `[data-flyover-anchor]`, a cell of the usage popover's dial wall), as
   * wide as the row: where the cell stands in a wall (`[data-flyover-span]`)
   * the row is the wall's whole width at the cell's height, so a session's
   * title and project read whole. It is a card: a head line (the account's
   * name as its cell shows it, then how many sessions), its sessions under
   * it, top-aligned. It covers whole cells or none: where its foot would
   * fall inside a cell or a head line under it (`[data-flyover-anchor]`,
   * `[data-flyover-edge]`, in `[data-flyover-scope]`), it reaches that
   * cell's or line's foot, and the band left under its sessions is the
   * card's own. Opened by
   * a pointer (a rest or a press) it leaves focus where it
   * is: no ring lands on its first session. Opened from the keyboard, focus
   * goes to the first session and the house ring shows.
   */
  import { MediaQuery } from "svelte/reactivity";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { cawco, type InstanceRow } from "../client.svelte";
  import { instanceTitle, projectOfRow } from "../home/home-state.svelte";
  import { conversationHref } from "../links";
  import SessionStatus from "../workspace/SessionStatus.svelte";

  let {
    sessions,
    account,
    name = account,
    onopen,
  }: {
    sessions: InstanceRow[];
    /** The account's name, for the chip's label. */
    account: string;
    /** Its name as its cell shows it, for the card's head. */
    name?: string;
    /** A session was opened from the list. */
    onopen?: () => void;
  } = $props();

  const OPEN_AFTER = 350;
  const CLOSE_AFTER = 300;

  const fine = new MediaQuery("(hover: hover) and (pointer: fine)");
  let open = $state(false);
  let dwell: ReturnType<typeof setTimeout> | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;
  /** The last thing that opened it was a pointer (a rest or a press). */
  let byPointer = $state(false);
  let trigger = $state<HTMLElement | null>(null);
  const row = $derived(
    trigger?.closest<HTMLElement>("[data-flyover-anchor]") ?? null
  );
  const span = $derived(
    row?.closest<HTMLElement>("[data-flyover-span]") ?? null
  );
  /** The row, across its grid's whole width where it stands in one. */
  const anchor = $derived.by(() => {
    if (!(row && span)) {
      return row;
    }
    const cell = row;
    const grid = span;
    return {
      contextElement: cell,
      getBoundingClientRect: () => {
        const at = cell.getBoundingClientRect();
        const across = grid.getBoundingClientRect();
        return new DOMRect(across.x, at.y, across.width, at.height);
      },
    };
  });
  const keepFocus = (event: Event) => {
    if (byPointer) {
      event.preventDefault();
    }
  };

  /** The card's content, and the height it reaches to so it covers whole cells (0: its own). */
  let card = $state<HTMLElement | null>(null);
  let reach = $state(0);
  $effect(() => {
    if (!(open && card && row)) {
      reach = 0;
      return;
    }
    const content = card;
    const cell = row;
    const scope = cell.closest<HTMLElement>("[data-flyover-scope]");
    if (!scope) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      // It stands a pitch (4px) under the row, with a 1px edge each side.
      const top = cell.getBoundingClientRect().bottom + 4;
      const zones = [
        ...scope.querySelectorAll<HTMLElement>(
          "[data-flyover-anchor], [data-flyover-edge]"
        ),
      ]
        .filter((one) => one !== cell)
        .map((one) => {
          const at = one.getBoundingClientRect();
          return { top: at.top, bottom: at.bottom };
        });
      const own = content.offsetHeight + 2;
      let end = top + own;
      for (let moved = true; moved;) {
        moved = false;
        for (const zone of zones) {
          if (zone.top < end - 0.5 && end < zone.bottom - 0.5) {
            end = zone.bottom;
            moved = true;
          }
        }
      }
      reach = end - top > own + 0.5 ? end - top : 0;
    });
    return () => cancelAnimationFrame(frame);
  });

  const count = $derived(sessions.length);
  const label = $derived(
    `${count} ${count === 1 ? "session" : "sessions"} on ${account}`
  );

  function rest() {
    if (!fine.current) {
      return;
    }
    clearTimeout(closing);
    if (!open) {
      clearTimeout(dwell);
      dwell = setTimeout(() => {
        byPointer = true;
        open = true;
      }, OPEN_AFTER);
    }
  }
  function leave() {
    if (!fine.current) {
      return;
    }
    clearTimeout(dwell);
    clearTimeout(closing);
    closing = setTimeout(() => {
      open = false;
    }, CLOSE_AFTER);
  }
  function opened() {
    open = false;
    onopen?.();
  }

  $effect(() => () => {
    clearTimeout(dwell);
    clearTimeout(closing);
  });
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    aria-label={label}
    badge
    class="pressable touch-hit h-icon-md min-w-icon-md flex-none cursor-pointer overflow-visible px-space-1 font-body text-ink-row text-meta leading-none num"
    data-sessions-chip
    onkeydown={() => {
      byPointer = false;
    }}
    onpointerdown={() => {
      byPointer = true;
    }}
    onpointerenter={rest}
    onpointerleave={leave}
    bind:ref={trigger}
  >
    <span class="mono-figure">{count}</span>
  </Popover.Trigger>
  <Popover.Content
    align="start"
    class="w-(--bits-popover-anchor-width) gap-0 overflow-hidden p-0 shadow-raised min-h-(--reach)"
    customAnchor={anchor}
    data-sessions-flyover
    onCloseAutoFocus={keepFocus}
    onOpenAutoFocus={keepFocus}
    onpointerenter={rest}
    onpointerleave={leave}
    side="bottom"
    sideOffset={4}
    style={reach > 0 ? `--reach: ${reach}px` : undefined}
    trapFocus={!byPointer}
  >
    <div data-slot="sessions-chip-card" class="flex flex-col" bind:this={card}>
      <p
        data-slot="head"
        class="px-space-3 pt-space-2 pb-space-1 font-body text-ink-strong text-meta font-medium"
        data-flyover-head
      >
        {name}
        · {count === 1 ? "1 session" : `${count} sessions`}
      </p>
      <ul data-slot="list" aria-label={label} class="flex flex-col">
        {#each sessions as session (session.id)}
          <li>
            <!-- literal: 40px, 44px -->
            <a
              data-slot="item"
              class="no-hover:h-(--item-h-touch) h-(--item-h) max-phone:h-(--item-h-touch) transition-[background-color] dur-control ease-out flex items-center gap-space-2 px-space-3 py-0 text-ink-strong no-underline hover:bg-surface-hover"
              style:--item-h="40px"
              style:--item-h-touch="44px"
              data-session-link={session.id}
              href={conversationHref(session.id, cawco.instanceIndex)}
              onclick={opened}
            >
              <SessionStatus compact sessionId={session.id} />
              <span
                data-slot="title"
                class="min-w-0 flex-auto truncate type-label"
                >{instanceTitle(session)}</span
              >
              <span
                data-slot="project"
                class="type-meta max-w-2/5 min-w-0 flex-initial truncate text-ink-muted"
                >{projectOfRow(session)}</span
              >
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </Popover.Content>
</Popover.Root>
