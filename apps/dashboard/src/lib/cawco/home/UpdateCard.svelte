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
  import { frameObserver } from "#lib/cawco/frame-observer.js";
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
   * 2 fixed. Install now to run it everywhere."), then the footer at the
   * row's trailing edge: Show changes, then its one act (Retry, Install now)
   * when it has one (updates/model `noticeFor`). The reload a tab older than
   * the dashboard needs is the update toast's (updates/update-toast).
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
   */
  import { page } from "$app/state";
  import ReleaseNotes from "../updates/ReleaseNotes.svelte";
  import type { CawStatus } from "./Caw.svelte";
  import CawMark from "./CawMark.svelte";
  import NoticeRow from "./NoticeRow.svelte";

  let {
    notice,
    alone,
    ondismiss,
    onaction,
  }: {
    notice: Notice;
    /** It is all the panel holds: its notes stand open unless the reader folded them. */
    alone: boolean;
    ondismiss: () => void;
    onaction: (action: NonNullable<Notice["action"]>) => void;
  } = $props();

  /** An overflow that scrolls: the footer's scroller is the nearest such ancestor. */
  const SCROLLS = /auto|scroll/u;

  const ACTS: Record<NonNullable<Notice["action"]>, string> = {
    retry: "Retry",
    "install-all": "Install now",
  };
  /** What the act does, after the notes' tally. */
  const ACT_WORDS: Record<NonNullable<Notice["action"]>, string> = {
    retry: "Retry to install it again.",
    "install-all": "Install now to run it everywhere.",
  };

  const notes = $derived(notice.notes ?? null);
  /** The notes stand open: as the reader left them, else open when alone. */
  const open = $derived(notes !== null && (chosen.get(keyOf(notice)) ?? alone));
  /** The first line still under way carries the spinner; the rest are words. */
  const spinnerAt = $derived(
    notice.lines.findIndex((line) => line.state === "busy")
  );
  /** The way to the settings, but not on Configure › Updates; with notes, once they stand open. */
  const showConfigure = $derived(
    notice.configure &&
      page.url.pathname !== "/config/updates" &&
      (notes === null || open)
  );
  /**
   * The meta line: the notes' tally and what the act does; a failure says
   * its closing line instead. A landing with no act runs here already.
   */
  const meta = $derived.by(() => {
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
    notice.lines.length > 0 || Boolean(notice.closing && !notice.failed)
  );
  const footer = $derived(
    showConfigure || notes !== null || Boolean(notice.action)
  );

  function toggle(): void {
    chosen.set(keyOf(notice), !open);
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
    const read = () => {
      const foot =
        port.getBoundingClientRect().bottom -
        Number.parseFloat(getComputedStyle(port).paddingBottom);
      node.toggleAttribute(
        "data-stuck",
        row.getBoundingClientRect().bottom > foot + 0.5 &&
          node.getBoundingClientRect().top < foot
      );
    };
    // Read in the next frame (frameObserver), once, whatever asked: a
    // resize, or the list scrolling (`soon`).
    const sizes = frameObserver(read);
    const soon = () => sizes.request();
    port.addEventListener("scroll", soon, { passive: true });
    sizes.observe(row);
    sizes.observe(port);
    soon();
    return () => {
      port.removeEventListener("scroll", soon);
      sizes.disconnect();
    };
  }
</script>

{#snippet lines(n: Notice)}
  <div data-slot="body" class="grid gap-space-row type-meta">
    {#each n.lines as line, i (i)}
      {#if line.state === "busy" && i === spinnerAt}
        <div class="mark-line flex items-center gap-space-2 text-ink-strong">
          <Spinner class="shrink-0" tone="muted" />
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
  label={notice.title}
  {ondismiss}
>
  {#snippet lead()}
    <CawMark size={28} status={notice.caw.status as CawStatus} />
  {/snippet}
  <div data-slot="update-card-card" class="flex min-w-0 flex-col gap-space-row">
    <h2
      data-slot="title"
      class="mark-line m-0 flex items-center gap-space-2 pe-(--x-room) type-label wrap-anywhere text-ink-strong"
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
      <div
        data-slot="fold"
        class="group/fold -mt-space-row grid grid-rows-shut transition-[grid-template-rows,margin-top] duration-(--dur-exit) ease-out data-open:mt-0 data-open:grid-rows-open motion-safe:data-open:duration-(--dur-panel) motion-reduce:transition-off"
        data-open={open || undefined}
        id="update-notes"
        inert={!open}
        ontransitionend={settled}
      >
        <!-- Open, no filter at all: a blur(0) is still a filter, and WebKit
             drew the whole of the notes through one on every paint of the
             panel. It interpolates with the shut blur as blur(0) would. -->
        <div
          data-slot="fold-inner"
          class="fold-item opacity-0 blur-(--fold-blur) transition-fold-fade group-data-open/fold:opacity-100 group-data-open/fold:filter-none motion-safe:group-data-open/fold:duration-(--dur-panel) motion-reduce:filter-none motion-reduce:transition-[opacity] motion-reduce:duration-(--dur-fade) motion-reduce:group-data-open/fold:duration-(--dur-panel)"
        >
          <div class="flex flex-col gap-space-1 pt-space-1">
            <div class="type-body text-ink-row">
              <ReleaseNotes source={notes.full} />
            </div>
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
        class="sticky bottom-0 z-1 mt-space-1 flex flex-wrap items-center justify-end gap-space-1 bg-surface-raised before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-(--fade-len) before:bg-linear-to-b/srgb before:from-transparent before:to-surface-raised before:opacity-0 before:transition-[opacity] before:duration-(--dur-control) before:ease-out data-stuck:before:opacity-100"
        {@attach held}
      >
        {#if showConfigure}
          <Button
            data-settings
            class={[
              "shrink",
              notes !== null && "ms-(--settings-hang) me-auto",
              notes === null && "last:me-(--settings-hang)",
            ]}
            href="/config/updates"
            label="Configure update behaviour"
            size="sm"
            style="--settings-hang: calc(-1 * (1px + var(--space-3)));"
            variant="link"
            width="shrink"
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
          <Button
            data-toggle
            aria-controls="update-notes"
            aria-expanded={open}
            onclick={toggle}
            class="last:-me-space-3"
            expanded="unfilled"
            size="sm"
            toggle="last"
            style="--end: calc(var(--space-3) - 1px - var(--icon-md) * 4.25 / 24); --toggle-start: calc(var(--space-3) + var(--space-2) - var(--end));"
            variant="ghost"
          >
            <span>{open ? "Hide changes" : "Show changes"}</span>
            <IconChevronDown
              data-chev
              aria-hidden="true"
              class="*:vector-non-scaling transition-[scale] duration-(--dur-panel) ease-out group-aria-expanded/button:-scale-y-100 motion-reduce:transition-off"
              data-icon="inline-end"
            />
          </Button>
        {/if}
        {#if notice.action}
          {@const action = notice.action}
          <Button
            label={ACTS[action]}
            margin="hairline-overlap"
            onclick={() => onaction(action)}
            size="sm"
          />
        {/if}
      </div>
    {/if}
  </div>
</NoticeRow>
