<!--
  A picture beside the page: a file the session's work folder or machine
  held when it published, kept in the artifact's folder (hub
  decision-program.ts). One the page does not hold says so in words.
-->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { served } from "./page.svelte.js";

  let {
    props,
  }: OpenUIRenderProps<{ file: unknown; alt: unknown; caption?: unknown }> =
    $props();
  const file = $derived(String(props.file ?? ""));
  const src = $derived(served.files[file]);
  let failed = $state(false);
</script>

<!-- mark-line: the picture stands over its caption, in a column; it is no mark beside words -->
<figure class="dp-pane media">
  {#if src && !failed}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a picture that fails to load says so in words. -->
    <img
      alt={String(props.alt ?? "")}
      decoding="async"
      loading="lazy"
      onerror={() => {
        failed = true;
      }}
      {src}
    />
  {:else}
    <p class="gone">The picture {file} is not on this page.</p>
  {/if}
  {#if props.caption}<figcaption>{String(props.caption)}</figcaption>{/if}
</figure>

<style>
  /* tailwind: this folder is bundled by Bun with no Tailwind build (core decision-host.ts), and Tailwind only generates CSS where it scans the source, so a utility here would draw nothing — https://tailwindcss.com/docs/detecting-classes-in-source-files */
  .media {
    min-inline-size: 0;
  }
  img {
    display: block;
    max-inline-size: 100%;
    block-size: auto;
    border-radius: var(--radius-md);
    background: var(--surface-raised);
  }
  .gone {
    color: var(--ink-muted);
    font: var(--type-meta);
    overflow-wrap: anywhere;
  }
</style>
