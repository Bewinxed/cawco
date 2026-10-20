<!--
  The page (the root): one centred column on the recessed ground (DESIGN.md,
  The Frame Recesses Rule), 21px in at a desk and 14px under a finger, its
  groups 18px apart (Layout: "the groups of a page … stand 18px apart"). Its
  head is the page head: Caw as the title's mark (The Mark Line Rule) and the
  title. Then the offline notice when CawCo does not show the page, every
  decision and piece of media the program puts on it, and the foot: a band
  of the panel material standing at the window's foot (sticky, as the update
  notice's footer is "never a scroll away"), clear of a host's docked
  composer and the screen's bottom inset, with the count picked and its bar
  at its start and Send at its end.

  The count and Send's label ("Send 3 picks": what goes) change in place
  through MorphText (DESIGN.md, The Steady Swap Rule), the count's digit
  rolling. ⌘/Ctrl+Enter sends from anywhere on the page; Send wears the keys
  on its keycaps. Sending, Send runs the kit's pending: its label stays, the
  spinner stands over its start and a check holds once the hub has it
  (Buttons, Pending). The page's one polite live region says what a card's
  pick and Continue did (Decision.svelte), the count with Continue.

  At any moment one coral action shows, the next act (the owner's ruling
  on primary and secondary): while any card stands open Send is the kit's
  outline button, and the open card the person is working in has its
  Continue coral (Decision.svelte); once the last open card is decided Send
  turns coral where it stands. Change takes it back the same way.
-->
<script lang="ts">
  import { pickOf, readProgram } from "@cawco/core/decisions";
  import type { ElementNode } from "@openuidev/lang-core";
  import { setContext } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { MediaQuery, SvelteSet } from "svelte/reactivity";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent from "#lib/components/ui/button/pending-content.svelte";
  import { Kbd, KbdGroup } from "#lib/components/ui/kbd/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconWarningTriangle } from "#lib/icons.js";
  import cawDark from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-ready.webp";
  import cawLight from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-ready.webp";
  import { frameObserver } from "../../frame-observer.js";
  import { CURVE, dur, motionOk } from "../../motion/curves.svelte";
  import { morph } from "../../motion/morph.svelte";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { bridge, picks } from "./page.svelte.js";
  import { scheme } from "./scheme.svelte.js";

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
  /** The bar's share filled, 0 to 1. */
  const share = $derived(ids.length ? count / ids.length : 0);
  /**
   * The bar's fill, a scale along its track (the compositor's: Vercel's Web
   * Interface Guidelines, "prioritize GPU-accelerated properties"): one move
   * with the count, on the count's clock (MorphText's: --dur-morph on
   * ease-out, started at the frame's own time as its letters are), from
   * where it is drawn, so a change caught mid-way turns from there (L489).
   * With less motion it lands at once (L517: a bar is travel, not a fade).
   */
  const fill: Attachment<HTMLElement> = (node) => {
    let run: Animation | undefined;
    let first = true;
    $effect(() => {
      const to = `${share} 1`;
      if (first) {
        first = false;
        node.style.scale = to;
        return;
      }
      const from = getComputedStyle(node).scale;
      run?.cancel();
      node.style.scale = to;
      if (!motionOk.current) {
        return;
      }
      run = node.animate([{ scale: from }, { scale: to }], {
        duration: dur("--dur-morph"),
        easing: CURVE.out,
      });
      run.startTime = document.timeline.currentTime;
    });
  };
  /**
   * How much of the window's foot the page's foot stands over (its height,
   * over the docked composer's inset), as the page's own scroll padding: the
   * browser's focus scrolling and a scroll into view stop above it, never
   * under it (WCAG 2.4.11, Focus Not Obscured), as a sticky footer's
   * scroller keeps its room (visible-viewport.svelte.ts `aboveKeyboard`).
   * Read now, and a change in the next frame (frameObserver).
   */
  const footRoom: Attachment<HTMLElement> = (node) => {
    const root = document.documentElement;
    const read = () => {
      root.style.scrollPaddingBlockEnd = `calc(var(--page-inset-bottom) + ${node.offsetHeight}px)`;
    };
    read();
    const sizes = frameObserver(read);
    sizes.observe(node);
    return () => {
      sizes.disconnect();
      root.style.scrollPaddingBlockEnd = "";
    };
  };
  /** Send's label: what goes. */
  const sendLabel = $derived(
    count === 0
      ? "Send picks"
      : `Send ${count} ${count === 1 ? "pick" : "picks"}`
  );
  let sending = $state(false);
  /** What the page's live region says now. */
  let said = $state("");
  /** The cards standing open, by id: any one keeps Send quiet. */
  const opened = new SvelteSet<string>();
  /** The card the person is working in: its Continue is the coral one. */
  let working = $state("");
  setContext("decision-page", {
    say: (words: string) => {
      said = words;
    },
    tally: () => `${count} of ${ids.length} picked`,
    stand: (card: string, open: boolean) => {
      if (open) {
        opened.add(card);
      } else {
        opened.delete(card);
      }
    },
    work: (card: string) => {
      working = card;
    },
    working: () => working,
  });

  /** Under a finger: Send is the large button (DESIGN.md, The 44 Touch Rule). */
  const coarse = new MediaQuery("pointer: coarse");
  /** The send key's modifier as this keyboard names it. */
  const modifier =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform)
      ? "⌘"
      : "Ctrl";

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
    } catch (error) {
      console.error("[decision-page] send failed:", error);
    } finally {
      sending = false;
    }
  }
</script>

<svelte:window onkeydown={sendKey} />

<main
  class="mx-auto flex w-full min-w-0 max-w-c-decision-page-w flex-col gap-space-5 px-space-6 pt-space-6 pb-(--page-inset-bottom) coarse:px-space-4 coarse:pt-space-4"
  data-slot="decision-page"
>
  <header
    class="mark-line type-title flex min-w-0 items-start gap-space-3 py-space-2"
    data-slot="page-head"
  >
    <span class="mark-cell">
      <img
        alt="Caw"
        height="40"
        src={scheme.now === "dark" ? cawDark : cawLight}
        width="40"
      />
    </span>
    <h1
      class="type-title mark-text min-w-0 text-balance text-ink-strong wrap-anywhere"
    >
      {String(props.title ?? "")}
    </h1>
  </header>
  {#if !bridge()}
    <Alert variant="warning">
      <IconWarningTriangle />
      <AlertDescription>
        Picks are kept only when CawCo shows this page: publish it with
        artifact_create.
      </AlertDescription>
    </Alert>
  {/if}
  {@render renderNode(props.children)}
  <footer
    {@attach morph()}
    {@attach footRoom}
    class="sticky bottom-(--page-inset-bottom) z-(--layer-sticky) -mx-space-6 flex flex-wrap items-center justify-between gap-space-3 border-t border-border-hairline bg-material-panel px-space-6 pt-space-3 pb-safe-space-3 glass-backdrop coarse:-mx-space-4 coarse:px-space-4 reduced-transparency:bg-surface-raised reduced-transparency:backdrop-filter-none"
    data-safe-bottom
    data-slot="page-foot"
  >
    <p
      class="mark-line type-meta num flex items-center gap-space-3 text-ink-muted"
      data-slot="meter"
    >
      <span><MorphText text={String(count)} /> of {ids.length} picked</span>
      <span
        class="h-space-1 w-c-decision-meter-w overflow-hidden rounded-xs bg-surface-recess-deep"
        data-box
      >
        <i
          {@attach fill}
          class="block h-full w-full origin-left bg-brand-solid rtl:origin-right"
        ></i>
      </span>
    </p>
    <Button
      aria-keyshortcuts="Meta+Enter Control+Enter"
      data-send
      disabled={!bridge()}
      onclick={send}
      pending={sending}
      size={coarse.current ? "lg" : "default"}
      variant={opened.size > 0 ? "outline" : "default"}
      ><PendingContent label={sendLabel} pending={sending} /><KbdGroup
        aria-hidden="true"
        data-box
        ><Kbd reach="keyboard">{modifier}</Kbd><Kbd reach="keyboard">↵</Kbd
        ></KbdGroup
      ></Button
    >
  </footer>
  <p aria-live="polite" class="sr-only" data-slot="page-said">{said}</p>
</main>
