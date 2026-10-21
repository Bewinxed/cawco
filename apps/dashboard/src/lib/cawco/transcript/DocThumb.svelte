<script lang="ts">
  /**
   * An attached file, drawn in the thumbnail row beside the pictures a turn
   * carried: the same 48px-high box, radius, hairline and focus ring as
   * `<Shot size="thumb">`, widened to hold the file's name. The sent turn's
   * tile and the thread gallery's; a draft's attachments are chips
   * (AttachmentChips), with the same face (doc-face.ts).
   *
   * A text (`content`) opens in the lightbox, which flies out of this box and
   * back into it (motion/share.svelte.ts). Any other file (`size`) says its
   * size: while it uploads, a ring in place of its glyph fills as it goes;
   * if the upload failed, "Couldn't upload", and a press tries again; once
   * the hub has it (`href`), a press downloads it.
   */
  import { humanSize } from "@cawco/core";
  import { lightbox } from "../lightbox/lightbox-state.svelte";
  import { glyphOf, nameParts, sizeLine } from "./doc-face";
  import UploadRing from "./UploadRing.svelte";

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
  const Glyph = $derived(glyphOf(name));
  const parts = $derived(nameParts(name));
  const meta = $derived(
    "content" in props ? sizeLine(props.content) : humanSize(props.size)
  );
  const uploading = $derived(
    !!file && file.progress !== undefined && !file.failed && !file.href
  );
  const BOX =
    "inline-flex items-center gap-space-2 h-(--tx-shot-thumb) max-w-c-doc-max py-0 ps-space-2 pe-space-3 border border-border-hairline rounded-sm bg-surface-recess text-ink-strong text-start motion-safe:transition-[background-color,transform] motion-safe:duration-(--dur-control) motion-safe:ease-out";
</script>

{#snippet face()}
  <span
    data-slot="glyph"
    aria-hidden="true"
    class="grid place-items-center flex-none text-ink-muted"
  >
    {#if uploading}
      <UploadRing class="size-icon-md m-space-1" progress={file?.progress ?? 0} />
    {:else}
      <Glyph class="size-icon-md m-space-1" />
    {/if}
  </span>
  <span data-slot="text" class="flex flex-col min-w-0">
    <span
      data-slot="name"
      class="flex min-w-0 text-size-label font-medium leading-ui whitespace-nowrap"
      ><span data-slot="head" class="min-w-0 truncate">{parts.head}</span><span
        class="flex-none">{parts.tail}</span
      ></span
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
    class={["select-none press-tint hover:bg-surface-hover", BOX]}
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
    class={["press-tint hover:bg-surface-hover", BOX]}
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
    class={["select-none press-tint hover:bg-surface-hover", BOX]}
    onclick={() => file?.onretry?.()}
    title={`${name}: ${file.failed}`}
    type="button"
  >
    {@render face()}
  </button>
{:else if uploading}
  <span
    data-slot="doc"
    aria-busy="true"
    aria-label={`Uploading ${name}`}
    class={["cursor-default", BOX]}
    role="status"
    title={name}
  >
    {@render face()}
  </span>
{:else}
  <span data-slot="doc" class={["cursor-default", BOX]} title={name}
    >{@render face()}</span
  >
{/if}
