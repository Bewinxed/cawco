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
   * An attached text file, drawn in the thumbnail row beside the pictures a
   * turn carried: the same 48px-high box, radius, hairline and focus ring as
   * `<Shot size="thumb">`, widened to hold the file's name. Clicking it opens
   * the file in the lightbox, which flies out of this box and back into it
   * (motion/share.svelte.ts).
   */
  import {
    IconDocument,
    IconFileCode,
    IconFileLog,
    IconFileMarkdown,
    IconFileTable,
  } from "#lib/icons.js";
  import { lightbox } from "./lightbox-state.svelte";

  let { name, content }: { name: string; content: string } = $props();

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
  const meta = $derived(sizeLine(content));
</script>

<button
  aria-label={`Open ${name}`}
  class="doc press-tint"
  data-share={share}
  onclick={() => lightbox.open({ kind: "text", name, content, share })}
  title={name}
  type="button"
>
  <span aria-hidden="true" class="glyph"><Glyph /></span>
  <span class="text">
    <span class="name"
      ><span class="head">{name.slice(0, cut)}</span
      ><span class="tail">{name.slice(cut)}</span></span
    >
    <span class="meta">{meta}</span>
  </span>
</button>

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
</style>
