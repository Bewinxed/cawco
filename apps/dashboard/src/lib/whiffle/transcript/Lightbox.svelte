<script lang="ts">
  /**
   * One image, large. It opens out of the thumbnail that was clicked: the
   * picture flies from the thumbnail's box to its own (motion/share.svelte.ts,
   * --dur-panel on --ease-drawer) while the scrim and the frame around it
   * fade in. Closing sends it back: the picture shrinks into the thumbnail
   * it came from over --dur-exit on --ease-out as the scrim and frame fade
   * out, and the dialog closes when it has landed. A thumbnail that has gone
   * (its row scrolled out of the list) has nowhere to return to, and the
   * whole dialog fades out instead.
   */
  import { onDestroy } from "svelte";
  import { IconClose } from "$lib/icons";
  import { dur, ease, motionOk } from "../motion/curves.svelte";
  import { land } from "../motion/share.svelte";
  import { lightbox } from "./lightbox-state.svelte";

  // biome-ignore lint/suspicious/noUnassignedVariables: assigned by Svelte bind:this before effects run.
  let dialog: HTMLDialogElement;
  let image = $state<HTMLImageElement>();
  let leaving = $state(false);
  onDestroy(lightbox.close);

  $effect(() => {
    if (lightbox.current) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  });

  /** The thumbnail this picture opened from, where it is drawn now. */
  function thumbnail(key: string | undefined): HTMLElement | null {
    const source = key
      ? document.querySelector<HTMLElement>(`[data-share="${CSS.escape(key)}"]`)
      : null;
    if (!source) {
      return null;
    }
    const { bottom, top, width } = source.getBoundingClientRect();
    return width > 0 && bottom > 0 && top < innerHeight ? source : null;
  }

  /**
   * The picture shrinking back onto the thumbnail's box. The thumbnail may
   * crop (a square of a wide picture): the picture is scaled to cover that
   * box and clipped to it, so it lands on exactly what the thumbnail shows.
   */
  function returnInto(node: HTMLElement, source: HTMLElement): Animation {
    const from = node.getBoundingClientRect();
    const to = source.getBoundingClientRect();
    const scale = Math.max(to.width / from.width, to.height / from.height);
    const spareX = (from.width * scale - to.width) / 2;
    const spareY = (from.height * scale - to.height) / 2;
    const radius = Number.parseFloat(getComputedStyle(source).borderRadius);
    source.style.visibility = "hidden";
    return node.animate(
      [
        {
          transformOrigin: "0 0",
          transform: "none",
          clipPath: "inset(0px 0px 0px 0px round 0px)",
        },
        {
          transformOrigin: "0 0",
          transform: `translate(${to.left - spareX - from.left}px, ${to.top - spareY - from.top}px) scale(${scale})`,
          clipPath: `inset(${spareY / scale}px ${spareX / scale}px round ${radius / scale}px)`,
        },
      ],
      {
        duration: dur("--dur-exit"),
        easing: ease("--ease-out"),
        fill: "forwards",
      }
    );
  }

  function dismiss(): void {
    const shot = lightbox.current;
    if (leaving || !shot) {
      return;
    }
    if (!motionOk.current) {
      lightbox.close();
      return;
    }
    leaving = true;
    const source = thumbnail(shot.share);
    const exit =
      source && image
        ? returnInto(image, source)
        : dialog.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: dur("--dur-exit"),
            easing: ease("--ease-out"),
            fill: "forwards",
          });
    exit.finished.then(() => {
      lightbox.close();
      leaving = false;
      if (source) {
        source.style.visibility = "";
      }
      exit.cancel();
    });
  }
</script>

<!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: native dialog backdrop click; content has its own close button. -->
<!-- biome-ignore lint/a11y/useKeyWithClickEvents: native dialog handles Escape. -->
<dialog
  aria-label="Image preview"
  oncancel={(event) => { event.preventDefault(); dismiss(); }}
  onclick={(event) => { if (event.target === dialog) { dismiss(); } }}
  onclose={() => lightbox.close()}
  bind:this={dialog}
  class:leaving
>
  {#if lightbox.current}
    {@const shot = lightbox.current}
    <div class="content">
      <img
        alt={shot.alt}
        src={shot.src}
        bind:this={image}
        {@attach land(() => shot.share)}
      >
      <div class="bar">
        <div class="description">
          {#if shot.caption}
            <span>{shot.caption}</span>
          {/if}
          {#if shot.path}
            <span class="path">{shot.path}</span>
          {/if}
        </div>
        <!-- A base64 image has no page to open: Chrome refuses top-level
             data: navigation, so it is offered as a file instead. -->
        {#if shot.src.startsWith('data:')}
          <a download={shot.path?.split('/').pop() ?? shot.alt} href={shot.src}
            >Save original</a
          >
        {:else}
          <a href={shot.src} rel="noreferrer" target="_blank">Open original</a>
        {/if}
        <button aria-label="Close image" onclick={dismiss} type="button">
          <IconClose />
        </button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  /* The dialog itself draws nothing: the frame is `.content`'s own layer,
     so it can fade while the picture travels, and the picture may travel
     outside the dialog's box on its way to and from its thumbnail. */
  dialog {
    margin: auto;
    max-inline-size: 96vw;
    max-block-size: 96dvh;
    padding: 0;
    border: 0;
    overflow: visible;
    background: transparent;
    color: var(--ink-muted);
  }
  dialog::backdrop {
    background: var(--scrim);
  }
  .content {
    position: relative;
    isolation: isolate;
    padding: var(--space-2);

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      background: var(--surface-recess);
    }
  }
  /* Scrim and frame come in with the picture's flight and go with its
     return; opacity only, so they run with or without motion. */
  dialog[open]::backdrop,
  dialog[open] .content::before,
  dialog[open] .bar {
    animation: fade-in var(--dur-panel) var(--ease-out) both;
  }
  dialog.leaving::backdrop,
  dialog.leaving .content::before,
  dialog.leaving .bar {
    animation: fade-out var(--dur-exit) var(--ease-out) both;
  }
  img {
    display: block;
    max-inline-size: 92vw;
    max-block-size: 86vh;
    object-fit: contain;
    margin-inline: auto;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding-block-start: var(--space-2);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
  }
  .description {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  .path {
    font-family: var(--font-mono);
  }
  a {
    white-space: nowrap;
    text-decoration: underline;
  }
  button {
    display: grid;
    place-items: center;
    min-inline-size: 44px;
    min-block-size: 44px;
    padding: var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  button :global(svg) {
    inline-size: 16px;
    block-size: 16px;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  @keyframes fade-out {
    to {
      opacity: 0;
    }
  }
</style>
