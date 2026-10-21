<script lang="ts">
  import { artifactWords as words } from "@cawco/core";
  /**
   * A pin's card (Projects spec §5.7; tsk-3; DESIGN.md Artifact panel, canvas
   * and ink), over the page beside its pin: the raised card recipe (12px,
   * control edge, hairline shadow, 11px padding), standing at the well's
   * foot as the house drawer does on a phone and wherever the well can't
   * hold it beside the open Comments panel. What the pin stands on, in words
   * (pin-name.ts), its file:line dim under it and its selector only in the
   * tooltip; no picture: the pin it would show stands beside the card. Its
   * thread in the transcript's two voices (its turn/ pieces: Turn, Well,
   * Who): the
   * person's words in the reader's well, the agent's bare under its mark and
   * the session's name; the reply field and Reply.
   * Its head carries what acts on the pin, as Figma's, Vercel's and Miro's
   * comment popovers do: Resolve (or Reopen), ⋯ (Copy link, Delete pin) and
   * Close. A resolved pin's field reopens it with its reply ("Reply to
   * reopen", Miro's and Rows' shape). Delete is asked in the card itself
   * before it runs (The Open Page Rule: AskHere under the footer, the page
   * still live). What goes wrong is said under the field, a refused delete
   * under its question.
   *
   * A pin whose element is gone says so under its head, with Pin it
   * somewhere else: the next tap on the page pins it anew, Cancel puts the
   * offer back. Reply is the card's one primary; everything else is ghost.
   *
   * A column: the head over it, the field and its actions at its foot, both
   * always in view, and between them the thread, the only
   * part that scrolls, under the house edge fade. Past the card's cap the
   * thread gives up height, never the actions.
   *
   * A press anywhere outside it closes it (the house's outside-press rule,
   * press-outside.ts), as Esc and its Close do; the page in the well, whose
   * presses this document never hears, says its own (`cawco:press`). What
   * the field holds is the pin's draft, which the pane keeps with the pin.
   */
  import type { Pin } from "@cawco/core/comments";
  import { type Component, tick, untrack } from "svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { lastInput } from "#lib/components/ui/fluid-tabs/last-input.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconClose,
    IconLink,
    IconReopen,
    IconSuccess,
    IconTrash,
  } from "#lib/icons.js";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import RowMenu from "../config/RowMenu.svelte";
  import { copyToClipboard } from "../copy";
  import { pressOutside } from "../press-outside";
  import Turn from "../turn/Turn.svelte";
  import Well from "../turn/Well.svelte";
  import Who from "../turn/Who.svelte";
  import LiveDot from "./LiveDot.svelte";
  import PinDisc from "./PinDisc.svelte";
  import { pinName, pinSelector } from "./pin-name";
  import type { PreviewPinAt } from "./wire";

  let {
    pin,
    agentName,
    link,
    at,
    room,
    sheet = false,
    live = false,
    placing = false,
    problem,
    draft = $bindable(""),
    onreply,
    onresolve,
    ondelete,
    onplace,
    onclose,
    onring,
  }: {
    pin: Pin;
    /** Who answers in the thread: the session the artifact belongs to, as its transcript names it. */
    agentName: string;
    /** The pin's own address: its artifact's page, opening this pin's card. */
    link: string;
    /** The pin's disc and the box of what it stands on, in the well, px; null while it is not on screen. */
    at: PreviewPinAt | null;
    /** The card's room in the well, px: the well beside the Comments panel when it is open. */
    room: { h: number; w: number };
    /** Where the well can't hold the card beside the panel, and on a phone: at the well's foot, full width. */
    sheet?: boolean;
    /** The agent is working on this pin. */
    live?: boolean;
    /** Its element gone, the next tap on the page pins it anew. */
    placing?: boolean;
    /** What went wrong with the last reply, resolve or send, in the error formula. */
    problem: string | null;
    /** What the person has written and not yet said: the pin's, kept by the pane. */
    draft?: string;
    /** Keeps the person's words in the thread (reopening a resolved pin): true once kept, false when refused (its reason is `problem`). */
    onreply: (text: string) => boolean;
    onresolve: (resolved: boolean) => void;
    /** Deletes the pin once the person confirmed; rejects with the refusal's sentence. */
    ondelete: () => Promise<void>;
    /** Pin it somewhere else (true), or Cancel (false). */
    onplace: (placing: boolean) => void;
    onclose: () => void;
    /** The field's keyboard ring shows (true) or goes (false): the page's target drops its line while it shows (DESIGN.md, The One Target Rule). */
    onring?: (shown: boolean) => void;
  } = $props();

  /**
   * The thread's words as the transcript sets them (MessageBody and its
   * markdown), loaded once a pin with a thread opens: an artifact's own tab
   * never draws one before then, and the markdown is the heaviest thing it
   * would otherwise load at first paint. The thread's room stands once it
   * has, so it opens at its newest entry as before.
   */
  let Body = $state<Component<{ source: string }> | null>(null);
  $effect(() => {
    if (pin.thread.length > 0 && !Body) {
      import("../MessageBody.svelte").then((loaded) => {
        Body = loaded.default;
      });
    }
  });

  let height = $state(0);
  let width = $state(0);
  let field = $state<HTMLTextAreaElement | null>(null);
  let card = $state<HTMLDivElement | null>(null);
  let roomEl = $state<HTMLDivElement | null>(null);
  let head = $state<HTMLElement | null>(null);
  let foot = $state<HTMLDivElement | null>(null);
  /** The head and the foot alone outgrow the card (a phone's keyboard over a short well). */
  let squeezed = $state(false);
  /** The thread is read at its end: a new entry keeps it there. */
  let atEnd = true;

  // The thread opens at its newest entry, beside the field that answers it,
  // and follows a new one while the person reads at its end; reading
  // further back, they are left where they are.
  let shownPin: string | null = null;
  $effect(() => {
    const count = pin.thread.length;
    // A pin is shown once its room stands: the room waits on its words
    // (`Body`), and opens at the newest entry when it comes.
    if (!roomEl || count === 0) {
      return;
    }
    const fresh = pin.id !== shownPin;
    shownPin = pin.id;
    if (fresh || atEnd) {
      const holder = roomEl;
      tick().then(() => {
        holder.scrollTop = holder.scrollHeight;
        atEnd = true;
      });
    }
  });
  // Read at its end, the room stays there as its entries take their height
  // (their words are set once they have loaded, after the room stands) and
  // as the room itself takes its height (the card's cap, a squeeze).
  $effect(() => {
    const holder = roomEl;
    const list = holder?.querySelector('[data-slot="thread"]');
    if (!(holder && list)) {
      return;
    }
    // biome-ignore lint/style/noRestrictedGlobals: the room keeps its end by its scroll, which resizes nothing, in the delivery, so no frame paints it short of its newest entry
    const watch = new ResizeObserver(() => {
      if (atEnd) {
        holder.scrollTop = holder.scrollHeight;
      }
    });
    watch.observe(list);
    watch.observe(holder);
    return () => watch.disconnect();
  });
  const readAt = () => {
    if (roomEl) {
      atEnd = roomEl.scrollTop + roomEl.clientHeight >= roomEl.scrollHeight - 1;
    }
  };

  // When the head and the foot alone outgrow the card, the thread keeps
  // its whole height and the card scrolls, the field kept in view while
  // writing: the thread stays readable above the field instead of
  // shrinking to nothing. Measured in the observer's callback and written in
  // the next frame's callbacks: the card scrolling (or no longer) can take a
  // scrollbar's width from the head and the foot watched here, and written
  // inside the delivery that resize was reported again at a depth the
  // delivery had passed (a ResizeObserver loop).
  $effect(() => {
    if (!(card && head && foot)) {
      return;
    }
    const holder = card;
    const top = head;
    const bottom = foot;
    let measured = false;
    const measure = () => {
      const style = getComputedStyle(holder);
      const gap = Number.parseFloat(style.rowGap) || 0;
      const edges =
        (Number.parseFloat(style.paddingTop) || 0) +
        (Number.parseFloat(style.paddingBottom) || 0);
      measured =
        top.offsetHeight + bottom.offsetHeight + 2 * gap + edges >
        holder.clientHeight + 1;
    };
    const watch = frameObserver(
      () => {
        squeezed = measured;
      },
      { read: measure }
    );
    for (const part of [holder, top, bottom]) {
      watch.observe(part);
    }
    return () => watch.disconnect();
  });

  // A press outside the card closes it; one in a modal layer over
  // everything is that layer's.
  $effect(() => {
    if (!card) {
      return;
    }
    // So is one in the card's ⋯ menu, which stands outside it.
    return pressOutside(card, (event) => {
      if (!(
        event.target instanceof Element &&
        event.target.closest("[aria-modal='true'], dialog[open], [role='menu']")
      )) {
        onclose();
      }
    });
  });

  /** The card's gap from what it stands beside (`--space-3`, the ladder's step at the card's own padding), and from its room's edge, px. */
  const GAP = 11;
  const EDGE = 8;

  /** The card's top beside a span from `y`: inside its room. */
  const topFrom = (y: number) =>
    Math.max(EDGE, Math.min(y, room.h - height - EDGE));
  /** The card's left over a span from `x`: inside its room. */
  const leftFrom = (x: number) =>
    Math.max(EDGE, Math.min(x, room.w - width - EDGE));

  /**
   * Beside what its pin stands on, where its room allows: the element's end
   * side, else its start side, else below it; else beside the pin itself,
   * on the side with room. A pin not on the page (its element gone) stands
   * at its room's top-right.
   */
  const place = $derived.by(() => {
    if (sheet) {
      return null;
    }
    if (!at) {
      return {
        left: Math.max(EDGE, room.w - width - EDGE),
        top: EDGE,
        side: "room",
      };
    }
    const { box } = at;
    const end = box.x + box.w + GAP;
    if (end + width <= room.w - EDGE) {
      return { left: end, top: topFrom(box.y), side: "end" };
    }
    const start = box.x - GAP - width;
    if (start >= EDGE) {
      return { left: start, top: topFrom(box.y), side: "start" };
    }
    const below = box.y + box.h + GAP;
    if (below + height <= room.h - EDGE) {
      return { left: leftFrom(box.x), top: below, side: "below" };
    }
    let left = at.x + at.r + GAP;
    if (left + width > room.w - EDGE) {
      left = at.x - at.r - GAP - width;
    }
    return { left: leftFrom(left), top: topFrom(at.y - at.r), side: "pin" };
  });

  const source = $derived(
    "selector" in pin.anchor && pin.anchor.source?.file
      ? `${pin.anchor.source.file}${pin.anchor.source.line ? `:${pin.anchor.source.line}` : ""}`
      : null
  );
  const selector = $derived(pinSelector(pin));

  /** What the empty field says: a resolved pin's reopens it; a pin with a thread is replied to; a new one asks what to change. */
  const fieldHint = $derived.by(() => {
    if (pin.resolvedAt) {
      return "Reply to reopen";
    }
    return pin.thread.length > 0 ? "Reply" : "Say what to change here";
  });

  function reply() {
    const text = draft.trim();
    if (!text) {
      return;
    }
    // A refused reply stays in the field, its reason under it.
    if (onreply(text)) {
      draft = "";
    }
  }

  /** The card's one question: Delete, asked under its footer. */
  const asks = new Asker<AskHereRequest>();
  /** What a delete takes with it, named before it runs (WORDS.md, destructive confirm). */
  const deleteBody = $derived.by(() => {
    const parts = [
      pin.thread.length > 0 ? "its thread" : null,
      pin.ink ? "the ink it stands on" : null,
    ].filter(Boolean);
    const taking =
      parts.length > 0
        ? `It goes from the page with ${parts.join(" and ")}. `
        : "It goes from the page. ";
    return `${taking}The other pins keep their numbers. This can't be undone.`;
  });
  function askDelete() {
    asks.ask({
      at: "delete",
      title: `Delete pin ${pin.number}?`,
      body: deleteBody,
      confirmLabel: "Delete pin",
      destructive: true,
      pendingLabel: "Deleting…",
      run: ondelete,
    });
  }
  // Another pin in the same card: a question asked of the last one goes.
  $effect.pre(() => {
    if (pin.id) {
      untrack(() => asks.dismiss());
    }
  });

  /*
   * The field's ring is keyboard focus's alone (The One Ring Rule; The One
   * Target Rule): a browser matches `:focus-visible` on a text field however
   * it was focused, so a focus that came by a pointer (the house's last
   * input, `lastInput`) marks the field `data-pointer-focus` and draws no
   * ring. So does the card's own focus on open: the person pressed the page,
   * whose presses this document never hears.
   */
  let focused = $state(false);
  let quiet = $state(false);
  /** The card is focusing its own field. */
  let opening = false;
  const ringShown = $derived(focused && !quiet);
  $effect(() => {
    onring?.(ringShown);
  });
  $effect(() => () => onring?.(false));

  $effect(() => {
    // A new pin's card takes the keyboard: the person tapped to say something.
    if (pin.thread.length === 0 && field) {
      opening = true;
      field.focus({ preventScroll: true });
      opening = false;
    }
  });
</script>

<div
  data-sheet={sheet || undefined}
  data-slot="pin-card"
  aria-label={`Pin ${pin.number}`}
  class="group/pin pointer-events-auto absolute z-2 motion-safe:animate-pin-card-in flex flex-col gap-space-2 coarse:gap-space-5 w-(--card-w) max-h-(--card-max) overflow-y-auto overscroll-contain p-space-3 border border-border-control rounded-lg bg-surface-raised shadow-hairline data-sheet:inset-x-0 data-sheet:bottom-0 data-sheet:w-full data-sheet:max-h-7/10 data-sheet:border-x-0 data-sheet:border-b-0 data-sheet:rounded-b-none data-sheet:pb-(--sheet-pb)"
  data-pin-card={pin.number}
  role="dialog"
  bind:this={card}
  data-side={place?.side}
  style:left={place ? `${place.left}px` : undefined}
  style:top={place ? `${place.top}px` : undefined}
  style:max-width={sheet ? undefined : `${Math.max(0, room.w - 2 * EDGE)}px`}
  style:--card-w="min(var(--c-pin-card-w), calc(100% - 16px))"
  style:--card-max="calc(100% - 16px)"
  style:--sheet-pb="calc(var(--space-3) + env(safe-area-inset-bottom, 0px))"
  style:--field-fs="var(--text-field-floor)"
  bind:offsetHeight={height}
  bind:offsetWidth={width}
>
  <header
    data-slot="head"
    class="flex shrink-0 items-center gap-space-2 coarse:gap-space-5"
    bind:this={head}
  >
    <PinDisc number={pin.number} resolved={!!pin.resolvedAt} />
    <span
      data-slot="anchor"
      class="flex flex-1 min-w-0 flex-col"
      title={selector ?? undefined}
    >
      <!-- What it stands on, whole to two lines and cut there: the card's head is never cut to a word. -->
      <span
        data-slot="name"
        class="line-clamp-2 wrap-anywhere text-ink-strong type-label"
        >{pinName(pin)}</span
      >
      {#if source}
        <!-- Cut from its start, so the file's name and line stay. -->
        <span
          data-slot="source"
          class="dir-rtl truncate text-left text-ink-muted type-code"
          ><bdi>{source}</bdi></span
        >
      {/if}
    </span>
    {#if live}
      <LiveDot label="The agent is working on it" />
    {/if}
    {#if pin.resolvedAt}
      <Button
        aria-label="Reopen pin"
        icon={IconReopen}
        onclick={() => onresolve(false)}
        size="icon-sm"
        title="Reopen pin"
        variant="ghost"
      />
    {:else}
      <Button
        aria-label="Resolve pin"
        icon={IconSuccess}
        onclick={() => onresolve(true)}
        size="icon-sm"
        title="Resolve pin"
        variant="ghost"
      />
    {/if}
    <RowMenu
      actions={[
        {
          icon: IconLink,
          label: "Copy link",
          onselect: () => {
            copyToClipboard("Link", link);
          },
        },
        {
          destructive: true,
          icon: IconTrash,
          label: "Delete pin",
          onselect: askDelete,
        },
      ]}
      label={`pin ${pin.number}`}
    />
    <Button
      aria-label="Close"
      icon={IconClose}
      onclick={onclose}
      size="icon-sm"
      title="Close"
      variant="ghost"
    />
  </header>
  {#if pin.movedAt}
    <!-- Its element is gone: said once, and pinned anew with the next tap on the page. -->
    <div
      data-slot="gone"
      class="flex shrink-0 flex-wrap items-baseline gap-x-space-2 gap-y-space-1 type-meta"
    >
      <!-- One sentence and its action in one row; wrapped, the action's words stand under the sentence's. -->
      <p class="m-0 min-w-0 text-ink-muted" role="status">
        {placing ? "Tap the page where it goes." : words.pinElementGone}
      </p>
      {#if placing}
        <Button
          label="Cancel"
          onclick={() => onplace(false)}
          pad="none"
          size="sm"
          variant="link"
        />
      {:else}
        <Button
          label="Pin it somewhere else"
          onclick={() => onplace(true)}
          pad="none"
          size="sm"
          variant="link"
        />
      {/if}
    </div>
  {/if}
  <!-- What the pin holds, the one part that scrolls: the head stands over it
       and the field and its actions under it, never a scroll away; the
       house edge fade says there is more above or below. -->
  {#if pin.thread.length > 0 && Body}
    <div
      data-whole={squeezed || undefined}
      class="kit-edge-fade-block relative flex flex-auto flex-col min-h-0 overflow-y-auto overscroll-contain data-whole:shrink-0"
      data-pin-room
      onscroll={readAt}
      bind:this={roomEl}
    >
      <!-- The transcript's turns (turn/: Turn, Well, Who): a run of one
           speaker's entries is one turn (its later entries grouped under the
           first's speaker line), the person's run one well. -->
      <ol data-slot="thread" class="m-0 p-0 list-none">
        {#each pin.thread as entry, i (entry.id)}
          {@const grouped = pin.thread[i - 1]?.by === entry.by}
          <li data-slot="entry" class="group/entry" data-by={entry.by}>
            {#if entry.by === "person"}
              {@const runsOn = pin.thread[i + 1]?.by === "person"}
              <Turn class="group-first/entry:mt-0" {grouped} {runsOn} you>
                {#if !grouped}
                  <Who name="You" timestamp={entry.at} you />
                {/if}
                <Well {grouped} {runsOn}>
                  {#if grouped}
                    <Who grouped name="You" timestamp={entry.at} you />
                  {/if}
                  <Body source={entry.text} />
                </Well>
              </Turn>
            {:else}
              <Turn class="group-first/entry:mt-0" {grouped}>
                <Who {grouped} name={agentName} timestamp={entry.at} />
                <Body source={entry.text} />
              </Turn>
            {/if}
            {#if entry.by === "agent" && entry.files?.length}
              <p class="flex flex-wrap gap-space-1 mt-space-1 mx-0 mb-0">
                {#each entry.files as file (file)}
                  <code
                    class="min-w-0 wrap-anywhere px-space-1 py-0 rounded-xs bg-code-bg type-code"
                    >{file}</code
                  >
                {/each}
              </p>
            {/if}
          </li>
        {/each}
      </ol>
    </div>
  {/if}
  <div
    data-slot="foot"
    class="flex shrink-0 flex-col gap-space-2"
    bind:this={foot}
  >
    <Textarea
      data-field
      data-pointer-focus={quiet || undefined}
      onfocus={() => {
        quiet = opening || lastInput.current === "pointer";
        focused = true;
      }}
      onblur={() => {
        focused = false;
        quiet = false;
      }}
      aria-describedby={problem ? `pin-error-${pin.id}` : undefined}
      aria-invalid={problem ? true : undefined}
      aria-label={pin.thread.length > 0 ? "Reply" : "Comment"}
      text="pin-field"
      onkeydown={(event: KeyboardEvent) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          reply();
        }
      }}
      placeholder={fieldHint}
      rows={2}
      bind:ref={field}
      bind:value={draft}
    />
    {#if problem}
      <p
        class="m-0 text-data-bad text-size-meta"
        id={`pin-error-${pin.id}`}
        role="alert"
      >
        {problem}
      </p>
    {/if}
    <footer data-slot="actions" class="flex justify-end gap-space-2">
      <Button
        disabled={!draft.trim()}
        label="Reply"
        onclick={reply}
        size="sm"
      />
    </footer>
    <AskHere asker={asks} at="delete" />
  </div>
</div>
