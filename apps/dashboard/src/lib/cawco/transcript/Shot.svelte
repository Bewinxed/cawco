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
  import {
    type LightboxShot,
    lightbox,
  } from "../lightbox/lightbox-state.svelte";

  let {
    src,
    alt,
    caption,
    path,
    size = "card",
    video = false,
  }: {
    src: string;
    alt: string;
    caption?: string;
    path?: string;
    size?: "thumb" | "card";
    /** A clip rather than a picture: played in place, with the browser's own controls. */
    video?: boolean;
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

<!-- literal: 240px, 48px -->
<figure
  data-thumb={size === "thumb" || undefined}
  class="group/shot m-0 w-full max-w-full data-thumb:w-(--thumb)"
  style:--cap="240px"
  style:--thumb="48px"
>
  {#if video && failed !== src}
    <div class="relative flex items-center justify-start w-full h-(--cap) p-0 border border-border-hairline rounded-sm overflow-hidden bg-transparent text-ink-muted group-data-thumb/shot:w-(--thumb) group-data-thumb/shot:h-(--thumb)">
      <!-- biome-ignore lint/a11y/useMediaCaption: an agent's screen recording carries no caption track -->
      <video
        aria-label={alt}
        class="block max-w-full max-h-(--cap) h-full object-contain"
        controls
        onerror={() => {
          failed = src;
        }}
        playsinline
        preload="metadata"
        {src}
      ></video>
    </div>
  {:else if failed === src}
    <div class="relative flex flex-col items-start justify-center w-full h-(--cap) p-space-3 border border-border-hairline rounded-sm overflow-hidden bg-surface-recess text-ink-muted text-size-meta font-normal group-data-thumb/shot:w-(--thumb) group-data-thumb/shot:h-(--thumb)">
      <span>{video ? "Video" : "Image"} not available</span>
      {#if path}
        <span data-slot="path" class="font-mono wrap-anywhere">{path}</span>
      {/if}
    </div>
  {:else}
    <button
      aria-label={`Open ${alt}`}
      class="relative flex items-center justify-start w-full h-(--cap) p-0 border border-border-hairline rounded-sm overflow-hidden bg-transparent text-ink-muted group-data-thumb/shot:w-(--thumb) group-data-thumb/shot:h-(--thumb) cursor-pointer"
      onclick={open}
      type="button"
    >
      <span
        data-sized={intrinsic !== null || undefined}
        class="group/frame relative flex items-center w-full h-full rounded-sm data-sized:w-(--frame-w) data-sized:h-auto data-sized:aspect-(--frame-ratio)"
        style:--frame-ratio="var(--w) / var(--h)"
        style:--frame-w="min(100%, calc(var(--w) * 1px), calc(var(--cap) * var(--w) / var(--h)))"
        style:--h={intrinsic?.height}
        style:--w={intrinsic?.width}
      >
        {#if loaded !== src}
          <span
            aria-hidden="true"
            class="kit-skeleton absolute inset-0 rounded-sm"
          ></span>
        {/if}
        <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: image load/error lifecycle events; the containing button owns interaction. -->
        <img
          {alt}
          data-cached={cached || undefined}
          data-loaded={loaded === src || undefined}
          class="block max-w-full max-h-(--cap) object-contain opacity-0 data-loaded:opacity-100 not-data-cached:transition-[opacity] not-data-cached:dur-control not-data-cached:ease-out group-data-thumb/shot:w-full group-data-thumb/shot:h-full group-data-thumb/shot:object-cover group-data-sized/frame:w-full group-data-sized/frame:h-full"
          data-caption={caption}
          data-path={path}
          data-shot={size}
          decoding="async"
          height={intrinsic?.height}
          loading="lazy"
          onerror={() => {
            failed = src;
          }}
          onload={() => {
            loaded = src;
          }}
          {src}
          width={intrinsic?.width}
          bind:this={image}
          {@attach mounted}
          {@attach sized}
        />
      </span>
    </button>
  {/if}
  {#if caption || path}
    <figcaption class="flex flex-col gap-space-1 mt-space-2 text-size-meta font-normal text-ink-muted">
      {#if caption}
        <span>{caption}</span>
      {/if}
      {#if path}
        <span data-slot="path" class="font-mono wrap-anywhere">{path}</span>
      {/if}
    </figcaption>
  {/if}
</figure>
