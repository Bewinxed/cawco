<script lang="ts">
  /**
   * The chip lives inside the fill so the level and its filled track read as
   * one object, and the fill's right end is the value. The chip snaps to the
   * level nearest the pointer; its centre sits at kw/2 + f * (width - kw).
   */
  import type { EffortLevel } from "@cawco/core";
  import { untrack } from "svelte";
  import { TextMorph } from "torph/svelte";
  import { morphMs } from "#lib/cawco/motion/curves.svelte.js";

  let {
    efforts,
    value,
    onchange,
    oncommit,
    embedded = false,
  }: {
    efforts: EffortLevel[];
    /** The level the slider sits on; the owner decides what "untouched" shows. */
    value: EffortLevel | null;
    onchange: (level: EffortLevel) => void;
    oncommit?: (level: EffortLevel) => void;
    embedded?: boolean;
  } = $props();

  let knobWidth = $state(0);
  /** Transitions wait for the chip's first measurement, so nothing slides in from zero. */
  let ready = $state(false);
  $effect(() => {
    if (knobWidth && !ready) {
      const frame = requestAnimationFrame(() => {
        ready = true;
      });
      return () => cancelAnimationFrame(frame);
    }
  });
  let draft = $state<EffortLevel | null>(null);
  const displayed = $derived(draft ?? value);
  const kw = $derived(knobWidth + 4);

  const n = $derived(efforts.length);
  const effortIdx = $derived(
    Math.max(0, efforts.indexOf(displayed as EffortLevel))
  );
  const frac = (i: number) => (n > 1 ? i / (n - 1) : 0);
  /** The chip always sits on a level; the pointer picks the nearest one. */
  const p = $derived(frac(effortIdx));
  let hover = $state(false);
  let drag = $state(false);
  /** Keyboard focus only; a pointer or an opening popover focusing the input is not shown. */
  let focused = $state(false);
  /** Offset from the pointer to the chip's centre at grab, so a drag moves it from there. */
  let grab = 0;
  const active = $derived(hover || drag || focused);
  let trackWidth = $state(0);
  /**
   * The level the bars last rested on, so a move fills the bars between there
   * and the new level in order (or drains them from the top down), rather than
   * every bar switching at once.
   */
  let restedOn = $state(0);
  let cameFrom = $state(0);
  $effect.pre(() => {
    const next = effortIdx;
    untrack(() => {
      if (next !== restedOn) {
        cameFrom = restedOn;
        restedOn = next;
      }
    });
  });
  /** Wait per bar, counted from the bar the move starts at; bars that do not change wait for nothing. */
  const BAR_STEP_MS = 40;
  const barDelay = (i: number) => {
    if (effortIdx > cameFrom && i > cameFrom && i <= effortIdx) {
      return (i - cameFrom - 1) * BAR_STEP_MS;
    }
    if (effortIdx < cameFrom && i > effortIdx && i <= cameFrom) {
      return (cameFrom - i) * BAR_STEP_MS;
    }
    return 0;
  };
  const capital = (word: string) =>
    word.charAt(0).toUpperCase() + word.slice(1);
  /** Gap kept between the chip's edge and the next stop marker. */
  const PIP_CLEARANCE = 10;
  /** A stop shows only where it lands in the empty track, clear of the chip. */
  const pips = $derived(
    efforts.map((_, i) => {
      const dist = (i - effortIdx) * (Math.max(1, trackWidth - kw) * frac(1));
      return { frac: frac(i), on: dist >= kw / 2 + PIP_CLEARANCE };
    })
  );
  const label = $derived(n ? (efforts[effortIdx] ?? "") : "Default");
  function change(level: EffortLevel) {
    if (oncommit) {
      draft = level;
    } else {
      onchange(level);
    }
  }
  function commit() {
    if (draft !== null) {
      oncommit?.(draft);
      draft = null;
    }
  }

  /** The pointer's x inside the track, and the rail the chip's centre travels. */
  function locate(event: PointerEvent) {
    const el = event.currentTarget as HTMLElement;
    const x = event.clientX - el.getBoundingClientRect().left - el.clientLeft;
    return { x, rail: Math.max(1, el.clientWidth - kw) };
  }
  const clamp01 = (f: number) => Math.min(1, Math.max(0, f));
  /** The chip's centre sits at kw/2 + f * rail. */
  function fracAt(x: number, rail: number) {
    return clamp01((x - kw / 2) / rail);
  }
  const levelOf = (f: number) => Math.round(f * (n - 1));
  function down(event: PointerEvent) {
    if (!n || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    event.preventDefault();
    const { x, rail } = locate(event);
    const centre = kw / 2 + p * rail;
    const onKnob = Math.abs(x - centre) <= kw / 2;
    grab = onKnob ? centre - x : 0;
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a nicety; the move handler still tracks the pointer.
    }
    drag = true;
    hover = false;
    change(efforts[levelOf(fracAt(x + grab, rail))]);
  }
  function move(event: PointerEvent) {
    if (!n) {
      return;
    }
    if (drag) {
      const { x, rail } = locate(event);
      const level = efforts[levelOf(fracAt(x + grab, rail))];
      if (level !== displayed) {
        change(level);
      }
      return;
    }
    hover = true;
  }
  function up() {
    commit();
    drag = false;
    hover = false;
  }
  function leave() {
    if (!drag) {
      hover = false;
    }
  }
</script>

<div class="box" class:embedded={embedded}>
  <div
    class="slider"
    style={`opacity:${n ? 1 : 0.55};pointer-events:${n ? "auto" : "none"}`}
  >
    <div
      class="track"
      onpointercancel={() => {
        draft = null;
        drag = false;
        hover = false;
      }}
      onpointerdown={down}
      onpointerleave={leave}
      onpointermove={move}
      onpointerup={up}
      role="presentation"
      style={`--kw:${kw}px`}
      class:focus={focused}
      class:ready={ready}
      bind:clientWidth={trackWidth}
    >
      <div
        class="fill"
        style={`width:calc(var(--kw) + ${p} * (100% - var(--kw)))`}
      >
        <div
          class="knob"
          style={`opacity:${n ? 1 : 0.7};--bars:${n}`}
          class:active={active}
          bind:offsetWidth={knobWidth}
        >
          <!-- The chip is as wide as its longest label so the rail never moves.
               The ghost holds that width; the icon and the label sit together,
               centred in it, so a short label leaves no gap beside it. -->
          <span aria-hidden="true" class="ghost">
            {#each efforts as level, i (level)}
              <span>{level}</span>
            {/each}
          </span>
          <span class="content">
            {#if n}
              <!-- One bar per level, all the same size on whole pixels; the lit
                   ones say where the level sits. -->
              <svg
                aria-hidden="true"
                class="level-bars"
                height="10"
                viewBox={`0 0 ${n * 4 - 2} 10`}
                width={n * 4 - 2}
              >
                {#each efforts as level, i (level)}
                  <rect class="bar" height="10" rx="1" width="2" x={i * 4} />
                  <rect
                    class="bar-fill"
                    height="10"
                    rx="1"
                    style={`--delay:${barDelay(i)}ms`}
                    width="2"
                    x={i * 4}
                    class:lit={i <= effortIdx}
                  />
                {/each}
              </svg>
            {/if}
            {#if n}
              <!-- The word morphs letter by letter into the next. The chip is as wide
                   as its longest label, so the word never leaves it. -->
              <TextMorph
                as="span"
                class="lvl"
                duration={morphMs()}
                text={capital(label)}
              />
            {:else}
              <span class="lvl">{label}</span>
            {/if}
          </span>
        </div>
      </div>
      {#each pips as pip, i (i)}
        <span
          class="pip"
          style={`left:calc(var(--kw) / 2 - 2.5px + ${pip.frac} * (100% - var(--kw)));opacity:${pip.on ? 0.3 : 0}`}
        ></span>
      {/each}
      <input
        aria-label="Effort"
        aria-valuetext={label}
        disabled={!n}
        max={Math.max(0, n - 1)}
        min="0"
        onblur={() => {
          focused = false;
        }}
        onchange={commit}
        onfocus={(event) => {
          focused = event.currentTarget.matches(":focus-visible");
        }}
        oninput={(event) => change(efforts[Number(event.currentTarget.value)])}
        step="1"
        type="range"
        value={effortIdx}
      >
    </div>
  </div>
</div>

<style>
  .box {
    position: relative;
    display: grid;
    height: 56px;
    padding: 10px 12px;
    background: var(--surface-recess);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .box.embedded {
    height: auto;
    padding: 0;
    border: 0;
    background: transparent;
  }
  .slider {
    grid-area: 1 / 1;
    display: grid;
    align-content: start;
    transition: opacity var(--dur-pop) var(--ease-out);
  }
  .track {
    position: relative;
    height: 30px;
    background: var(--surface-raised);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    overflow: hidden;
    cursor: ew-resize;
    user-select: none;
    touch-action: none;
    box-shadow: none;
    transition:
      var(--transition-control),
      box-shadow var(--dur-control) var(--ease-out);
  }
  /* The range input is invisible over the track, so the track is the
     field: its border takes the ring. */
  .track.focus {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-inset);
  }
  .fill {
    position: absolute;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: 2px;
    border-radius: calc(var(--radius-md) - 1px);
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--surface-recess-deep);
    pointer-events: none;
    @media (prefers-reduced-motion: no-preference) {
      transition: width var(--ns-fill-ms) var(--ease-in-out);
    }
  }
  .pip {
    position: absolute;
    top: 50%;
    width: 5px;
    height: 5px;
    margin-top: -2.5px;
    border-radius: var(--radius-pill);
    background: var(--ink-strong);
    transition: opacity var(--dur-control) var(--ease-out);
    pointer-events: none;
    @media (prefers-reduced-motion: no-preference) {
      transition:
        left var(--ns-fill-ms) var(--ease-in-out),
        opacity var(--dur-control) var(--ease-out);
    }
  }
  .knob {
    flex-shrink: 0;
    height: 100%;
    display: grid;
    place-items: center;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-lift);
    box-shadow:
      inset 0 0 0 1px var(--neutral-8),
      var(--shadow-raised);
    color: var(--ink-muted);
    font: var(--weight-strong) var(--text-label) / 1 var(--font-body);
    text-transform: capitalize;
    font-variant-numeric: tabular-nums;
    transition:
      color var(--dur-control) var(--ease-out),
      opacity var(--dur-control) var(--ease-out);
    pointer-events: none;
    white-space: nowrap;
  }
  .knob > * {
    grid-area: 1 / 1;
  }
  /* Every label stacked, so the chip is as wide as the longest and space
     for the icon is held beside it. */
  .ghost {
    display: grid;
    visibility: hidden;
    padding-inline-start: calc(var(--bars) * 4px - 2px + 5px);
  }
  .ghost {
    justify-items: start;
  }
  .ghost > span {
    grid-area: 1 / 1;
  }
  .knob :global(.lvl) {
    text-transform: none;
    white-space: nowrap;
  }
  .content {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .knob.active {
    color: var(--ink-strong);
  }
  /* As many bars as the model has levels, lit up to the one it sits on. The
     ramp is set inline so it spans 4→12px whether the model offers three
     levels or five. */
  /* Equal bars on whole pixels, about as tall as a capital letter beside it. */
  .level-bars {
    display: block;
    flex: none;
  }
  .bar {
    fill: var(--ink-strong);
    opacity: 0.22;
  }
  /* A lit bar fills up from its foot and drains back down into it; the wait
     per bar (set inline) makes a rise climb bar by bar and a fall drain from
     the top bar down. */
  .bar-fill {
    fill: var(--ink-strong);
    transform-box: fill-box;
    transform-origin: 50% 100%;
    transform: scaleY(0);
    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-morph) var(--ease-out) var(--delay, 0ms);
    }
  }
  .bar-fill.lit {
    transform: scaleY(1);
  }
  /* Until the chip is measured nothing in the track moves. */
  .track:not(.ready),
  .track:not(.ready) * {
    transition: none;
  }
  input[type="range"] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    pointer-events: none;
  }
  @media (max-width: 640px) {
    .box {
      height: 64px;
    }
    .track {
      height: 38px;
    }
    .knob {
      font-weight: var(--weight-strong);
    }
  }
</style>
