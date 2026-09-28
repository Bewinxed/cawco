<script lang="ts">
  import { lightbox } from "./lightbox-state.svelte";

  let {
    src,
    alt,
    caption,
    path,
    size = "card",
  }: {
    src: string;
    alt: string;
    caption?: string;
    path?: string;
    size?: "thumb" | "card";
  } = $props();

  let loaded = $state<string>();
  let failed = $state<string>();
  /**
   * An image the browser already had when this mounted — a row scrolled back
   * into view, a pane come back — is simply there. Only an image that
   * actually loads in front of the reader resolves out of its blur.
   */
  let cached = $state(false);
  function mounted(img: HTMLImageElement): void {
    if (img.complete && img.naturalWidth > 0) {
      cached = true;
      loaded = src;
    }
  }
</script>

<figure class:thumb={size === 'thumb'}>
  {#if failed === src}
    <div class="box missing">
      <span>Image not available</span>
      {#if path}
        <span class="path">{path}</span>
      {/if}
    </div>
  {:else}
    <button
      aria-label={`Open ${alt}`}
      class="box"
      onclick={() => lightbox.open({ src, alt, caption, path })}
      type="button"
    >
      {#if loaded !== src}
        <span aria-hidden="true" class="skeleton"></span>
      {/if}
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: image load/error lifecycle events; the containing button owns interaction. -->
      <img
        {alt}
        decoding="async"
        loading="lazy"
        onerror={() => { failed = src; }}
        onload={() => { loaded = src; }}
        {src}
        class:cached={cached}
        class:loaded={loaded === src}
        {@attach mounted}
      >
    </button>
  {/if}
  {#if caption || path}
    <figcaption>
      {#if caption}
        <span>{caption}</span>
      {/if}
      {#if path}
        <span class="path">{path}</span>
      {/if}
    </figcaption>
  {/if}
</figure>

<style>
  .box {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    inline-size: 100%;
    block-size: 240px;
    padding: 0;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: transparent;
    color: var(--ink-muted);
  }
  button {
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 1px;
    }
  }
  img {
    display: block;
    max-inline-size: 100%;
    max-block-size: 240px;
    object-fit: contain;
    opacity: 0;
    filter: blur(6px);

    &.loaded {
      opacity: 1;
      filter: blur(0);
    }
    @media (prefers-reduced-motion: no-preference) {
      &:not(.cached) {
        transition:
          opacity calc(var(--dur-control) * 3) var(--ease-out),
          filter calc(var(--dur-control) * 3) var(--ease-out);
      }
    }
  }
  .skeleton {
    position: absolute;
    inset: 0;
    background: var(--surface-recess);

    @media (prefers-reduced-motion: no-preference) {
      animation: pulse calc(var(--dur-control) * 10) var(--ease-out) infinite
        alternate;
    }
  }
  .missing {
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    padding: var(--space-3);
    background: var(--surface-recess);
    font-size: var(--text-meta);
  }
  .path {
    font-family: var(--font-mono);
    overflow-wrap: anywhere;
  }
  figcaption {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-block-start: var(--space-2);
    font-size: var(--text-meta);
    color: var(--ink-muted);
  }
  figure {
    margin: 0;
    inline-size: 100%;
    max-inline-size: 100%;

    &.thumb {
      inline-size: 48px;

      & .box {
        inline-size: 48px;
        block-size: 48px;
      }
      & img {
        inline-size: 100%;
        block-size: 100%;
        object-fit: cover;
      }
    }
  }
  @keyframes pulse {
    from {
      opacity: 0.4;
    }
    to {
      opacity: 1;
    }
  }
</style>
