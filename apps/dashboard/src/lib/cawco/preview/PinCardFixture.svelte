<!--
  The comment card sizing exploration's stage (design-explore, three
  directions): a preview pane at a real size, its page, the open comment's
  pill on its element, the Comments rail when it is open, and the thread
  where the direction puts it, every part the pane's own component
  (PinFloat, PinCard, CommentRail, CommentComposer, PinMark, the kit's
  resizable split), each direction's sizing set through their props and the
  exploration's tokens. The page stands for the artifact's frame: it is
  drawn here, not loaded.

  - `reading` (A): the card beside its pill at two fifths of the well, 280
    to 480px, as tall as the room from its pill to the well's foot, its
    head the pill and the actions over a two-line quote.
  - `short` (B): the card a fixed 320px and at most 400px or two fifths of
    the well tall, the first and last entries with the rest one press; a
    longer thread opens in the rail, which widens to 400px to hold it.
  - `panel` (C): the card only composes, at 280px; a thread is a panel at
    the pane's end, 400px, its handle dragging it from 300px to half the
    pane.
-->
<script lang="ts">
  import { commentWords as said } from "@cawco/core";
  import type { Pin } from "@cawco/core/comments";
  import { pinName } from "@cawco/core/pin-name";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Resizable from "#lib/components/ui/resizable/index.js";
  import { frameObserver } from "../frame-observer";
  import { numberOf } from "../motion/curves.svelte";
  import { ComposerDraft } from "../transcript/composer-draft.svelte";
  import CommentComposer from "./CommentComposer.svelte";
  import CommentRail from "./CommentRail.svelte";
  import PinCard from "./PinCard.svelte";
  import PinFloat from "./PinFloat.svelte";
  import PinMark, { markState } from "./PinMark.svelte";
  import {
    AGENT,
    LONGER_PIN,
    OPEN_PIN,
    OPEN_TEXT,
    OTHER_PINS,
  } from "./pin-card-fixture";

  let {
    option,
    pane,
    list = "none",
    stands,
    longer = false,
    caption,
    panelW,
    dragging = false,
  }: {
    /** The direction drawn. */
    option: "reading" | "short" | "panel";
    /** The preview pane's size, px: the well and the rail beside it. */
    pane: { w: number; h: number };
    /** The Comments list: beside the page, the well's foot sheet, or shut. */
    list?: "beside" | "sheet" | "none";
    /**
     * Where the open comment's thread stands: its card beside the pill, the
     * well's foot sheet, the rail beside the page, the panel at the pane's
     * end, a side sheet over the page's end, the list's foot sheet with its
     * row opened, a bottom sheet of its own, or the composer beside the pill (no thread yet).
     */
    stands:
      | "card"
      | "sheet"
      | "rail"
      | "panel"
      | "side"
      | "row"
      | "bottom"
      | "compose";
    /** The thread after two more turns (B's short card folds it). */
    longer?: boolean;
    /** What the person judges in this frame, in words over it: the screen and what is open. */
    caption?: string;
    /** C's panel as the person dragged it, px; its 400px default when unsaid. */
    panelW?: number;
    /** C's handle held: drawn as the kit's split handle draws its drag (`data-active`, the muted ink). */
    dragging?: boolean;
  } = $props();

  const pin = $derived<Pin>(longer ? LONGER_PIN : OPEN_PIN);
  const pins = $derived([...OTHER_PINS.slice(0, 2), pin, OTHER_PINS[2]]);
  const draft = new ComposerDraft({ byReference: true });
  const nextDraft = new ComposerDraft({ byReference: true });
  const none = () => undefined;
  const nothing = new Set<string>();

  let well = $state<HTMLDivElement | null>(null);
  let pageScroll = $state<HTMLDivElement | null>(null);
  let target = $state<HTMLElement | null>(null);
  let room = $state({ w: 0, h: 0 });
  let mark = $state<{ x: number; y: number; w: number; h: number } | null>(
    null
  );
  let handle = $state<HTMLElement | null>(null);
  // Held, the handle is marked as paneforge marks it while a pointer drags
  // it (`data-active`), so the kit's split look draws it in its drag's ink
  // (resizable-handle.svelte `data-active:bg-ink-muted`). A real held mouse
  // would make the frame follow the person's pointer over the page.
  $effect(() => {
    if (dragging && handle) {
      handle.setAttribute("data-active", "pointer");
    }
  });
  /** The pill's height: `--c-pin`. */
  const pinH = $derived(numberOf("--c-pin") || 20);
  /** How far clear of a drawer's top the pill stands once lifted: `--space-3`. */
  const clearance = $derived(numberOf("--space-3") || 11);
  /** The thread stands as a drawer over the page's foot, which the pane tells the page it covers (`cawco:covered`). */
  const drawer = $derived(
    stands === "sheet" ||
      stands === "row" ||
      stands === "bottom" ||
      list === "sheet"
  );
  // The well's room and the pill's box in it, read as they lay out: the
  // pill stands on its element's top edge, near its end. Under a drawer the
  // page is scrolled as little as lands the pill clear above it, as the
  // page's overlay brings a covered pin out (agent preview-overlay pins.ts
  // `reveal`); the drawer is watched too, as its entries take their height.
  $effect(() => {
    const holder = well;
    const scroller = pageScroll;
    const on = target;
    if (!(holder && scroller && on)) {
      return;
    }
    const watched = new Set<Element>();
    const lift = () => {
      const over = holder.querySelector(
        '[data-slot="pin-card"][data-sheet], [data-slot="rail-sheet"]'
      );
      if (!(drawer && over)) {
        return;
      }
      if (!watched.has(over)) {
        watched.add(over);
        watch.observe(over);
      }
      const under =
        on.getBoundingClientRect().top +
        clearance -
        over.getBoundingClientRect().top;
      if (under > 0) {
        scroller.scrollTop += under;
      }
    };
    const read = () => {
      lift();
      const box = holder.getBoundingClientRect();
      const at = on.getBoundingClientRect();
      room = { w: holder.clientWidth, h: holder.clientHeight };
      mark = {
        x: Math.round(at.left - box.left + at.width * 0.82),
        y: Math.round(at.top - box.top - pinH),
        w: pinH,
        h: pinH,
      };
    };
    const watch = frameObserver(read);
    read();
    watch.observe(holder);
    watch.observe(on);
    return () => watch.disconnect();
  });

  /** The rail holding a thread: 400px, 500px on a pane 1680px or wider (B). */
  const threadW = $derived(
    pane.w >= 1680
      ? "var(--c-comments-thread-wide-w)"
      : "var(--c-comments-thread-w)"
  );
  /** C's panel in the split, as shares of the pane: 400px, 300px at least, half at most. */
  const panelShare = $derived({
    size: ((panelW ?? numberOf("--c-comments-thread-w")) / pane.w) * 100 || 30,
    min: (numberOf("--c-thread-panel-min") / pane.w) * 100 || 22,
    max: 50,
  });
  const reach = $derived(
    option === "reading"
      ? numberOf("--c-pin-card-reading-room") || 320
      : undefined
  );
  const fold = $derived(
    option === "reading" ? numberOf("--c-pin-card-fold-w") || 360 : undefined
  );
  const cardW = $derived(
    {
      reading: "var(--c-pin-card-reading-w)",
      short: "var(--c-pin-card-short-w)",
      panel: "var(--c-pin-card-w)",
    }[option]
  );
  const cardCap = $derived(
    option === "short" ? "var(--c-pin-card-short-max)" : undefined
  );
  /** Where the thread stands holds the rail's list or its thread. */
  const railHolds = $derived(
    stands === "rail" ||
      stands === "panel" ||
      stands === "side" ||
      stands === "bottom"
  );
</script>

{#snippet card(held: boolean)}
  <PinCard
    agentName={AGENT}
    opens="start"
    brief={option === "short" && !held}
    {draft}
    fold={held ? undefined : fold}
    head={option === "reading" ? "quote" : "line"}
    link="https://hub.local/a/reconnect-doc#pin-3"
    name={pinName(pin)}
    onclose={none}
    ondelete={async () => undefined}
    onfind={none}
    onmore={none}
    onplace={none}
    onrail={option === "reading" ? none : undefined}
    onreply={none}
    onresolve={none}
    onretry={none}
    parent="Retry policy"
    {pin}
    problem={null}
  />
{/snippet}

{#snippet rail(layout: "beside" | "sheet", width: string)}
  <CommentRail
    focused={null}
    hold="ready"
    down={null}
    {layout}
    live={nothing}
    onclose={none}
    onhover={none}
    onopen={none}
    onpage={none}
    onresolve={none}
    onretry={none}
    onretrypin={none}
    open={stands === "compose" ? null : pin.id}
    {pins}
    thread={railHolds || stands === "row" ? threadHeld : undefined}
    threadIn={stands === "row" ? "row" : "rail"}
    unread={nothing}
    {width}
  />
{/snippet}

{#snippet threadHeld()}
  {@render card(true)}
{/snippet}

{#snippet page()}
  <!-- The artifact's page, as its frame would draw it. -->
  <!-- Its foot pads a pane's height, standing for the rest of a long page, so a drawer can lift the pin clear above it. -->
  <article
    class="mx-auto max-w-phone px-space-6 pt-space-8 pb-(--pane-h) text-ink-strong"
    data-slot="fixture-page"
  >
    <h1 class="m-0 type-title" id="title">Reconnecting to the hub</h1>
    <p class="mt-space-3 mb-0 text-ink-muted type-body text-pretty">
      What a machine does when its link to the hub drops, and what the dashboard
      says while it does.
    </p>
    <h2 class="mt-space-8 mb-0 type-label">Where it connects</h2>
    <p class="mt-space-2 mb-0 type-body text-pretty" id="ports">
      The hub listens on 7421 over the tailnet. A machine finds it by mDNS on
      the LAN first, then by the address it was paired with.
    </p>
    <h2 class="mt-space-8 mb-0 type-label">Retry policy</h2>
    <p
      bind:this={target}
      class="mt-space-2 mb-0 type-body text-pretty"
      id="retry-backoff"
    >
      {OPEN_TEXT}
    </p>
    <p class="mt-space-3 mb-0 type-body text-pretty" id="log">
      Each try is written to the daemon's log. The machine's row shows it as
      connected until it has been silent for 90 seconds.
    </p>
    <h2 class="mt-space-8 mb-0 type-label">When it gives up</h2>
    <p class="mt-space-2 mb-0 type-body text-pretty">
      It never does today. A machine that can't reach the hub keeps trying at
      the longest wait until it is stopped.
    </p>
    <h2 class="mt-space-8 mb-0 type-label">What the dashboard says</h2>
    <p class="mt-space-2 mb-0 type-body text-pretty">
      The machine's row keeps its last status until the hub hears from it again.
      Its sessions keep their places on the board and show the time they were
      last heard from.
    </p>
    <p class="mt-space-3 mb-0 type-body text-pretty">
      Once the machine answers, its sessions report what they did while it was
      away, and the row returns to its live status without a reload.
    </p>
    <h2 class="mt-space-8 mb-0 type-label">Settings</h2>
    <p class="mt-space-2 mb-0 type-body text-pretty">
      None of this can be changed from the dashboard yet. The wait and the
      number of tries live in the daemon's own configuration, read once when it
      starts.
    </p>
    <p class="mt-space-3 mb-0 type-body text-pretty">
      A machine started with a different configuration keeps it until it is
      restarted, so two machines on one hub can retry at different paces.
    </p>
  </article>
{/snippet}

{#snippet wellOf()}
  <div
    bind:this={well}
    class="relative flex-1 min-w-0 h-full overflow-hidden bg-surface-well"
    data-slot="fixture-well"
  >
    <!-- The page scrolls in its own box, as the artifact's frame does: a drawer over its foot scrolls it as little as lifts the pin clear above the drawer. -->
    <div
      bind:this={pageScroll}
      class="absolute inset-0 overflow-hidden"
      data-slot="fixture-page-scroll"
    >
      {@render page()}
    </div>
    {#if mark}
      <span
        class="absolute start-(--mark-x) top-(--mark-y) flex"
        data-slot="fixture-pill"
        style:--mark-x={`${mark.x}px`}
        style:--mark-y={`${mark.y}px`}
      >
        <PinMark
          focused={stands !== "compose"}
          number={stands === "compose" ? null : pin.number}
          state={stands === "compose" ? "provisional" : markState(pin)}
        />
      </span>
    {/if}
    <!-- What stands over the page beside a pill: the pane's pin room, the size container its card's width reads. -->
    <div
      class="absolute inset-0 pointer-events-none @container-size"
      data-slot="pin-room"
    >
      {#if (stands === "card" || stands === "sheet") && room.w > 0}
        <PinFloat
          cap={cardCap}
          label={`Comment ${pin.number}`}
          {mark}
          pin={pin.number}
          {reach}
          {room}
          sheet={stands === "sheet"}
          slot="pin-card"
          width={cardW}
        >
          {@render card(false)}
        </PinFloat>
      {:else if stands === "compose" && room.w > 0}
        <PinFloat
          bare
          label={said.comment}
          {mark}
          {room}
          slot="pin-composer"
          width={cardW}
        >
          <CommentComposer
            action="Comment"
            chain={[
              "Retry policy · After a failed reconnect…",
              "Retry policy",
              "Whole page",
            ]}
            draft={nextDraft}
            onsubmit={none}
            placeholder={said.composeHint}
          />
        </PinFloat>
      {/if}
    </div>
    {#if list === "sheet" || stands === "row" || stands === "bottom"}
      <!-- The list as the well's foot sheet; holding a thread in its row, it stands taller. -->
      <div
        class="absolute inset-x-0 bottom-0 z-2 flex max-h-3/5 data-tall:max-h-17/20"
        data-slot="rail-sheet"
        data-tall={stands === "row" || stands === "bottom" || undefined}
      >
        {@render rail("sheet", "100%")}
      </div>
    {/if}
    {#if stands === "side"}
      <!-- C on a tablet: the thread a side sheet over the page's end, the page kept at its width. -->
      <div
        class="absolute inset-y-0 end-0 z-2 flex w-c-comments-thread-w max-w-full border-s border-border-hairline shadow-drawer"
        data-slot="side-sheet"
      >
        {@render rail("beside", "100%")}
      </div>
    {/if}
  </div>
{/snippet}

<div class="flex flex-col gap-space-2" data-slot="fixture">
  {#if caption}
    <p class="m-0 type-label text-ink-strong" data-slot="fixture-caption">
      {caption}
    </p>
  {/if}
  <div
    class="relative flex w-(--pane-w) h-(--pane-h) overflow-hidden bg-surface-well"
    data-slot="fixture-pane"
    style:--pane-w={`${pane.w}px`}
    style:--pane-h={`${pane.h}px`}
  >
    {#if stands === "panel"}
      <!-- C on a desk: the thread a panel at the pane's end, the kit's split handle between. -->
      <Resizable.PaneGroup direction="horizontal">
        <Resizable.Pane defaultSize={100 - panelShare.size}>
          {@render wellOf()}
        </Resizable.Pane>
        <Resizable.Handle
          aria-label={said.resizeThread}
          look="split"
          withHandle
          bind:ref={handle}
        />
        <Resizable.Pane
          defaultSize={panelShare.size}
          maxSize={panelShare.max}
          minSize={panelShare.min}
        >
          <div class="flex h-full" data-slot="thread-panel">
            {@render rail("beside", "100%")}
          </div>
        </Resizable.Pane>
      </Resizable.PaneGroup>
    {:else}
      {@render wellOf()}
      {#if (list === "beside" && stands !== "side") || stands === "rail"}
        <div
          class="flex flex-none min-h-0 border-s border-border-hairline"
          data-slot="rail-beside"
        >
          {@render rail(
            "beside",
            stands === "rail" ? threadW : "var(--c-comments-w)"
          )}
        </div>
      {/if}
    {/if}
  </div>
</div>
