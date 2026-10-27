<script lang="ts">
  /**
   * THE GOO CARD (dev only): a comment's card pouring out of its pill
   * through the gooey plus-menu's filter (PinFloatGoo), on the page the
   * owner's two comments stood on (the comment-sizing preview's Away mode
   * decision page), each opening his own thread in the real PinCard. A
   * press on a pill opens its card; Close, Esc or the pill again closes it.
   * The page scrolls under an open card. The head's controls, in the words
   * of what they change: Stickiness, how far apart the card and its pin
   * still pull a bridge between them (the goo's blur, `--goo-blur`, a prop); Open
   * and Close, in ms (`--dur-goo`, `--dur-goo-exit`), read as each open or
   * close starts; Stay joined, the card kept joined to its pin by a neck
   * once open, the pin wearing the card's surface.
   */
  import type { Pin } from "@cawco/core/comments";
  import { pinName } from "@cawco/core/pin-name";
  import { tick } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import PinCard from "#lib/cawco/preview/PinCard.svelte";
  import PinMark, { markState } from "#lib/cawco/preview/PinMark.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import PinFloatGoo from "./PinFloatGoo.svelte";
  import { AGENT, PINS } from "./pins";

  interface Box {
    h: number;
    w: number;
    x: number;
    y: number;
  }

  /** Each thread as it was first sent, his words alone: a card shorter than the well, which moves once as its pill leaves it. */
  let firstSent = $state(false);
  const pins: Pin[] = $derived(
    firstSent
      ? PINS.map((one) => ({ ...one, thread: one.thread.slice(0, 1) }))
      : PINS
  );
  /** The page's words each pin stands on, by pin: comment 1 the button, comment 2 the recommended answer. */
  const parents: Record<number, string | null> = {
    1: null,
    2: "Where should the away notes sit?",
  };

  /** The controls, at their tokens' values (the goo's blur, its open and its close), joined. */
  const DEFAULTS = { stickiness: 6, openMs: 350, closeMs: 250, joined: true };
  let stickiness = $state(DEFAULTS.stickiness);
  let openMs = $state(DEFAULTS.openMs);
  let closeMs = $state(DEFAULTS.closeMs);
  let joined = $state(DEFAULTS.joined);
  const reset = () => {
    ({ stickiness, openMs, closeMs, joined } = DEFAULTS);
  };

  let well = $state<HTMLElement>();
  let roomW = $state(0);
  let roomH = $state(0);
  const pills = $state<Record<string, HTMLElement>>({});
  const targets = $state<Record<string, HTMLElement>>({});
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

  let open = $state<string | null>(null);
  const openPin = $derived(pins.find((one) => one.id === open) ?? null);
  /** How the open card goes: at once when another pin's card takes its place. */
  const exit: { at: "fade" | "cut" } = { at: "fade" };
  const drafts = new Map<string, ComposerDraft>();
  const draftOf = (id: string) => {
    const kept = drafts.get(id) ?? new ComposerDraft();
    drafts.set(id, kept);
    return kept;
  };
  async function press(id: string) {
    if (open === id) {
      open = null;
      return;
    }
    measure();
    exit.at = open ? "cut" : "fade";
    open = id;
    await tick();
    exit.at = "fade";
  }
</script>

<svelte:head><title>Goo card · CawCo</title></svelte:head>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape" && open) {
      open = null;
    }
  }}
/>

{#snippet pillOf(pin: Pin)}
  <PinMark
    focused={open === pin.id}
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
    class="absolute start-(--at-x) top-(--at-y) z-1 flex -translate-y-full border-none bg-transparent p-0 rounded-full focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
    data-slot="page-pill"
    onclick={() => press(pin.id)}
    style:--at-x={pin.number === 1 ? "70%" : "var(--space-5)"}
    style:--at-y={pin.number === 1 ? "50%" : "var(--space-4)"}
    type="button"
  >
    <!-- Joined, the card's goo draws the pin as part of itself: the page's own pill steps back. -->
    <span class={["flex", joined && open === pin.id && "opacity-0"]}>
      {@render pillOf(pin)}
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
      <span>Stickiness</span>
      <input
        bind:value={stickiness}
        class="accent-action-solid"
        max="12"
        min="3"
        step="0.5"
        type="range"
      />
      <span class="num w-c-bench-readout-w">{stickiness}</span>
    </label>
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
              {@const pinned = card.q === parents[2] && i === 0}
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
      {#if openPin}
        {@const pin = openPin}
        {@const where = at[pin.id]}
        {#key pin.id}
          {#snippet copy()}
            {@render pillOf(pin)}
          {/snippet}
          <PinFloatGoo
            box={where?.box ?? null}
            {exit}
            {joined}
            {stickiness}
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
              parent={parents[pin.number] ?? null}
              {pin}
              problem={null}
            />
          </PinFloatGoo>
        {/key}
      {/if}
    </div>
  </div>
</main>
