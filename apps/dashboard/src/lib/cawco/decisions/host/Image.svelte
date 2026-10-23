<!--
  A picture beside the page: a file the session's work folder or machine
  held when it published, kept in the artifact's folder (hub
  decision-program.ts). In its well at its own size, 1 CSS px per px, never
  scaled: its well hugs it once it has loaded and scrolls it sideways where
  it is wider (Well.svelte); its edge the house image outline (1px inside
  it). One the page does not hold says so in words where it would stand.
-->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { served } from "./page.svelte.js";
  import Well from "./Well.svelte";

  let {
    props,
  }: OpenUIRenderProps<{ file: unknown; alt: unknown; caption?: unknown }> =
    $props();
  const file = $derived(String(props.file ?? ""));
  const src = $derived(served.files[file]);
  let failed = $state(false);
  let picture = $state<HTMLImageElement>();
  /** Its own width once it has loaded, px. */
  let natural = $state<number>();
  $effect(() => {
    // A picture the browser had already loaded fires no load of its own.
    if (picture?.complete && picture.naturalWidth > 0) {
      natural = picture.naturalWidth;
    }
  });
</script>

<!-- mark-line: the picture stands over its caption, in a column; it is no mark beside words -->
<Well
  caption={props.caption ? String(props.caption) : undefined}
  picture={src && !failed ? natural : undefined}
>
  {#if src && !failed}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a picture that fails to load says so in words; one that loads tells its well its width. -->
    <img
      alt={String(props.alt ?? "")}
      bind:this={picture}
      class="block h-auto w-auto max-w-none flex-none rounded-xs outline-1 -outline-offset-1 outline-image-outline"
      decoding="async"
      loading="lazy"
      onerror={() => {
        failed = true;
      }}
      onload={() => {
        natural = picture?.naturalWidth;
      }}
      {src}
    />
  {:else}
    <!-- One line in its well where the picture would stand, never a slab of its size. -->
    <p
      data-slot="media-gone"
      class="type-meta w-full text-ink-muted wrap-anywhere"
    >
      {failed
        ? "The picture this card showed didn't load."
        : "The picture this card showed is gone."}
    </p>
  {/if}
</Well>
