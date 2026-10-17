<script lang="ts" module>
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
  import { extensionOf } from "../lightbox/extension";
  import { lightbox } from "../lightbox/lightbox-state.svelte";

  type Props =
    | { name: string; content: string }
    | {
        name: string;
        size: number;
        /** Where the hub serves it; a press downloads it. */
        href?: string;
        /** How far its upload has gone, 0 to 1, while it uploads. */
        progress?: number;
        /** Why the upload failed, in the hub's words: a press calls `onretry`. */
        failed?: string;
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
    <span
      data-slot="glyph"
      aria-hidden="true"
      class="grid place-items-center flex-none text-ink-muted"
    >
      <svg
        data-slot="ring"
        aria-hidden="true"
        class="size-icon-md m-space-1 -rotate-90"
        viewBox="0 0 24 24"
      >
        <circle
          class="fill-none stroke-current opacity-25"
          cx="12"
          cy="12"
          r="9"
        />
        <circle
          data-slot="arc"
          class="fill-none stroke-current motion-safe:transition-[stroke-dashoffset] motion-safe:dur-control motion-safe:ease-out"
          cx="12"
          cy="12"
          r="9"
          stroke-dasharray={RING}
          stroke-dashoffset={RING * (1 - (file?.progress ?? 0))}
        />
      </svg>
    </span>
  {:else}
    <!-- literal: 24px -->
    <span
      data-slot="glyph"
      aria-hidden="true"
      class="grid place-items-center flex-none text-ink-muted"
      style:--glyph="24px"><Glyph class="size-(--glyph)" /></span
    >
  {/if}
  <span data-slot="text" class="flex flex-col min-w-0">
    <span
      data-slot="name"
      class="flex min-w-0 text-size-label font-medium leading-ui whitespace-nowrap"
      ><span data-slot="head" class="min-w-0 truncate"
        >{name.slice(0, cut)}</span
      ><span class="flex-none">{name.slice(cut)}</span></span
    >
    {#if file?.failed}
      <span
        data-slot="meta"
        data-doc-thumb-failed
        class="text-size-meta font-normal tabular-nums leading-ui text-status-fail-ink whitespace-nowrap"
        >Couldn't upload</span
      >
    {:else}
      <span
        data-slot="meta"
        class="text-size-meta font-normal tabular-nums leading-ui text-ink-muted whitespace-nowrap"
        >{meta}</span
      >
    {/if}
  </span>
{/snippet}

{#if "content" in props}
  <button
    data-slot="doc"
    aria-label={`Open ${name}`}
    class="press-tint inline-flex items-center gap-space-2 h-(--doc-h) max-w-(--doc-max) py-0 ps-space-2 pe-space-3 border border-border-hairline rounded-sm bg-surface-recess text-ink-strong text-start motion-safe:transition-[background-color,transform] motion-safe:dur-control motion-safe:ease-out cursor-pointer hover:bg-surface-hover"
    style:--doc-h="48px"
    style:--doc-max="min(100%, 16rem)"
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
    data-slot="doc"
    aria-label={`Download ${name}`}
    class="press-tint inline-flex items-center gap-space-2 h-(--doc-h) max-w-(--doc-max) py-0 ps-space-2 pe-space-3 border border-border-hairline rounded-sm bg-surface-recess text-ink-strong text-start motion-safe:transition-[background-color,transform] motion-safe:dur-control motion-safe:ease-out cursor-pointer hover:bg-surface-hover"
    style:--doc-h="48px"
    style:--doc-max="min(100%, 16rem)"
    download={name}
    href={file.href}
    title={name}
  >
    {@render face()}
  </a>
{:else if file?.failed}
  <button
    data-slot="doc"
    aria-label={`Couldn't upload ${name}: ${file.failed} Try again`}
    class="press-tint inline-flex items-center gap-space-2 h-(--doc-h) max-w-(--doc-max) py-0 ps-space-2 pe-space-3 border border-border-hairline rounded-sm bg-surface-recess text-ink-strong text-start motion-safe:transition-[background-color,transform] motion-safe:dur-control motion-safe:ease-out cursor-pointer hover:bg-surface-hover"
    style:--doc-h="48px"
    style:--doc-max="min(100%, 16rem)"
    onclick={() => file?.onretry?.()}
    title={`${name}: ${file.failed}`}
    type="button"
  >
    {@render face()}
  </button>
{:else}
  {#if uploading}
    <span
      data-slot="doc"
      aria-busy="true"
      aria-label={`Uploading ${name}`}
      class="inline-flex items-center gap-space-2 h-(--doc-h) max-w-(--doc-max) py-0 ps-space-2 pe-space-3 border border-border-hairline rounded-sm bg-surface-recess text-ink-strong text-start motion-safe:transition-[background-color,transform] motion-safe:dur-control motion-safe:ease-out cursor-default hover:bg-surface-recess"
      style:--doc-h="48px"
      style:--doc-max="min(100%, 16rem)"
      role="status"
      title={name}
    >
      {@render face()}
    </span>
  {:else}
    <span
      data-slot="doc"
      class="inline-flex items-center gap-space-2 h-(--doc-h) max-w-(--doc-max) py-0 ps-space-2 pe-space-3 border border-border-hairline rounded-sm bg-surface-recess text-ink-strong text-start motion-safe:transition-[background-color,transform] motion-safe:dur-control motion-safe:ease-out cursor-default hover:bg-surface-recess"
      style:--doc-h="48px"
      style:--doc-max="min(100%, 16rem)"
      title={name}>{@render face()}</span
    >
  {/if}
{/if}

<style>
  /* residual: svg-paint */
  [data-slot="ring"] circle {
    stroke-width: 2.5;
  }
  [data-slot="arc"] {
    stroke-linecap: round;
  }
</style>
