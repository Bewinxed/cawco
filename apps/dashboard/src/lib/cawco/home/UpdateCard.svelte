<script lang="ts" module>
  import { SvelteMap } from "svelte/reactivity";
  import type { Notice } from "../updates/model";

  /**
   * The notes' fold as the reader left it, by notice, until the notice is
   * acknowledged: a reader who folds a notice that stands alone does not see
   * it open again each time the panel opens.
   */
  const chosen = new SvelteMap<string, boolean>();
  const keyOf = (notice: Notice): string => notice.acks.join(" ");

  /** The notice was acknowledged: its fold is forgotten with it. */
  export function forgetFold(notice: Notice): void {
    chosen.delete(keyOf(notice));
  }
</script>

<script lang="ts">
  import { motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { reflowsFrom, reread } from "#lib/cawco/motion/rows.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconChevronDown, IconError } from "#lib/icons.js";
  /**
   * The update notice as a row of Caw's panel (CawPanel), its one surface,
   * until its ✕ (NoticeRow) or its act acknowledges it. At rest it is two
   * lines and a footer: Caw's mark in the notice's status and the title
   * (with the failure glyph when it says one), then one meta line, the
   * notes counted by section and what the act does ("4 new · 3 improved ·
   * 2 fixed. Reload to run it."), then the footer at the row's trailing
   * edge: Show changes, then its one act (Retry, Install now, Reload) when
   * it has one (updates/model `noticeFor`).
   *
   * The notes fold in the row with what it says machine by machine and its
   * closing line: transitions-dev's Accordion expand, a grid row going 0fr
   * to 1fr while the notes cross-blur in (`--fold-blur`), open over
   * --dur-panel and shut over --dur-exit (exits faster than entrances), on
   * --ease-out, the chevron flipping from ⌄ to ⌃. They stand open from the
   * start when the notice is all the panel holds (`alone`), until the reader
   * folds them; a fold the reader chose holds for that notice until it is
   * acknowledged. While they are open `Configure update behaviour` takes the
   * footer's leading edge. A notice with no notes has nothing to fold: what
   * it says stands in the row.
   *
   * While the notes run past the panel's foot, the footer stays at its foot
   * (sticky inside the row), on the panel's surface with the house edge fade
   * above it, so Hide changes is never a scroll away; folding gives it back
   * to the row's flow where it stands. The list's own foot fade gives way
   * to it meanwhile (CawPanel).
   *
   * Reload turns the row into its goodbye (../updates/goodbye): his mark
   * waiting on his `loading`, beside "See you in a bit", and nothing else,
   * until the tab goes. The row is a `reflow` box, so its edge travels to the
   * goodbye's height and what is under it follows.
   */
  import { page } from "$app/state";
  import { arrive, GOODBYE, leaveInPlace } from "../updates/goodbye";
  import ReleaseNotes from "../updates/ReleaseNotes.svelte";
  import Caw, { type CawStatus } from "./Caw.svelte";
  import CawMark from "./CawMark.svelte";
  import NoticeRow from "./NoticeRow.svelte";

  let {
    notice,
    alone,
    ondismiss,
    onaction,
  }: {
    /** Null only once Reload was chosen and the acknowledgement dropped it: the goodbye needs none. */
    notice: Notice | null;
    /** It is all the panel holds: its notes stand open unless the reader folded them. */
    alone: boolean;
    ondismiss: () => void;
    onaction: (action: NonNullable<Notice["action"]>) => void;
  } = $props();

  /** An overflow that scrolls: the footer's scroller is the nearest such ancestor. */
  const SCROLLS = /auto|scroll/;

  const ACTS: Record<NonNullable<Notice["action"]>, string> = {
    retry: "Retry",
    "install-all": "Install now",
    reload: "Reload",
  };
  /** What the act does, after the notes' tally. */
  const ACT_WORDS: Record<NonNullable<Notice["action"]>, string> = {
    retry: "Retry to install it again.",
    "install-all": "Install now to run it everywhere.",
    reload: "Reload to run it.",
  };

  /** Reload was chosen: the row says its goodbye until the tab goes. */
  let leaving = $state(false);
  let card = $state<HTMLElement>();
  let layer = $state<HTMLElement>();

  const notes = $derived(notice?.notes ?? null);
  /** The notes stand open: as the reader left them, else open when alone. */
  const open = $derived(
    notice !== null && notes !== null && (chosen.get(keyOf(notice)) ?? alone)
  );
  /** The first line still under way carries the spinner; the rest are words. */
  const spinnerAt = $derived(
    notice?.lines.findIndex((line) => line.state === "busy") ?? -1
  );
  /** The way to the settings, but not on Configure › Updates; with notes, once they stand open. */
  const showConfigure = $derived(
    notice?.configure === true &&
      page.url.pathname !== "/config/updates" &&
      (notes === null || open)
  );
  /**
   * The meta line: the notes' tally and what the act does; a failure says
   * its closing line instead. A landing with no act runs here already.
   */
  const meta = $derived.by(() => {
    if (!notice) {
      return "";
    }
    if (notice.failed) {
      return notice.closing ?? "";
    }
    let does = "";
    if (notice.action) {
      does = ACT_WORDS[notice.action];
    } else if (notice.kind === 6) {
      does = "Running here already.";
    }
    return [notes ? `${notes.tally}.` : "", does].filter(Boolean).join(" ");
  });
  /** What it says beyond the meta line: machine by machine, and its closing line (unless the meta said it). */
  const said = $derived(
    notice !== null &&
      (notice.lines.length > 0 || (notice.closing && !notice.failed))
  );
  const footer = $derived(
    showConfigure || notes !== null || Boolean(notice?.action)
  );

  /** What the row showed leaves where it stood, and the row turns into its goodbye. */
  function sayGoodbye(): void {
    if (card && layer) {
      const away = layer;
      leaveInPlace(
        [...card.children].filter(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child !== away
        ),
        away
      );
    }
    leaving = true;
  }

  function act(action: NonNullable<Notice["action"]>): void {
    if (action === "reload") {
      sayGoodbye();
    }
    onaction(action);
  }

  function toggle(): void {
    if (notice) {
      chosen.set(keyOf(notice), !open);
    }
  }

  /**
   * The fold moved what follows it with no change to the DOM: every `reflow`
   * around it reads its rows where they now stand (motion/fold `rereadOnEnd`).
   */
  function settled(event: TransitionEvent): void {
    if (
      event.target === event.currentTarget &&
      event.propertyName === "grid-template-rows"
    ) {
      reread(reflowsFrom((event.currentTarget as HTMLElement).parentElement));
    }
  }

  /**
   * Whether the footer is held at the panel's foot (`data-stuck`): the row
   * runs on past the scroller's foot while the footer is still in view. Read
   * from where they stand, once a frame at most, as the list scrolls and as
   * the row or the list changes size (the fold opening or shutting).
   */
  function held(node: HTMLElement) {
    let scroller = node.parentElement;
    while (scroller && !SCROLLS.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    const port = scroller;
    const row = node.parentElement;
    if (!(port && row)) {
      return;
    }
    let frame = 0;
    const read = () => {
      frame = 0;
      const foot =
        port.getBoundingClientRect().bottom -
        Number.parseFloat(getComputedStyle(port).paddingBottom);
      node.toggleAttribute(
        "data-stuck",
        row.getBoundingClientRect().bottom > foot + 0.5 &&
          node.getBoundingClientRect().top < foot
      );
    };
    const soon = () => {
      frame ||= requestAnimationFrame(read);
    };
    port.addEventListener("scroll", soon, { passive: true });
    const sizes = new ResizeObserver(soon);
    sizes.observe(row);
    sizes.observe(port);
    soon();
    return () => {
      cancelAnimationFrame(frame);
      port.removeEventListener("scroll", soon);
      sizes.disconnect();
    };
  }
</script>

{#snippet lines(
  n: Notice
)}
  <div class="body">
    {#each n.lines as line, i (i)}
      {#if line.state === "busy" && i === spinnerAt}
        <div class="ink busy">
          <Spinner class="size-3.5 shrink-0 text-muted-foreground" />
          {line.text}
        </div>
      {:else}
        <div class="ink">{line.text}</div>
      {/if}
    {/each}
    {#if n.closing && !n.failed}
      <span class="closing">{n.closing}</span>
    {/if}
  </div>
{/snippet}

<NoticeRow
  dismissLabel="Dismiss the update notice"
  label={leaving ? GOODBYE : (notice?.title ?? GOODBYE)}
  ondismiss={leaving ? undefined : ondismiss}
>
  {#snippet lead()}
    {#if leaving && motionOk.current}
      <!-- His wait: the page can't show its content until the tab is back. -->
      <Caw size={28} status="loading" />
    {:else}
      <CawMark
        size={28}
        status={leaving
          ? "loading"
          : ((notice?.caw.status ?? "sleeping") as CawStatus)}
      />
    {/if}
  {/snippet}
  <div class="card" bind:this={card}>
    <!-- What the row showed, copied where it stood, leaving. -->
    <div aria-hidden="true" class="leaving" inert bind:this={layer}></div>
    {#if leaving}
      <span class="line" {@attach arrive}>{GOODBYE}</span>
    {:else if notice}
      <h2 class="title">
        {#if notice.failed}
          <IconError aria-hidden="true" class="fail size-4 shrink-0" />
        {/if}
        {notice.title}
      </h2>
      {#if meta}
        <p class="meta">{meta}</p>
      {/if}
      {#if notes}
        <div
          class="fold"
          data-open={open || undefined}
          id="update-notes"
          inert={!open}
          ontransitionend={settled}
        >
          <div class="fold-inner">
            <div class="fold-body">
              <div class="notes"><ReleaseNotes source={notes.full} /></div>
              {#if said}
                {@render lines(notice)}
              {/if}
            </div>
          </div>
        </div>
      {:else if said}
        {@render lines(notice)}
      {/if}
      {#if footer}
        <div class="actions" {@attach held}>
          {#if showConfigure}
            <Button
              class={["settings", notes !== null && "leading"]}
              href="/config/updates"
              label="Configure update behaviour"
              size="sm"
              variant="link"
            />
          {/if}
          {#if notes}
            <Button
              aria-controls="update-notes"
              aria-expanded={open}
              class="toggle"
              onclick={toggle}
              size="sm"
              variant="ghost"
            >
              {open ? "Hide changes" : "Show changes"}
              <IconChevronDown
                aria-hidden="true"
                class="chev"
                data-icon="inline-end"
              />
            </Button>
          {/if}
          {#if notice.action}
            {@const action = notice.action}
            <Button
              label={ACTS[action]}
              onclick={() => act(action)}
              size="sm"
            />
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</NoticeRow>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .leaving {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding-inline-end: var(--x-room);
    font: var(--type-label);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .title :global(.fail) {
    color: var(--status-fail-ink);
  }
  .meta {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* The notes' fold (transitions-dev Accordion expand): the grid row is the
     track, 0fr shut and 1fr open, so any height of notes folds with no
     measuring; the inner box clips, fades and cross-blurs. The shut fold
     gives the column's 2px gap back, and its air is the inner box's own
     padding, never the track's, so it closes to nothing. Shutting is
     quicker than opening. */
  .fold {
    display: grid;
    grid-template-rows: 0fr;
    margin-block-start: -2px;
    transition: grid-template-rows var(--dur-exit) var(--ease-out);
  }
  .fold[data-open] {
    grid-template-rows: 1fr;
    transition-duration: var(--dur-panel);
  }
  .fold-inner {
    min-block-size: 0;
    overflow: hidden;
    opacity: 0;
    filter: blur(var(--fold-blur));
    transition:
      opacity var(--dur-exit) var(--ease-out),
      filter var(--dur-exit) var(--ease-out);
  }
  .fold[data-open] > .fold-inner {
    opacity: 1;
    filter: blur(0);
    transition-duration: var(--dur-panel);
  }
  .fold-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-block-start: calc(2px + var(--space-1));
  }
  .notes {
    font: var(--type-body);
    color: var(--ink-row);
  }
  .body {
    display: grid;
    gap: 2px;
    font: var(--type-meta);
  }
  .ink {
    color: var(--ink-strong);
  }
  .busy {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .closing {
    color: var(--ink-muted);
  }
  /* The footer: one row packed to the row's trailing edge, the way to the
     settings at its leading edge while the notes stand open. It holds at
     the panel's foot while the notes run past it, on the panel's own
     surface, with the house edge fade (`--fade-len`) above it so the notes
     pass under it while it is held (`held`). */
  .actions {
    position: sticky;
    inset-block-end: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
    margin-top: var(--space-1);
    background: var(--surface-raised);
  }
  .actions::before {
    content: "";
    position: absolute;
    inset-inline: 0;
    inset-block-end: 100%;
    block-size: var(--fade-len);
    pointer-events: none;
    background: linear-gradient(to bottom, transparent, var(--surface-raised));
    opacity: 0;
    transition: opacity var(--dur-control) var(--ease-out);
  }
  .actions:global([data-stuck])::before {
    opacity: 1;
  }
  .actions > :global(.settings) {
    min-inline-size: 0;
    flex-shrink: 1;
  }
  /* With the notes open it takes the footer's leading edge; on a phone the
     buttons wrap under it, still at the trailing edge. */
  .actions > :global(.leading) {
    margin-inline-end: auto;
  }
  /* The chevron flips from ⌄ to ⌃ with the fold (scaleY through a flat
     line), its stroke kept even through the flip. */
  .actions :global(.chev) {
    transition: transform var(--dur-panel) var(--ease-out);
  }
  .actions :global(.chev path) {
    vector-effect: non-scaling-stroke;
  }
  .actions :global(.toggle[aria-expanded="true"] .chev) {
    transform: scaleY(-1);
  }
  /* With less motion nothing travels: the notes only fade. */
  @media (prefers-reduced-motion: reduce) {
    .fold,
    .actions :global(.chev) {
      transition: none;
    }
    .fold-inner {
      filter: none;
      transition: opacity var(--dur-fade) var(--ease-out);
    }
  }
  /* The goodbye's one line, beside his waiting mark and centred on it. */
  .line {
    display: flex;
    align-items: center;
    min-block-size: 28px;
    font: var(--type-label);
    color: var(--ink-strong);
  }
</style>
