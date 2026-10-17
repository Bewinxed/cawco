<script lang="ts">
  /**
   * The chip lives inside the fill so the level and its filled track read as
   * one object, and the fill's right end is the value. The chip snaps to the
   * level nearest the pointer; its centre sits at kw/2 + f * (width - kw).
   */
  import type { EffortLevel } from "@cawco/core";
  import { untrack } from "svelte";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";

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

<!-- literal: 56px / 64px height, 10px 12px padding, 30px / 38px track -->
<div
  class="relative grid h-(--h) max-phone:h-(--h-phone) overflow-hidden rounded-md border border-border-hairline bg-surface-recess px-(--pad-x) py-(--pad-y) data-embedded:h-auto data-embedded:border-none data-embedded:border-current data-embedded:bg-transparent data-embedded:p-0"
  data-embedded={embedded || undefined}
  style:--h="56px"
  style:--h-phone="64px"
  style:--pad-x="12px"
  style:--pad-y="10px"
>
  <div
    class={[
      "col-start-1 row-start-1 grid content-start opacity-(--o) transition-[opacity] dur-pop ease-out",
      n ? "pointer-events-auto" : "pointer-events-none",
    ]}
    style:--o={n ? 1 : 0.55}
  >
    <div
      data-slot="track"
      data-focus={focused || undefined}
      data-ready={ready || undefined}
      class="relative h-(--track-h) max-phone:h-(--track-h-phone) cursor-ew-resize touch-none overflow-hidden rounded-md border border-border-control bg-surface-raised shadow-none select-none data-focus:outline-solid data-focus:outline-(length:--focus-ring-width) data-focus:outline-focus-ring data-focus:outline-offset-(--focus-ring-inset)"
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
      style:--kw={`${kw}px`}
      style:--track-h="30px"
      style:--track-h-phone="38px"
      bind:clientWidth={trackWidth}
    >
      <div
        data-slot="fill"
        class="pointer-events-none absolute top-0 bottom-0 left-0 flex w-(--w) items-center justify-end rounded-(--r) bg-surface-recess-deep p-space-row motion-safe:transition-[width] motion-safe:duration-(--ns-fill-ms) motion-safe:ease-in-out"
        style:--r="calc(var(--radius-md) - 1px)"
        style:--w={`calc(var(--kw) + ${p} * (100% - var(--kw)))`}
      >
        <!-- literal: 8px inline padding -->
        <div
          data-slot="knob"
          class="grid h-full shrink-0 place-items-center rounded-sm bg-surface-lift px-(--pad-x) font-body text-size-label leading-none font-medium text-ink-muted capitalize num opacity-(--o) transition-[color,opacity] pointer-events-none dur-control ease-out whitespace-nowrap data-active:text-ink-strong"
          data-active={active || undefined}
          style:--bars={n}
          style:--o={n ? 1 : 0.7}
          style:--pad-x="8px"
          bind:offsetWidth={knobWidth}
        >
          <!-- The chip is as wide as its longest label so the rail never moves.
               The ghost holds that width; the icon and the label sit together,
               centred in it, so a short label leaves no gap beside it. -->
          <!-- literal: 4px / 2px / 5px bar pitch in the padding -->
          <span
            data-slot="ghost"
            aria-hidden="true"
            class="invisible col-start-1 row-start-1 grid justify-items-start ps-(--ps)"
            style:--ps="calc(var(--bars) * 4px - 2px + 5px)"
          >
            {#each efforts as level, i (level)}
              <span class="col-start-1 row-start-1">{level}</span>
            {/each}
          </span>
          <!-- literal: 5px gap -->
          <span
            class="mark-line col-start-1 row-start-1 flex items-center gap-(--gap)"
            style:--gap="5px"
          >
            {#if n}
              <!-- One bar per level, all the same size on whole pixels; the lit
                   ones say where the level sits. -->
              <svg
                aria-hidden="true"
                class="block flex-none"
                height="10"
                viewBox={`0 0 ${n * 4 - 2} 10`}
                width={n * 4 - 2}
              >
                {#each efforts as level, i (level)}
                  <rect
                    class="fill-ink-strong opacity-22"
                    height="10"
                    rx="1"
                    width="2"
                    x={i * 4}
                  />
                  <rect
                    data-slot="bar-fill"
                    class="origin-bottom transform-(--t) fill-ink-strong motion-safe:transition-[transform] motion-safe:delay-(--delay) motion-safe:dur-morph motion-safe:ease-out"
                    height="10"
                    rx="1"
                    style={`--delay:${barDelay(i)}ms`}
                    style:--t={i <= effortIdx ? "scaleY(1)" : "scaleY(0)"}
                    width="2"
                    x={i * 4}
                  />
                {/each}
              </svg>
            {/if}
            {#if n}
              <!-- The word morphs letter by letter into the next. The chip is as wide
                   as its longest label, so the word never leaves it. -->
              <span class="whitespace-nowrap normal-case"
                ><MorphText text={capital(label)} /></span
              >
            {:else}
              <span class="whitespace-nowrap normal-case">{label}</span>
            {/if}
          </span>
        </div>
      </div>
      {#each pips as pip, i (i)}
        <!-- literal: 5px dot, -2.5px offset -->
        <span
          data-slot="pip"
          class="pointer-events-none absolute top-1/2 left-(--left) mt-(--mt) size-(--dot) rounded-pill bg-ink-strong opacity-(--o) transition-[opacity] dur-control ease-out"
          style:--dot="5px"
          style:--left={`calc(var(--kw) / 2 - 2.5px + ${pip.frac} * (100% - var(--kw)))`}
          style:--mt="-2.5px"
          style:--o={pip.on ? 0.3 : 0}
        ></span>
      {/each}
      <input
        aria-label="Effort"
        aria-valuetext={label}
        class="pointer-events-none absolute inset-0 m-0 h-full w-full opacity-0"
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
      />
    </div>
  </div>
</div>

<style>
  /* residual: unmapped */
  /* needs transition token: var(--transition-control), box-shadow var(--dur-control) var(--ease-out) */
  [data-slot="track"] {
    transition:
      var(--transition-control),
      box-shadow var(--dur-control) var(--ease-out);
  }
  /* needs transition token: left var(--ns-fill-ms) var(--ease-in-out), opacity var(--dur-control) var(--ease-out) */
  [data-slot="pip"] {
    @media (prefers-reduced-motion: no-preference) {
      transition:
        left var(--ns-fill-ms) var(--ease-in-out),
        opacity var(--dur-control) var(--ease-out);
    }
  }
  /* A compound box-shadow: an inset ring and the raised shadow. */
  [data-slot="knob"] {
    box-shadow:
      inset 0 0 0 1px var(--neutral-8),
      var(--shadow-raised);
  }
  [data-slot="bar-fill"] {
    transform-box: fill-box;
  }
  /* residual: foreign-dom */
  /* Until the chip is measured nothing in the track moves. */
  [data-slot="track"]:not([data-ready]),
  [data-slot="track"]:not([data-ready]) :global(*) {
    transition: none;
  }
</style>
