<script lang="ts">
  /**
   * A pin's card (Projects spec §5.7; tsk-3; DESIGN.md Artifact panel, canvas
   * and ink), over the page beside its pin: the raised card recipe (12px,
   * control edge, hairline shadow, 11px padding), on a phone standing at the
   * well's foot as the house drawer does. What the pin stands on (its text
   * and file:line) with its picture, which opens full size in the lightbox;
   * its thread, the agent's replies as markdown; the reply field, Reply, and
   * Resolve or Reopen; Delete, asked in the card itself before it runs (The
   * Open Page Rule: AskHere under the footer, the page still live). What goes
   * wrong is said under the field, a refused delete under its question.
   *
   * A column: the head over it, the field and its actions at its foot, both
   * always in view, and between them the picture and the thread, the only
   * part that scrolls, under the house edge fade. Past the card's cap the
   * thread gives up height, never the actions.
   *
   * A press anywhere outside it closes it (the house's outside-press rule,
   * press-outside.ts), as Esc and its Close do; the page in the well, whose
   * presses this document never hears, says its own (`cawco:press`). What
   * the field holds is the pin's draft, which the pane keeps with the pin.
   */
  import type { Pin } from "@cawco/core/comments";
  import { tick, untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconClose, IconReopen, IconSuccess, IconTrash } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import MessageBody from "../MessageBody.svelte";
  import { pressOutside } from "../press-outside";
  import PinDisc from "./PinDisc.svelte";
  import { pinName } from "./pin-name";

  let {
    pin,
    at,
    room,
    sheet = false,
    live = false,
    thumb,
    problem,
    draft = $bindable(""),
    onreply,
    onresolve,
    ondelete,
    onclose,
    onpicture,
  }: {
    pin: Pin;
    /** The pin's disc in the well, px; null while it is not on screen. */
    at: { r: number; x: number; y: number } | null;
    /** The well's size, px. */
    room: { h: number; w: number };
    /** On a phone: at the well's foot, full width. */
    sheet?: boolean;
    /** The agent is working on this pin. */
    live?: boolean;
    /** The pin's picture, small; null while it is drawn or when it has none. */
    thumb: string | null;
    /** What went wrong with the last reply, resolve or send, in the error formula. */
    problem: string | null;
    /** What the person has written and not yet said: the pin's, kept by the pane. */
    draft?: string;
    /** Keeps the person's words in the thread: true once kept, false when refused (its reason is `problem`). */
    onreply: (text: string) => boolean;
    onresolve: (resolved: boolean) => void;
    /** Deletes the pin once the person confirmed; rejects with the refusal's sentence. */
    ondelete: () => Promise<void>;
    onclose: () => void;
    onpicture: (from: HTMLElement) => void;
  } = $props();

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
    const fresh = pin.id !== shownPin;
    shownPin = pin.id;
    if (roomEl && count > 0 && (fresh || atEnd)) {
      const holder = roomEl;
      tick().then(() => {
        holder.scrollTop = holder.scrollHeight;
        atEnd = true;
      });
    }
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

  // A press outside the card closes it; one in the picture's lightbox, a
  // modal layer the card opened over everything, is that layer's.
  $effect(() => {
    if (!card) {
      return;
    }
    return pressOutside(card, (event) => {
      if (
        !(
          event.target instanceof Element &&
          event.target.closest("[aria-modal='true'], dialog[open]")
        )
      ) {
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
  aria-label={`Pin ${pin.number}`}
  class="pin-card"
  data-pin-card={pin.number}
  role="dialog"
  bind:this={card}
  style:left={place ? `${place.left}px` : undefined}
  style:top={place ? `${place.top}px` : undefined}
  class:sheet
  bind:offsetHeight={height}
  bind:offsetWidth={width}
>
  <header class="head" bind:this={head}>
    <PinDisc number={pin.number} resolved={!!pin.resolvedAt} />
    <span class="anchor">
      <span class="name">{pinName(pin)}</span>
      {#if source}
        <span class="source">{source}</span>
      {/if}
    </span>
    {#if live}
      <span
        aria-label="The agent is working on it"
        class="live"
        role="img"
      ></span>
    {/if}
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
  {#if thumb || pin.thread.length > 0}
    <div
      class={["room kit-edge-fade-block", squeezed && "whole"]}
      data-pin-room
      onscroll={readAt}
      bind:this={roomEl}
    >
      {#if thumb}
        <button
          aria-label={`Pin ${pin.number}'s picture, full size`}
          class="thumb"
          onclick={(event) => onpicture(event.currentTarget)}
          type="button"
        >
          <img alt="" src={`data:image/png;base64,${thumb}`}>
        </button>
      {/if}
      {#if pin.thread.length > 0}
        <ol class="thread">
          {#each pin.thread as entry (entry.id)}
            <li class="entry" data-by={entry.by}>
              <p class="who">
                <span>{entry.by === "agent" ? "Agent" : "You"}</span>
                <time datetime={entry.at}
                  >{formatAgeShort(Date.parse(entry.at))}</time
                >
              </p>
              {#if entry.by === "agent"}
                <MessageBody source={entry.text} />
                {#if entry.files?.length}
                  <p class="files">
                    {#each entry.files as file (file)}
                      <code>{file}</code>
                    {/each}
                  </p>
                {/if}
              {:else}
                <p class="words">{entry.text}</p>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  {/if}
  <div class="foot" bind:this={foot}>
    <Textarea
      aria-describedby={problem ? `pin-error-${pin.id}` : undefined}
      aria-invalid={problem ? true : undefined}
      aria-label={pin.thread.length > 0 ? "Reply" : "Comment"}
      class="field"
      onkeydown={(event: KeyboardEvent) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          reply();
        }
      }}
      placeholder={pin.thread.length > 0 ? "Reply" : "Say what to change here"}
      rows={2}
      bind:ref={field}
      bind:value={draft}
    />
    {#if problem}
      <p class="error" id={`pin-error-${pin.id}`} role="alert">{problem}</p>
    {/if}
    <footer class="actions">
      <Button
        aria-expanded={asks.pending !== null}
        class="delete"
        icon={IconTrash}
        label="Delete"
        onclick={askDelete}
        size="sm"
        variant="ghost"
      />
      {#if pin.resolvedAt}
        <Button
          icon={IconReopen}
          label="Reopen"
          onclick={() => onresolve(false)}
          size="sm"
          variant="outline"
        />
      {:else}
        <Button
          icon={IconSuccess}
          label="Resolve"
          onclick={() => onresolve(true)}
          size="sm"
          variant="outline"
        />
      {/if}
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
  /* The raised card recipe: 12px, control edge, hairline shadow, 11px padding. */
  .pin-card {
    position: absolute;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: min(var(--c-pin-card-w), calc(100% - 16px));
    max-height: calc(100% - 16px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 11px;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-hairline);
  }
  .pin-card:not(.sheet) {
    top: var(--space-2);
    right: var(--space-2);
  }
  .pin-card:not(.sheet)[style*="left"] {
    right: auto;
  }
  /* On a phone: the house drawer's shape at the well's foot. */
  .pin-card.sheet {
    inset-inline: 0;
    bottom: 0;
    width: 100%;
    max-height: 70%;
    border-width: 1px 0 0;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding-bottom: calc(11px + env(safe-area-inset-bottom, 0px));
  }
  @media (prefers-reduced-motion: no-preference) {
    .pin-card {
      animation: pin-card-in var(--dur-pop) var(--ease-out);
    }
  }
  @keyframes pin-card-in {
    from {
      opacity: 0;
      transform: translateY(var(--pop-rise, 8px)) scale(0.96);
    }
  }
  .head {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--space-2);
  }
  /* The one scroller: past the card's cap it gives up height, never the
     head or the foot. The card itself scrolls only when the head and foot
     alone outgrow its room (a phone's keyboard over a short well). */
  .room {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* Squeezed (the head and foot alone outgrow the card): the thread keeps
     its whole height inside the card's own scroll, never shrinking away. */
  .room.whole {
    flex-shrink: 0;
  }
  .foot {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: var(--space-2);
  }
  .anchor {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
  }
  .name,
  .source {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name {
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .source {
    color: var(--ink-muted);
    font: var(--text-meta) var(--font-mono);
  }
  .live {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: var(--radius-pill);
    background: var(--status-live-glyph);
  }
  @media (prefers-reduced-motion: no-preference) {
    .live {
      animation: pin-card-live var(--dur-loop) var(--ease-in-out) infinite;
    }
  }
  @keyframes pin-card-live {
    50% {
      opacity: 0.4;
    }
  }
  .thumb {
    align-self: flex-start;
    width: var(--c-pin-thumb);
    height: var(--c-pin-thumb);
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    cursor: zoom-in;

    & img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
  .thread {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .who {
    display: flex;
    gap: var(--space-2);
    margin: 0;
    color: var(--ink-strong);
    font: var(--type-label);

    & time {
      color: var(--ink-muted);
      font-size: var(--text-meta);
      font-weight: var(--weight-body);
    }
  }
  .words {
    margin: 0;
    color: var(--ink-row);
    font: var(--type-body);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .files {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: var(--space-1) 0 0;

    & code {
      padding: 0 var(--space-1);
      border-radius: var(--radius-xs);
      background: var(--code-bg);
      font: var(--text-meta) var(--font-mono);
    }
  }
  /* 16px on a phone, so iOS does not zoom the page into the field. */
  .sheet :global(.field) {
    font-size: 16px;
  }
  .error {
    margin: 0;
    color: var(--data-bad);
    font-size: var(--text-meta);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  /* Delete stands apart from Resolve and Reply, at the footer's start. */
  .actions :global(.delete) {
    margin-inline-end: auto;
  }
</style>
