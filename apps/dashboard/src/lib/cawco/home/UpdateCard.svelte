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

{#snippet lines(n: Notice)}
  <div data-slot="body" class="grid gap-space-row type-meta">
    {#each n.lines as line, i (i)}
      {#if line.state === "busy" && i === spinnerAt}
        <!-- literal: 6px -->
        <div
          class="mark-line flex items-center gap-(--busy-gap) text-ink-strong"
          style:--busy-gap="6px"
        >
          <Spinner class="size-space-4 shrink-0 text-ink-muted" />
          <span>{line.text}</span>
        </div>
      {:else}
        <div class="text-ink-strong">{line.text}</div>
      {/if}
    {/each}
    {#if n.closing && !n.failed}
      <span class="text-ink-muted">{n.closing}</span>
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
  <div
    data-slot="update-card-card"
    class="relative flex min-w-0 flex-col gap-space-row"
    bind:this={card}
  >
    <!-- What the row showed, copied where it stood, leaving. -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0"
      inert
      bind:this={layer}
    ></div>
    {#if leaving}
      <!-- The goodbye's one line, beside his waiting mark and centred on it. -->
      <!-- literal: 28px -->
      <span
        class="flex min-h-(--line-min) items-center type-label text-ink-strong"
        style:--line-min="28px"
        {@attach arrive}>{GOODBYE}</span
      >
    {:else if notice}
      <!-- literal: 6px -->
      <h2
        data-slot="title"
        class="mark-line m-0 flex items-center gap-(--title-gap) pe-(--x-room) type-label wrap-anywhere text-ink-strong"
        style:--title-gap="6px"
      >
        {#if notice.failed}
          <IconError
            aria-hidden="true"
            class="size-icon-md shrink-0 text-status-fail-ink"
          />
        {/if}
        <span>{notice.title}</span>
      </h2>
      {#if meta}
        <p data-slot="meta" class="m-0 type-meta text-ink-muted">{meta}</p>
      {/if}
      {#if notes}
        <!-- The notes' fold (transitions-dev Accordion expand): the grid row
             is the track, 0fr shut and 1fr open, so any height of notes
             folds with no measuring; the inner box clips, fades and
             cross-blurs. The shut fold gives the column's 2px gap back, and
             its air is the inner box's own padding, never the track's, so it
             closes to nothing. Shutting is quicker than opening. With less
             motion nothing travels: the notes only fade. -->
        <!-- literal: 0fr, 1fr; -2px -->
        <div
          data-slot="fold"
          class="group/fold mt-(--fold-pull) grid grid-rows-(--fold-shut) transition-[grid-template-rows] dur-exit ease-out data-open:grid-rows-(--fold-open) data-open:dur-panel motion-reduce:transition-none"
          data-open={open || undefined}
          id="update-notes"
          inert={!open}
          ontransitionend={settled}
          style:--fold-open="1fr"
          style:--fold-pull="-2px"
          style:--fold-shut="0fr"
        >
          <!-- Open, no filter at all: a blur(0) is still a filter, and WebKit
               drew the whole of the notes through one on every paint of the
               panel. It interpolates with the shut blur as blur(0) would. -->
          <div
            data-slot="fold-inner"
            class="min-h-0 overflow-hidden opacity-0 blur-(--fold-blur) transition-fold-fade group-data-open/fold:opacity-100 group-data-open/fold:filter-none group-data-open/fold:dur-panel motion-reduce:filter-none motion-reduce:transition-[opacity] motion-reduce:dur-fade motion-reduce:group-data-open/fold:dur-panel"
          >
            <div
              class="flex flex-col gap-space-1 pt-(--fold-air)"
              style:--fold-air="calc(2px + var(--space-1))"
            >
              <div class="type-body text-ink-row"><ReleaseNotes source={notes.full} /></div>
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
        <!-- The footer: one row packed to the row's trailing edge, the way to
             the settings at its leading edge while the notes stand open. It
             holds at the panel's foot while the notes run past it, on the
             panel's own surface, with the house edge fade (`--fade-len`)
             above it so the notes pass under it while it is held (`held`).
             The footer's last control ends its ink on the panel's trailing
             edge, its box kept whole. Every kit button has a 1px transparent
             border: the act's fill stops inside it (the kit clips its fill
             to the padding box), so it hangs past by that pixel; the way to
             the settings, standing alone, by it and its 11px. With the notes
             open the way to the settings takes the footer's leading edge,
             its words on the text column with the title's: it hangs into the
             gutter by what stands before its first letter (the kit's 1px
             transparent border and the sm size's 11px padding), its box kept
             whole. On a phone the buttons wrap under it, still at the
             trailing edge. -->
        <div
          data-slot="actions"
          class="sticky bottom-0 z-1 mt-space-1 flex flex-wrap items-center justify-end gap-space-1 bg-surface-raised"
          {@attach held}
        >
          {#if showConfigure}
            <!-- literal: 11px -->
            <Button
              data-settings
              class={[
                "min-w-0 shrink",
                notes !== null && "ms-(--settings-hang) me-auto",
                notes === null && "last:me-(--settings-hang)",
              ]}
              href="/config/updates"
              label="Configure update behaviour"
              size="sm"
              style="--settings-hang: calc(-1 * (1px + 11px));"
              variant="link"
            />
          {/if}
          {#if notes}
            <!-- Show changes, when last, would hang by its 1px border, its
                 8px end padding and the 16px chevron's side bearing (its
                 stroke ends at 19.75 of 24), past the row's own `space-3`
                 and out of the list, which then scrolled sideways: so it
                 hangs by `space-3` exactly, and what its end padding gives
                 up for that its start padding takes, so its box is the sm
                 size's as ever (11px and 8px padding). The chevron flips
                 from ⌄ to ⌃ with the fold (scaleY through a flat line), its
                 stroke kept even through the flip. -->
            <!-- literal: 1px, 16px * 4.25 / 24; 11px + 8px; scaleY(-1) -->
            <Button
              data-toggle
              aria-controls="update-notes"
              aria-expanded={open}
              onclick={toggle}
              class="last:-me-space-3"
              size="sm"
              style="--end: calc(var(--space-3) - 1px - 16px * 4.25 / 24); --toggle-start: calc(11px + 8px - var(--end));"
              variant="ghost"
            >
              <span>{open ? "Hide changes" : "Show changes"}</span>
              <IconChevronDown
                data-chev
                aria-hidden="true"
                class="transition-[transform] dur-panel ease-out group-aria-expanded/button:transform-(--chev-flip) motion-reduce:transition-none"
                data-icon="inline-end"
                style="--chev-flip: scaleY(-1);"
              />
            </Button>
          {/if}
          {#if notice.action}
            {@const action = notice.action}
            <Button
              class="-me-px"
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
  /* residual: pseudo — the house edge fade above the footer, shown while it
     is held at the panel's foot (`held` sets data-stuck). */
  [data-slot="actions"]::before {
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
  [data-slot="actions"]:global([data-stuck])::before {
    opacity: 1;
  }
  /* residual: svg-paint — the chevron's stroke kept even through its flip
     (its paths are the icon's). */
  [data-slot="actions"] :global([data-chev] path) {
    vector-effect: non-scaling-stroke;
  }
  /* residual: unmapped — two rules over the kit Button's own recipe, which
     a utility passed in `class` cannot outrank: its sm padding is
     `px-[11px]` with `has-data-[icon=inline-end]:pr-2` (a later variant),
     and its ghost fill is `aria-expanded:bg-…`. Show changes, when last,
     moves its end padding to its start (--toggle-start, --end); open, it
     says so in its words and its flipped chevron, not in the ghost's
     expanded fill (a fill standing while the notes are open would be its
     ink, its edge hung past the trailing edge); under the pointer it takes
     the hover fill as ever. */
  [data-slot="actions"] > :global([data-toggle]:last-child) {
    padding-inline: var(--toggle-start) var(--end);
  }
  [data-slot="actions"]
    > :global([data-toggle][aria-expanded="true"]:not(:hover)) {
    background-color: transparent;
  }
</style>
