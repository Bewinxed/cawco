<!--
  One decision: a raised card on the page's recessed ground (DESIGN.md, The
  Frame Recesses Rule; --radius-panel, a decision page's panels; the tile
  shadow, no border; 18px in, 14px under a finger, 11px once decided). The
  card carries its id twice: `data-cawco-choice`, which the overlay's bridge
  picks on (a click on an option's `data-option` stores it, pick.ts), and
  `id="decision-<id>"`, which a pin's selector holds on to across revisions.
  Its head is its question alone while it stands open; decided, the chosen
  option itself stands at its end, then Change.

  A pick selects and waits for Continue (the owner: "follow the pattern of
  waiting for a continue press"). Its options are the kit's option group
  (ui/option-group: one tab stop, the arrows and Home/End move focus and
  never pick; a click, Space or the option's digit picks; Enter goes to the
  card's Continue and never picks). The option takes its chosen look where
  it stands, a press on another moves the pick, a press on the chosen one
  keeps it ("Kept <option>"), and a several-pick card toggles each. Once the
  card holds a pick, Continue (the primary button, ↵ on its keycap) grows
  out of its foot on the card's own height tween (motion/morph; with reduced
  motion it fades in where it stands), and leaves folded shut with the body.

  Continue, or Enter, folds the card to one line: its question, then the
  chosen option's chip itself ("Decided: <option>" its accessible name),
  then Change, and under them the note quoted with its edit mark when there
  is one. Its body (why, media, options, note, Continue) folds shut but stays
  mounted, so the overlay's marks, the media's frames and a Dials panel stay.
  The fold is this view's own: the picks the hub keeps, and artifact_read,
  are the same. Change reopens it in place, its pick standing chosen;
  Continue folds it back unchanged. A stored pick on an option a revision
  took out is no pick here (core `pickOf`, as the graph and the count read
  it): the card stands open, its kept options counted, never folded to an
  empty "Decided:". A pick that arrives (a reload, another device, a
  revision) stands decided at once.

  A pointer's Continue moves (DESIGN.md, The Stay In Context Rule): the
  body folds shut over `--dur-settle` on `--ease-crossfade` while, on that
  clock, each chosen option's chip flies whole from the options to the head
  (L485, The One Object Rule, motion/share: the source hidden while its
  copy flies), and the card's padding and the page's scroll ride the fold,
  the scroll bringing the next open card in under the decided line; focus
  goes to that card's first option once the fold lands, or to Send when none
  is left. Change opens it again the same way, from the height it is drawn
  at, each head chip closing back into its option. A pick, Continue or
  Change made from the keyboard lands in one frame, with no colour fade,
  fold, flight or scroll travel (L690: "A choice made from the keyboard … is
  instant, as every keyboard action is"). With reduced motion the body fades
  and its height lands at the end, where the scroll is placed, and the head
  chip fades in where it stands, and fades there as Change opens the card
  (L517: "flights do not fly").

  "Add a note" folds into the note's field and the field back into it on
  one clock (open over `--dur-pop`, shut over `--dur-exit`, The Fast Exit
  Rule), inside the card's height tween; its words name what the note is for
  when the program says (`note`).

  The page's one polite live region hears "Picked <option>" on a pick,
  "Kept <option>" on a press on the chosen one, and "Decided: <option>" with
  the count on Continue.

  The clock is page-length travel (the card's height and the page's scroll
  move a thousand pixels and more), so it runs on the one house curve that
  never moves a change more than an eighth in a frame (L690: "`ease-crossfade`
  … moves at most 7.2% of a change in any 1/60s at 400ms; every other house
  curve moves more than an eighth in one frame there, which reads as a
  lurch"); on the drawer over `--dur-panel` (L479) one frame carried 24% of
  the card's height (decision-pick's live trace).
-->
<script lang="ts">
  import { pickOf } from "@cawco/core/decisions";
  import { getContext, setContext, tick } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import { OptionGroup } from "#lib/components/ui/option-group/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconPen } from "#lib/icons.js";
  import { frameObserver } from "../../frame-observer.js";
  import { dur, ease, motionOk } from "../../motion/curves.svelte";
  import { fold, landFold } from "../../motion/fold.svelte";
  import { morph } from "../../motion/morph.svelte";
  import { scrollOnClock } from "../../motion/scroll-on";
  import { closeInto, departBox, land } from "../../motion/share.svelte";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { bridge, picks } from "./page.svelte.js";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    id: unknown;
    question: unknown;
    options: unknown[];
    why?: unknown;
    media?: unknown[];
    multiple?: unknown;
    note?: unknown;
  }> = $props();

  type OptionNode = {
    props?: {
      id?: unknown;
      label?: unknown;
      line?: unknown;
      cost?: unknown;
      media?: unknown[];
    };
  } | null;

  const id = $derived(String(props.id ?? ""));
  const question = $derived(String(props.question ?? ""));
  const multiple = $derived(props.multiple === true);
  const options = $derived(
    (Array.isArray(props.options) ? props.options : []).map((option) => {
      const held = (option as OptionNode)?.props;
      const optionId = String(held?.id ?? "");
      return {
        id: optionId,
        label: String(held?.label ?? optionId),
        line: !!held?.line,
        cost: !!held?.cost,
        media: Array.isArray(held?.media) && held.media.length > 0,
      };
    })
  );
  /** Each option's id in order: an option's keycap is its place. */
  const order = $derived(options.map((option) => option.id));
  setContext("decision-options", () => order);
  /** Its id: each option's parts are named under it, ids that hold across revisions. */
  setContext("decision-id", () => id);
  /**
   * The rows every option of the card stands on (the chip, its line, its
   * cost, its media): one track each that any option fills, shared across
   * the columns, so every chip, line, cost and media starts on one line.
   */
  const rows = $derived.by(() => {
    let at = 1;
    const next = (any: boolean) => {
      if (!any) {
        return 0;
      }
      at += 1;
      return at;
    };
    const line = next(options.some((option) => option.line));
    const cost = next(options.some((option) => option.cost));
    const media = next(options.some((option) => option.media));
    return { line, cost, media, span: at };
  });
  setContext("decision-rows", () => rows);

  /**
   * The widest story its options' Previews draw, px, as the program says it
   * (`Preview`'s `width`, through any Row or Column); 0 when none says one.
   * Its options then stand on that pitch (the story and its well's insets),
   * as many abreast as the column holds, each story at 1:1.
   */
  const storyWidth = $derived.by(() => {
    const widest = (value: unknown): number => {
      if (Array.isArray(value)) {
        return Math.max(0, ...value.map(widest));
      }
      if (typeof value !== "object" || value === null) {
        return 0;
      }
      const node = value as {
        props?: { children?: unknown; width?: unknown };
        typeName?: unknown;
      };
      if (node.typeName === "Preview") {
        return typeof node.props?.width === "number" ? node.props.width : 0;
      }
      return widest(node.props?.children);
    };
    return widest(
      (Array.isArray(props.options) ? props.options : []).map(
        (option) => (option as OptionNode)?.props?.media
      )
    );
  });
  let optionsGrid = $state<HTMLDivElement>();
  /**
   * Its pictured options leave one alone on their last row: that one spans
   * the row (Option.svelte), so no empty cell stands beside it, its chip,
   * words and picture still on the first column's edge as every row's are
   * (a centred last row would stand them on no column's). Read from the
   * grid's own tracks as it mounts and as it resizes (`grid-cols-fit-story`:
   * every track its stories' pitch, as many as the row holds).
   */
  let lone = $state(false);
  $effect(() => {
    const grid = optionsGrid;
    const count = options.length;
    if (!(grid && storyWidth > 0)) {
      lone = false;
      return;
    }
    const read = () => {
      const columns = getComputedStyle(grid)
        .gridTemplateColumns.split(" ")
        .filter((track) => Number.parseFloat(track) > 0).length;
      lone = columns > 1 && count > columns && count % columns === 1;
    };
    read();
    const sizes = frameObserver(read);
    sizes.observe(grid);
    return () => sizes.disconnect();
  });

  /** The pieces drawn in a well (Well.svelte), by the library's names for them. */
  const WELLS = new Set(["Image", "Diagram", "Canvas", "Preview", "Dials"]);
  /** The card's media are two pictures: they may share the body's width. */
  const pictures = $derived(
    Array.isArray(props.media) &&
      props.media.length === 2 &&
      props.media.every((node) =>
        WELLS.has((node as { typeName?: unknown } | null)?.typeName as string)
      )
  );

  /**
   * The stored pick as core `pickOf` reads it, as the graph and the count
   * do: an option a revision took out is no pick on this card.
   */
  const pick = $derived(pickOf({ options }, picks.now[id]));
  /** The options picked that the card still offers. */
  const chosen = $derived(
    (picks.now[id]?.options ?? []).filter((one) => order.includes(one))
  );

  /** The person is picking in it, or Change reopened it: it stays open until Continue. */
  let open = $state(false);
  /**
   * A keyboard's pick, Continue or Change under way: everything it changes
   * lands in one frame, the chosen colour with no fade (`data-instant`) and
   * the card's height with no tween.
   */
  let instant = $state(false);
  /** A pointer's Continue or Change under way: what comes and goes in the head fades on its clock. */
  let moving = $state(false);
  const decided = $derived(pick.picked && !open);
  /** Under a finger: Continue is the large button (DESIGN.md, The 44 Touch Rule). */
  const coarse = new MediaQuery("pointer: coarse");
  /** The page's one polite live region and its count (Decisions.svelte). */
  const page = getContext<
    | {
        say: (words: string) => void;
        scroller: () => HTMLElement | null;
        stand: (card: string, open: boolean) => void;
        tally: () => string;
        work: (card: string) => void;
        working: () => string;
      }
    | undefined
  >("decision-page");
  // The page hears whether this card stands open (Send stays quiet while
  // any does) and when the person works in it (its Continue is then the
  // page's one coral action).
  $effect(() => {
    const card = id;
    page?.stand(card, !decided);
    return () => page?.stand(card, false);
  });
  /** The chosen options as the head shows them: each with its keycap, its place in the card. */
  const chips = $derived(
    options
      .map((option, at) => ({ ...option, keycap: at + 1 }))
      .filter((option) => chosen.includes(option.id))
  );
  const decidedLine = $derived(chips.map((chip) => chip.label).join(", "));
  /** The head's chips stand on while they close back into their options (Change). */
  let returning = $state(false);
  /** The key an option's chip travels under, between the options and the head. */
  const shareKey = (option: string) => `decision:${id}:${option}`;
  /** An option's chip in the options: what flies to the head and back. */
  const chipOf = (option: string) =>
    body?.querySelector<HTMLElement>(`[data-option="${CSS.escape(option)}"]`) ??
    null;

  let card = $state<HTMLElement>();
  let body = $state<HTMLDivElement>();

  /**
   * How the person moved this card (Continue, Change), for its next turn: a
   * pointer's moves, a key's lands at once; none, it stands.
   */
  let acted: "key" | "pointer" | null = null;

  /** Lets go of `instant` once the frame it landed in has been drawn. */
  const afterInstant = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        instant = false;
      })
    );

  // A press on an option holds the card open: its pick selects and waits
  // for Continue. Only the person's own press speaks: the overlay's other
  // writes to the page's doc (a pin re-anchored as the card opens) and a
  // pick from elsewhere say nothing. The press is armed before its pick is
  // written: the overlay writes on the click at the window, and a browser's
  // own click runs the microtasks after each listener, so the pick is drawn
  // before any listener on the card hears the click.
  let pressed = false;
  /** What the card held when the press began: a press on it keeps it. */
  let held: string[] = [];
  let seen = "";
  $effect(() => {
    const now = chosen.join("\n");
    if (pressed && now !== seen) {
      pressed = false;
      if (chips.length > 0) {
        page?.say(`Picked ${decidedLine}`);
      }
    }
    seen = now;
  });
  /** A press on an option, by a key or a pointer, about to write its pick. */
  function arm(key: boolean) {
    pressed = true;
    held = [...chosen];
    instant = key;
    open = true;
    page?.work(id);
  }
  /** The option a press on its chip or its words is for, if any. */
  const optionAt = (event: Event): string | null => {
    const at = (event.target as Element | null)?.closest(
      "[data-option], [data-option-for]"
    );
    return (
      at?.getAttribute("data-option") ??
      at?.getAttribute("data-option-for") ??
      null
    );
  };
  $effect(() => {
    const group = body;
    if (!group) {
      return;
    }
    const pointed = (event: Event) => {
      if (optionAt(event) !== null) {
        arm(false);
      }
    };
    // Space and an option's digit pick (the group presses the option); armed
    // here, in capture, before the group's own keys run.
    const keyed = (event: KeyboardEvent) => {
      const target = event.target as Element | null;
      if (
        decided ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !target?.closest("[data-option]")
      ) {
        return;
      }
      if (event.key === " " || (event.key >= "1" && event.key <= "9")) {
        arm(true);
      }
    };
    // A press that wrote no pick (a drag off the option) arms nothing past
    // its click; a task later, after the pick's own effects have run. A
    // press on the one chosen option of a one-pick card keeps it.
    const clicked = (event: Event) => {
      const option = optionAt(event);
      if (option === null) {
        return;
      }
      if (pressed && !multiple && held.length === 1 && held[0] === option) {
        const label = options.find((one) => one.id === option)?.label;
        page?.say(`Kept ${label ?? option}`);
      }
      setTimeout(() => {
        pressed = false;
      });
      if (instant) {
        afterInstant();
      }
    };
    const stood = () => page?.work(id);
    group.addEventListener("pointerdown", pointed, true);
    group.addEventListener("keydown", keyed, true);
    group.addEventListener("click", clicked, true);
    group.addEventListener("focusin", stood);
    return () => {
      group.removeEventListener("pointerdown", pointed, true);
      group.removeEventListener("keydown", keyed, true);
      group.removeEventListener("click", clicked, true);
      group.removeEventListener("focusin", stood);
    };
  });

  /** Continue: the card folds to its decided line, said with the count. */
  function proceed(by: "key" | "pointer") {
    acted = by;
    instant = by === "key";
    moving = !instant;
    if (instant) {
      afterInstant();
    }
    open = false;
    page?.say(`Decided: ${decidedLine}. ${page.tally()}`);
  }

  /** What scrolls the page's cards (Decisions.svelte's first row). */
  const pageScroller = (): HTMLElement =>
    page?.scroller() ?? document.documentElement;

  /** The page's cards in its order. */
  const cardsOnPage = () => [
    ...document.querySelectorAll<HTMLElement>("[data-cawco-choice]"),
  ];

  /** The page's other cards still open, the ones after `from` first, then the ones before it. */
  function openCardsAfter(from: HTMLElement): HTMLElement[] {
    const cards = cardsOnPage();
    const at = cards.indexOf(from);
    return [...cards.slice(at + 1), ...cards.slice(0, Math.max(at, 0))].filter(
      (one) => !one.hasAttribute("data-decided")
    );
  }

  /** Where focus goes once the card has folded: the next open card's option that holds its tab stop, else Send. */
  function nextStop(from: HTMLElement): HTMLElement | null {
    const [next] = openCardsAfter(from);
    return (
      next?.querySelector<HTMLElement>(
        '[data-option][tabindex="0"]:not(:disabled)'
      ) ?? document.querySelector<HTMLElement>("[data-send]:not(:disabled)")
    );
  }

  /**
   * Where the page's scroll lands once `node` (`from`'s body) has folded
   * shut: the next open card in view, under `from`'s decided line when it
   * comes right after it, else at the top; with none left, where it stands
   * (Send is in the page's foot, always in view).
   * Read with the body held at the fold's end, let go before anything is
   * drawn.
   */
  function landing(node: HTMLElement, gap: number, from: HTMLElement): number {
    const scroller = pageScroller();
    // The page's own scroll as it stands: the read below lays the page out
    // at its folded height, and the browser clamps the scroll to that
    // shorter page (it fell 321px on a card near the foot, the fold's
    // first frame); it is put back before anything is drawn.
    const stood = scroller.scrollTop;
    // Held as `fold` ends it: no height, the gap given back, and clipped, so
    // what it holds no longer reaches past it into the page's height.
    const was = [
      node.style.height,
      node.style.marginBottom,
      node.style.overflow,
    ];
    node.style.height = "0px";
    node.style.marginBottom = `${-gap}px`;
    node.style.overflow = "hidden";
    const origin = scroller.getBoundingClientRect().top;
    const top = (el: Element) =>
      el.getBoundingClientRect().top -
      origin +
      scroller.scrollTop -
      (Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
    const cards = cardsOnPage();
    const [next] = openCardsAfter(from);
    let to = stood;
    if (next) {
      to = top(cards.indexOf(next) === cards.indexOf(from) + 1 ? from : next);
    }
    // With none left the page stays where the reader has it: Send stands in
    // the page's foot, always in view, and only the page's own shrink moves
    // the scroll (the clamp below).
    const most = scroller.scrollHeight - scroller.clientHeight;
    [node.style.height, node.style.marginBottom, node.style.overflow] = was;
    scroller.scrollTop = stood;
    return Math.min(Math.max(0, to), Math.max(0, most));
  }

  // The card as it stands before it turns, read before the page changes:
  // its padding (a decided card is slimmer), its head's height and the
  // margin under it (the decided line may wrap to more lines than the open
  // head, or fewer; a turn under way holds the difference in that margin),
  // where the head's chosen options and Change stand in the card, and
  // whether focus was in it.
  let padFrom = "";
  let headFrom = 0;
  let headLiftFrom = 0;
  let asideFrom: { at: DOMRect; part: HTMLElement }[] = [];
  let hadFocus = false;
  let wasDecided = false;
  const headOf = (box: HTMLElement) =>
    box.querySelector("header")?.getBoundingClientRect().height ?? 0;
  /** The parts of the head that leave it as the card opens: its decided line. */
  const leavingParts = (box: HTMLElement) => [
    ...box.querySelectorAll<HTMLElement>("header [data-leaves]"),
  ];
  $effect.pre(() => {
    if (decided !== wasDecided && card) {
      padFrom = getComputedStyle(card).paddingBlockStart;
      headFrom = headOf(card);
      const head = card.querySelector("header");
      headLiftFrom = head
        ? Number.parseFloat(getComputedStyle(head).marginBottom) || 0
        : 0;
      const box = card.getBoundingClientRect();
      asideFrom = leavingParts(card).map((part) => {
        const at = part.getBoundingClientRect();
        return {
          part,
          at: new DOMRect(at.left - box.left, at.top - box.top, at.width),
        };
      });
      hadFocus = card.contains(document.activeElement);
      // A pointer's Continue: each chosen option's chip departs from the
      // options, hidden while its copy flies to the head (motion/share).
      if (decided && acted === "pointer") {
        for (const chip of chips) {
          const source = chipOf(chip.id);
          if (source) {
            departBox(shareKey(chip.id), source, false);
          }
        }
      }
    }
  });

  /**
   * Change: each head chip closes back into its option's chip on the fold's
   * clock (motion/share `closeInto`), the option's chip hidden until it
   * lands, so the screen shows one of each; then the head lets them go.
   */
  function closeBack(box: HTMLElement, ms: number, easing: string) {
    if (!returning) {
      return;
    }
    if (!motionOk.current) {
      // Flights do not fly (DESIGN.md L517): the chosen options and Change
      // fade where they stand (`data-leaving`), and go once faded.
      const fades = leavingParts(box).flatMap((part) =>
        part.getAnimations({ subtree: true })
      );
      Promise.allSettled(fades.map((fade) => fade.finished)).then(() => {
        returning = false;
      });
      return;
    }
    const flights = [
      ...box.querySelectorAll<HTMLElement>("header [data-pick]"),
    ].flatMap((chip) => {
      const target = chipOf(chip.dataset.pick ?? "");
      const flight = target ? closeInto(chip, target, ms, easing) : undefined;
      if (!(target && flight)) {
        return [];
      }
      // Hidden by opacity, not visibility: focus lands on it as it lands.
      target.style.opacity = "0";
      const show = () => {
        target.style.opacity = "";
      };
      return [flight.finished.then(show, show)];
    });
    Promise.all(flights).then(() => {
      returning = false;
    });
  }

  let first = true;
  let padRun: Animation | undefined;
  let headRun: Animation | undefined;
  let stopRide: (() => void) | undefined;

  /**
   * The head's decided line, opening: it stands out of the head's flow
   * where it was drawn while it leaves (the chips flying home, Change
   * fading), so the head takes its open height from the turn's first frame
   * and never jumps when they go. Shutting, it stands in it again.
   */
  function standAside(box: HTMLElement, opening: boolean) {
    const edge = getComputedStyle(box);
    const left = Number.parseFloat(edge.borderLeftWidth) || 0;
    const top = Number.parseFloat(edge.borderTopWidth) || 0;
    for (const { part, at } of asideFrom) {
      const placed = opening && part.isConnected;
      part.style.position = placed ? "absolute" : "";
      // Measured on the screen's axes, so placed on them (in a right-to-left
      // page the inline start is the right edge).
      part.style.left = placed ? `${at.x - left}px` : "";
      part.style.top = placed ? `${at.y - top}px` : "";
      part.style.width = placed ? `${at.width}px` : "";
    }
  }

  /**
   * A pointer's turn, moving: the body folds from the height it is drawn at
   * over --dur-settle on --ease-crossfade, and on its clock the card's
   * padding, the head's change of height and the page's scroll (`to`, when
   * it shuts); shut, focus goes on once it lands; open, the head's chips
   * fly home.
   */
  function moveTurn(
    node: HTMLElement,
    box: HTMLElement,
    shut: boolean,
    gap: number,
    to: number | null
  ) {
    const ms = dur("--dur-settle");
    const easing = ease("--ease-crossfade");
    standAside(box, !shut && returning);
    const run = fold(node, !shut, { ms, easing, fade: true, gap });
    const padTo = getComputedStyle(box).paddingBlockStart;
    if (motionOk.current && padFrom && padFrom !== padTo) {
      padRun = box.animate(
        [{ paddingBlock: padFrom }, { paddingBlock: padTo }],
        { duration: ms, easing }
      );
    }
    // What the head grew or shrank by as it turned stands under it as a
    // margin that runs out on the fold's clock, so the body stays where it
    // was drawn on the first frame and the card at its drawn height
    // (DESIGN.md, The Nothing Jumps Rule).
    const lift = headLiftFrom + headFrom - headOf(box);
    const head = box.querySelector("header");
    if (motionOk.current && head && Math.abs(lift) > 0.5) {
      headRun = head.animate(
        [{ marginBottom: `${lift}px` }, { marginBottom: "0px" }],
        { duration: ms, easing }
      );
    }
    if (to !== null && run) {
      stopRide = scrollOnClock(run, pageScroller(), to);
    }
    const still = () => {
      moving = false;
    };
    run?.finished.then(still, () => undefined);
    if (!shut) {
      closeBack(box, ms, easing);
      return;
    }
    const landed = () => nextStop(box)?.focus({ preventScroll: true });
    if (run) {
      run.finished.then(landed, () => undefined);
    } else {
      landed();
    }
  }

  $effect(() => {
    const shut = decided;
    const node = body;
    const box = card;
    if (!(node && box)) {
      return;
    }
    const turned = shut !== wasDecided;
    wasDecided = shut;
    const gap = Number.parseFloat(getComputedStyle(box).rowGap) || 0;
    const how = turned ? acted : null;
    if (first || how === null) {
      first = false;
      landFold(node, !shut, { fade: true, gap });
      // Focus in a card shut by a pick from elsewhere goes to its Change.
      if (turned && shut && hadFocus) {
        box.querySelector<HTMLElement>("[data-change]")?.focus();
      }
      return;
    }
    acted = null;
    stopRide?.();
    padRun?.cancel();
    headRun?.cancel();
    const to = shut ? landing(node, gap, box) : null;
    if (how === "key") {
      standAside(box, false);
      // The keyboard's turn lands in this frame: the body shut or open, the
      // page where the fold would have taken it, focus on.
      landFold(node, !shut, { fade: true, gap });
      if (to !== null) {
        pageScroller().scrollTop = to;
        nextStop(box)?.focus({ preventScroll: true });
      }
      return;
    }
    moveTurn(node, box, shut, gap, to);
  });

  /**
   * A keyboard's press on Change, Continue or the note's buttons: a click
   * with no pointer behind it (UI Events: a click's `detail` counts the
   * pointer's presses, 0 for a key).
   */
  const pressBy = (event: MouseEvent) =>
    event.detail === 0 ? "key" : "pointer";
  const turnedBy = (event: MouseEvent) => {
    const key = pressBy(event) === "key";
    acted = key ? "key" : "pointer";
    instant = key;
    moving = !key;
    if (key) {
      afterInstant();
    }
  };

  /** Opens the card again, focus on its first picked option. */
  async function reopen(event: MouseEvent) {
    turnedBy(event);
    page?.work(id);
    // A pointer's Change: the head's chips stand on while they fly home.
    returning = acted === "pointer";
    // A Continue's flight caught mid-way hid each chosen chip in the options
    // as its source (motion/share); the card opening gives them back, so
    // focus can land on the pick (the flight home hides them by opacity).
    for (const chip of chips) {
      chipOf(chip.id)?.style.removeProperty("visibility");
    }
    open = true;
    await tick();
    chipOf(chosen[0] ?? "")?.focus({ preventScroll: true });
  }

  const stored = $derived(picks.now[id]?.note ?? "");
  let note = $state("");
  let typing = false;
  $effect(() => {
    const next = stored;
    if (!typing) {
      note = next;
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  function typed() {
    typing = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      typing = false;
      if (note !== stored) {
        bridge()
          ?.note(id, note)
          .catch(() => undefined);
      }
    }, 700);
  }

  /** What the note is for, in the program's words, else a note. */
  const noteFor = $derived(props.note ? String(props.note) : "a note");
  /** The note stands open: asked for, or written. */
  let noteAsked = $state(false);
  const noteOpen = $derived(noteAsked || stored !== "");
  let noteAdd = $state<HTMLDivElement>();
  let noteField = $state<HTMLDivElement>();
  let field = $state<HTMLTextAreaElement | null>(null);
  let noteKey = false;
  let noteFirst = true;
  // "Add a note" and the field fold on one clock, the field opening over
  // --dur-pop and shutting over --dur-exit (The Fast Exit Rule), the card's
  // height tween following them (motion/morph); a key's press lands at once.
  $effect(() => {
    const shown = noteOpen;
    const add = noteAdd;
    const fieldBox = noteField;
    if (!(add && fieldBox)) {
      return;
    }
    if (noteFirst || noteKey) {
      noteFirst = false;
      noteKey = false;
      landFold(add, !shown, { fade: true });
      landFold(fieldBox, shown, { fade: true });
      return;
    }
    const clock = {
      ms: dur(shown ? "--dur-pop" : "--dur-exit"),
      easing: ease("--ease-out"),
      fade: true,
    };
    fold(add, !shown, clock);
    fold(fieldBox, shown, clock);
  });
  async function askNote(event: MouseEvent) {
    noteKey = pressBy(event) === "key";
    noteAsked = true;
    await tick();
    field?.focus({ preventScroll: true });
  }
  /** Edit mark on the decided line: the card opens with its note in hand. */
  async function editNote(event: MouseEvent) {
    await reopen(event);
    noteAsked = true;
    await tick();
    field?.focus({ preventScroll: true });
  }
  async function noteDone(event: MouseEvent) {
    noteKey = pressBy(event) === "key";
    noteAsked = false;
    await tick();
    if (!noteOpen) {
      noteAdd?.querySelector<HTMLElement>("button")?.focus();
    }
  }
</script>

<article
  bind:this={card}
  {@attach morph({ still: () => instant })}
  class="group/card relative flex min-w-0 data-instant:**:transition-none scroll-mt-space-4 flex-col gap-space-5 rounded-panel bg-surface-raised p-(--card-in) shadow-tile data-decided:py-space-3"
  data-cawco-choice={id}
  data-cawco-multiple={multiple ? "" : undefined}
  data-decided={decided ? "" : undefined}
  data-instant={instant ? "" : undefined}
  data-moving={moving ? "" : undefined}
  data-slot="decision"
  id={`decision-${id}`}
>
  <!-- Under a finger its rows open to 14px (DESIGN.md, The 44 Touch Rule: "clusters open their gap on touch"), and the note's row stands 18px under Change, so Change's 44px area and the note's edit's stand clear of each other, not touching at a midpoint a subpixel puts either side of. -->
  <header
    class="flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-2 coarse:gap-y-space-4"
    data-slot="decision-head"
  >
    <h2
      class="type-title min-w-0 max-w-c-measure flex-1 basis-c-decision-question-basis text-balance text-ink-strong wrap-anywhere"
    >
      {question}
    </h2>
    {#if decided || returning}
      <!-- The decided line: the chosen options' chips, then Change, centred on the question's line beside it, or on a row of its own under it where the head wraps. Opening, the chips fly home and Change fades where it stood; with reduced motion the chips fade too. -->
      <div
        class="flex min-w-0 max-w-full"
        data-leaves
        data-leaving={decided ? undefined : ""}
      >
        <div class="flex min-w-0 max-w-full flex-wrap items-center gap-space-2">
          <!-- biome-ignore lint/a11y/useSemanticElements: a mark of the pick, named for a screen reader; no control is inside it. -->
          <span
            aria-label={`Decided: ${decidedLine}`}
            class="flex flex-wrap items-center gap-space-2 motion-reduce:transition-opacity motion-reduce:duration-(--dur-fade) motion-reduce:ease-out motion-reduce:in-data-leaving:opacity-0 motion-reduce:starting:opacity-0 group-data-instant/card:transition-none"
            data-slot="decided"
            role="group"
          >
            {#each chips as chip (chip.id)}
              <span
                {@attach land(() => (decided ? shareKey(chip.id) : undefined), {
                  mode: "grow",
                  now: true,
                  ms: dur("--dur-settle"),
                  easing: ease("--ease-crossfade"),
                })}
                aria-hidden="true"
                class={chipVariants({ variant: "option" })}
                data-chosen
                data-pick={chip.id}
                ><Kbd data-box look="keycap">{chip.keycap}</Kbd><span
                  class="min-w-0 wrap-anywhere">{chip.label}</span
                ></span
              >
            {/each}
          </span>
          <span
            class="transition-opacity duration-(--dur-settle) ease-crossfade in-data-leaving:opacity-0 group-data-moving/card:starting:opacity-0 motion-reduce:duration-(--dur-fade) motion-reduce:ease-out group-data-instant/card:transition-none"
          >
            <Button
              data-change
              inert={!decided}
              onclick={reopen}
              size="sm"
              variant="ghost">Change</Button
            >
          </span>
        </div>
      </div>
      {#if stored}
        <p
          class="flex min-w-0 basis-full items-center gap-space-1 transition-opacity duration-(--dur-settle) ease-crossfade data-leaving:opacity-0 group-data-instant/card:transition-none motion-reduce:duration-(--dur-fade) coarse:mt-space-1"
          data-leaves
          data-leaving={decided ? undefined : ""}
          data-slot="decided-note"
        >
          <q class="type-meta min-w-0 text-ink-muted wrap-anywhere">{stored}</q>
          <Button
            aria-label="Edit the note"
            inert={!decided}
            onclick={editNote}
            size={coarse.current ? "icon-sm" : "icon-xs"}
            variant="ghost"><IconPen /></Button
          >
        </p>
      {/if}
    {/if}
  </header>
  <div
    bind:this={body}
    class="@container flex min-w-0 flex-col gap-space-5"
    data-slot="decision-body"
    inert={decided}
  >
    {#if props.why}
      <p
        class="type-body max-w-c-measure text-pretty text-ink-muted wrap-anywhere"
        data-slot="why"
      >
        {String(props.why)}
      </p>
    {/if}
    {#if Array.isArray(props.media) && props.media.length > 0}
      <!-- Two pictures side by side in equal columns once the card's body holds two at a readable width; one, three and more, or words (a Row, a Text, a Badge) beside a picture, one under another, each at the body's width, where a story's well reaches the screen's edges on a phone (`data-bleeds`, Well.svelte). -->
      <div
        class={[
          "grid min-w-0 grid-cols-1 gap-space-3",
          pictures && "@media-split:grid-cols-2",
        ]}
        data-bleeds={pictures ? undefined : ""}
        data-slot="decision-media"
      >
        {@render renderNode(props.media)}
      </div>
    {/if}
    <OptionGroup
      aria-label={question}
      bind:value={() => chosen, () => undefined}
      class="w-full"
      disabled={!bridge()}
      {multiple}
      onenter={() => {
        if (pick.picked) {
          proceed("key");
        }
      }}
    >
      <!-- Options with pictures stand on their stories' pitch, each story at 1:1 in a well that hugs it, as many abreast as the column holds, one left alone on the last row spanning it (`data-lone`); under the phone's line one under another, each well reaching the screen's edges as far as its story does (`data-bleeds`, Well.svelte). Options of words stand at least 190px each. -->
      <div
        bind:this={optionsGrid}
        class={[
          "group/options grid w-full min-w-0 gap-space-3",
          storyWidth > 0
            ? "grid-cols-fit-story max-phone:grid-cols-1"
            : "grid-cols-fit-c-decision-option-min",
        ]}
        data-bleeds={storyWidth > 0 ? "" : undefined}
        data-lone={lone ? "" : undefined}
        data-slot="options"
        style:--story-w={storyWidth > 0 ? `${storyWidth}px` : undefined}
      >
        {@render renderNode(props.options)}
      </div>
    </OptionGroup>
    <div data-slot="note">
      <!-- A ghost's ink starts inside its box: it hangs back by its padding so its first letter stands on the card's text edge, as RelayJourney's ghosts do. -->
      <div bind:this={noteAdd}>
        <Button
          class="-ms-space-3"
          disabled={!bridge()}
          onclick={askNote}
          size="sm"
          variant="ghost">Add {noteFor}</Button
        >
      </div>
      <div bind:this={noteField}>
        <div class="flex flex-col gap-space-2">
          <div class="flex items-center justify-between gap-space-2">
            <label class="type-label text-ink-muted" for={`note-${id}`}
              >Note</label
            >
            <Button onclick={noteDone} size="sm" variant="ghost">Done</Button>
          </div>
          <Textarea
            bind:ref={field}
            bind:value={note}
            disabled={!bridge()}
            id={`note-${id}`}
            onblur={() => {
              typing = false;
            }}
            oninput={typed}
            placeholder={props.note ? String(props.note) : "Anything to add"}
            rows={1}
          />
        </div>
      </div>
    </div>
    {#if pick.picked}
      <!-- Continue grows out of the card's foot on its height tween (morph) and folds shut with the body. -->
      <div
        class="flex justify-end group-data-instant/card:transition-none motion-safe:transition-opacity motion-safe:duration-(--dur-morph) motion-safe:ease-drawer motion-safe:starting:opacity-0 motion-reduce:transition-opacity motion-reduce:duration-(--dur-fade) motion-reduce:starting:opacity-0"
        data-slot="decision-foot"
      >
        <Button
          aria-keyshortcuts="Enter"
          data-continue
          onclick={(event: MouseEvent) => proceed(pressBy(event))}
          size={coarse.current ? "lg" : "default"}
          variant={page && page.working() !== id ? "outline" : "default"}
          >Continue<Kbd aria-hidden="true" data-box reach="keyboard">↵</Kbd
          ></Button
        >
      </div>
    {/if}
  </div>
</article>
