<!--
  One decision: the kit's card (RECIPES.md, page.css `.dp-card`). The card
  carries its id twice: `data-cawco-choice`, which the overlay's bridge
  picks on (a click on an option's `data-option` stores it, and the
  overlay marks it `data-cawco-picked`), and `id="decision-<id>"`, which a
  pin's selector holds on to across revisions. Its note goes to the hub a
  moment after typing stops; the state line follows the stored picks.

  A pick selects and waits for Continue (the owner: "follow the pattern of
  waiting for a continue press"). The option takes its chosen look where it
  stands (L905, its colour over `--dur-control`) and the card stays open: a
  press on another option moves the pick, a press on the chosen one keeps it
  (the overlay's pick.ts), and a several-pick card toggles each. Once the
  card holds a pick, Continue (the primary button, ↵ on its keycap) grows
  out of its foot on the card's own height tween (motion/morph; with
  reduced motion it fades in where it stands), and leaves folded shut with
  the body.

  Continue, or Enter, folds the card to one line: its question, then the
  chosen option itself (its keycap and label in the chosen look; "Decided:
  <option>" is its accessible name), then Change. Its body (why, media,
  options, note, Continue) folds shut but stays mounted, so the overlay's
  marks, the media's frames and a Dials panel stay. The fold is this view's
  own: the picks the hub keeps, and artifact_read, are the same. Change
  reopens it in place, its pick standing chosen; Continue folds it back
  unchanged. A stored pick on an option a revision took out is no pick here
  (core `pickOf`, as the graph and the count read it): the card stands
  open, its kept options counted, never folded to an empty "Decided:". A
  pick that arrives (a reload, another device, a revision) stands decided
  at once.

  A pointer's Continue moves (DESIGN.md, The Stay In Context Rule): the
  body folds shut over `--dur-settle` on `--ease-crossfade` while, on that
  clock, the chosen option's keycap and label fly from its chip to the head
  (L485, The One Object Rule, motion/share: the source hidden while its
  copy flies), the state line leaves its slot over `--dur-exit`, and the
  card's padding and the page's scroll ride the fold, the scroll bringing
  the next open card in under the decided line; focus goes to that card's
  first option once the fold lands, or to Send when none is left. Change
  opens it again the same way, from the height it is drawn at, each head
  chip closing back into its option. A pick, Continue or Change made from
  the keyboard lands in one frame, with no colour fade, fold, flight or
  scroll travel (L690: "A choice made from the keyboard … is instant, as
  every keyboard action is"). With reduced motion the body fades and its
  height lands at the end, where the scroll is placed, and the head chip
  fades in where it stands (L517: "flights do not fly").

  Keys: the card's options are one tab stop, and the arrows move focus
  among them and never pick (WAI-ARIA APG, roving tabindex); Space, or an
  option's digit while focus is in its card, picks; Enter continues once
  the card holds a pick and never picks; ⌘/Ctrl+Enter sends (Decisions).
  The page's one polite live region hears "Picked <option>" on a pick and
  "Decided: <option>" with the count on Continue.

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
  }> = $props();

  type OptionNode = { props?: { id?: unknown; label?: unknown } } | null;

  const id = $derived(String(props.id ?? ""));
  const question = $derived(String(props.question ?? ""));
  const multiple = $derived(props.multiple === true);
  const options = $derived(
    (Array.isArray(props.options) ? props.options : []).map((option) => {
      const held = (option as OptionNode)?.props;
      const optionId = String(held?.id ?? "");
      return { id: optionId, label: String(held?.label ?? optionId) };
    })
  );
  /** Each option's id in order: an option's keycap is its place. */
  const order = $derived(options.map((option) => option.id));
  setContext("decision-options", () => order);
  /** Its id: each option's parts are named under it, ids that hold across revisions. */
  setContext("decision-id", () => id);

  /**
   * The stored pick as core `pickOf` reads it, as the graph and the count
   * do: an option a revision took out is no pick on this card.
   */
  const pick = $derived(pickOf({ options }, picks.now[id]));
  /** The options picked that the card still offers. */
  const chosen = $derived(
    (picks.now[id]?.options ?? []).filter((one) => order.includes(one))
  );
  const picked = $derived(chosen.length);
  const stateLine = $derived.by(() => {
    if (picked === 0) {
      return "Not picked";
    }
    return picked > 1 ? `${picked} picked` : "Picked";
  });

  /** The person is picking in it, or Change reopened it: it stays open until Continue. */
  let open = $state(false);
  /**
   * A keyboard's pick, Continue or Change under way: everything it changes
   * lands in one frame, the chosen colour with no fade (`data-instant`,
   * page.css) and the card's height with no tween.
   */
  let instant = $state(false);
  /** A pointer's Continue or Change under way: what comes and goes in the head fades on its clock (page.css). */
  let moving = $state(false);
  const decided = $derived(pick.picked && !open);
  /** The page's one polite live region and its count (Decisions.svelte). */
  const page = getContext<
    { say: (words: string) => void; tally: () => string } | undefined
  >("decision-page");
  /** The option focus last stood on in this card: Tab's stop among them. */
  let focusedOption = $state("");
  /** The option Tab reaches: the one focus last stood on, else the pick, else the first. */
  const tabStop = $derived(
    order.includes(focusedOption) ? focusedOption : (chosen[0] ?? order[0])
  );
  setContext("decision-stop", () => tabStop);
  /** The chosen options as the head shows them: each with its keycap, its place in the card. */
  const chips = $derived(
    options
      .map((option, at) => ({ ...option, keycap: at + 1 }))
      .filter((option) => chosen.includes(option.id))
  );
  const decidedLine = $derived(chips.map((chip) => chip.label).join(", "));
  /** The head's chips stand on while they close back into their options (Change). */
  let returning = $state(false);
  /** The key an option's keycap and label travel under, between its chip and the head. */
  const shareKey = (option: string) => `decision:${id}:${option}`;
  /** An option's keycap and label run in the grid: what flies to the head and back. */
  const runOf = (option: string) =>
    body?.querySelector<HTMLElement>(
      `[data-option="${CSS.escape(option)}"] > b`
    ) ?? null;

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
  // for Continue. Only the person's own press says "Picked": the overlay's
  // other writes to the page's doc (a pin re-anchored as the card opens)
  // and a pick from elsewhere say nothing. The press is armed before its
  // pick is written: the overlay writes on the click at the window, and a
  // browser's own click runs the microtasks after each listener, so the
  // pick is drawn before any listener on the card hears the click.
  let pressed = false;
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
    instant = key;
    open = true;
  }
  $effect(() => {
    const group = body;
    if (!group) {
      return;
    }
    const onOption = (event: Event) =>
      !!(event.target as Element | null)?.closest("[data-option]");
    const pointed = (event: Event) => {
      if (onOption(event)) {
        arm(false);
      }
    };
    // A press that wrote no pick (a drag off the option) arms nothing past
    // its click; a task later, after the pick's own effects have run.
    const disarm = (event: Event) => {
      if (onOption(event)) {
        setTimeout(() => {
          pressed = false;
        });
        if (instant) {
          afterInstant();
        }
      }
    };
    const stood = (event: FocusEvent) => {
      const option = (event.target as Element | null)?.closest("[data-option]");
      if (option) {
        focusedOption = option.getAttribute("data-option") ?? "";
      }
    };
    group.addEventListener("pointerdown", pointed, true);
    group.addEventListener("click", disarm, true);
    group.addEventListener("focusin", stood);
    // The card's keys, heard as they bubble from its options (`keyed`).
    group.addEventListener("keydown", keyed);
    return () => {
      group.removeEventListener("pointerdown", pointed, true);
      group.removeEventListener("click", disarm, true);
      group.removeEventListener("focusin", stood);
      group.removeEventListener("keydown", keyed);
    };
  });

  /** The arrows' steps through a card's options: back or on, across or down. */
  const STEPS: Record<string, number> = {
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -1,
  };
  const DIGIT = /^[1-9]$/;
  /** Whether `target` takes typing: a digit, Space or Enter there is a letter. */
  const takesTyping = (target: Element) =>
    (target instanceof HTMLElement && target.isContentEditable) ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
  const optionEls = () => [
    ...(body?.querySelectorAll<HTMLButtonElement>(
      "[data-option]:not(:disabled)"
    ) ?? []),
  ];

  /**
   * The card's keys, heard while focus is in it: the arrows move focus
   * among its options and never pick; Space on an option picks it (the
   * button's own click) and an option's digit picks that option; Enter on
   * an option continues once the card holds a pick, and never picks.
   */
  function keyed(event: KeyboardEvent) {
    const target = event.target as Element | null;
    if (
      decided ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !target ||
      takesTyping(target)
    ) {
      return;
    }
    const option = target.closest<HTMLElement>("[data-option]");
    const step = STEPS[event.key];
    if (option && step) {
      event.preventDefault();
      const all = optionEls();
      const at = all.indexOf(option as HTMLButtonElement);
      all[(at + step + all.length) % all.length]?.focus();
    } else if (option && event.key === "Enter") {
      // The button's own Enter would click it, a pick: it continues instead.
      event.preventDefault();
      if (pick.picked) {
        proceed("key");
      }
    } else if (option && event.key === " ") {
      arm(true);
    } else if (DIGIT.test(event.key)) {
      const named = body?.querySelector<HTMLButtonElement>(
        `[data-option="${CSS.escape(order[Number(event.key) - 1] ?? "")}"]:not(:disabled)`
      );
      if (named) {
        event.preventDefault();
        arm(true);
        named.focus();
        named.click();
      }
    }
  }

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

  /** Where focus goes once the card has folded: the next open card's first option, else Send. */
  function nextStop(from: HTMLElement): HTMLElement | null {
    const [next] = openCardsAfter(from);
    return (
      next?.querySelector<HTMLElement>("[data-option]:not(:disabled)") ??
      document.querySelector<HTMLElement>(".dp-send:not(:disabled)")
    );
  }

  /**
   * Where the page's scroll lands once `node` (`from`'s body) has folded
   * shut: the next open card in view, under `from`'s decided line when it
   * comes right after it, else at the top; with none left, Send in view.
   * Read with the body held at the fold's end, let go before anything is
   * drawn.
   */
  function landing(node: HTMLElement, gap: number, from: HTMLElement): number {
    const scroller = document.scrollingElement ?? document.documentElement;
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
    const top = (el: Element) =>
      el.getBoundingClientRect().top +
      scroller.scrollTop -
      (Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
    const cards = cardsOnPage();
    const [next] = openCardsAfter(from);
    let to = stood;
    if (next) {
      to = top(cards.indexOf(next) === cards.indexOf(from) + 1 ? from : next);
    } else {
      const foot = document.querySelector(".dp-done");
      if (foot) {
        to = Math.max(
          to,
          foot.getBoundingClientRect().bottom +
            scroller.scrollTop +
            gap -
            scroller.clientHeight
        );
      }
    }
    const most = scroller.scrollHeight - scroller.clientHeight;
    [node.style.height, node.style.marginBottom, node.style.overflow] = was;
    scroller.scrollTop = stood;
    return Math.min(Math.max(0, to), Math.max(0, most));
  }

  // The card as it stands before it turns, read before the page changes:
  // its padding (a decided card is slimmer), its head's height and the
  // margin under it (the decided line may wrap to more lines than the state
  // line, or fewer; a turn under way holds the difference in that margin),
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
  /** The parts of the head that leave it as the card opens: its chosen options and Change. */
  const leavingParts = (box: HTMLElement) => [
    ...box.querySelectorAll<HTMLElement>("header :is(.dp-picks, .dp-change)"),
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
      // A pointer's pick: each chosen option's run departs from its chip,
      // hidden while its copy flies to the head (motion/share).
      if (decided && acted === "pointer") {
        for (const chip of chips) {
          const run = runOf(chip.id);
          if (run) {
            departBox(shareKey(chip.id), run, false);
          }
        }
      }
    }
  });

  /**
   * Change: each head chip closes back into its option's run on the fold's
   * clock (motion/share `closeInto`), the run hidden until it lands, so the
   * screen shows one of each; then the head lets them go.
   */
  function closeBack(box: HTMLElement, ms: number, easing: string) {
    if (!returning) {
      return;
    }
    const flights = [
      ...box.querySelectorAll<HTMLElement>("header [data-pick]"),
    ].flatMap((chip) => {
      const target = runOf(chip.dataset.pick ?? "");
      const flight = target ? closeInto(chip, target, ms, easing) : undefined;
      if (!(target && flight)) {
        return [];
      }
      target.style.visibility = "hidden";
      const show = () => {
        target.style.visibility = "";
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
   * The head's chosen options and Change, opening: each stands out of the
   * head's flow where it was drawn while it leaves (the options flying home,
   * Change fading), so the head takes its open height from the turn's first
   * frame and never jumps when they go. Shutting, they stand in it again.
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
      stopRide = scrollOnClock(
        run,
        document.scrollingElement ?? document.documentElement,
        to
      );
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
        box.querySelector<HTMLElement>(".dp-change")?.focus();
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
        (document.scrollingElement ?? document.documentElement).scrollTop = to;
        nextStop(box)?.focus({ preventScroll: true });
      }
      return;
    }
    moveTurn(node, box, shut, gap, to);
  });

  /**
   * A keyboard's press on Change or Continue: a click with no pointer behind it
   * (UI Events: a click's `detail` counts the pointer's presses, 0 for a key).
   */
  const turnedBy = (event: MouseEvent) => {
    const key = event.detail === 0;
    acted = key ? "key" : "pointer";
    instant = key;
    moving = !key;
    if (key) {
      afterInstant();
    }
  };
  const pressBy = (event: MouseEvent) =>
    event.detail === 0 ? "key" : "pointer";

  /** Opens the card again, focus on its first picked option. */
  async function reopen(event: MouseEvent) {
    turnedBy(event);
    // A pointer's Change: the head's chips stand on while they fly home.
    returning = acted === "pointer" && motionOk.current;
    open = true;
    await tick();
    body
      ?.querySelector<HTMLElement>(
        `[data-option="${CSS.escape(chosen[0] ?? "")}"]`
      )
      ?.focus({ preventScroll: true });
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
</script>

<article
  bind:this={card}
  {@attach morph({ still: () => instant })}
  class="dp-card"
  data-cawco-choice={id}
  data-cawco-multiple={multiple ? "" : undefined}
  data-decided={decided ? "" : undefined}
  data-instant={instant ? "" : undefined}
  data-moving={moving ? "" : undefined}
  id={`decision-${id}`}
>
  <header>
    <h2>{question}</h2>
    <!-- One slot: the state line leaves it as the chosen options land in it. -->
    <span class="dp-slot">
      <span aria-hidden={decided ? "true" : undefined} class="dp-state"
        >{stateLine}</span
      >
      {#if decided || returning}
        <!-- biome-ignore lint/a11y/useSemanticElements: a mark of the pick, named for a screen reader; no control is inside it. -->
        <span
          aria-label={`Decided: ${decidedLine}`}
          class="dp-picks"
          role="group"
        >
          {#each chips as chip (chip.id)}
            <span
              {@attach land(() => (decided ? shareKey(chip.id) : undefined), {
                mode: "grow",
                anchor: "b",
                now: true,
                ms: dur("--dur-settle"),
                easing: ease("--ease-crossfade"),
              })}
              aria-hidden="true"
              class="dp-pick"
              data-pick={chip.id}
              ><b
                ><span class="dp-kc">{chip.keycap}</span><span
                  >{chip.label}</span
                ></b
              ></span
            >
          {/each}
        </span>
      {/if}
    </span>
    {#if decided || returning}
      <!-- Opening, Change fades out where it stood while the chosen options fly home. -->
      <button
        class="dp-change"
        data-leaving={decided ? undefined : ""}
        inert={!decided}
        onclick={reopen}
        type="button">Change</button
      >
    {/if}
  </header>
  <div bind:this={body} class="dp-body" inert={decided}>
    {#if props.why}<p class="dp-why">{String(props.why)}</p>{/if}
    {#if Array.isArray(props.media) && props.media.length > 0}
      <div class={["dp-show", props.media.length !== 2 && "solo"]}>
        {@render renderNode(props.media)}
      </div>
    {/if}
    <!-- biome-ignore lint/a11y/useSemanticElements: the kit's option grid (page.css .dp-opts); a fieldset's legend would say the question twice. -->
    <div aria-label={question} class="dp-opts" role="group">
      {@render renderNode(props.options)}
    </div>
    <label class="dp-note"
      >Note<textarea
        bind:value={note}
        disabled={!bridge()}
        oninput={typed}
        onblur={() => {
          typing = false;
        }}
        placeholder="Anything to add"
        rows="1"></textarea></label
    >
    {#if pick.picked}
      <!-- Continue grows out of the card's foot on its height tween (morph) and folds shut with the body. -->
      <div class="dp-foot">
        <button
          aria-keyshortcuts="Enter"
          class="dp-continue"
          onclick={(event) => proceed(pressBy(event))}
          type="button"
          ><span>Continue</span><span aria-hidden="true" class="dp-kc">↵</span
          ></button
        >
      </div>
    {/if}
  </div>
</article>
