<script lang="ts">
  /**
   * A pin's card (Projects spec §5.7; tsk-3; DESIGN.md Artifact panel, canvas
   * and ink), over the page beside its pin: the raised card recipe (12px,
   * control edge, hairline shadow, 11px padding), on a phone standing at the
   * well's foot as the house drawer does. What the pin stands on, in words
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
  import { Button } from "#lib/components/ui/button/index.js";
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
  import PinDisc from "./PinDisc.svelte";
  import { pinName, pinSelector } from "./pin-name";

  let {
    pin,
    agentName,
    link,
    at,
    room,
    sheet = false,
    live = false,
    problem,
    draft = $bindable(""),
    onreply,
    onresolve,
    ondelete,
    onclose,
  }: {
    pin: Pin;
    /** Who answers in the thread: the session the artifact belongs to, as its transcript names it. */
    agentName: string;
    /** The pin's own address: its artifact's page, opening this pin's card. */
    link: string;
    /** The pin's disc in the well, px; null while it is not on screen. */
    at: { r: number; x: number; y: number } | null;
    /** The well's size, px. */
    room: { h: number; w: number };
    /** On a phone: at the well's foot, full width. */
    sheet?: boolean;
    /** The agent is working on this pin. */
    live?: boolean;
    /** What went wrong with the last reply, resolve or send, in the error formula. */
    problem: string | null;
    /** What the person has written and not yet said: the pin's, kept by the pane. */
    draft?: string;
    /** Keeps the person's words in the thread (reopening a resolved pin): true once kept, false when refused (its reason is `problem`). */
    onreply: (text: string) => boolean;
    onresolve: (resolved: boolean) => void;
    /** Deletes the pin once the person confirmed; rejects with the refusal's sentence. */
    ondelete: () => Promise<void>;
    onclose: () => void;
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
  // (their words are set once they have loaded, after the room stands).
  $effect(() => {
    const holder = roomEl;
    const list = holder?.querySelector('[data-slot="thread"]');
    if (!(holder && list)) {
      return;
    }
    const watch = new ResizeObserver(() => {
      if (atEnd) {
        holder.scrollTop = holder.scrollHeight;
      }
    });
    watch.observe(list);
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
  // shrinking to nothing.
  $effect(() => {
    if (!(card && head && foot)) {
      return;
    }
    const holder = card;
    const top = head;
    const bottom = foot;
    const measure = () => {
      const style = getComputedStyle(holder);
      const gap = Number.parseFloat(style.rowGap) || 0;
      const edges =
        (Number.parseFloat(style.paddingTop) || 0) +
        (Number.parseFloat(style.paddingBottom) || 0);
      squeezed =
        top.offsetHeight + bottom.offsetHeight + 2 * gap + edges >
        holder.clientHeight + 1;
    };
    const watch = new ResizeObserver(measure);
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

  /** The card's gap from its pin and from the well's edge, px: the space scale's. */
  const GAP = 12;
  const EDGE = 8;

  /** Beside its pin, on the side with room; inside the well. */
  const place = $derived.by(() => {
    if (sheet || !at) {
      return null;
    }
    let left = at.x + at.r + GAP;
    if (left + width > room.w - EDGE) {
      left = at.x - at.r - GAP - width;
    }
    left = Math.max(EDGE, Math.min(left, room.w - width - EDGE));
    const top = Math.max(EDGE, Math.min(at.y - at.r, room.h - height - EDGE));
    return { left, top };
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

  $effect(() => {
    // A new pin's card takes the keyboard: the person tapped to say something.
    if (pin.thread.length === 0 && field) {
      field.focus({ preventScroll: true });
    }
  });
</script>

<div
  data-sheet={sheet || undefined}
  data-slot="pin-card"
  aria-label={`Pin ${pin.number}`}
  class="group/pin absolute z-2 flex flex-col gap-space-2 w-(--card-w) max-h-(--card-max) overflow-y-auto overscroll-contain p-space-3 border border-border-control rounded-lg bg-surface-raised shadow-hairline max-w-(--card-maxw) not-data-sheet:not-data-placed:top-space-2 not-data-sheet:not-data-placed:right-space-2 data-placed:top-(--card-top) data-placed:left-(--card-left) data-sheet:inset-x-0 data-sheet:bottom-0 data-sheet:w-full data-sheet:max-h-(--sheet-max) data-sheet:border-x-0 data-sheet:border-b-0 data-sheet:rounded-b-none data-sheet:pb-(--sheet-pb)"
  data-pin-card={pin.number}
  data-placed={place ? "" : undefined}
  role="dialog"
  bind:this={card}
  style:--card-left={place ? `${place.left}px` : undefined}
  style:--card-top={place ? `${place.top}px` : undefined}
  style:--card-maxw={sheet ? undefined : `${Math.max(0, room.w - 2 * EDGE)}px`}
  style:--card-w="min(var(--c-pin-card-w), calc(100% - 16px))"
  style:--card-max="calc(100% - 16px)"
  style:--sheet-max="70%"
  style:--sheet-pb="calc(var(--space-3) + env(safe-area-inset-bottom, 0px))"
  style:--live-dot="8px"
  style:--lh-normal="normal"
  style:--field-fs="16px"
  bind:offsetHeight={height}
  bind:offsetWidth={width}
>
  <header
    data-slot="head"
    class="flex shrink-0 items-center gap-space-2"
    bind:this={head}
  >
    <PinDisc number={pin.number} resolved={!!pin.resolvedAt} />
    <span
      data-slot="anchor"
      class="flex flex-1 min-w-0 flex-col"
      title={selector ?? undefined}
    >
      <span data-slot="name" class="truncate text-ink-strong type-label"
        >{pinName(pin)}</span
      >
      {#if source}
        <!-- Cut from its start, so the file's name and line stay. -->
        <span
          data-slot="source"
          class="truncate text-left text-ink-muted font-(family-name:--font-mono) text-size-meta font-normal leading-(--lh-normal)"
          ><bdi>{source}</bdi></span
        >
      {/if}
    </span>
    {#if live}
      <span
        data-slot="live"
        aria-label="The agent is working on it"
        class="shrink-0 size-(--live-dot) rounded-pill bg-status-live-glyph"
        role="img"
      ></span>
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
                    class="min-w-0 wrap-anywhere px-space-1 py-0 rounded-xs bg-code-bg font-mono text-size-meta font-normal leading-(--lh-normal)"
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
      aria-describedby={problem ? `pin-error-${pin.id}` : undefined}
      aria-invalid={problem ? true : undefined}
      aria-label={pin.thread.length > 0 ? "Reply" : "Comment"}
      class="group-data-sheet/pin:text-(length:--field-fs)"
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

<style>
  /* residual: keyframes */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="pin-card"] {
      animation: pin-card-in var(--dur-pop) var(--ease-out);
    }
  }
  @keyframes pin-card-in {
    from {
      opacity: 0;
      transform: translateY(var(--pop-rise)) scale(0.96);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="live"] {
      animation: pin-card-live var(--dur-loop) var(--ease-in-out) infinite;
    }
  }
  @keyframes pin-card-live {
    50% {
      opacity: 0.4;
    }
  }
  /* residual: unmapped */
  /* rtl only to put the ellipsis at the start; the line stays at the left. */
  [data-slot="source"] {
    direction: rtl;
  }
</style>
