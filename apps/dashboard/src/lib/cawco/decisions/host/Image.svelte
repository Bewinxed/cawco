<!--
  A picture beside the page: a file the session's work folder or machine
  held when it published, kept in the artifact's folder (hub
  decision-program.ts). In its well at its own size and centred, one wider
  than the well scaled down to fit it and none taller than the media cap,
  its edge the house image outline (1px inside it). One the page does not
  hold says so in words where it would stand.
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
</script>

<Well caption={props.caption ? String(props.caption) : undefined}>
  {#if src && !failed}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a picture that fails to load says so in words. -->
    <img
      alt={String(props.alt ?? "")}
      class="block h-auto max-h-c-media-max-h w-auto max-w-full rounded-xs outline-1 -outline-offset-1 outline-image-outline"
      decoding="async"
      loading="lazy"
      onerror={() => {
        failed = true;
      }}
      {src}
    />
  {:else}
    <p
      class="type-meta grid aspect-16/10 w-full place-items-center text-center text-ink-muted wrap-anywhere"
    >
      The picture {file} is not on this page.
    </p>
  {/if}
</Well>
