<!--
  The Comments panel in its compact form (the owner's note on
  comment-card-sizing: "create a compact view for the comment panel for
  tablet viewport and let the comments grow out of it just how the hovering
  thing on the top right does"): a narrow window used with a mouse, its
  Comments open, where the page beside a full rail leaves no room for a card
  beside its pin.

  Narrower than the rail (`--c-comments-compact-w`), each row only what picks
  a comment: its pill (and its dot), what it stands on in one line, its first
  words in one line. A row opened grows its thread out of it the way Caw's
  panel grows out of Caw's glass: a HangCard hung from the row, flush with
  the panel's trailing edge, wider than the row (`--c-pin-card-reading-w`)
  and reaching over the page, come down out of the row's foot on the house's
  hang (motion/hang: translate alone, under a cut that never moves, over
  `--dur-pop`, out over `--dur-exit`). Another row opened while one hangs:
  the card glides to it (its wrapper's move over `--dur-pop` on
  `--ease-drawer`, the session card's glide from tab to tab), never folding.
-->
<script lang="ts">
  import { commentWords as said } from "@cawco/core";
  import type { Pin } from "@cawco/core/comments";
  import { pinName } from "@cawco/core/pin-name";
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconClose } from "#lib/icons.js";
  import { frameObserver } from "../frame-observer";
  import { numberOf } from "../motion/curves.svelte";
  import PinMark, { markState } from "./PinMark.svelte";

  let {
    pins,
    open = null,
    unread = new Set(),
    live = new Set(),
    onopen,
    onclose,
    onshut,
    thread,
  }: {
    pins: Pin[];
    /** The comment whose thread hangs from its row. */
    open?: string | null;
    /** Comments with an answer the person hasn't read. */
    unread?: ReadonlySet<string>;
    /** Comments the agent is working on now. */
    live?: ReadonlySet<string>;
    /** A row pressed: its thread hangs from it. */
    onopen: (id: string) => void;
    /** The thread put away (its Close, Esc, a press outside). */
    onshut: () => void;
    /** The panel closed. */
    onclose: () => void;
    /** The open comment's thread, as the card draws it (PinCard). */
    thread: Snippet;
  } = $props();

  /** Each row's element, the card's anchor. */
  const rows = new Map<string, HTMLElement>();
  const keep = (id: string) => (node: HTMLElement) => {
    rows.set(id, node);
    return () => {
      if (rows.get(id) === node) {
        rows.delete(id);
      }
    };
  };
  let anchor = $state<HTMLElement | null>(null);
  /** The card glides: another row was opened while it hung. */
  let gliding = $state(false);
  let card = $state<HTMLElement | null>(null);
  $effect(() => {
    const next = open ? (rows.get(open) ?? null) : null;
    gliding = !!(anchor && next && anchor !== next);
    anchor = next;
  });
  // Marked on the element, as PaneTabs marks its glide: the wrapper's move is the glide.
  $effect(() => {
    card?.parentElement?.toggleAttribute("data-thread-glide", gliding);
  });

  /**
   * The card's tallest, px: the panel's room under the open row, less
   * `--space-2` at its foot (read off the panel, not the window, so a
   * canvas frame scrolled out of view draws it as the window would).
   */
  let panel = $state<HTMLElement | null>(null);
  let room = $state(0);
  $effect(() => {
    const at = anchor;
    const holder = panel;
    if (!(at && holder)) {
      return;
    }
    const read = () => {
      room =
        holder.getBoundingClientRect().bottom -
        at.getBoundingClientRect().bottom -
        (numberOf("--space-2") || 7);
    };
    read();
    const watch = frameObserver(read);
    watch.observe(holder);
    watch.observe(at);
    return () => watch.disconnect();
  });

  const dotOf = (pin: Pin): "live" | "unread" | null => {
    if (live.has(pin.id)) {
      return "live";
    }
    return unread.has(pin.id) ? "unread" : null;
  };
  const firstWords = (pin: Pin) => pin.thread[0]?.text.trim() ?? "";
</script>

<aside
  bind:this={panel}
  aria-label={said.comments}
  class="flex h-full w-c-comments-compact-w max-w-full flex-col bg-surface-raised"
  data-slot="comment-panel-compact"
>
  <header
    class="flex shrink-0 items-center gap-space-2 ps-space-3 pe-space-1 py-space-1 mark-line"
  >
    <h2
      class="m-0 min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
    >
      {said.comments}
    </h2>
    <Button
      aria-label={said.closeComments}
      icon={IconClose}
      onclick={onclose}
      size="icon-sm"
      title={said.closeComments}
      variant="ghost"
    />
  </header>
  <ol
    class="m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto overscroll-contain p-space-1"
  >
    {#each pins as pin (pin.id)}
      {@const opened = pin.id === open}
      <li class="flex-none">
        <button
          aria-expanded={opened}
          class="flex w-full items-start gap-space-2 rounded-sm border-none bg-transparent px-space-2 py-space-2 text-start transition-[background-color] duration-(--dur-control) ease-out not-aria-expanded:hover:bg-surface-hover aria-expanded:bg-selected-bg focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset)"
          data-pin-row={pin.number}
          data-slot="pin-row"
          onclick={() => (opened ? onshut() : onopen(pin.id))}
          type="button"
          {@attach keep(pin.id)}
        >
          <span class="mark-cell">
            <PinMark
              dot={dotOf(pin)}
              focused={opened}
              gone={!!pin.movedAt}
              number={pin.number}
              state={markState(pin)}
            />
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span
              class={[
                "truncate type-label font-medium",
                opened ? "text-selected-ink" : "text-ink-row",
              ]}>{pinName(pin)}</span
            >
            {#if firstWords(pin)}
              <span
                class={[
                  "mt-space-row truncate type-meta",
                  opened ? "text-selected-ink" : "text-ink-muted",
                ]}>{firstWords(pin)}</span
              >
            {/if}
          </span>
        </button>
      </li>
    {/each}
  </ol>
</aside>

<Popover.Root
  onOpenChange={(next) => {
    if (!next) {
      onshut();
    }
  }}
  open={open !== null && anchor !== null}
>
  <HangCard
    {anchor}
    align="end"
    avoidCollisions={false}
    class="w-c-pin-card-reading-w"
    customAnchor={anchor}
    data-slot="pin-card"
    flared={false}
    onOpenAutoFocus={(event) => event.preventDefault()}
    side="bottom"
    sideOffset={0}
    trapFocus={false}
    bind:ref={card}
  >
    <!-- As tall as the panel's room under its row; the thread scrolls
         inside it, its head and reply standing. -->
    <div
      class="flex max-h-(--thread-max) flex-col gap-space-2 p-space-3"
      style:--thread-max={`${Math.max(0, room)}px`}
    >
      {@render thread()}
    </div>
  </HangCard>
</Popover.Root>
