<script lang="ts">
  /**
   * The steps bar over a component canvas's page (the primitives spec
   * §1.2): the step slider, the Steps | Graph switch and Hide, on one
   * floating bar, drawn three ways while the owner picks (call 1, its
   * references in design/graph-controls-references.md):
   *
   * - `field` (Dessn's controls, nim's tweet): one field, the kept state's
   *   name at its start and 3/6 at its end, its fill up to the kept stop and
   *   a notch per stop; the whole field scrubs. Top of the page, the
   *   switch leading.
   * - `scrubber` (Apple Books' page scrubber, HIG Page controls): a dot per
   *   stop beside the kept name, the stop under the pointer or finger named
   *   in a bubble over it. Foot of the page, centred, Graph its one glyph.
   * - `player` (Sentry's replay bar, a mini player): ‹ and ›, Play through
   *   the sequence, the kept name and 3/6, a line of one segment per stop
   *   along its foot that scrubs. Foot of the page, centred, the switch its
   *   own glass group beside it (iOS 26's tab bar and its accessory).
   *
   * Every side scrubs the same way: between two stops it holds the move
   * into the next at that fraction (a stop whose story plays no move snaps
   * at the midpoint) and a let-go lands on the nearer stop. A hover on a
   * stop previews it on the page, a press keeps it; ← and → (J and K) step,
   * Home and End go to the ends. Hide folds the bar into a pill saying 3/6
   * where it stood (The One Object Rule); resting a mouse on the pill peeks
   * the bar over the page without taking room from it, a press brings it
   * back. Under a finger there is no peek: a tap brings it back.
   */
  import type { StepState } from "@cawco/core/design-graph";
  import { designGraphWords as words } from "@cawco/core/words/design-graph";
  import type { Snippet } from "svelte";
  import { cubicOut } from "svelte/easing";
  import type { TransitionConfig } from "svelte/transition";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import {
    dur,
    easeDrawer,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import {
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
    IconChevronUp,
    IconPause,
    IconPlay,
    IconSteps,
    IconStructure,
  } from "#lib/icons.js";
  import type { DesignGraph } from "./design-graph.svelte";
  import { graphOptions } from "./options.svelte";
  import { RING, SYMBOL } from "./symbol";

  let {
    graph,
    phone = false,
    dials,
    onbox,
    switcher,
  }: {
    graph: DesignGraph;
    /** A narrow pane: the bar runs the pane's width. */
    phone?: boolean;
    /** The agent's dials, which stand and fold with the bar. */
    dials?: Snippet;
    /** The room the bar takes from the page while it stands (0 folded or peeked: then it floats over the page). */
    onbox?: (height: number) => void;
    /** The Steps | Graph switch, bare, for a glass group it stands in. */
    switcher: Snippet;
  } = $props();

  const look = $derived(graphOptions.sides.bar);
  const steps = $derived(graph.steps);
  const count = $derived(steps.length);
  const last = $derived(Math.max(0, count - 1));
  /** Where the slider stands, in stops from the first: held, where the finger is; else the kept stop. */
  const place = $derived(graph.scrubAt ?? Math.max(0, graph.at));
  const kept = $derived(graph.at >= 0 ? steps[graph.at] : undefined);
  /** The stop a pointer rests on or a finger holds, named in place of the kept one while it does. */
  let aimed = $state<number | null>(null);
  const shown = $derived(aimed === null ? kept : (steps[aimed] ?? kept));
  const fraction = (at: number) => (last > 0 ? at / last : 1);
  /** A stop's place along a track, as a share of it. */
  const share = (at: number) => `${fraction(at) * 100}%`;

  /* --- Folded, peeked, standing --------------------------------------------- */

  const hidden = $derived(graph.barHidden);
  let peeking = $state(false);
  const open = $derived(!hidden || peeking);
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  let pill = $state<HTMLButtonElement>();
  let hideButton = $state<HTMLButtonElement>();

  function setHidden(next: boolean): void {
    clearTimeout(peekTimer);
    peeking = false;
    graph.setBarHidden(next);
    queueMicrotask(() =>
      (next ? pill : hideButton)?.focus({ preventScroll: true })
    );
  }
  /** A mouse resting on the pill peeks the bar; one leaving the bar puts it away. */
  function restOn(event: PointerEvent): void {
    if (event.pointerType !== "mouse" || !hidden) {
      return;
    }
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      peeking = true;
    }, dur("--dur-peek"));
  }
  function leave(event: PointerEvent): void {
    if (event.pointerType !== "mouse") {
      return;
    }
    clearTimeout(peekTimer);
    if (hidden && peeking && !press) {
      peekTimer = setTimeout(() => {
        peeking = false;
      }, dur("--dur-peek"));
    }
  }

  // The room it takes: standing, its height; folded or peeked, none, so the page never moves as it peeks.
  let height = $state(0);
  $effect(() => {
    onbox?.(hidden ? 0 : height);
  });

  /**
   * The bar folding into its pill and growing back out of it, from the edge
   * it stands at: a scale from its anchor and a fade; with less motion a fade.
   */
  const origin = $derived(look === "field" ? "top left" : "bottom center");
  function fold(node: Element, { exit }: { exit: boolean }): TransitionConfig {
    const moving = motionOk.current;
    (node as HTMLElement).style.transformOrigin = origin;
    return {
      duration: dur(exit ? "--dur-exit" : "--dur-panel"),
      easing: exit ? cubicOut : easeDrawer,
      css: (t) =>
        moving
          ? `opacity: ${t}; transform: scale(${0.9 + 0.1 * t})`
          : `opacity: ${t}`,
    };
  }

  /* --- The hand: a drag scrubs, a press keeps, a hover or a held press previews --- */

  let track = $state<HTMLElement>();
  /** Stops from the first at a pointer's x over the track. */
  const placeAt = (clientX: number): number => {
    const box = track?.getBoundingClientRect();
    if (!box || box.width <= 0) {
      return 0;
    }
    const along = (clientX - box.left) / box.width;
    const ltr = getComputedStyle(track as HTMLElement).direction !== "rtl";
    return Math.max(0, Math.min(1, ltr ? along : 1 - along)) * last;
  };
  const nearest = (clientX: number) => Math.round(placeAt(clientX));
  let press: {
    id: number;
    x: number;
    y: number;
    dragging: boolean;
    shown: boolean;
    timer: ReturnType<typeof setTimeout> | undefined;
  } | null = null;

  function aim(at: number | null): void {
    aimed = at;
    const step = at === null ? null : steps[at];
    graph.preview(step && !step.missing ? step.point : null);
  }
  function down(event: PointerEvent): void {
    if (event.button !== 0 || count < 2) {
      return;
    }
    const at = nearest(event.clientX);
    const one: NonNullable<typeof press> = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
      shown: false,
      timer: undefined,
    };
    // A held finger previews the stop under it, as a resting mouse does.
    if (event.pointerType !== "mouse") {
      one.timer = setTimeout(() => {
        one.shown = true;
        aim(at);
      }, dur("--dur-press-hold"));
    }
    press = one;
  }
  function move(event: PointerEvent): void {
    if (!press) {
      if (event.pointerType === "mouse" && count > 1) {
        aim(nearest(event.clientX));
      }
      return;
    }
    if (event.pointerId !== press.id) {
      return;
    }
    const dx = event.clientX - press.x;
    if (!press.dragging) {
      // A sideways drag scrubs; one that goes up or down first is the page's scroll.
      if (
        Math.abs(dx) < 4 ||
        Math.abs(dx) < Math.abs(event.clientY - press.y)
      ) {
        return;
      }
      press.dragging = true;
      clearTimeout(press.timer);
      graph.preview(null);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    const at = placeAt(event.clientX);
    aimed = Math.round(at);
    graph.scrub(at);
  }
  function up(event: PointerEvent): void {
    if (!press || event.pointerId !== press.id) {
      return;
    }
    clearTimeout(press.timer);
    const { dragging, shown: held } = press;
    press = null;
    if (held) {
      aim(null);
    }
    if (dragging) {
      aimed = null;
      graph.release();
      return;
    }
    if (!held) {
      const step = steps[nearest(event.clientX)];
      if (step && !step.missing) {
        graph.keepAt(step.point);
      }
    }
  }
  function cancel(event: PointerEvent): void {
    if (press?.dragging) {
      graph.release();
    }
    clearTimeout(press?.timer);
    press = null;
    aim(null);
    leave(event);
  }
  function out(event: PointerEvent): void {
    if (!press) {
      aim(null);
    }
    leave(event);
  }
  function key(event: KeyboardEvent): void {
    const to = {
      ArrowLeft: -1,
      ArrowRight: 1,
      j: -1,
      k: 1,
      J: -1,
      K: 1,
    }[event.key] as -1 | 1 | undefined;
    if (to) {
      event.preventDefault();
      graph.stepBy(to);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      graph.stepTo(event.key === "Home" ? "first" : "last");
    }
  }
  const stepAt = (delta: -1 | 1) => graph.stepBy(delta);
  function nameOf(step: StepState | undefined): string {
    if (!step) {
      return "";
    }
    return step.missing ? words.stepMissing(step.name) : step.name;
  }
  /** A stop's mark, by side: the kept one inked, a missing one hollow or dashed, the rest quiet. */
  function markOf(
    at: number,
    step: StepState,
    inked: string,
    missing: string,
    rest: string
  ): string {
    if (at === Math.round(place)) {
      return inked;
    }
    return step.missing ? missing : rest;
  }
  /** A player's segment: inked up to the kept stop, muted up to the one aimed at, then the track. */
  function segmentOf(at: number, step: StepState): string {
    if (at <= Math.round(place)) {
      return "bg-ink-strong";
    }
    if (aimed !== null && at <= aimed) {
      return "bg-ink-muted";
    }
    return step.missing ? "bg-surface-fill" : "bg-surface-fill-strong";
  }

  /* --- The player's Play: the sequence plays through to its end --------------- */

  let playing = $state(false);
  let playTimer: ReturnType<typeof setTimeout> | undefined;
  function play(): void {
    if (playing) {
      playing = false;
      clearTimeout(playTimer);
      return;
    }
    if (graph.at >= last) {
      graph.stepTo("first");
    }
    playing = true;
    const next = () => {
      // Each stop holds while its move plays, and a beat after it rests.
      playTimer = setTimeout(
        () => {
          if (!playing) {
            return;
          }
          if (graph.at >= last) {
            playing = false;
            return;
          }
          graph.stepBy(1);
          next();
        },
        graph.playLength + dur("--dur-panel") * 3
      );
    };
    next();
  }
  $effect(() => () => clearTimeout(playTimer));

  /** The slider's one keyboard stop, on the element each side scrubs. */
  const sliderProps = $derived({
    "aria-label": words.slider,
    "aria-valuemax": count,
    "aria-valuemin": 1,
    "aria-valuenow": Math.round(place) + 1,
    "aria-valuetext": kept ? nameOf(kept) : undefined,
    role: "slider",
    tabindex: 0,
    onkeydown: key,
    onpointerdown: down,
    onpointermove: move,
    onpointerup: up,
    onpointercancel: cancel,
    onpointerleave: out,
  });
  const GLASS =
    "relative before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:rounded-inherit before:border before:border-border-hairline before:bg-material-panel before:shadow-tile before:glass-backdrop contrast-more:before:border-border-contrast contrast-more:before:bg-surface-raised contrast-more:before:backdrop-filter-none reduced-transparency:before:border-border-contrast reduced-transparency:before:bg-surface-raised reduced-transparency:before:backdrop-filter-none";
</script>

{#snippet hideToggle()}
  <button
    bind:this={hideButton}
    aria-expanded={!hidden}
    aria-label={hidden ? words.showSteps : words.hideSteps}
    class={SYMBOL}
    data-hide-steps
    onclick={() => setHidden(!hidden)}
    title={hidden ? words.showSteps : words.hideSteps}
    type="button"
    >{#if (look === "field") !== hidden}<IconChevronUp />{:else}<IconChevronDown
      />{/if}</button
  >
{/snippet}

{#snippet fieldBar()}
  <!-- Dessn's field: the switch leading, then one field that is the slider, then Hide. -->
  <div
    class="{GLASS} flex h-c-btn-h-lg w-full min-w-0 items-center gap-c-bar-group-pad rounded-pill p-c-bar-group-pad"
    data-steps-bar="field"
  >
    <div class="flex-none">{@render switcher()}</div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      bind:this={track}
      {...sliderProps}
      class={[
        "group/field relative flex h-c-btn-h min-w-0 flex-1 cursor-ew-resize touch-pan-y items-center overflow-hidden rounded-pill bg-surface-fill select-none",
        RING,
      ]}
      data-dragging={graph.scrubAt !== null || undefined}
      data-track
    >
      <!-- The fill, up to the kept stop (where the finger is, held); the ghost, up to the stop a pointer rests on. -->
      {#if aimed !== null && graph.scrubAt === null}
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 start-0 w-(--to) rounded-pill bg-surface-fill-strong/50"
          style:--to={`calc(var(--c-btn-h) + (100% - var(--c-btn-h)) * ${fraction(aimed)})`}
        ></span>
      {/if}
      <span
        aria-hidden="true"
        class={[
          "pointer-events-none absolute inset-y-0 start-0 w-(--to) rounded-pill bg-surface-fill-strong",
          graph.scrubAt === null &&
            "transition-[width] duration-(--dur-control) ease-out motion-reduce:transition-none",
        ]}
        style:--to={`calc(var(--c-btn-h) + (100% - var(--c-btn-h)) * ${fraction(place)})`}
      ></span>
      <!-- A notch per stop along the field's top, the kept one inked, a missing one hollow; gone where they'd crowd. -->
      {#if count > 1 && count <= 24}
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-(--half) top-space-1 h-space-1"
          style:--half="calc(var(--c-btn-h) / 2)"
        >
          {#each steps as step, at (step.point.story)}
            <i
              class={[
                "absolute top-0 start-(--x) size-1 -translate-x-1/2 rtl:translate-x-1/2 rounded-pill",
                markOf(
                  at,
                  step,
                  "bg-ink-strong",
                  "border border-ink-muted",
                  "bg-ink-muted"
                ),
              ]}
              style:--x={share(at)}
            ></i>
          {/each}
        </span>
      {/if}
      <span
        class={[
          "relative min-w-0 flex-1 truncate ps-space-4 type-label",
          shown?.missing ? "text-ink-subtle line-through" : "text-ink-strong",
        ]}
        data-name
        title={nameOf(shown)}>{shown?.name ?? ""}</span
      >
      <span
        class="relative flex-none pe-space-4 ps-space-2 type-code text-ink-row tabular-nums"
        data-figure
        >{words.stepFigure(Math.round(aimed ?? place) + 1, count)}</span
      >
    </div>
    {@render hideToggle()}
  </div>
{/snippet}

{#snippet scrubberBar()}
  <!-- Apple Books' scrubber: the kept name, a dot per stop that scrubs, the one Graph glyph and Hide. -->
  <!-- mark-line: the name stands beside the dots' track and the symbols, each a control of its own, not words beside a mark -->
  <div
    class="{GLASS} flex h-c-btn-h-lg max-w-full min-w-0 items-center gap-space-2 rounded-pill ps-space-4 pe-c-bar-group-pad"
    data-steps-bar="scrubber"
  >
    <span
      class="max-w-c-graph-node-w flex-none truncate type-label text-ink-strong"
      data-name
      title={nameOf(kept)}>{kept?.name ?? ""}</span
    >
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      bind:this={track}
      {...sliderProps}
      class={[
        "relative flex h-c-btn-h w-(--w) max-w-c-graph-panel-w min-w-c-btn-h shrink cursor-ew-resize touch-pan-y items-center rounded-pill select-none",
        RING,
      ]}
      data-track
      style:--w={`calc(${Math.max(1, count)} * var(--space-4))`}
    >
      {#if count * 6 > 448}
        <!-- Past what dots can count (HIG Page controls: more than about ten are hard to count), they run as one line. -->
        <span
          aria-hidden="true"
          class="absolute inset-x-0 h-1 rounded-pill bg-surface-fill-strong"
        ></span>
        <span
          aria-hidden="true"
          class="absolute start-0 h-1 w-(--to) rounded-pill bg-ink-strong"
          style:--to={share(place)}
        ></span>
      {:else}
        {#each steps as step, at (step.point.story)}
          <i
            aria-hidden="true"
            class={[
              "absolute start-(--x) size-space-2 -translate-x-1/2 rtl:translate-x-1/2 rounded-pill transition-[scale,background-color] duration-(--dur-control) ease-out motion-reduce:transition-none",
              markOf(
                at,
                step,
                "bg-ink-strong",
                "border border-dashed border-border-control-strong",
                "bg-border-control-strong"
              ),
              aimed === at && Math.round(place) !== at && "scale-125",
            ]}
            style:--x={`calc(var(--space-2) / 2 + (100% - var(--space-2)) * ${fraction(at)})`}
          ></i>
        {/each}
      {/if}
      {#if aimed !== null && steps[aimed]}
        <!-- The bubble: the stop under the pointer or finger, named over it (Apple Books' chapter bubble). -->
        <span
          class="pointer-events-none absolute bottom-full mb-space-3 start-(--x) z-2 flex max-w-c-graph-panel-w -translate-x-1/2 rtl:translate-x-1/2 items-baseline gap-space-1 rounded-pill bg-ink-solid px-space-3 py-space-1 whitespace-nowrap shadow-overlay"
          data-bubble
          style:--x={`calc(var(--space-2) / 2 + (100% - var(--space-2)) * ${fraction(aimed)})`}
        >
          <span
            class="max-w-c-graph-node-w min-w-0 truncate type-label text-on-ink"
            >{steps[aimed]?.name}</span
          >
          <span class="type-meta text-on-ink/70 tabular-nums"
            >{words.stepOf(aimed + 1, count)}</span
          >
        </span>
      {/if}
    </div>
    <button
      aria-label={words.graphView}
      class={SYMBOL}
      onclick={() => graph.setIndex("graph")}
      title={words.graphView}
      type="button"><IconStructure /></button
    >
    {@render hideToggle()}
  </div>
{/snippet}

{#snippet playerBar()}
  <!-- Sentry's replay bar: ‹, Play, the kept name and 3/6, ›, Hide; one segment per stop along its foot that scrubs. -->
  <div class="flex max-w-full min-w-0 items-center gap-space-2">
    <div
      class="{GLASS} flex h-c-btn-h-lg min-w-0 flex-col justify-center rounded-pill px-c-bar-group-pad"
      data-steps-bar="player"
    >
      <div class="flex min-w-0 items-center gap-c-bar-group-pad">
        <button
          aria-label={words.previousStep}
          class={SYMBOL}
          disabled={graph.at <= 0}
          onclick={() => stepAt(-1)}
          title={words.previousStep}
          type="button"><IconChevronLeft /></button
        >
        <button
          aria-label={playing ? words.pauseSteps : words.playSteps}
          aria-pressed={playing}
          class={SYMBOL}
          disabled={count < 2}
          onclick={play}
          title={playing ? words.pauseSteps : words.playSteps}
          type="button"
          >{#if playing}<IconPause />{:else}<IconPlay />{/if}</button
        >
        <span
          class="flex max-w-c-graph-panel-w min-w-0 items-baseline gap-space-2 px-space-1"
        >
          <span
            class="min-w-0 truncate type-label text-ink-strong"
            data-name
            title={nameOf(shown)}>{shown?.name ?? ""}</span
          >
          <span class="flex-none type-code text-ink-muted tabular-nums"
            >{words.stepFigure(Math.round(aimed ?? place) + 1, count)}</span
          >
        </span>
        <button
          aria-label={words.nextStep}
          class={SYMBOL}
          disabled={graph.at >= last}
          onclick={() => stepAt(1)}
          title={words.nextStep}
          type="button"><IconChevronRight /></button
        >
        {@render hideToggle()}
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={track}
        {...sliderProps}
        class={[
          "absolute inset-x-space-6 bottom-0 flex h-space-3 coarse:h-space-5 cursor-ew-resize touch-pan-y items-end gap-px pb-space-1 select-none",
          RING,
        ]}
        data-track
      >
        {#each steps as step, at (step.point.story)}
          <i
            aria-hidden="true"
            class={[
              "h-0.5 min-w-px flex-1 rounded-pill transition-colors duration-(--dur-control) ease-out",
              segmentOf(at, step),
            ]}
          ></i>
        {/each}
      </div>
    </div>
    <div
      class="{GLASS} flex h-c-btn-h-lg flex-none items-center rounded-pill p-c-bar-group-pad"
    >
      {@render switcher()}
    </div>
  </div>
{/snippet}

{#if count > 0}
  <div
    class={[
      "pointer-events-none relative flex w-full min-w-0 flex-col gap-space-1",
      look === "field" ? "items-start" : "flex-col-reverse items-center",
    ]}
    data-steps={look}
    data-hidden={hidden || undefined}
    data-peeking={peeking || undefined}
  >
    {#if hidden}
      <!-- The pill the bar folds into: 3/6 where it stood, its press brings the bar back, a mouse resting on it peeks. -->
      <button
        bind:this={pill}
        aria-label={`${words.showSteps}, ${words.stepFigure(Math.max(0, graph.at) + 1, count)}`}
        class="{GLASS} mark-line pointer-events-auto flex h-c-btn-h items-center gap-space-1 rounded-pill ps-space-2 pe-space-3 type-label text-ink-strong touch-hit transition-[scale] duration-(--dur-control) ease-out active:scale-(--press-scale) {RING}"
        data-steps-pill
        onclick={() => setHidden(false)}
        onpointerenter={restOn}
        onpointerleave={leave}
        title={kept ? `${nameOf(kept)} · ${words.showSteps}` : words.showSteps}
        type="button"
        in:fold={{ exit: false }}
        ><IconSteps
          aria-hidden="true"
          class="size-c-bar-symbol text-ink-muted"
          data-box
        /><span class="tabular-nums"
          >{words.stepFigure(Math.max(0, graph.at) + 1, count)}</span
        ></button
      >
    {/if}
    {#if open}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        {@attach frameSize((node: HTMLElement) => {
          height = node.offsetHeight;
        })}
        class={[
          "pointer-events-auto flex min-w-0 flex-col gap-space-1",
          look !== "field" && "max-w-full flex-col-reverse items-center",
          look === "field" &&
            (phone ? "w-full" : "w-c-graph-panel-w max-w-full"),
          peeking &&
            (look === "field"
              ? "absolute top-0 start-0 z-1"
              : "absolute inset-x-0 bottom-0 z-1"),
        ]}
        data-steps-stack
        onpointerenter={() => clearTimeout(peekTimer)}
        onpointerleave={leave}
        in:fold={{ exit: false }}
        out:fold={{ exit: true }}
      >
        {#if look === "field"}
          {@render fieldBar()}
        {:else if look === "scrubber"}
          {@render scrubberBar()}
        {:else}
          {@render playerBar()}
        {/if}
        {@render dials?.()}
      </div>
    {/if}
  </div>
{/if}
