<script lang="ts">
  /**
   * THE GOO CARD (dev only): a comment's card pouring out of its pill
   * through the gooey plus-menu's filter (PinFloatGoo), on the page the
   * owner's two comments stood on (the comment-sizing preview's Away mode
   * decision page), each opening his own thread in the real PinCard. A
   * press on a pill opens its card; Close, Esc, a press anywhere outside
   * it (the house's pressOutside) or the pill again closes it. The page
   * scrolls under an open card. The head's controls, in the words of what
   * they change: Open and Close, in ms (`--dur-goo`, `--dur-goo-exit`), read
   * as each open or close starts; Stay joined, the card standing beside its
   * pin, a bridge as tall as the pin between them, the pin wearing the
   * card's surface; Status, the pins' status dot, which pours out into the
   * card's rim; Count, the pins' numbers, so the bubble is seen at one, two
   * and three figures.
   */
  import type { Pin } from "@cawco/core/comments";
  import { pinName } from "@cawco/core/pin-name";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { pressOutside } from "#lib/cawco/press-outside.js";
  import PinCard from "#lib/cawco/preview/PinCard.svelte";
  import PinMark, { markState } from "#lib/cawco/preview/PinMark.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import {
    keyboardUse,
    lastInput,
  } from "#lib/components/ui/fluid-tabs/last-input.js";
  import PinFloatGoo from "./PinFloatGoo.svelte";
  import { AGENT, COUNTS, numbered, PINS } from "./pins";

  interface Box {
    h: number;
    w: number;
    x: number;
    y: number;
  }

  /** Each thread as it was first sent, his words alone: a card shorter than the well, which moves once as its pill leaves it. */
  let firstSent = $state(false);
  /** The first pin's number (Count): the second takes the next. */
  let count = $state<number>(COUNTS[0]);
  const pins: Pin[] = $derived(
    numbered(
      firstSent
        ? PINS.map((one) => ({ ...one, thread: one.thread.slice(0, 1) }))
        : PINS,
      count
    )
  );
  /** The page's words each pin stands on, by pin: the first the button, the second the recommended answer. */
  const parents: Record<string, string | null> = {
    [PINS[0].id]: null,
    [PINS[1].id]: "Where should the away notes sit?",
  };

  /** The controls, at their tokens' values (the goo's open and its close), joined. */
  const DEFAULTS = {
    openMs: 350,
    closeMs: 250,
    joined: true,
    dot: "live" as "live" | "unread" | "none",
    count: COUNTS[0] as number,
  };
  let openMs = $state(DEFAULTS.openMs);
  let closeMs = $state(DEFAULTS.closeMs);
  let joined = $state(DEFAULTS.joined);
  /** The pins' status dot: the agent working, an answer unread, or none. */
  let dot = $state(DEFAULTS.dot);
  const dotOf = $derived(dot === "none" ? null : dot);
  const reset = () => {
    ({ openMs, closeMs, joined, dot, count } = DEFAULTS);
  };

  let well = $state<HTMLElement>();
  let roomW = $state(0);
  let roomH = $state(0);
  const pills = $state<Record<string, HTMLElement>>({});
  const targets = $state<Record<string, HTMLElement>>({});
  /**
   * The pill with keyboard focus, by its pin: the one source of its focus
   * ring, by the house rule (`lastInput`, `keyboardUse`): a key that moves
   * or acts sets it, a modifier held alone or Escape never does, a press
   * clears it.
   */
  let keyed = $state<string | null>(null);
  /** Each pill and what it stands on, in the well, px; its mark null while it is out of view. */
  let at = $state<Record<string, { box: Box; mark: Box | null }>>({});
  const inWell = (rect: DOMRect, frame: DOMRect): Box => ({
    x: rect.left - frame.left,
    y: rect.top - frame.top,
    w: rect.width,
    h: rect.height,
  });
  /** Where the pills stand now, as the page's overlay reports them: on every scroll and resize. */
  function measure() {
    if (!well) {
      return;
    }
    const frame = well.getBoundingClientRect();
    const next: typeof at = {};
    for (const pin of pins) {
      const pill = pills[pin.id];
      const target = targets[pin.id];
      if (!(pill && target)) {
        continue;
      }
      const rect = pill.getBoundingClientRect();
      const shown = rect.bottom > frame.top && rect.top < frame.bottom;
      next[pin.id] = {
        mark: shown ? inWell(rect, frame) : null,
        box: inWell(target.getBoundingClientRect(), frame),
      };
    }
    at = next;
  }
  const measureRoom = frameSize<HTMLElement>((node) => {
    roomW = node.clientWidth;
    roomH = node.clientHeight;
    measure();
  });
  /** The page's column changing size (its faces loading, a wrap) moves the pills: measured again. */
  const measureColumn = frameSize<HTMLElement>(() => measure());

  /** The pin whose card is open. */
  let open = $state<string | null>(null);
  /** The open card's box. */
  let card = $state<HTMLElement>();
  // A press anywhere outside the open card puts it away (the house's
  // outside-press rule, heard as the press starts, so a drag begun inside
  // it, a selection, never closes it); its own pin's press is its own
  // toggle.
  $effect(() => {
    const id = open;
    if (!(id && card)) {
      return;
    }
    return pressOutside(card, (event) => {
      if (event.target instanceof Node && pills[id]?.contains(event.target)) {
        return;
      }
      open = null;
    });
  });
  /** The pin whose card is on the page: the open one, or the one still going back into its pin. */
  let shown = $state<string | null>(null);
  const shownPin = $derived(pins.find((one) => one.id === shown) ?? null);
  /** A pill the goo draws as part of its shape while its card is on the page and it is on screen: it steps back, its edge and its ring with it. */
  const held = (id: string) => shown === id && !!at[id]?.mark;
  /** The open card's box in the well. */
  let cardArea = $state<Box | null>(null);
  /**
   * Another pin that stands under the card on the page is covered by it
   * whole, its ring and its dot with it: the card stands over every pin
   * but its own, and a pin under it never shows through or past its edge.
   */
  const covered = (id: string) => {
    const mark = at[id]?.mark;
    const over = cardArea;
    if (!(shown && shown !== id && mark && over)) {
      return false;
    }
    return (
      mark.x < over.x + over.w &&
      mark.x + mark.w > over.x &&
      mark.y < over.y + over.h &&
      mark.y + mark.h > over.y
    );
  };
  const drafts = new Map<string, ComposerDraft>();
  const draftOf = (id: string) => {
    const kept = drafts.get(id) ?? new ComposerDraft();
    drafts.set(id, kept);
    return kept;
  };
  /** A pill's press: its card opens, or closes if open; another pin's card, open or closing, goes at once. */
  function press(id: string) {
    if (open === id) {
      open = null;
      return;
    }
    measure();
    open = id;
    shown = id;
  }
</script>

<svelte:head><title>Goo card · CawCo</title></svelte:head>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape" && open) {
      open = null;
    }
  }}
  onpointerdown={() => {
    keyed = null;
  }}
/>

{#snippet pillOf(pin: Pin, focused: boolean)}
  <PinMark
    dot={dotOf}
    {focused}
    number={pin.number}
    state={markState(pin)}
    tail="bottom-start"
  />
{/snippet}

{#snippet pinOn(pin: Pin)}
  <!-- The pill on the page, its foot's corner on the pressed point. -->
  <button
    aria-expanded={open === pin.id}
    aria-label="Comment {pin.number}"
    bind:this={pills[pin.id]}
    class="absolute start-(--at-x) top-(--at-y) z-1 flex -translate-y-full border-none bg-transparent p-0 rounded-full outline-hidden"
    data-slot="page-pill"
    onblur={() => {
      keyed = null;
    }}
    onclick={() => press(pin.id)}
    onfocus={() => {
      keyed = lastInput.current === "key" ? pin.id : null;
    }}
    onkeydown={(event) => {
      // A key on a pill focused by a press makes its focus visible; a modifier alone never does.
      if (keyboardUse(event)) {
        keyed = pin.id;
      }
    }}
    style:--at-x={pin.id === PINS[0].id ? "70%" : "var(--space-5)"}
    style:--at-y={pin.id === PINS[0].id ? "50%" : "var(--space-4)"}
    type="button"
  >
    <!-- Held, the card's goo draws the pin as part of itself: the page's own pill steps back. -->
    <span class={["flex", (held(pin.id) || covered(pin.id)) && "opacity-0"]}>
      {@render pillOf(pin, keyed === pin.id)}
    </span>
  </button>
{/snippet}

<main
  class="flex h-dvh flex-col bg-surface-recess text-ink-strong"
  style:--dur-goo="{openMs}ms"
  style:--dur-goo-exit="{closeMs}ms"
>
  <!-- The controls. -->
  <header
    class="flex flex-none flex-wrap items-center gap-x-space-5 gap-y-space-2 border-b border-border-hairline bg-surface-raised px-space-4 py-space-2 type-meta"
    data-slot="dials"
  >
    <label class="flex items-center gap-space-2">
      <span>Open, ms</span>
      <input
        bind:value={openMs}
        class="accent-action-solid"
        max="2000"
        min="100"
        step="10"
        type="range"
      />
      <span class="num w-c-bench-readout-w">{openMs}</span>
    </label>
    <label class="flex items-center gap-space-2">
      <span>Close, ms</span>
      <input
        bind:value={closeMs}
        class="accent-action-solid"
        max="2000"
        min="100"
        step="10"
        type="range"
      />
      <span class="num w-c-bench-readout-w">{closeMs}</span>
    </label>
    <label class="flex items-center gap-space-2">
      <input
        bind:checked={joined}
        class="accent-action-solid"
        type="checkbox"
      />
      <span>Stay joined</span>
    </label>
    <label class="flex items-center gap-space-2">
      <span>Status</span>
      <select bind:value={dot} class="type-meta">
        <option value="none">None</option>
        <option value="live">Working</option>
        <option value="unread">Unread</option>
      </select>
    </label>
    <label class="flex items-center gap-space-2">
      <span>Count</span>
      <select bind:value={count} class="type-meta num">
        {#each COUNTS as one (one)}
          <option value={one}>{one}</option>
        {/each}
      </select>
    </label>
    <label class="flex items-center gap-space-2">
      <input
        bind:checked={firstSent}
        class="accent-action-solid"
        type="checkbox"
      />
      <span>Threads as first sent</span>
    </label>
    <button class="ms-auto underline" onclick={reset} type="button"
      >Reset</button
    >
  </header>
  <!-- The preview's well: the page, and the card's layer over it. -->
  <div
    bind:this={well}
    class="relative min-h-0 flex-auto"
    data-slot="well"
    {@attach measureRoom}
  >
    <div
      class="absolute inset-0 overflow-y-auto bg-surface-page"
      data-slot="page"
      onscroll={measure}
    >
      <div
        {@attach measureColumn}
        class="mx-auto flex max-w-c-decision-page-max flex-col gap-space-6 px-space-5 py-space-5"
      >
        <div class="flex flex-wrap items-center gap-space-3">
          <h1 class="m-0 type-title">How a comment opens</h1>
          <span class="relative" bind:this={targets[pins[0].id]}>
            <span
              class="flex items-center rounded-md border border-border-control bg-surface-raised px-space-3 py-space-1 type-label"
            >
              Play the opening again
            </span>
            {@render pinOn(pins[0])}
          </span>
        </div>
        <section class="flex flex-col gap-space-2">
          <p class="m-0 text-ink-muted type-meta">Decision page</p>
          <h2 class="m-0 type-title">Away mode</h2>
          <p class="m-0 max-w-c-measure text-ink-muted type-body">
            What CawCo does with your sessions while you are away from the desk,
            and how it tells you what happened once you are back.
          </p>
        </section>
        {#each [{ q: "When should new sessions pause?", why: "A session that starts while nobody watches can wait on a question for hours.", options: [["Pause new sessions after 30 minutes away", "Running ones finish their turn, nothing new starts."], ["Never pause", "Routines keep starting on their schedule."]] }, { q: "Who hears about it?", why: "Most away notes are for you; some are for whoever shares the machine.", options: [["Only you", "Notes go to the account that started the session."], ["Everyone on the hub", "Each person sees the notes of every machine they can reach."]] }, { q: "Where should the away notes sit?", why: "Each session leaves a note when it stops for you: what it finished, what it needs.", options: [["In the rail", "The notes collect in the Comments rail, its tab counting the new ones."], ["On the session's card", "One line under the card's title, the rest a press away."], ["In the transcript", "A row in the conversation where the session stopped."]] }, { q: "What happens when you're back?", why: "The first thing you see after a long break.", options: [["Send one digest when you're back", "Every note in one list, newest first, each a link to its session."], ["Show each note where it is", "No list: the rail's count and the cards say it."]] }] as card (card.q)}
          <section
            class="flex flex-col gap-space-3 rounded-lg border border-border-hairline bg-surface-raised p-space-4"
          >
            <div class="flex flex-col gap-space-1">
              <h3 class="m-0 type-label">{card.q}</h3>
              <p class="m-0 text-ink-muted type-meta">{card.why}</p>
            </div>
            {#each card.options as [name, line], i (name)}
              {@const pinned = card.q === parents[PINS[1].id] && i === 0}
              {#if pinned}
                <div
                  bind:this={targets[pins[1].id]}
                  class="relative flex flex-col gap-space-1 rounded-md border border-border-control p-space-3"
                >
                  <span class="type-label">{name} · Recommended</span>
                  <span class="text-ink-muted type-meta">{line}</span>
                  {@render pinOn(pins[1])}
                </div>
              {:else}
                <div
                  class="flex flex-col gap-space-1 rounded-md border border-border-control p-space-3"
                >
                  <span class="type-label">{name}</span>
                  <span class="text-ink-muted type-meta">{line}</span>
                </div>
              {/if}
            {/each}
          </section>
        {/each}
        <p class="m-0 text-ink-muted type-meta">
          Picks are kept as you make them.
        </p>
        <!-- Room to scroll the last answers up past the card. -->
        <div aria-hidden="true" class="h-dvh"></div>
      </div>
    </div>
    <!-- The card's layer: the size container its width reads (`--c-pin-card-reading-w`). -->
    <div
      class="@container pointer-events-none absolute inset-0"
      data-slot="pin-room"
    >
      {#if shownPin}
        {@const pin = shownPin}
        {@const where = at[pin.id]}
        {#key pin.id}
          {#snippet copy()}
            {@render pillOf(pin, keyed === pin.id)}
          {/snippet}
          <PinFloatGoo
            bind:area={cardArea}
            bind:float={card}
            box={where?.box ?? null}
            dot={dotOf}
            focused={keyed === pin.id}
            {joined}
            onclosed={() => {
              if (open !== shown) {
                shown = null;
              }
            }}
            open={open === pin.id}
            label="Comment {pin.number}"
            mark={where?.mark ?? null}
            pill={copy}
            pin={pin.number}
            room={{ w: roomW, h: roomH }}
          >
            <PinCard
              agentName={AGENT}
              draft={draftOf(pin.id)}
              link="/dev/pin-goo#pin-{pin.number}"
              marked={!!where?.mark}
              name={pinName(pin)}
              onclose={() => {
                open = null;
              }}
              ondelete={async () => undefined}
              onfind={() => pills[pin.id]?.scrollIntoView({ block: "center" })}
              onplace={() => undefined}
              onreply={() => undefined}
              onresolve={() => undefined}
              onretry={() => undefined}
              parent={parents[pin.id] ?? null}
              {pin}
              problem={null}
            />
          </PinFloatGoo>
        {/key}
      {/if}
    </div>
  </div>
</main>
