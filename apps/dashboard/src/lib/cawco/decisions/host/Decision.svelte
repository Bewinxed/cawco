<!--
  One decision: the kit's card (RECIPES.md, page.css `.dp-card`). The card
  carries its id twice: `data-cawco-choice`, which the overlay's bridge
  picks on (a click on an option's `data-option` stores it, and the
  overlay marks it `data-cawco-picked`), and `id="decision-<id>"`, which a
  pin's selector holds on to across revisions. Its note goes to the hub a
  moment after typing stops; the state line follows the stored picks.

  A picked card folds to one line, "Decided: <option>" with Change, and its
  body (why, media, options, note) folds shut but stays mounted, so the
  overlay's marks, the media's frames and a Dials panel stay. The fold is
  this view's own: the picks the hub keeps, and artifact_read, are the same.
  A one-pick card folds when the person's pick in it is stored; a
  several-pick card stays open while they pick, and folds on Done. Change
  reopens it. A stored pick on an option a revision took out is no pick
  here (core `pickOf`, as the graph and the count read it): the card stands
  open, its kept options counted, never folded to an empty "Decided:".

  The pick the person makes moves (DESIGN.md, The Stay In Context Rule):
  the option shows chosen where it stands for `--dur-hold` ("How long a done
  state stays up"), then the body folds shut over `--dur-exit` on
  `--ease-out` (a disclosure folding shut, `--dur-reveal`'s role) while the
  card's padding and the page's scroll ride the same clock, the scroll
  bringing the next open card in under the decided line; focus goes to that
  card's first option once the fold lands, or to Send when none is left.
  Change opens it again over `--dur-reveal`, from the height it is drawn at.
  A pick that arrives (a reload, another device, a revision) stands at
  once. With reduced motion the body fades and its height lands at the end,
  where the scroll is placed (motion/fold, motion/scroll-on).
-->
<script lang="ts">
  import { pickOf } from "@cawco/core/decisions";
  import { setContext, tick } from "svelte";
  import { dur, ease, motionOk } from "../../motion/curves.svelte";
  import { fold, landFold } from "../../motion/fold.svelte";
  import { morph } from "../../motion/morph.svelte";
  import { scrollOnClock } from "../../motion/scroll-on";
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

  /** Change reopened it, or the person is picking several: it stays open until a pick or Done. */
  let open = $state(false);
  /** The person's pick, shown chosen where it stands before the card folds. */
  let holding = $state(false);
  const decided = $derived(pick.picked && !open && !holding);
  const decidedLine = $derived(
    options
      .filter((option) => chosen.includes(option.id))
      .map((option) => option.label)
      .join(", ")
  );

  let card = $state<HTMLElement>();
  let body = $state<HTMLDivElement>();

  /** The person moved this card (a pick, Done, Change): its next turn moves. */
  let acted = false;
  let held: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(held));

  // A pick the person makes is shown chosen for --dur-hold, then folds a
  // one-pick card; a several-pick card stays open while they pick in it,
  // until Done. Only their own press on an option moves it: the overlay's
  // other writes to the page's doc (a pin re-anchored as the card opens)
  // leave it as it is. The press is armed before its pick is written: the
  // overlay writes on the click at the window, and a browser's own click
  // runs the microtasks after each listener, so the pick is drawn before
  // any listener on the card hears the click.
  let picking = false;
  let seen = "";
  $effect(() => {
    const now = chosen.join("\n");
    if (picking && now !== seen) {
      picking = false;
      clearTimeout(held);
      holding = chosen.length > 0;
      if (holding) {
        open = false;
        acted = true;
        held = setTimeout(() => {
          holding = false;
        }, dur("--dur-hold"));
      }
    }
    seen = now;
  });
  $effect(() => {
    const group = body;
    if (!group) {
      return;
    }
    const onOption = (event: Event) =>
      !!(event.target as Element | null)?.closest("[data-option]");
    const arm = (event: Event) => {
      if (
        !onOption(event) ||
        (event instanceof KeyboardEvent &&
          event.key !== "Enter" &&
          event.key !== " ")
      ) {
        return;
      }
      if (multiple) {
        open = true;
      } else {
        picking = true;
      }
    };
    // A press that wrote no pick (a drag off the option) arms nothing past
    // its click; a task later, after the pick's own effects have run.
    const disarm = (event: Event) => {
      if (onOption(event)) {
        setTimeout(() => {
          picking = false;
        });
      }
    };
    group.addEventListener("pointerdown", arm, true);
    group.addEventListener("keydown", arm, true);
    group.addEventListener("click", disarm, true);
    return () => {
      group.removeEventListener("pointerdown", arm, true);
      group.removeEventListener("keydown", arm, true);
      group.removeEventListener("click", disarm, true);
    };
  });

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
    const was = [node.style.height, node.style.marginBottom];
    node.style.height = "0px";
    node.style.marginBottom = `${-gap}px`;
    const top = (el: Element) =>
      el.getBoundingClientRect().top +
      scroller.scrollTop -
      (Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
    const cards = cardsOnPage();
    const [next] = openCardsAfter(from);
    let to = scroller.scrollTop;
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
    [node.style.height, node.style.marginBottom] = was;
    return Math.min(Math.max(0, to), Math.max(0, most));
  }

  // The card as it stands before it turns, read before the page changes:
  // its padding (a decided card is slimmer), its head's height (the decided
  // line may wrap to more lines than the state line, or fewer), and whether
  // focus was in it.
  let padFrom = "";
  let headFrom = 0;
  let hadFocus = false;
  let wasDecided = false;
  const headOf = (box: HTMLElement) =>
    box.querySelector("header")?.getBoundingClientRect().height ?? 0;
  $effect.pre(() => {
    if (decided !== wasDecided && card) {
      padFrom = getComputedStyle(card).paddingBlockStart;
      headFrom = headOf(card);
      hadFocus = card.contains(document.activeElement);
    }
  });

  let first = true;
  let padRun: Animation | undefined;
  let stopRide: (() => void) | undefined;
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
    if (first || !(turned && acted)) {
      first = false;
      landFold(node, !shut, { fade: true, gap });
      // Focus in a card shut by a pick from elsewhere goes to its Change.
      if (turned && shut && hadFocus) {
        box.querySelector<HTMLElement>(".dp-change")?.focus();
      }
      return;
    }
    acted = false;
    stopRide?.();
    padRun?.cancel();
    const ms = dur(shut ? "--dur-exit" : "--dur-reveal");
    const easing = ease("--ease-out");
    const to = shut ? landing(node, gap, box) : null;
    // The body starts from its drawn height less what the head grew by as
    // it turned, so the card stands at the height it was drawn at on the
    // fold's first frame (DESIGN.md, The Nothing Jumps Rule).
    const from = Math.max(
      0,
      node.getBoundingClientRect().height + headFrom - headOf(box)
    );
    const run = fold(node, !shut, { ms, easing, fade: true, gap }, from);
    const padTo = getComputedStyle(box).paddingBlockStart;
    if (motionOk.current && padFrom && padFrom !== padTo) {
      padRun = box.animate(
        [{ paddingBlock: padFrom }, { paddingBlock: padTo }],
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
    if (!shut) {
      return;
    }
    const landed = () => nextStop(box)?.focus({ preventScroll: true });
    if (run) {
      run.finished.then(landed, () => undefined);
    } else {
      landed();
    }
  });

  /** Opens the card again, focus on its first picked option. */
  async function reopen() {
    acted = true;
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
  {@attach morph()}
  class="dp-card"
  data-cawco-choice={id}
  data-cawco-multiple={multiple ? "" : undefined}
  data-decided={decided ? "" : undefined}
  id={`decision-${id}`}
>
  <header>
    <h2>{question}</h2>
    {#if decided}
      <span class="dp-state on">Decided: {decidedLine}</span>
      <button class="dp-change" onclick={reopen} type="button">Change</button>
    {:else}
      <span class={["dp-state", picked > 0 && "on"]}>{stateLine}</span>
      {#if pick.picked && !holding}
        <button
          class="dp-change"
          onclick={() => {
            acted = true;
            open = false;
          }}
          type="button">Done</button
        >
      {/if}
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
  </div>
</article>
