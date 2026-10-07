<script lang="ts" module>
  /** A file name's extension, lower-cased; "" for none. */
  export function extensionOf(name: string): string {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  }

  const KB = 1024;
  /** "12 lines · 2.3 KB": what the thumb says under the name. */
  function sizeLine(content: string): string {
    const lines = content.split("\n").length;
    const bytes = new TextEncoder().encode(content).length;
    let size = `${bytes} B`;
    if (bytes >= KB * KB) {
      size = `${(bytes / KB / KB).toFixed(1)} MB`;
    } else if (bytes >= KB) {
      size = `${(bytes / KB).toFixed(1)} KB`;
    }
    return `${lines} ${lines === 1 ? "line" : "lines"} · ${size}`;
  }

  /** The tail of a name that always stays in view: its last characters and extension. */
  const TAIL = 8;
</script>

<script lang="ts">
  /**
   * An attached file, drawn in the thumbnail row beside the pictures a turn
   * carried: the same 48px-high box, radius, hairline and focus ring as
   * `<Shot size="thumb">`, widened to hold the file's name.
   *
   * A text (`content`) opens in the lightbox, which flies out of this box and
   * back into it (motion/share.svelte.ts). Any other file (`size`) says its
   * size: while it uploads, a ring in place of its glyph fills as it goes;
   * if the upload failed, "Couldn't upload", and a press tries again; once
   * the hub has it (`href`), a press downloads it.
   */
  import { humanSize } from "@cawco/core";
  import {
    IconDocument,
    IconFileCode,
    IconFileLog,
    IconFileMarkdown,
    IconFileTable,
  } from "#lib/icons.js";
  import { lightbox } from "./lightbox-state.svelte";

  type Props =
    | { name: string; content: string }
    | {
        name: string;
        size: number;
        /** Where the hub serves it; a press downloads it. */
        href?: string;
        /** How far its upload has gone, 0 to 1, while it uploads. */
        progress?: number;
        /** The upload failed: a press calls `onretry`. */
        failed?: boolean;
        onretry?: () => void;
      };

  const props: Props = $props();
  const { name } = $derived(props);
  const file = $derived("content" in props ? undefined : props);

  const uid = $props.id();
  /** What the lightbox flies out of and back into (motion/share.svelte.ts). */
  const share = `doc:${uid}`;
  const extension = $derived(extensionOf(name));
  const Glyph = $derived(
    {
      md: IconFileMarkdown,
      markdown: IconFileMarkdown,
      json: IconFileCode,
      csv: IconFileTable,
      log: IconFileLog,
    }[extension] ?? IconDocument
  );
  const cut = $derived(Math.max(0, name.length - TAIL));
  const meta = $derived(
    "content" in props ? sizeLine(props.content) : humanSize(props.size)
  );
  const uploading = $derived(
    !!file && file.progress !== undefined && !file.failed && !file.href
  );
  /** The ring's arc: its circumference, and how much of it is still to fill. */
  const RING = 2 * Math.PI * 9;
</script>

{#snippet face()}
  {#if uploading}
    <span aria-hidden="true" class="glyph">
      <svg aria-hidden="true" class="ring" viewBox="0 0 24 24">
        <circle class="track" cx="12" cy="12" r="9" />
        <circle
          class="arc"
          cx="12"
          cy="12"
          r="9"
          stroke-dasharray={RING}
          stroke-dashoffset={RING * (1 - (file?.progress ?? 0))}
        />
      </svg>
    </span>
  {:else}
    <span aria-hidden="true" class="glyph"><Glyph /></span>
  {/if}
  <span class="text">
    <span class="name"
      ><span class="head">{name.slice(0, cut)}</span
      ><span class="tail">{name.slice(cut)}</span></span
    >
    {#if file?.failed}
      <span class="meta failed">Couldn't upload</span>
    {:else}
      <span class="meta">{meta}</span>
    {/if}
  </span>
{/snippet}

{#if "content" in props}
  <button
    aria-label={`Open ${name}`}
    class="doc press-tint"
    data-share={share}
    onclick={() =>
      lightbox.open({ kind: "text", name, content: props.content, share })}
    title={name}
    type="button"
  >
    {@render face()}
  </button>
{:else if file?.href}
  <a
    aria-label={`Download ${name}`}
    class="doc press-tint"
    download={name}
    href={file.href}
    title={name}
  >
    {@render face()}
  </a>
{:else if file?.failed}
  <button
    aria-label={`Couldn't upload ${name}. Try again`}
    class="doc press-tint"
    onclick={() => file?.onretry?.()}
    title={name}
    type="button"
  >
    {@render face()}
  </button>
{:else}
  {#if uploading}
    <span
      aria-busy="true"
      aria-label={`Uploading ${name}`}
      class="doc still"
      role="status"
      title={name}
    >
      {@render face()}
    </span>
  {:else}
    <span class="doc still" title={name}>{@render face()}</span>
  {/if}
{/if}

<style>
  /* Shot's thumb box — 48px high, --radius-sm, hairline, recess — with the
     width of its name. */
  .doc {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    block-size: 48px;
    max-inline-size: min(100%, 16rem);
    padding-block: 0;
    padding-inline: var(--space-2) var(--space-3);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    color: var(--ink-strong);
    text-align: start;
    cursor: pointer;

    &:hover {
      background: var(--surface-hover);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .doc {
      transition:
        background-color var(--dur-control) var(--ease-out),
        transform var(--dur-control) var(--ease-out);
    }
  }
  .glyph {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: 24px;
      block-size: 24px;
    }
  }
  .text {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }
  /* Middle truncation: the head gives way to an ellipsis, the tail — the
     last characters and the extension — never does. */
  .name {
    display: flex;
    min-inline-size: 0;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    line-height: var(--leading-ui);
    white-space: nowrap;
  }
  .head {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tail {
    flex: 0 0 auto;
  }
  .meta {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    font-variant-numeric: tabular-nums;
    line-height: var(--leading-ui);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .meta.failed {
    color: var(--status-fail-ink);
  }
  /* A file this box can do nothing with yet: no press, no hover. */
  .doc.still {
    cursor: default;

    &:hover {
      background: var(--surface-recess);
    }
  }
  /* The kit spinner's ring, filled as far as the upload has gone: the
     glyph's slot, a 16px ring in it, the track at a quarter. */
  .glyph .ring {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    margin: var(--space-1);
    rotate: -90deg;
  }
  .ring circle {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
  }
  .ring .track {
    opacity: 0.25;
  }
  .ring .arc {
    stroke-linecap: round;
  }
  @media (prefers-reduced-motion: no-preference) {
    .ring .arc {
      transition: stroke-dashoffset var(--dur-control) var(--ease-out);
    }
  }
</style>
