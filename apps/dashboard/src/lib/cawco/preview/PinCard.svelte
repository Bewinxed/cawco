<script lang="ts">
  /**
   * A pin's card (Projects spec §5.7; tsk-3; DESIGN.md Artifact panel, canvas
   * and ink), over the page beside its pin: the raised card recipe (12px,
   * control edge, hairline shadow, 11px padding), on a phone standing at the
   * well's foot as the house drawer does. What the pin stands on (its text
   * and file:line) with its picture, which opens full size in the lightbox;
   * its thread, the agent's replies as markdown; the reply field, Reply, and
   * Resolve or Reopen. What goes wrong is said under the field.
   */
  import type { Pin } from "@cawco/core/comments";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconClose, IconReopen, IconSuccess } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import MessageBody from "../transcript/MessageBody.svelte";
  import { pinName } from "./pin-name";

  let {
    pin,
    at,
    room,
    sheet = false,
    live = false,
    thumb,
    problem,
    onreply,
    onresolve,
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
    onreply: (text: string) => void;
    onresolve: (resolved: boolean) => void;
    onclose: () => void;
    onpicture: (from: HTMLElement) => void;
  } = $props();

  let draft = $state("");
  let height = $state(0);
  let width = $state(0);
  let field = $state<HTMLTextAreaElement | null>(null);

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
    onreply(text);
    draft = "";
  }

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
  style:left={place ? `${place.left}px` : undefined}
  style:top={place ? `${place.top}px` : undefined}
  class:sheet
  bind:offsetHeight={height}
  bind:offsetWidth={width}
>
  <header class="head">
    <span aria-hidden="true" class="disc" class:resolved={!!pin.resolvedAt}
      >{pin.number}</span
    >
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
    <button
      aria-label="Close"
      class="close"
      onclick={onclose}
      title="Close"
      type="button"
    >
      <IconClose />
    </button>
  </header>
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
    <Button disabled={!draft.trim()} label="Reply" onclick={reply} size="sm" />
  </footer>
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
    align-items: center;
    gap: var(--space-2);
  }
  .disc {
    display: inline-grid;
    place-items: center;
    flex-shrink: 0;
    width: var(--c-pin);
    height: var(--c-pin);
    border-radius: var(--radius-pill);
    background: var(--action-solid);
    color: var(--on-action);
    font: var(--type-label);
    font-variant-numeric: tabular-nums;
  }
  .disc.resolved {
    opacity: 0.4;
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
  .close {
    display: inline-grid;
    place-items: center;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;

    & :global(svg) {
      width: 16px;
      height: 16px;
    }
  }
  @media (hover: hover) {
    .close:hover {
      background: var(--surface-hover);
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
</style>
