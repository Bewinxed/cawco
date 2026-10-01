<script lang="ts" module>
  /** Bytes from the front of a base64 payload: enough for any header read below. */
  const HEAD = 65_536;

  /**
   * An image's own width and height, read from the header of its bytes, for
   * the formats agents and browsers hand back (PNG, JPEG, GIF, WebP). A
   * `data:` image carries its size in its first bytes, so its box is known
   * before it decodes; null when the header says nothing this reads.
   */
  interface Size {
    height: number;
    width: number;
  }
  /** 14-bit fields in WebP headers: 2^14. */
  const FOURTEEN_BITS = 16_384;

  function webpSize(text: string, view: DataView): Size | null {
    const chunk = text.slice(12, 16);
    const le24 = (i: number) =>
      view.getUint16(i, true) + view.getUint8(i + 2) * 65_536;
    if (chunk === "VP8X") {
      return { width: le24(24) + 1, height: le24(27) + 1 };
    }
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return {
        width: (bits % FOURTEEN_BITS) + 1,
        height: (Math.floor(bits / FOURTEEN_BITS) % FOURTEEN_BITS) + 1,
      };
    }
    if (chunk === "VP8 ") {
      return {
        width: view.getUint16(26, true) % FOURTEEN_BITS,
        height: view.getUint16(28, true) % FOURTEEN_BITS,
      };
    }
    return null;
  }

  /**
   * JPEG: walk the segments to the frame header (SOF0–SOF15, less the DHT,
   * JPG and DAC markers that share the range).
   */
  function jpegSize(view: DataView): Size | null {
    let i = 2;
    while (i + 9 < view.byteLength) {
      if (view.getUint8(i) !== 0xff) {
        return null;
      }
      const marker = view.getUint8(i + 1);
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
      }
      i += 2 + view.getUint16(i + 2);
    }
    return null;
  }

  export function dataImageSize(src: string): Size | null {
    const comma = src.indexOf(",");
    const b64 = src.slice(comma + 1, comma + 1 + HEAD - (HEAD % 4));
    const text = atob(b64);
    const view = new DataView(
      Uint8Array.from(text, (char) => char.charCodeAt(0)).buffer
    );
    // PNG: the IHDR chunk follows the 8-byte signature.
    if (text.startsWith("\x89PNG")) {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (text.startsWith("GIF8")) {
      return {
        width: view.getUint16(6, true),
        height: view.getUint16(8, true),
      };
    }
    if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") {
      return webpSize(text, view);
    }
    if (text.startsWith("\xff\xd8")) {
      return jpegSize(view);
    }
    return null;
  }
</script>

<script lang="ts">
  import { type LightboxShot, lightbox } from "./lightbox-state.svelte";

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

  let image = $state<HTMLImageElement>();
  let loaded = $state<string>();
  let failed = $state<string>();
  /**
   * An image the browser already had when this mounted — a row scrolled back
   * into view, a pane come back — is simply there. Only an image that
   * actually loads in front of the reader fades in.
   */
  let cached = $state(false);
  function mounted(img: HTMLImageElement): void {
    if (img.complete && img.naturalWidth > 0) {
      cached = true;
      loaded = src;
    }
  }
  /**
   * A card's image, drawn at its own size inside the 240px box (never wider
   * than the box, never taller than 240px), and the placeholder standing in
   * exactly that box. The size is the image's own, from its header: a
   * `data:` image carries it in its first bytes, so its box is right from
   * the first frame; a picture served by URL gives it as soon as its header
   * has arrived, which is when the browser lays the still-loading image out
   * at that size — heard below — and before it has finished loading.
   */
  let served = $state<{ src: string; width: number; height: number } | null>(
    null
  );
  const intrinsic = $derived.by(() => {
    if (size !== "card") {
      return null;
    }
    if (src.startsWith("data:")) {
      return dataImageSize(src);
    }
    return served?.src === src ? served : null;
  });
  function sized(img: HTMLImageElement) {
    if (size !== "card" || src.startsWith("data:")) {
      return;
    }
    const watch = new ResizeObserver(() => {
      if (img.naturalWidth > 0) {
        served = {
          src: img.currentSrc || src,
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
        watch.disconnect();
      }
    });
    watch.observe(img);
    return () => watch.disconnect();
  }

  /** A drawn picture as the lightbox shows it, zooming out of its own box. */
  function shotOf(img: HTMLImageElement): LightboxShot {
    return {
      src: img.src,
      alt: img.alt,
      caption: img.dataset.caption,
      path: img.dataset.path,
      width: img.naturalWidth,
      height: img.naturalHeight,
      element: img,
      cropped: img.dataset.shot === "thumb",
    };
  }

  /**
   * The lightbox opens on this picture among every picture of its message
   * (the nearest `data-gallery`), so the reader can swipe between them.
   */
  function open(): void {
    if (!image) {
      return;
    }
    const pictures = [
      ...(image
        .closest("[data-gallery]")
        ?.querySelectorAll<HTMLImageElement>("img[data-shot]") ?? [image]),
    ];
    lightbox.open({
      kind: "image",
      shots: pictures.map(shotOf),
      index: pictures.indexOf(image),
    });
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
    <button aria-label={`Open ${alt}`} class="box" onclick={open} type="button">
      <span
        class="frame"
        style:--h={intrinsic?.height}
        style:--w={intrinsic?.width}
        class:sized={intrinsic !== null}
      >
        {#if loaded !== src}
          <span
            aria-hidden="true"
            class="kit-skeleton absolute inset-0 rounded-[inherit]"
          ></span>
        {/if}
        <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: image load/error lifecycle events; the containing button owns interaction. -->
        <img
          {alt}
          data-caption={caption}
          data-path={path}
          data-shot={size}
          decoding="async"
          height={intrinsic?.height}
          loading="lazy"
          onerror={() => { failed = src; }}
          onload={() => { loaded = src; }}
          {src}
          width={intrinsic?.width}
          bind:this={image}
          class:cached={cached}
          class:loaded={loaded === src}
          {@attach mounted}
          {@attach sized}
        >
      </span>
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
  }
  /* The picture's box. Unsized, it is the whole card box and the picture
     fits inside it; sized, it is the picture's own box at contain scale. */
  .frame {
    position: relative;
    display: flex;
    align-items: center;
    inline-size: 100%;
    block-size: 100%;
    border-radius: inherit;

    &.sized {
      inline-size: min(
        100%,
        calc(var(--w) * 1px),
        calc(240px * var(--w) / var(--h))
      );
      block-size: auto;
      aspect-ratio: var(--w) / var(--h);
    }
  }
  img {
    display: block;
    max-inline-size: 100%;
    max-block-size: 240px;
    object-fit: contain;
    opacity: 0;

    &.loaded {
      opacity: 1;
    }
    &:not(.cached) {
      transition: opacity var(--dur-control) var(--ease-out);
    }
  }
  .sized img {
    inline-size: 100%;
    block-size: 100%;
  }
  .missing {
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    padding: var(--space-3);
    background: var(--surface-recess);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
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
    font-weight: var(--weight-body);
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
</style>
