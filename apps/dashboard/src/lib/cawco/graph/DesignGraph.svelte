<script lang="ts" module>
  /** What the agent's ask names: the component in front, the state it opens on, and the face the room opens on. */
  export interface Ask {
    component?: string;
    /** The room's face it opens on: the states (the default), the whole set, or the move. */
    face?: Face;
    state?: string;
  }

  /** The room's three faces: the states list with its steps, the whole set, the move. */
  export type Face = "states" | "whole" | "move";

  /**
   * Where the states and the move stand on a desk: the explore's one axis.
   * `beside`, a room at the stage's trailing side; `below`, a strip under
   * the stage; `stage`, the steps on the stage's own foot and a room for
   * the whole set and the move, put away until asked for.
   */
  export type Arrangement = "beside" | "below" | "stage";
</script>

<script lang="ts">
  /**
   * The design graph (spec.md §5; its surface brief under
   * apps/dashboard/.impeccable/surfaces): where the owner judges a
   * component an agent built. The stage holds the real component in the
   * state he keeps, and only that: a press on a state keeps it, and
   * nothing else changes the stage. Beside it one room, its one switch
   * (fluid-tabs) choosing its face: the states list with its steps, the
   * whole set, or the move into the kept state. Compare, a switch that
   * stays on, compares the kept state with the one before it at once,
   * and a press on another state compares with that one instead; the
   * stage keeps the kept state and rings what differs. The move into a
   * kept state plays once as it arrives, then its playhead rests at its
   * start. Several components under one ask: one in front, the others
   * behind its name's menu.
   *
   * One bar of one row (DESIGN.md, The Title Bars Follow Liquid Glass
   * Rule): leading the component's name (its menu when there are several),
   * trailing one glass group of bare symbols (Compare, the stage's view,
   * the room). The view is a card hung from the glass (HangCard, as the
   * app's own glass hangs its cards): the widths as device glyphs, the
   * scheme as sun and moon, Reduce motion as a switch. Under the desk line
   * (900px of its own width) the room is the kit's bottom drawer, its
   * stops head, half and whole, the stage whole above it at the head stop.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { mergeProps } from "bits-ui";
  import { onMount, tick, untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import {
    motionOk,
    numberOf,
    sheetSlide,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { lastInput } from "#lib/components/ui/fluid-tabs/last-input.js";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChevronDown,
    IconClose,
    IconCompare,
    IconLayers,
    IconMaximize,
    IconMonitor,
    IconMoon,
    IconPhone,
    IconSidebar,
    IconSun,
    IconTablet,
  } from "#lib/icons.js";
  import Journey from "./Journey.svelte";
  import MoveFace, { type MoveState } from "./MoveFace.svelte";
  import {
    moveInto,
    pathOf,
    previousOf,
    type Review,
    type ReviewInput,
    reviewOf,
  } from "./model";
  import { type Clip, lengthOf, Replays, untune } from "./motion";
  import Stage, { type Shown } from "./Stage.svelte";
  import Stepper from "./Stepper.svelte";
  import WholeSet from "./WholeSet.svelte";

  let {
    inputs,
    ask = {},
    recordsAt = null,
    stale = false,
    arrangement = "beside",
  }: {
    /** The components under review, each its states file and the agent's spec. */
    inputs: ReviewInput[];
    ask?: Ask;
    /** When the agent opened the surface: the records shown are the set as it stood then. */
    recordsAt?: Date | null;
    /** The hub's link is down. */
    stale?: boolean;
    arrangement?: Arrangement;
  } = $props();

  const reviews = $derived(inputs.map(reviewOf));
  let front = $state(
    untrack(() =>
      Math.max(
        0,
        reviews.findIndex((one) => one.name === ask.component)
      )
    )
  );
  const review = $derived(reviews[front] as Review);

  /** A state and one of its variants (null: the state as written). */
  interface Pick {
    state: string;
    variant: string | null;
  }
  /** Where a component opens: the state the ask names (a variant's or a width's state too), else its first. */
  const first = (one: Review): Pick => {
    const asked =
      one.name === ask.component || reviews.length === 1
        ? ask.state
        : undefined;
    const holder = one.order.find(
      (id) =>
        id === asked ||
        one.states[id]?.variants.some((each) => each.id === asked) ||
        one.states[id]?.widths.some((size) => size.story === asked)
    );
    const state = holder ?? one.order[0] ?? "";
    const variant =
      one.states[state]?.variants.find((each) => each.id === asked)?.id ?? null;
    return { state, variant };
  };
  /** The kept state of each component, by its name. */
  let keptOf = $state<Record<string, Pick>>(
    untrack(() =>
      Object.fromEntries(reviews.map((one) => [one.name, first(one)]))
    )
  );
  const kept = $derived(keptOf[review.name] ?? first(review));
  let comparing = $state(false);
  /** The state the kept one is compared with, while comparing. */
  let against = $state<string | null>(null);
  let face = $state<Face>(untrack(() => ask.face ?? "states"));
  let roomOpen = $state(untrack(() => arrangement !== "stage"));
  let width = $state<number | null>(null);
  let scheme = $state<"light" | "dark">(
    typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
      ? "dark"
      : "light"
  );
  let reduce = $state(false);
  const still = $derived(reduce || !motionOk.current);
  let surface = $state(0);
  /** The desk line, of the surface's own width (DESIGN.md breakpoints: 900px). */
  const desk = $derived(surface === 0 || surface >= 900);

  /**
   * A state as the stage draws it: a record set's args when one is picked;
   * at a width he picked that one of its stories is written for (its
   * phone story at 390), that story's; else as written.
   */
  const drawOf = (pick: Pick, atWidth: number | null): Shown => {
    const state = review.states[pick.state];
    const variant = state?.variants.find((one) => one.id === pick.variant);
    const sized =
      atWidth === null
        ? null
        : state?.widths.find((one) => one.width === atWidth);
    return {
      args: variant?.args ?? sized?.args ?? state?.args ?? review.args,
      name: state?.name ?? pick.state,
      story: variant?.story ?? sized?.story ?? pick.state,
      variant: variant?.name ?? null,
      width: sized?.width ?? state?.width ?? null,
      line: state?.line ?? null,
    };
  };
  const shown = $derived(drawOf(kept, width));
  const againstShown = $derived(
    comparing && against
      ? drawOf({ state: against, variant: null }, width)
      : null
  );

  /** Compare turned on compares with the state before the kept one (`previousOf`), the one the move plays from. It leaves the room as it stands: the states are what he compares against. */
  const setComparing = (on: boolean) => {
    comparing = on;
    against = on ? previousOf(review, kept.state) : null;
  };
  /** A press on a state: while comparing, compare with it; else keep it (a record set too). */
  const press = (state: string, variant: string | null) => {
    if (comparing && state !== kept.state) {
      against = state;
      return;
    }
    keep(state, variant);
  };
  const keep = (state: string, variant: string | null) => {
    keptOf = { ...keptOf, [review.name]: { state, variant } };
    if (comparing && against === state) {
      against = previousOf(review, state);
    }
  };

  // --- The move into the kept state ------------------------------------------

  let stage = $state<ReturnType<typeof Stage>>();
  let move = $state<MoveState>({ kind: "none", state: "" });
  let playhead = $state(0);
  let playing = $state(false);
  let run = 0;
  let clock = 0;
  const replays = new Replays();

  /** The components whose kept region has been brought into view, once, as each opened. */
  const opened = new Set<string>();
  /** What the move changed on the stage: each moving thing. */
  const regionOf = (clips: readonly Clip[]): Element[] =>
    clips.flatMap((clip) => (clip.thing ? [clip.thing] : []));
  /** What a row rested on in the move names on the stage. */
  let lit = $state<Element | null>(null);

  const stop = () => {
    playing = false;
    cancelAnimationFrame(clock);
  };
  const clipsNow = (): Clip[] => (move.kind === "ready" ? move.clips : []);

  /** The move into `pick` on `on` played on the stage, its clips read; then its playhead rests at its start. */
  const arrive = async (on: Review, pick: Pick) => {
    stop();
    replays.release();
    run += 1;
    const mine = run;
    playhead = 0;
    const into = moveInto(on, pick.state);
    const to = on.states[pick.state];
    const from = into ? on.states[into.from] : null;
    if (!(into && to?.play && from && pick.variant === null)) {
      move = { kind: "none", state: to?.name ?? pick.state };
      opened.add(on.name);
      return;
    }
    move = { kind: "reading", from: from.name, to: to.name };
    await tick();
    try {
      const clips = (await stage?.playMove(from.args, to.play, still)) ?? [];
      if (mine !== run) {
        return;
      }
      move = { kind: "ready", from: from.name, to: to.name, clips };
      // On open, once: the region the move changed brought into view with
      // room for its ring, the state's own evidence. A press after that
      // keeps the stage's scroll where he left it.
      if (!opened.has(on.name)) {
        opened.add(on.name);
        await stage?.reveal(regionOf(clips));
      }
    } catch (error) {
      if (mine === run) {
        move = {
          kind: "failed",
          from: from.name,
          to: to.name,
          why: error instanceof Error ? error.message : String(error),
        };
      }
    }
  };
  // Each kept drawing arrives with its move, once: the stage mounts it
  // afresh, so the move is read again on the instance it shows.
  $effect(() => {
    const on = review;
    const pick = kept;
    const drawing = shown;
    untrack(() => {
      if (drawing) {
        arrive(on, pick);
      }
    });
  });

  const play = (rate: number) => {
    const clips = clipsNow();
    if (clips.length === 0) {
      return;
    }
    stop();
    const length = lengthOf(clips);
    if (still) {
      replays.seek(clips, length);
      stage?.fadeIn();
      playhead = 0;
      return;
    }
    const from = playhead >= length ? 0 : playhead;
    replays.play(clips, from, rate);
    playing = true;
    const t0 = performance.now();
    const step = () => {
      playhead = Math.min(length, from + (performance.now() - t0) * rate);
      if (playhead >= length) {
        playing = false;
        playhead = 0;
        return;
      }
      clock = requestAnimationFrame(step);
    };
    clock = requestAnimationFrame(step);
  };
  const scrub = (t: number) => {
    stop();
    playhead = t;
    replays.seek(clipsNow(), t);
  };
  /** The clips he tuned put in the move, which plays again on the stage at once. */
  const retime = (changed: readonly Clip[]) => {
    if (move.kind !== "ready") {
      return;
    }
    const by = new Map(changed.map((clip) => [clip.id, clip]));
    move = {
      ...move,
      clips: move.clips.map((clip) => by.get(clip.id) ?? clip),
    };
    playhead = 0;
    play(1);
  };

  // --- Keys ---------------------------------------------------------------------

  /**
   * Only the person's own press or key closes what he opened. A move's
   * play presses inside the stage with events of its own making
   * (core stage-play.ts `userEventIn`: a `pointerdown` that bubbles to the
   * document, a focus, keys), and the view card's layer read that
   * `pointerdown` as a press outside it and closed: picking a width draws
   * the state's story at that width, whose move plays as it arrives.
   */
  const personsOwn = (event: Event) => {
    if (!event.isTrusted) {
      event.preventDefault();
    }
  };

  onMount(() => {
    const key = (event: KeyboardEvent) => {
      const field = (event.target as HTMLElement | null)?.closest(
        "input, textarea, select, [contenteditable='true']"
      );
      if (
        event.key === "Escape" &&
        event.isTrusted &&
        !event.defaultPrevented &&
        !field &&
        roomOpen
      ) {
        roomOpen = false;
      }
    };
    window.addEventListener("keydown", key);
    const resized = () => {
      windowHeight = window.innerHeight;
    };
    window.addEventListener("resize", resized);
    return () => {
      window.removeEventListener("resize", resized);
      window.removeEventListener("keydown", key);
      stop();
      replays.release();
    };
  });

  const timeWords = $derived(
    recordsAt
      ? new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          day: "numeric",
          month: "short",
        }).format(recordsAt)
      : null
  );
  const hasRecords = $derived(
    review.states[kept.state]?.variants.some((one) => one.id.includes(":")) ??
      false
  );
  /** The journey's one order: the component's path, as the list shows it. */
  const path = $derived(pathOf(review));
  const at = $derived(path.indexOf(kept.state));
  const single = $derived(review.order.length === 1);
  /** The widths the stage is drawn at, each a device's glyph; its own first. */
  const WIDTHS = [
    { value: 390, icon: IconPhone, name: words.phone },
    { value: 680, icon: IconTablet, name: words.tablet },
    { value: 1440, icon: IconMonitor, name: words.desk },
  ] as const;
  const DESK_FORM = 1280;
  const ownWidth = $derived(drawOf(kept, null).width ?? DESK_FORM);
  /**
   * The stage's share of a wide surface: the widest of the component's own
   * widths, so it holds still from state to state. Taken from the kept
   * state's own width, a press on a state written at 680 after one at
   * 1440 narrowed the stage and widened the room beside it, and the list's
   * rows wrapped anew.
   */
  const stageWidth = $derived(
    Math.max(
      0,
      ...review.order.map((id) => review.states[id]?.width ?? DESK_FORM)
    ) || DESK_FORM
  );
  /** The head's glass, which the view's card hangs from, and whether it hangs. */
  let glass = $state<HTMLElement | null>(null);
  let viewJoined = $state(false);
  /**
   * The view card is open. It is kept mounted while shut (`forceMount`), as
   * the glass's own card is (GlassCard), so it goes back up behind the
   * glass's cut on its close and rests there (motion/hang), never cut off
   * as bits-ui unmounted it.
   */
  let viewOpen = $state(false);
  /**
   * The drawer's stops, as vaul takes them: shares of the window's height
   * for a sheet as tall as its cap (`--c-sheet-max-h`, a share of the
   * window), so a stop showing `px` of it is that share less what the cap
   * leaves above the sheet. Its head (the faces and the steps), half, and
   * whole.
   */
  /** What takes the focus when pressed: a control or a field. */
  const FOCUSABLE =
    "button, input, select, textarea, a[href], [contenteditable='true'], [tabindex]:not([tabindex='-1'])";
  /**
   * A press on the drawer's own surface (its grabber, its head, the space
   * between its rows) leaves the focus where it was: the drawer's content
   * is the dialog's (bits-ui gives it `tabindex="-1"`), and a browser hands
   * the focus to the focusable box round whatever a mouse press, or a
   * finger's press as it ends, lands on, so a drag of the drawer moved the
   * focus into it. A press on a control still focuses that control.
   */
  const keepFocusOnPage = (event: MouseEvent) => {
    if (!(event.target as Element | null)?.closest(FOCUSABLE)) {
      event.preventDefault();
    }
  };
  /** A root token's value as the page computes it. */
  const rootValue = (name: string): string =>
    typeof document === "undefined"
      ? ""
      : getComputedStyle(document.documentElement).getPropertyValue(name);
  let windowHeight = $state(
    typeof window === "undefined" ? 844 : window.innerHeight
  );
  const capShare = $derived(
    Number.parseFloat(rootValue("--c-sheet-max-h")) / 100 || 1
  );
  const shareOf = (px: number) =>
    Math.min(1, px / windowHeight + (1 - capShare));
  const head = $derived(shareOf(numberOf("--c-graph-drawer-head")));
  const SNAPS = $derived([head, shareOf(windowHeight / 2), 1]);
  let snap = $state<number | string | null>(null);
  $effect(() => {
    if (snap === null) {
      snap = head;
    }
  });
  /** How much of the window the drawer stands over at a stop (a share as vaul takes it), px: the stage's scroller ends at its top. */
  const coverOf = (share: number) =>
    Math.max(0, (share - (1 - capShare)) * windowHeight);
  const cover = $derived(
    typeof snap === "number" ? coverOf(snap) : coverOf(head)
  );
  /** The grabber steps the drawer to its next stop, and from the last back to its head (HIG, Sheets: a tap on the grabber cycles its detents). */
  const nextStop = () => {
    const here = typeof snap === "number" ? SNAPS.indexOf(snap) : -1;
    snap = SNAPS[(here + 1) % SNAPS.length] ?? head;
  };
  // At each stop the region he is judging stays in view above the drawer:
  // the first difference while comparing, else what the move changed.
  $effect(() => {
    if (desk || snap === null) {
      return;
    }
    const clips = clipsNow();
    untrack(() => {
      requestAnimationFrame(() => stage?.reveal(regionOf(clips)));
    });
  });

  /** His own width, when it is one of the listed widths: that one stands for it, marked his own. */
  const ownListed = $derived(WIDTHS.some((one) => one.value === ownWidth));
  /** The view's width choice: his own width (null) is "own", or the listed width it equals. */
  const widthValue = $derived.by(() => {
    if (width !== null) {
      return String(width);
    }
    return ownListed ? String(ownWidth) : "own";
  });
  const pickWidth = (next: string) => {
    if (!next) {
      return;
    }
    width = next === "own" || Number(next) === ownWidth ? null : Number(next);
  };

  /**
   * Focus a menu or a card hands back, or takes as it opens, after a
   * press shows no ring (DESIGN.md, The One Ring Rule: pointer focus on a
   * control shows nothing): the focus moves as a script's, which would
   * draw it, so a press's moves it with `focusVisible: false`.
   */
  const quietFocus = (event: Event, to: HTMLElement | null | undefined) => {
    if (lastInput.current !== "pointer") {
      return;
    }
    event.preventDefault();
    to?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  };
  let menuTrigger = $state<HTMLElement | null>(null);
  let viewTrigger = $state<HTMLElement | null>(null);
  /** Whether the stage stands at its component's own width, narrower than its room. */
  let stageFits = $state(false);
  /** The room stands beside the stage on a desk. */
  const beside = $derived(desk && roomOpen && arrangement !== "below");
</script>

{#snippet statesFace(stepperHere: boolean)}
  {#if single}
    <p class="m-0 max-w-c-measure type-body text-ink-muted text-pretty">
      {words.oneState}
    </p>
  {:else if face === "whole"}
    <WholeSet
      against={comparing ? against : null}
      kept={kept.state}
      onpress={press}
      {review}
    />
  {:else}
    <Journey
      against={comparing ? against : null}
      kept={kept.state}
      keptVariant={kept.variant}
      onpress={press}
      onstep={(next) => keep(next, null)}
      {review}
      stepper={stepperHere}
    />
  {/if}
{/snippet}

{#snippet moveFace()}
  <MoveFace
    coarse={!desk}
    {move}
    onlight={(thing) => {
      lit = thing;
    }}
    onpause={stop}
    onplay={play}
    onreset={(ids) =>
      retime(
        clipsNow()
          .filter((clip) => ids.includes(clip.id))
          .map(untune)
      )}
    onretime={retime}
    onseek={scrub}
    {playhead}
    {playing}
    {still}
  />
{/snippet}

{#snippet faces()}
  <Tabs
    class="min-w-0 flex-1"
    onValueChange={(next) => {
      face = next === "whole" || next === "move" ? next : "states";
      lit = null;
    }}
    size="compact"
    value={face}
  >
    <TabsList aria-label={words.faces}>
      <TabItem label={words.statesFace} value="states" />
      <TabItem label={words.wholeSet} value="whole" />
      <TabItem label={words.moveFace} value="move" />
    </TabsList>
  </Tabs>
{/snippet}

{#snippet stepper()}
  <Stepper
    {at}
    name={review.states[kept.state]?.name ?? ""}
    onstep={(next) => keep(next, null)}
    {path}
  />
{/snippet}

{#snippet widthItem(
  value: string,
  name: string,
  figure: number,
  own: boolean,
  Icon: typeof IconPhone
)}
  <ToggleGroup.Item aria-label={name} {value}>
    <!-- mark-line: the device's glyph stands over its figure, not beside it -->
    <span class="flex flex-col items-center gap-space-row" data-box>
      <Icon aria-hidden="true" />
      <span
        class={[
          "type-meta num",
          own && "underline decoration-dotted underline-offset-2",
        ]}>{figure}</span
      >
    </span>
  </ToggleGroup.Item>
{/snippet}

<TooltipProvider>
  <div
    data-slot="design-graph"
    data-arrangement={arrangement}
    class="flex h-full min-h-0 min-w-0 flex-col bg-surface-page contain-layout"
    {@attach frameSize((node: HTMLElement) => {
      surface = node.clientWidth;
    })}
  >
    <!-- The bar: one row, no ground of its own. -->
    <header
      data-slot="graph-bar"
      class="flex h-c-top-bar-h min-w-0 flex-none items-center gap-space-3 ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5"
    >
      <div class="flex min-w-0 flex-1 items-center">
        {#if reviews.length > 1}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  bind:this={menuTrigger}
                  aria-label={words.components}
                  class="mark-line pointer-hit touch-hit inline-flex h-c-btn-h-sm min-w-0 items-center gap-space-1 rounded-md px-space-2 type-label text-ink-strong transition-control can-hover:hover:bg-surface-hover"
                  type="button"
                >
                  <span
                    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                    >{review.name}</span
                  >
                  <IconChevronDown
                    aria-hidden="true"
                    class="size-icon-sm flex-none text-ink-muted"
                    data-box
                  />
                </button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              align="start"
              onCloseAutoFocus={(event: Event) =>
                quietFocus(event, menuTrigger)}
              width="regular"
            >
              <DropdownMenu.RadioGroup
                bind:value={
                  () => String(front),
                  (next: string) => {
                    front = Number(next);
                    against = null;
                    comparing = false;
                    lit = null;
                  }
                }
              >
                {#each reviews as one, index (one.name)}
                  <DropdownMenu.RadioItem value={String(index)}>
                    <span
                      class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap"
                      >{one.name}</span
                    >
                  </DropdownMenu.RadioItem>
                {/each}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {:else}
          <h1
            class="m-0 min-w-0 truncate px-space-2 type-label text-ink-strong"
          >
            {review.name}
          </h1>
        {/if}
      </div>

      <div
        class="flex flex-1 justify-end"
        {@attach (node: HTMLElement) => {
          glass = node.querySelector<HTMLElement>('[data-slot="tools"]');
        }}
      >
        <!-- Compare and the view; Show states only while the room is put
             away. The room's one close is its own. -->
        <BarGlass form="group" joined={viewJoined}>
          {#if !single}
            <Tip label={words.compare}>
              {#snippet children(tip)}
                <button
                  data-bar-item
                  {...mergeProps(tip, {
                    onclick: () => setComparing(!comparing),
                  })}
                  aria-label={words.compare}
                  aria-pressed={comparing}
                  class="select-none touch-hit press-tint aria-pressed:bg-selected-bg aria-pressed:text-selected-ink"
                  type="button"
                >
                  <IconCompare data-slot="bar-symbol" aria-hidden="true" />
                </button>
              {/snippet}
            </Tip>
          {/if}
          <Popover.Root bind:open={viewOpen}>
            <Tip label={words.stageView}>
              {#snippet children(tip)}
                <Popover.Trigger>
                  {#snippet child({ props })}
                    <button
                      data-bar-item
                      {...mergeProps(tip, props)}
                      bind:this={viewTrigger}
                      aria-label={words.stageView}
                      class="select-none touch-hit press-tint"
                      type="button"
                    >
                      <IconLayers data-slot="bar-symbol" aria-hidden="true" />
                    </button>
                  {/snippet}
                </Popover.Trigger>
              {/snippet}
            </Tip>
            <!-- The view, hung from the glass as the app's glass hangs its
                 cards: it comes down out of the glass and goes back up. -->
            <HangCard
              align="end"
              anchor={glass}
              aria-label={words.stageView}
              bind:joined={viewJoined}
              customAnchor={glass}
              forceMount
              inert={!viewOpen}
              onCloseAutoFocus={(event: Event) =>
                quietFocus(event, viewTrigger)}
              onEscapeKeydown={personsOwn}
              onInteractOutside={personsOwn}
              onOpenAutoFocus={(event: Event) => quietFocus(event, viewTrigger)}
              side="bottom"
              sideOffset={0}
            >
              <div class="flex min-w-0 flex-col gap-space-4 p-space-4">
                <div class="flex min-w-0 flex-col gap-space-2">
                  <span class="type-label text-ink-muted">{words.width}</span>
                  <!-- Each width once: his own is the listed width it
                       equals, marked his own, and stands apart only when
                       none is. The names are the items' own; no tooltip
                       opens over the card. -->
                  <ToggleGroup.Root
                    aria-label={words.width}
                    onValueChange={pickWidth}
                    type="single"
                    value={widthValue}
                  >
                    {#if !ownListed}
                      {@render widthItem(
                        "own",
                        words.ownWidth(ownWidth),
                        ownWidth,
                        true,
                        IconMaximize
                      )}
                    {/if}
                    {#each WIDTHS as one (one.value)}
                      {@const own = one.value === ownWidth}
                      {@render widthItem(
                        String(one.value),
                        own
                          ? words.ownListed(one.name, one.value)
                          : words.widthOf(one.name, one.value),
                        one.value,
                        own,
                        one.icon
                      )}
                    {/each}
                  </ToggleGroup.Root>
                </div>
                <div
                  class="flex min-w-0 items-center justify-between gap-space-4"
                >
                  <span class="type-label text-ink-muted">{words.scheme}</span>
                  <Tabs
                    onValueChange={(next) => {
                      scheme = next === "dark" ? "dark" : "light";
                    }}
                    size="compact"
                    value={scheme}
                  >
                    <TabsList aria-label={words.scheme}>
                      <TabItem
                        glyphOnly
                        icon={IconSun}
                        label={words.light}
                        value="light"
                      />
                      <TabItem
                        glyphOnly
                        icon={IconMoon}
                        label={words.dark}
                        value="dark"
                      />
                    </TabsList>
                  </Tabs>
                </div>
                <label
                  class="flex min-w-0 items-center justify-between gap-space-4 type-label text-ink-row"
                >
                  <span>{words.reduceMotion}</span>
                  <Switch bind:checked={reduce} />
                </label>
              </div>
            </HangCard>
          </Popover.Root>
          {#if !roomOpen}
            <Tip label={words.openRoom}>
              {#snippet children(tip)}
                <button
                  data-bar-item
                  {...mergeProps(tip, {
                    onclick: () => {
                      roomOpen = true;
                      snap = head;
                    },
                  })}
                  aria-label={words.openRoom}
                  class="select-none touch-hit press-tint"
                  type="button"
                >
                  <IconSidebar data-slot="bar-symbol" aria-hidden="true" />
                </button>
              {/snippet}
            </Tip>
          {/if}
        </BarGlass>
      </div>
    </header>

    <!-- The page: the stage, and on a desk the room beside or under it. On
         a phone its foot stands at the drawer's top at each stop, so the
         stage's scroller ends where the drawer begins. -->
    <div
      data-slot="graph-page"
      class={[
        "flex min-h-0 min-w-0 flex-1 gap-space-5 overflow-clip ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5",
        desk && arrangement === "below" ? "flex-col" : "flex-row",
        !desk && roomOpen ? "pb-(--drawer-cover)" : "pb-space-6",
      ]}
      style:--stage-w="{width ?? stageWidth}px"
      style:--drawer-cover="{cover + numberOf('--space-3')}px"
    >
      <div
        class={[
          "flex min-h-0 min-w-0 flex-col",
          stageFits && "flex-initial",
          !stageFits && beside && "shrink grow-0 basis-(--stage-w)",
          !(stageFits || beside) && "flex-1",
          beside && "min-w-c-graph-stage-min",
        ]}
      >
        <Stage
          bind:this={stage}
          bind:fits={stageFits}
          against={againstShown}
          {lit}
          {review}
          {scheme}
          {shown}
          {stale}
          {width}
        />
        {#if timeWords && hasRecords}
          <!-- Under the stage, never over it: whose records these are. -->
          <p class="m-0 mt-space-2 type-meta text-ink-muted">
            {words.recordsAsOf(timeWords)}
          </p>
        {/if}
        {#if desk && arrangement === "stage" && !single}
          <!-- The steps on the stage's own foot. -->
          <div class="min-w-0 pt-space-3">{@render stepper()}</div>
        {/if}
      </div>

      {#if desk && roomOpen}
        <!-- The room: one surface, three faces, closed by its Close or Esc.
             It comes in from its edge and goes back there, as the app's
             panels do (the sheet recipe's motion, `sheetSlide`: the
             inspector's): from the trailing edge beside the stage, from the
             foot under it. It takes the room the stage leaves. -->
        <aside
          data-slot="graph-room"
          aria-label={words.statesFace}
          in:sheetSlide={{
            axis: arrangement === "below" ? "Y" : "X",
            leaving: false,
          }}
          out:sheetSlide={{
            axis: arrangement === "below" ? "Y" : "X",
            leaving: true,
          }}
          class={[
            "relative flex min-h-0 min-w-0 flex-col gap-space-3 rounded-lg border border-border-hairline bg-surface-raised p-space-4 pt-space-3 shadow-tile",
            arrangement === "below"
              ? "h-2/5 flex-none"
              : "grow basis-c-graph-room-w min-w-c-graph-room-w",
          ]}
        >
          <div class="flex min-w-0 items-center gap-space-2">
            {@render faces()}
            <Tip label={words.closeRoom}>
              {#snippet children(tip)}
                <button
                  {...mergeProps(tip, {
                    onclick: () => {
                      roomOpen = false;
                      lit = null;
                    },
                  })}
                  type="button"
                  aria-label={words.closeRoom}
                  class="pointer-hit touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-pill text-ink-muted transition-control can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong"
                >
                  <IconClose aria-hidden="true" class="size-icon-md" />
                </button>
              {/snippet}
            </Tip>
          </div>
          {#if face === "move"}
            {@render moveFace()}
          {:else}
            {@render statesFace(arrangement !== "stage")}
          {/if}
        </aside>
      {/if}
    </div>

    {#if !desk}
      <!-- Under the desk line: the room is the kit's bottom drawer, its stops
         head (the faces and the steps), half and whole; the page above it
         stays live and ends at its top. Its grabber steps between the
         stops; its Close is its own, 44px to a finger. Drawn in place, the
         surface its containing block (`contain: layout`), so it stands on
         the surface's foot wherever the surface stands. -->
      <Drawer.Root
        bind:activeSnapPoint={snap}
        bind:open={roomOpen}
        dismissible={false}
        modal={false}
        shouldScaleBackground={false}
        snapPoints={SNAPS}
      >
        <Drawer.Content
          grabber={{ label: words.nextStop, onpress: nextStop }}
          height="cap"
          modal={false}
          onOpenAutoFocus={(event: Event) => event.preventDefault()}
          portalProps={{ disabled: true }}
          onmousedown={keepFocusOnPage}
          trapFocus={false}
          ownHead
          title={words.statesFace}
        >
          <div
            class="flex min-h-0 flex-auto flex-col gap-space-3 px-space-4 pb-(--snap-drop)"
            style:--snap-drop="calc((1 - {typeof snap === 'number' ? snap : 0})
            * 100dvh)"
          >
            <div class="flex min-w-0 items-center gap-space-2">
              {@render faces()}
              <!-- The drawer's one Close, the ghost the kit's sheet heads draw. -->
              <Drawer.Close>
                {#snippet child({ props })}
                  <Button
                    {...mergeProps(props, {
                      onclick: () => {
                        lit = null;
                      },
                    })}
                    aria-label={words.closeRoom}
                    icon={IconClose}
                    press="pressable"
                    size="icon-sm"
                    title={words.closeRoom}
                    variant="ghost"
                  />
                {/snippet}
              </Drawer.Close>
            </div>
            {#if face === "move"}
              {@render moveFace()}
            {:else}
              {#if !single && face === "states"}
                {@render stepper()}
              {/if}
              {@render statesFace(false)}
            {/if}
          </div>
        </Drawer.Content>
      </Drawer.Root>
    {/if}
  </div>
</TooltipProvider>
