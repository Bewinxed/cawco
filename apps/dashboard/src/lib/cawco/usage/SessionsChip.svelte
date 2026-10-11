<script lang="ts">
  /**
   * The sessions an account carries, on its row: a kit badge with the
   * session glyph and how many (its delegates' sessions among them: each is
   * a hub row whose `accountId` is the account). Resting a fine pointer on
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
   * title and project read whole. It is as tall as its sessions. Opened by
   * a pointer (a rest or a press) it leaves focus where it
   * is: no ring lands on its first session. Opened from the keyboard, focus
   * goes to the first session and the house ring shows.
   */
  import { MediaQuery } from "svelte/reactivity";
  import { badgeVariants } from "#lib/components/ui/badge/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconChat } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { cawco, type InstanceRow } from "../client.svelte";
  import { instanceTitle, projectOfRow } from "../home/home-state.svelte";
  import { conversationHref } from "../links";
  import SessionStatus from "../workspace/SessionStatus.svelte";

  let {
    sessions,
    account,
    onopen,
  }: {
    sessions: InstanceRow[];
    /** The account's name, for the chip's label. */
    account: string;
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
    class={cn(
      badgeVariants(),
      "sessions-chip pressable touch-hit overflow-visible"
    )}
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
    <IconChat aria-hidden="true" />
    <span class="num">{count}</span>
  </Popover.Trigger>
  <Popover.Content
    align="start"
    class="sessions-flyover w-(--bits-popover-anchor-width) gap-0 overflow-hidden p-0"
    customAnchor={anchor}
    data-sessions-flyover
    onCloseAutoFocus={keepFocus}
    onOpenAutoFocus={keepFocus}
    onpointerenter={rest}
    onpointerleave={leave}
    side="bottom"
    sideOffset={4}
    trapFocus={!byPointer}
  >
    <ul aria-label={label} class="list">
      {#each sessions as session (session.id)}
        <li>
          <a
            class="item"
            data-session-link={session.id}
            href={conversationHref(session.id, cawco.instanceIndex)}
            onclick={opened}
          >
            <SessionStatus compact sessionId={session.id} />
            <span class="title">{instanceTitle(session)}</span>
            <span class="project">{projectOfRow(session)}</span>
          </a>
        </li>
      {/each}
    </ul>
  </Popover.Content>
</Popover.Root>

<style>
  :global(.sessions-chip) {
    flex: none;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-row);
    cursor: pointer;
  }
  /* It lies on the cells under it, so it takes the raised lift, not the
     overlay's long drop: that one fell across the next names and, at
     night, made them read as disabled. */
  :global(.kit-pop.sessions-flyover) {
    box-shadow: var(--shadow-raised);
  }
  .list {
    display: flex;
    flex-direction: column;
  }
  /* A session: its status glyph, its title, and its project after it,
     40px (44px on touch). */
  .item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    block-size: 40px;
    padding: 0 var(--space-3);
    color: var(--ink-strong);
    text-decoration: none;
    transition: background-color var(--dur-control) var(--ease-out);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--surface-hover);
      }
    }
    @media (hover: none), (pointer: coarse), (max-width: 640px) {
      block-size: 44px;
    }
  }
  .title {
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font: var(--type-label);
  }
  .project {
    flex: 0 1 auto;
    min-inline-size: 0;
    max-inline-size: 40%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
</style>
