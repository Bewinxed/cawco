<svelte:options css="injected" />

<script lang="ts">
  /**
   * Dialog: drawn open, in place (never a portal): its title, its body and
   * its buttons, over the screen it opens on (`over`), which is dimmed
   * under a scrim. Inert, but for a States switch inside its body.
   */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { textOf } from "./context";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    title: unknown;
    children: unknown[];
    actions?: unknown[];
    over?: unknown;
  }> = $props();
</script>

{#snippet dialog()}
  <div
    aria-label={textOf(props.title)}
    aria-modal="true"
    class="dialog"
    data-mk="Dialog"
    role="dialog"
  >
    <h2 class="title">{textOf(props.title)}</h2>
    <div class="body">{@render renderNode(props.children)}</div>
    {#if Array.isArray(props.actions) && props.actions.length > 0}
      <div class="actions">{@render renderNode(props.actions)}</div>
    {/if}
  </div>
{/snippet}

{#if props.over}
  <div class="over">
    <div aria-hidden="true" class="behind" inert>
      {@render renderNode(props.over)}
    </div>
    <div class="scrim">{@render dialog()}</div>
  </div>
{:else}
  {@render dialog()}
{/if}

<style>
  .over {
    position: relative;
    display: grid;
    min-inline-size: 0;
  }
  .behind,
  .scrim {
    grid-area: 1 / 1;
  }
  .scrim {
    display: grid;
    place-items: center;
    padding: calc(var(--mk-space) * 6);
    background: color-mix(in oklch, var(--mk-ink) 32%, transparent);
  }
  .dialog {
    display: flex;
    flex-direction: column;
    gap: calc(var(--mk-space) * 4);
    inline-size: min(100%, 28rem);
    padding: calc(var(--mk-space) * 6);
    border-radius: var(--mk-radius);
    background: var(--mk-surface);
    box-shadow: var(--mk-shadow);
  }
  .title {
    margin: 0;
    font-family: var(--mk-font-display);
    font-size: calc(var(--mk-text-size) * 1.25);
    font-weight: 650;
    color: var(--mk-ink);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: calc(var(--mk-space) * 3);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: calc(var(--mk-space) * 2);
  }
</style>
