<!--
  The page (the root): Caw, the title, the count picked, every
  decision and piece of media the program puts on it, and Send picks. The
  kit's hero, meter and footer (page.css `.dp-hero`, `.dp-meter`, `.dp-done`).
-->
<script lang="ts">
  import { pickOf, readProgram } from "@cawco/core/decisions";
  import type { ElementNode } from "@openuidev/lang-core";
  import cawDark from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-ready.webp";
  import cawLight from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-ready.webp";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { bridge, picks } from "./page.svelte.js";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    title: unknown;
    children: unknown[];
  }> = $props();

  const cards = $derived(
    readProgram({
      type: "element",
      typeName: "Decisions",
      props,
      partial: false,
      hasDynamicProps: false,
    } as unknown as ElementNode).cards
  );
  const ids = $derived(cards.map((card) => card.id));
  /** Cards picked as core `pickOf` counts them, as artifact_list and the graph do. */
  const count = $derived(
    cards.filter((card) => pickOf(card, picks.now[card.id]).picked).length
  );
  let sent = $state("");
  let sending = $state(false);

  async function send() {
    const cawco = bridge();
    if (!cawco) {
      return;
    }
    sending = true;
    try {
      await cawco.send();
      sent = "Sent. Change anything and send again.";
    } catch (error) {
      console.error("[decision-page] send failed:", error);
    } finally {
      sending = false;
    }
  }
</script>

<main class="dp">
  <header class="dp-hero">
    <span class="caw">
      <img alt="Caw" class="caw-light" height="72" src={cawLight} width="72" />
      <img alt="" class="caw-dark" height="72" src={cawDark} width="72" />
    </span>
    <div>
      <h1>{String(props.title ?? "")}</h1>
    </div>
    <div class="dp-meter" aria-live="polite">
      <span><b>{count}</b> of <span>{ids.length}</span> picked</span>
      <span class="dp-bar"
        ><i
          style:inline-size={`${ids.length ? (100 * count) / ids.length : 0}%`}
        ></i></span
      >
    </div>
  </header>
  {#if !bridge()}
    <p class="dp-offline">
      Picks are kept only when CawCo shows this page: publish it with
      artifact_create.
    </p>
  {/if}
  {@render renderNode(props.children)}
  <footer class="dp-done">
    <span>{sent}</span>
    <button
      class="dp-send"
      disabled={sending || !bridge()}
      onclick={send}
      type="button">Send picks</button
    >
  </footer>
</main>

<style>
  /* Caw in the host's theme (the overlay's `data-theme`), else the OS's. */
  .caw-dark {
    display: none;
  }
  :global(:root[data-theme="dark"]) .caw-light {
    display: none;
  }
  :global(:root[data-theme="dark"]) .caw-dark {
    display: inline;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme])) .caw-light {
      display: none;
    }
    :global(:root:not([data-theme])) .caw-dark {
      display: inline;
    }
  }
</style>
