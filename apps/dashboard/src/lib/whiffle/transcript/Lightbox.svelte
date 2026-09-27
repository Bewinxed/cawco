<script lang="ts">
  import { onDestroy } from "svelte";
  import { IconClose } from "$lib/icons";
  import { lightbox } from "./lightbox-state.svelte";

  // biome-ignore lint/suspicious/noUnassignedVariables: assigned by Svelte bind:this before effects run.
  let dialog: HTMLDialogElement;
  onDestroy(lightbox.close);

  $effect(() => {
    if (lightbox.current) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  });
</script>

<!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: native dialog backdrop click; content has its own close button. -->
<!-- biome-ignore lint/a11y/useKeyWithClickEvents: native dialog handles Escape. -->
<dialog
  aria-label="Image preview"
  onclick={(event) => { if (event.target === dialog) { lightbox.close(); } }}
  onclose={() => lightbox.close()}
  bind:this={dialog}
>
  {#if lightbox.current}
    {@const shot = lightbox.current}
    <div class="content">
      <img alt={shot.alt} src={shot.src}>
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
        <button
          aria-label="Close image"
          onclick={() => lightbox.close()}
          type="button"
        >
          <IconClose />
        </button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    margin: auto;
    max-width: 96vw;
    max-height: 96dvh;
    padding: var(--space-2);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    color: var(--ink-muted);
  }
  dialog::backdrop {
    background: var(--scrim);
  }
  img {
    display: block;
    max-width: 92vw;
    max-height: 86vh;
    object-fit: contain;
    margin-inline: auto;
  }
  dialog[open],
  dialog[open] img {
    animation: enter calc(var(--dur-control) * 2) var(--ease-out);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding-top: var(--space-2);
    font-size: var(--text-meta);
  }
  .description {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
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
    min-width: 44px;
    min-height: 44px;
    padding: var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  button :global(svg) {
    width: 16px;
    height: 16px;
  }
  @keyframes enter {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
