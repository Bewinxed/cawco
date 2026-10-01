<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import type PhotoSwipe from "photoswipe";
  import { type Component, mount, onDestroy, unmount } from "svelte";
  import OutputBlock from "$lib/components/features/tool-cards/OutputBlock.svelte";
  import { Button } from "$lib/components/ui/button";
  import { CopyButton } from "$lib/components/ui/copy-button";
  /**
   * What a thumbnail opens into, one entry point (lightbox-state) for both
   * kinds of attachment.
   *
   * Pictures open in PhotoSwipe (https://photoswipe.com), loaded the first
   * time one is opened: the picture zooms out of the thumbnail that was
   * clicked and back into it on close, and the pictures of one message are
   * one gallery to swipe through. Its buttons wear the house glyphs and its
   * surfaces the house tokens (styles below).
   *
   * A pasted document opens in a dialog on the same scrim. The thumb's box
   * grows into the sheet (motion/share.svelte.ts, `grow` from the header it
   * becomes) and the sheet shrinks back into the thumb as it fades on close
   * (`closeInto`), with the scrim fading under both. Markdown reads as a
   * turn does, JSON pretty-printed, anything else in the transcript's code
   * well.
   */
  import Tip from "$lib/components/ui/tooltip/tip.svelte";
  import {
    IconChevronLeft,
    IconChevronRight,
    IconClose,
    IconZoomIn,
  } from "$lib/icons";
  import { dur, ease, motionOk } from "../motion/curves.svelte";
  import { closeInto, land } from "../motion/share.svelte";
  import { extensionOf } from "./DocThumb.svelte";
  import {
    type LightboxShot,
    type LightboxView,
    lightbox,
  } from "./lightbox-state.svelte";
  import MessageBody from "./MessageBody.svelte";

  onDestroy(lightbox.close);

  // ── Pictures ────────────────────────────────────────────────────────────

  let gallery: PhotoSwipe | undefined;

  /** A glyph component's markup, for PhotoSwipe's `…SVG` button options. */
  function markup(glyph: Component): string {
    const host = document.createElement("div");
    const drawn = mount(glyph, { target: host });
    const html = host.innerHTML;
    unmount(drawn);
    return html;
  }

  /** The caption, path and original under the picture on screen. */
  function describe(bar: HTMLElement, shot: LightboxShot): void {
    const lines = document.createElement("div");
    lines.className = "lines";
    for (const [text, kind] of [
      [shot.caption, "caption"],
      [shot.path, "path"],
    ] as const) {
      if (text) {
        const line = document.createElement("span");
        line.className = kind;
        line.textContent = text;
        lines.append(line);
      }
    }
    // A base64 image has no page to open: Chrome refuses top-level data:
    // navigation, so it is offered as a file instead.
    const original = document.createElement("a");
    original.href = shot.src;
    if (shot.src.startsWith("data:")) {
      original.download = shot.path?.split("/").pop() ?? shot.alt;
      original.textContent = "Save original";
    } else {
      original.target = "_blank";
      original.rel = "noreferrer";
      original.textContent = "Open original";
    }
    bar.replaceChildren(lines, original);
  }

  async function showPictures(
    view: Extract<LightboxView, { kind: "image" }>
  ): Promise<void> {
    const [{ default: PhotoSwipeCore }] = await Promise.all([
      import("photoswipe"),
      import("photoswipe/style.css"),
    ]);
    // Closed again while PhotoSwipe was on its way.
    if (lightbox.current !== view) {
      return;
    }
    const opened = new PhotoSwipeCore({
      dataSource: view.shots.map((shot) => ({
        src: shot.src,
        msrc: shot.src,
        width: shot.width,
        height: shot.height,
        alt: shot.alt,
        element: shot.element,
        thumbCropped: shot.cropped,
      })),
      index: view.index,
      mainClass: "cawco-pswp",
      bgOpacity: 1,
      showHideAnimationType: motionOk.current ? "zoom" : "none",
      showAnimationDuration: dur("--dur-panel"),
      hideAnimationDuration: dur("--dur-exit"),
      easing: ease("--ease-drawer"),
      closeTitle: "Close image",
      closeSVG: markup(IconClose),
      arrowPrevSVG: markup(IconChevronLeft),
      arrowNextSVG: markup(IconChevronRight),
      zoomSVG: markup(IconZoomIn),
    });
    opened.on("uiRegister", () => {
      opened.ui?.registerElement({
        name: "description",
        appendTo: "root",
        onInit: (bar, pswp) => {
          pswp.on("change", () => describe(bar, view.shots[pswp.currIndex]));
        },
      });
    });
    opened.on("destroy", () => {
      gallery = undefined;
      if (lightbox.current === view) {
        lightbox.close();
      }
    });
    gallery = opened;
    opened.init();
  }

  $effect(() => {
    const view = lightbox.current;
    if (view?.kind === "image") {
      showPictures(view);
    } else {
      // Closed from outside (the preview sheet's Escape): it zooms home.
      gallery?.close();
    }
  });

  // ── Documents ───────────────────────────────────────────────────────────

  const doc = $derived(
    lightbox.current?.kind === "text" ? lightbox.current : null
  );
  let sheet = $state<HTMLElement>();
  let leaving = $state(false);

  /** The JSON as its structure reads; a file that does not parse, as sent. */
  function pretty(content: string): string {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }

  /** The DocThumb this document opened from, where it is drawn now. */
  function thumb(key: string | undefined): HTMLElement | null {
    const source = key
      ? document.querySelector<HTMLElement>(`[data-share="${CSS.escape(key)}"]`)
      : null;
    if (!source) {
      return null;
    }
    const { bottom, top, width } = source.getBoundingClientRect();
    return width > 0 && bottom > 0 && top < innerHeight ? source : null;
  }

  function dismiss(): void {
    if (leaving || !doc || !sheet) {
      return;
    }
    // Back into the thumb it came from; a thumb scrolled away has nowhere to
    // return to, and the sheet fades where it is.
    const source = thumb(doc.share);
    let exit: Animation | undefined;
    if (source) {
      exit = closeInto(sheet, source, dur("--dur-exit"));
    } else if (motionOk.current) {
      exit = sheet.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: dur("--dur-exit"),
        easing: ease("--ease-out"),
        fill: "forwards",
      });
    }
    if (!exit) {
      lightbox.close();
      return;
    }
    leaving = true;
    exit.finished.then(() => {
      leaving = false;
      lightbox.close();
    });
  }
</script>

<DialogPrimitive.Root
  onOpenChange={(open) => { if (!open) { dismiss(); } }}
  open={doc !== null}
>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      class="kit-scrim fixed inset-0 isolate z-50 {leaving ? 'leaving' : ''}"
    />
    <DialogPrimitive.Content
      class="doc-view"
      onEscapeKeydown={(event) => { event.preventDefault(); dismiss(); }}
      onInteractOutside={(event) => { event.preventDefault(); dismiss(); }}
    >
      {#if doc}
        {@const extension = extensionOf(doc.name)}
        <div
          class="doc-sheet"
          bind:this={sheet}
          {@attach land(() => doc.share, {
            mode: 'grow',
            anchor: '.doc-head',
            ms: dur('--dur-panel'),
          })}
        >
          <header class="doc-head">
            <DialogPrimitive.Title class="doc-name"
              >{doc.name}</DialogPrimitive.Title
            >
            <CopyButton
              aria-label={`Copy ${doc.name}`}
              class="touch-hit"
              size="icon"
              text={doc.content}
            />
            <Tip keys="Esc" label="Close document">
              {#snippet children(tip)}
                <Button
                  {...tip}
                  aria-label="Close document"
                  class="touch-hit"
                  onclick={dismiss}
                  size="icon"
                  variant="ghost"
                >
                  <IconClose />
                </Button>
              {/snippet}
            </Tip>
          </header>
          <div class="doc-body">
            {#if extension === 'md' || extension === 'markdown'}
              <MessageBody source={doc.content} />
            {:else if extension === 'json'}
              <OutputBlock language="json" text={pretty(doc.content)} />
            {:else}
              <OutputBlock language={extension} text={doc.content} />
            {/if}
          </div>
        </div>
      {/if}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>

<style>
  /* ── The document sheet. Content is only the centring box; the sheet is
     what travels, so the flight and the return move one surface. */
  :global(.doc-view) {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    pointer-events: none;
    outline: none;
  }
  .doc-sheet {
    display: flex;
    flex-direction: column;
    inline-size: min(100%, 60rem);
    max-block-size: min(86dvh, 100%);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    color: var(--ink-strong);
    pointer-events: auto;
  }
  .doc-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding-block: var(--space-2);
    padding-inline: var(--space-4) var(--space-2);
    border-block-end: 1px solid var(--border-hairline);

    & :global(.doc-name) {
      flex: 1;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--text-label);
      font-weight: var(--weight-strong);
    }
  }
  .doc-body {
    min-block-size: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: var(--space-4);
  }
  /* The scrim leaves with the sheet, not after it. */
  :global(.kit-scrim.leaving) {
    animation: kit-fade-out var(--dur-exit) var(--ease-out) both;
  }

  /* ── PhotoSwipe, in house tokens. Its root is appended to <body>, so these
     rules are global; `.cawco-pswp` is the `mainClass` it carries. */
  :global {
    .cawco-pswp {
      --pswp-bg: var(--scrim);
      --pswp-placeholder-bg: var(--surface-recess);
      --pswp-icon-color: var(--ink-strong);
      --pswp-error-text-color: var(--ink-muted);
      color: var(--ink-strong);
    }
    .cawco-pswp .pswp__bg {
      backdrop-filter: blur(var(--scrim-blur));
    }
    .cawco-pswp .pswp__top-bar {
      gap: var(--space-2);
      padding: var(--space-2);
      block-size: auto;
    }
    .cawco-pswp .pswp__button {
      display: grid;
      place-items: center;
      inline-size: 44px;
      block-size: 44px;
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      background: var(--surface-raised);
      color: var(--ink-strong);
      opacity: 1;
      overflow: visible;

      & svg {
        inline-size: 20px;
        block-size: 20px;
      }
      &:hover {
        background: var(--surface-hover);
      }
    }
    .cawco-pswp .pswp__button--arrow {
      inline-size: 44px;
      block-size: 44px;
      margin-block-start: -22px;
    }
    .cawco-pswp .pswp__button--arrow--prev {
      inset-inline-start: var(--space-3);
    }
    .cawco-pswp .pswp__button--arrow--next {
      inset-inline-end: var(--space-3);
    }
    .cawco-pswp .pswp__counter {
      block-size: auto;
      margin-inline-start: var(--space-2);
      font-size: var(--text-meta);
      font-weight: var(--weight-body);
      font-variant-numeric: tabular-nums;
      line-height: 44px;
      color: var(--ink-muted);
      text-shadow: none;
      opacity: 1;
    }
    /* PhotoSwipe fades its own chrome with the zoom (`pswp--ui-visible`);
     the description goes with it. */
    .cawco-pswp .pswp__description {
      position: absolute;
      inset-inline: var(--space-3);
      inset-block-end: var(--space-3);
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      background: var(--surface-recess);
      color: var(--ink-muted);
      font-size: var(--text-meta);
      font-weight: var(--weight-body);
      opacity: 0;

      & .lines {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-inline-size: 0;
        overflow-wrap: anywhere;
      }
      & .path {
        font-family: var(--font-mono);
      }
      & a {
        white-space: nowrap;
        text-decoration: underline;
        color: inherit;
      }
    }
    .cawco-pswp.pswp--ui-visible .pswp__description {
      opacity: 1;
    }
    @media (prefers-reduced-motion: no-preference) {
      .cawco-pswp .pswp__description {
        transition: opacity var(--dur-control) var(--ease-out);
      }
    }
  }
</style>
