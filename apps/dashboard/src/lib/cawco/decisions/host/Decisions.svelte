<!--
  The page (the root): the panel's height, in two rows. The first scrolls
  one centred column on the recessed ground (DESIGN.md, The Frame Recesses
  Rule), 21px in at a desk and 14px under a finger, its groups 18px apart
  (Layout: "the groups of a page … stand 18px apart"): the room's width up
  to `--c-decision-page-max` (three option columns at the label measure),
  so the cards grow with the window; or on a
  pictured page (media that knows its own width: a Preview's `width`, a
  drawing, a picture, a diagram) as wide as the most options abreast its
  room holds with each at 1:1, never under that cap, or the room's whole
  width where none fits. A page holding a Preview of a page-sized design
  that names no width (a whole screen that lays itself out to its frame,
  its well's `data-fills`) stands at the room's whole width, its foot's
  edges with it, so that design grows with the window (the owner, of a
  live timeline in a 1348px column on his 2529px window: "it's not
  growing"); its words keep their reading measure (`max-w-c-measure` on a
  card's question, its advice and its options' words). Its head is
  the page head: Caw as the title's mark (The Mark Line Rule) and the title.
  Then the offline notice when CawCo does not show the page, and every
  decision and piece of media the program puts on it. The second row is the
  foot, the panel's full width, "never a scroll away" and never over a
  card, clear of a host's docked composer (the page's bottom padding) and
  the screen's bottom inset: the count picked and its bar at the column's
  start, Send at its end. It is a bar (DESIGN.md, The Title Bars Follow
  Liquid Glass Rule: "A bar draws no fill, hairline or shadow of its own",
  Send on a page of picks its one prominent action), so it stands on the
  page's recessed ground with no ground of its own, and the cards part from
  it by the scroll edge effect: they fade out at its edge while more of
  them stands below (the house edge fade, `kit-edge-fade-block`), sharp at
  rest at the page's end.

  Send is spent ("Sent", its check) while the hub's record says the person
  sent and has written nothing since (core `unsentChoices` over the doc's
  `meta.sentAt`, which the bridge's "sent" tells), so a reload keeps it.

  The count and Send's label ("Send 3 picks": what goes) change in place
  through MorphText (DESIGN.md, The Steady Swap Rule), the count's digit
  rolling. ⌘/Ctrl+Enter sends from anywhere on the page; Send wears the keys
  on its keycaps. Sending, Send runs the kit's pending: its label stays, the
  spinner stands over its start and a check holds once the hub has it
  (Buttons, Pending). The page's one polite live region says what a card's
  pick did (Decision.svelte). Send is the page's one coral action: a card
  has no Continue (the owner: "The done and continue are useless buttons
  that break the flow of how this form should work"), and it is the page's
  only Send, the panel's head and Needs you standing none for a decision
  page (his pick, "Only the page's own Send").
-->
<script lang="ts">
  import { unsentChoices } from "@cawco/core/choices";
  import { pickMade, readProgram } from "@cawco/core/decisions";
  import type { ElementNode } from "@openuidev/lang-core";
  import { setContext } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { MediaQuery } from "svelte/reactivity";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent from "#lib/components/ui/button/pending-content.svelte";
  import { Kbd, KbdGroup } from "#lib/components/ui/kbd/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconSend, IconTick, IconWarningTriangle } from "#lib/icons.js";
  import cawDark from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-ready.webp";
  import cawLight from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-ready.webp";
  import { frameObserver } from "../../frame-observer.js";
  import { CURVE, dur, motionOk } from "../../motion/curves.svelte";
  import { morph } from "../../motion/morph.svelte";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import {
    bridge,
    hearWidths,
    MEDIA_WIDTHS,
    picks,
    sent,
  } from "./page.svelte.js";
  import { scheme } from "./scheme.svelte.js";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    title: unknown;
    children: unknown[];
  }> = $props();

  const program = $derived(
    readProgram({
      type: "element",
      typeName: "Decisions",
      props,
      partial: false,
      hasDynamicProps: false,
    } as unknown as ElementNode)
  );
  const cards = $derived(program.cards);
  /**
   * The widest piece of media on the page at its real size, px, as its well
   * says it (Well.svelte `picture`, through its card); 0 on a page with no
   * pictures, whose column is the room up to `--c-decision-page-max`.
   */
  const widths = hearWidths();
  setContext(MEDIA_WIDTHS, widths.hear);
  const storyWidth = $derived(widths.widest());
  let scroller = $state<HTMLDivElement>();
  /**
   * A pictured page's column: as many options abreast as its room holds,
   * each its picture at 1:1 in its well (`--well-in` each side, `--space-3`
   * between them), inside the card's and the page's insets; the largest
   * such step that fits, never under `--c-decision-page-max`; the room's
   * whole width where not one fits, so a picture wider than the room shows
   * as much of itself as it can, scrolling sideways in its well. Read from the
   * scroller's own room (its gutter kept, so a scrollbar coming never moves
   * it), as it mounts and as the panel resizes.
   */
  let pageWidth = $state<number | null>(null);
  $effect(() => {
    const box = scroller;
    const story = storyWidth;
    if (!(box && story > 0)) {
      pageWidth = null;
      return;
    }
    const read = () => {
      const style = getComputedStyle(box);
      const px = (name: string) =>
        Number.parseFloat(style.getPropertyValue(name)) || 0;
      const gap = px("--space-3");
      const pitch = story + 2 * px("--well-in");
      const insets = 2 * (px("--page-in") + px("--card-in"));
      const abreast = Math.floor(
        (box.clientWidth - insets + gap) / (pitch + gap)
      );
      const step =
        abreast > 0 ? abreast * (pitch + gap) - gap + insets : box.clientWidth;
      pageWidth = Math.max(px("--c-decision-page-max"), step);
    };
    read();
    const sizes = frameObserver(read);
    sizes.observe(box);
    return () => sizes.disconnect();
  });
  /**
   * The scroller's room, px: the window's width less a scrollbar's gutter
   * (none under the phone's line, so a story as wide as the screen stands
   * whole), what a well on a phone reaches across (design.css `well-bleed`). The
   * window's own width (`100vi`) counts the gutter, so a well bled to it
   * stood a scrollbar's width past the page and scrolled it sideways.
   */
  let pageRoom = $state<number | null>(null);
  $effect(() => {
    const box = scroller;
    if (!box) {
      return;
    }
    const read = () => {
      pageRoom = box.clientWidth;
    };
    read();
    const sizes = frameObserver(read);
    sizes.observe(box);
    return () => sizes.disconnect();
  });
  const ids = $derived(cards.map((card) => card.id));
  /** Cards picked as core `pickMade` counts them, as artifact_list, artifact_read and the graph do. */
  const count = $derived(
    cards.filter((card) => pickMade(card, picks.now[card.id])).length
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
  let sending = $state(false);
  /** The hub's record says the person sent, and has written nothing since (core `unsentChoices`, as artifact_read reads it): Send is spent, across reloads. */
  const spent = $derived(
    sent.at !== null && unsentChoices(picks.now, sent.at) === 0
  );
  /** Send's label: what goes, or that it went (morphing through the same MorphText as its count). */
  const sendLabel = $derived.by(() => {
    if (spent) {
      return "Sent";
    }
    return count === 0
      ? "Send picks"
      : `Send ${count} ${count === 1 ? "pick" : "picks"}`;
  });
  /** What the page's live region says now. */
  let said = $state("");
  setContext("decision-page", {
    say: (words: string) => {
      said = words;
    },
  });

  /** Under a finger: Send is the large button (DESIGN.md, The 44 Touch Rule). */
  const coarse = new MediaQuery("pointer: coarse");
  /** The send key's modifier as this keyboard names it. */
  const modifier =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/u.test(navigator.platform)
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
      send("page-key");
    }
  }

  async function send(control: "page-send" | "page-key") {
    const cawco = bridge();
    if (!cawco || sending) {
      return;
    }
    sending = true;
    try {
      await cawco.send(undefined, control);
    } catch (error) {
      console.error("[decision-page] send failed:", error);
    } finally {
      sending = false;
    }
  }
</script>

<svelte:window onkeydown={sendKey} />

<!-- The page is the panel's height: its cards scroll in the first row and the foot stands in the second, the panel's full width, its parts on the column's edges, so the foot never stands over a card. A host's docked composer is the page's own bottom padding (its inset). The column and the foot's row stand at one width (`--column-w`, design.css `decision-page-insets`) and the scroller and the foot keep the same gutter for a scrollbar, so the column and the foot's parts share their edges. The column clips sideways (`overflow-x-clip`, which no script can scroll), so the scroller has nothing to scroll sideways: a frame wider than its well for the frame before its well clips it (a window narrowed), with anything scrolled into view meanwhile, scrolled the column off the foot's edges, the foot standing outside the scroller; under the phone's line neither keeps one and its bar is drawn by nothing (`no-scrollbar`), as a phone draws none in the page's room: a window's scrollbar took 20px of it, so a 390 story stood in a 370 well and lost its last 20px. -->
<main
  class="group/page decision-page-insets grid h-dvh min-w-0 grid-rows-page-foot pb-(--page-inset-bottom)"
  data-pictured={storyWidth > 0 ? "" : undefined}
  data-slot="decision-page"
  style:--page-w={pageWidth === null ? undefined : `${pageWidth}px`}
  style:--page-room={pageRoom === null ? undefined : `${pageRoom}px`}
>
  <div
    bind:this={scroller}
    class="kit-edge-fade-block min-h-0 overflow-y-auto overscroll-y-contain scrollbar-gutter-stable max-phone:no-scrollbar"
    data-slot="page-scroll"
  >
    <div
      class="mx-auto flex w-full min-w-0 max-w-(--column-w) flex-col gap-space-5 overflow-x-clip px-(--page-in) pt-(--page-in) pb-space-5"
      data-slot="page-column"
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
            Picks are kept only when CawCo shows this page: publish it with <code
              class="text-size-meta wrap-anywhere">artifact_create</code
            >.
          </AlertDescription>
        </Alert>
      {/if}
      {@render renderNode(props.children)}
    </div>
  </div>
  <!-- Its words and Send on one row at a desk; under a finger the count's bar gives way first, then Send wraps under the count. -->
  <footer
    {@attach morph()}
    class="min-w-0 overflow-hidden pt-space-3 pb-safe-space-3 scrollbar-gutter-stable max-phone:no-scrollbar"
    data-safe-bottom
    data-slot="page-foot"
  >
    <div
      class="mx-auto flex w-full min-w-0 max-w-(--column-w) flex-wrap items-center justify-between gap-space-3 px-(--page-in)"
    >
      <p
        class="mark-line type-meta num flex min-w-0 grow items-center gap-space-3 text-ink-muted"
        data-slot="meter"
      >
        <span class="shrink-0"
          ><MorphText text={String(count)} /> of {ids.length} picked</span
        >
        <span
          class="h-space-1 w-0 max-w-c-decision-meter-w grow overflow-hidden rounded-xs bg-surface-recess-deep"
          data-box
          data-slot="meter-bar"
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
        onclick={() => send("page-send")}
        pending={sending}
        size={coarse.current ? "lg" : "default"}
        ><PendingContent
          icon={spent ? IconTick : IconSend}
          label={sendLabel}
          pending={sending}
        />{#if !spent}<KbdGroup aria-hidden="true" data-box
            ><Kbd reach="keyboard">{modifier}</Kbd><Kbd reach="keyboard">↵</Kbd
            ></KbdGroup
          >{/if}</Button
      >
    </div>
  </footer>
  <p aria-live="polite" class="sr-only" data-slot="page-said">{said}</p>
</main>
