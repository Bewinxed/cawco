<!--
  The page (the root): Caw, the title, the count picked, every
  decision and piece of media the program puts on it, and Send. The
  kit's hero, meter and footer (page.css `.dp-hero`, `.dp-meter`, `.dp-done`).

  The count and Send's label ("Send 3 picks": what goes) change in place
  through MorphText (DESIGN.md, The Steady Swap Rule), the count's digit
  rolling. ⌘/Ctrl+Enter sends from anywhere on the page. The page's one
  polite live region says what a card's pick and Continue did
  (Decision.svelte), the count with Continue.
-->
<script lang="ts">
  import { pickOf, readProgram } from "@cawco/core/decisions";
  import type { ElementNode } from "@openuidev/lang-core";
  import { setContext } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import cawDark from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-ready.webp";
  import cawLight from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-ready.webp";
  import MorphText from "../../../components/ui/morph-text/morph-text.svelte";
  import { CURVE, dur, motionOk } from "../../motion/curves.svelte";
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
  /** The bar's share filled, in percent. */
  const share = $derived(ids.length ? (100 * count) / ids.length : 0);
  /**
   * The bar's fill: one move with the count, so its width runs on the
   * count's clock (MorphText's: --dur-morph on ease-out, started at the
   * frame's own time as its letters are), from the width it is drawn at,
   * so a change caught mid-way turns from there (L489). With less motion
   * it lands at once (L517: a bar is travel, not a fade).
   */
  const fill: Attachment<HTMLElement> = (node) => {
    let run: Animation | undefined;
    let first = true;
    $effect(() => {
      const to = `${share}%`;
      if (first) {
        first = false;
        node.style.inlineSize = to;
        return;
      }
      const from = `${node.getBoundingClientRect().width}px`;
      run?.cancel();
      node.style.inlineSize = to;
      if (!motionOk.current) {
        return;
      }
      run = node.animate([{ inlineSize: from }, { inlineSize: to }], {
        duration: dur("--dur-morph"),
        easing: CURVE.out,
      });
      run.startTime = document.timeline.currentTime;
    });
  };
  /** Send's label: what goes. */
  const sendLabel = $derived(
    count === 0
      ? "Send picks"
      : `Send ${count} ${count === 1 ? "pick" : "picks"}`
  );
  let sent = $state("");
  let sending = $state(false);
  /** What the page's live region says now. */
  let said = $state("");
  setContext("decision-page", {
    say: (words: string) => {
      said = words;
    },
    tally: () => `${count} of ${ids.length} picked`,
  });

  /** ⌘/Ctrl+Enter sends, wherever focus is on the page. */
  function sendKey(event: KeyboardEvent) {
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.defaultPrevented
    ) {
      event.preventDefault();
      send();
    }
  }

  async function send() {
    const cawco = bridge();
    if (!cawco || sending) {
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

<svelte:window onkeydown={sendKey} />

<main class="dp">
  <header class="dp-hero">
    <span class="caw">
      <img alt="Caw" class="caw-light" height="72" src={cawLight} width="72" />
      <img alt="" class="caw-dark" height="72" src={cawDark} width="72" />
    </span>
    <div>
      <h1>{String(props.title ?? "")}</h1>
    </div>
    <div class="dp-meter">
      <span
        ><b><MorphText text={String(count)} /></b> of
        <span>{ids.length}</span> picked</span
      >
      <span class="dp-bar"><i {@attach fill}></i></span>
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
      aria-keyshortcuts="Meta+Enter Control+Enter"
      class="dp-send"
      disabled={sending || !bridge()}
      onclick={send}
      type="button"><MorphText text={sendLabel} /></button
    >
  </footer>
  <p aria-live="polite" class="dp-said">{said}</p>
</main>

<style>
  /* The page's scroller moves only where a fold rides it (Decision.svelte,
     motion/scroll-on): the browser's scroll anchoring would jump it as a
     card folds above the reader's view (the transcript's precedent). */
  /* css-scope: the decision page's own document root is its scroller; this component is the page */
  :global(:root) {
    overflow-anchor: none;
  }
  /* The bar's fill moves on the count's clock (`fill`), not on the kit's
     own transition, which a page without the host keeps. */
  .dp-bar i {
    transition: none;
  }
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
