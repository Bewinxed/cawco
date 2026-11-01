<script lang="ts" module>
  /** What the agent's ask names: the component in front, the state it opens on, and the way of seeing. */
  export interface Ask {
    component?: string;
    /** The room's face it opens on: the states (the default) or the move. */
    face?: "states" | "move";
    seeing?: "journey" | "whole";
    state?: string;
  }

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
   * state he keeps; with it one room with two faces, the states (the
   * journey or the whole set) and the move into the kept state. Resting a
   * fine pointer on a state previews it, pressing keeps it, a tap keeps
   * it. Compare, a switch that stays on, draws what differs from the kept
   * state. The move into a kept state plays once as it arrives, then its
   * playhead rests at its start. Several components under one ask: one in
   * front, the others behind its name's menu.
   *
   * One bar of one row (DESIGN.md, The Title Bars Follow Liquid Glass
   * Rule): leading the component's name (its menu when there are several),
   * centre the way of seeing, trailing one glass group of bare symbols
   * (Compare, the stage's view, the room). Under the desk line (900px of
   * its own width) the room is the kit's bottom drawer, its stops head,
   * half and whole, the stage whole above it at the head stop.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { graphWords as words } from "@cawco/core/words/graph";
  import { mergeProps } from "bits-ui";
  import { onMount, tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { motionOk, numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChevronDown,
    IconClose,
    IconColumns,
    IconLayers,
    IconSidebar,
  } from "#lib/icons.js";
  import Journey from "./Journey.svelte";
  import MoveFace, { type MoveState } from "./MoveFace.svelte";
  import { moveInto, type Review, type ReviewInput, reviewOf } from "./model";
  import {
    type Clip,
    lengthOf,
    Replays,
    type Tuning,
    tune,
    untune,
  } from "./motion";
  import Stage, { type Shown, type ShownRole } from "./Stage.svelte";
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

  /** A state and one of its variants (the state as written by default). */
  interface Pick {
    state: string;
    variant: string;
  }
  /** Where a component opens: the state the ask names (a variant's state too), else its first. */
  const first = (one: Review): Pick => {
    const asked =
      one.name === ask.component || reviews.length === 1
        ? ask.state
        : undefined;
    const holder = one.order.find(
      (id) =>
        id === asked ||
        one.states[id]?.variants.some((variant) => variant.id === asked)
    );
    const state = holder ?? one.order[0] ?? "";
    return { state, variant: holder && asked ? asked : state };
  };
  /** The kept state of each component, by its name. */
  let keptOf = $state<Record<string, Pick>>(
    untrack(() =>
      Object.fromEntries(reviews.map((one) => [one.name, first(one)]))
    )
  );
  const kept = $derived(keptOf[review.name] ?? first(review));
  let preview = $state<Pick | null>(null);
  let comparing = $state(false);
  let compared = $state<Pick | null>(null);
  let seeing = $state<"journey" | "whole">(
    untrack(() => ask.seeing ?? "journey")
  );
  let face = $state<"states" | "move">(untrack(() => ask.face ?? "states"));
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
  let machine = $state(untrack(() => review.states[kept.state]?.machine ?? ""));
  $effect(() => {
    // The journey walks the kept state's machine.
    const next = review.states[kept.state]?.machine;
    if (next) {
      untrack(() => {
        machine = next;
      });
    }
  });

  const fine = new MediaQuery("(hover: hover) and (pointer: fine)");
  let surface = $state(0);
  /** The desk line, of the surface's own width (DESIGN.md breakpoints: 900px). */
  const desk = $derived(surface === 0 || surface >= 900);

  const drawOf = (pick: Pick): Shown => {
    const state = review.states[pick.state];
    const variant =
      state?.variants.find((one) => one.id === pick.variant) ??
      state?.variants[0];
    return {
      args: variant?.args ?? review.args,
      name: state?.name ?? pick.state,
      story: variant?.story ?? pick.state,
      variant: variant && variant.id !== pick.state ? variant.name : null,
      width: variant?.width ?? state?.width ?? null,
      line: state?.line ?? null,
    };
  };
  const shownPick = $derived(preview ?? (comparing ? compared : null) ?? kept);
  const shown = $derived(drawOf(shownPick));
  const keptArgs = $derived(
    comparing && (preview ?? compared) ? drawOf(kept).args : null
  );
  const roleOf = (): ShownRole => {
    if (shownPick === kept) {
      return "kept";
    }
    return comparing ? "compared" : "previewing";
  };
  const role = $derived(roleOf());

  const keep = (state: string, variant: string) => {
    preview = null;
    if (comparing) {
      compared = { state, variant };
      return;
    }
    keptOf = { ...keptOf, [review.name]: { state, variant } };
  };
  const onpreview = (state: string, variant: string | null) => {
    preview = variant && fine.current ? { state, variant } : null;
  };

  // --- The move into the kept state ------------------------------------------

  let stage = $state<ReturnType<typeof Stage>>();
  let move = $state<MoveState>({ kind: "none", state: "" });
  let playhead = $state(0);
  let playing = $state(false);
  let run = 0;
  let clock = 0;
  const replays = new Replays();

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
    if (!(into && to?.play && from && pick.variant === pick.state)) {
      move = { kind: "none", state: to?.name ?? pick.state };
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
      // The region the move changed, in view: where its last clip lands, the state's own evidence.
      const target = clips.at(-1)?.target;
      if (target) {
        bringIntoView(target, {
          behavior: motionOk.current ? "smooth" : "instant",
        });
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
  // Each kept state arrives with its move, once.
  $effect(() => {
    const on = review;
    const pick = kept;
    untrack(() => {
      if (!comparing) {
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
  const retime = (id: string, change: (clip: Clip) => Clip) => {
    if (move.kind !== "ready") {
      return;
    }
    move = {
      ...move,
      clips: move.clips.map((clip) => (clip.id === id ? change(clip) : clip)),
    };
    playhead = 0;
    play(1);
  };

  // --- Keys ---------------------------------------------------------------------

  onMount(() => {
    const key = (event: KeyboardEvent) => {
      const field = (event.target as HTMLElement | null)?.closest(
        "input, textarea, select, [contenteditable='true']"
      );
      if (event.key === "Escape" && !field && roomOpen) {
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
  const path = $derived(
    review.machines.find((one) => one.name === machine)?.path ?? []
  );
  const at = $derived(path.indexOf(kept.state));
  const single = $derived(review.order.length === 1);
  const WIDTHS = [390, 680, 1440] as const;
  const DESK_FORM = 1280;
  const ownWidth = $derived(drawOf(kept).width ?? DESK_FORM);
  /**
   * The drawer's stops, as vaul takes them: shares of the window's height
   * for a sheet as tall as its cap (`--c-sheet-max-h`, a share of the
   * window), so a stop showing `px` of it is that share less what the cap
   * leaves above the sheet. Its head (the faces and the steps), half, and
   * whole.
   */
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
  const shareOf = (shown: number) =>
    Math.min(1, shown / windowHeight + (1 - capShare));
  const head = $derived(shareOf(numberOf("--c-graph-drawer-head")));
  const SNAPS = $derived([head, shareOf(windowHeight / 2), 1]);
  let snap = $state<number | string | null>(null);
  $effect(() => {
    if (snap === null) {
      snap = head;
    }
  });
  const comparedState = $derived(comparing ? (compared?.state ?? null) : null);
</script>

{#snippet machinesNav()}
  {#if review.machines.length > 1}
    <!-- The region names: the one navigation that brings their states into view. -->
    <nav
      aria-label={words.statesFace}
      class="-mx-space-1 flex min-w-0 flex-none gap-space-1 overflow-x-auto px-space-1 pb-space-1"
    >
      {#each review.machines as one (one.name)}
        <button
          type="button"
          aria-current={one.name === machine ? "true" : undefined}
          class={[
            "pointer-hit touch-hit h-c-btn-h-sm flex-none rounded-pill px-space-3 type-label transition-control",
            one.name === machine
              ? "bg-selected-bg text-selected-ink"
              : "text-ink-muted can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong",
          ]}
          onclick={() => {
            machine = one.name;
          }}>{one.name}</button
        >
      {/each}
    </nav>
  {/if}
{/snippet}

{#snippet seeingSwitch(open: boolean)}
  <Tabs.Root bind:value={seeing} class="min-w-0">
    <Tabs.List aria-label={words.seeing} class="w-full">
      {#each [["journey", words.journey], ["whole", words.wholeSet]] as const as [value, label] (value)}
        <Tabs.Trigger
          {value}
          onclick={() => {
            if (open) {
              roomOpen = true;
              face = "states";
            }
          }}>{label}</Tabs.Trigger
        >
      {/each}
    </Tabs.List>
  </Tabs.Root>
{/snippet}

{#snippet statesFace(axis: "column" | "row", journeyHere: boolean)}
  {#if single}
    <p class="m-0 max-w-c-measure type-body text-ink-muted text-pretty">
      {words.oneState}
    </p>
  {:else}
    {@render machinesNav()}
    {#if seeing === "journey" && journeyHere}
      <Journey
        {axis}
        compared={comparedState}
        kept={kept.state}
        keptVariant={kept.variant}
        {machine}
        onpress={keep}
        {onpreview}
        {review}
      />
    {:else}
      <div
        class="min-h-0 flex-1 overflow-hidden rounded-md bg-surface-recess-deep"
      >
        <WholeSet
          compared={comparedState}
          direction={axis === "row" ? "across" : "down"}
          focus={machine}
          kept={kept.state}
          keptVariant={kept.variant}
          onpress={keep}
          {onpreview}
          {review}
        />
      </div>
    {/if}
  {/if}
{/snippet}

{#snippet moveFace()}
  <MoveFace
    {move}
    onpause={stop}
    onplay={play}
    onreset={(id) => retime(id, untune)}
    onseek={scrub}
    ontune={(id, tuning: Tuning) => retime(id, (clip) => tune(clip, tuning))}
    {playhead}
    {playing}
    {still}
  />
{/snippet}

{#snippet faces()}
  <Tabs.Root bind:value={face} class="min-w-0 flex-1">
    <Tabs.List class="w-full">
      <Tabs.Trigger value="states">{words.statesFace}</Tabs.Trigger>
      <Tabs.Trigger value="move">{words.moveFace}</Tabs.Trigger>
    </Tabs.List>
  </Tabs.Root>
{/snippet}

{#snippet stepper()}
  <Stepper
    {at}
    {machine}
    name={review.states[kept.state]?.name ?? ""}
    onstep={(next) => keep(next, next)}
    {path}
  />
{/snippet}

<TooltipProvider>
<div
  data-slot="design-graph"
  data-arrangement={arrangement}
  class="flex h-full min-h-0 min-w-0 flex-col bg-surface-page"
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
          <DropdownMenu.Content align="start" width="regular">
            <DropdownMenu.RadioGroup
              bind:value={
                () => String(front),
                (next: string) => {
                  front = Number(next);
                  preview = null;
                  compared = null;
                }
              }
            >
              {#each reviews as one, index (one.name)}
                <DropdownMenu.RadioItem value={String(index)}>
                  <span class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap">{one.name}</span>
                  <span class="type-meta text-ink-muted num"
                    >{words.stateCount(one.order.length)}</span
                  >
                </DropdownMenu.RadioItem>
              {/each}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {:else}
        <h1 class="m-0 min-w-0 truncate px-space-2 type-label text-ink-strong">
          {review.name}
        </h1>
      {/if}
    </div>

    {#if desk && !single && arrangement !== "stage"}
      <div class="flex-none">{@render seeingSwitch(true)}</div>
    {/if}

    <div class="flex flex-1 justify-end">
      <BarGlass form="group">
        <Tip label={comparing ? words.compareOff : words.compareOn}>
          {#snippet children(tip)}
            <button
              data-bar-item
              {...mergeProps(tip, {
                onclick: () => {
                  comparing = !comparing;
                  compared = null;
                  preview = null;
                },
              })}
              aria-label={words.compare}
              aria-pressed={comparing}
              class="select-none touch-hit press-tint aria-pressed:bg-selected-bg aria-pressed:text-selected-ink"
              type="button"
            >
              <IconColumns data-slot="bar-symbol" aria-hidden="true" />
            </button>
          {/snippet}
        </Tip>
        <DropdownMenu.Root>
          <Tip label={words.stageView}>
            {#snippet children(tip)}
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <button
                    data-bar-item
                    {...mergeProps(tip, props)}
                    aria-label={words.stageView}
                    class="select-none touch-hit press-tint"
                    type="button"
                  >
                    <IconLayers data-slot="bar-symbol" aria-hidden="true" />
                  </button>
                {/snippet}
              </DropdownMenu.Trigger>
            {/snippet}
          </Tip>
          <DropdownMenu.Content align="end" width="regular">
            <DropdownMenu.Group>
              <DropdownMenu.GroupHeading
                >{words.width}</DropdownMenu.GroupHeading
              >
              <DropdownMenu.RadioGroup
                bind:value={
                  () => String(width ?? "own"),
                  (next: string) => {
                    width = next === "own" ? null : Number(next);
                  }
                }
              >
                <DropdownMenu.RadioItem value="own"
                  >{words.ownWidth(ownWidth)}</DropdownMenu.RadioItem
                >
                {#each WIDTHS as one (one)}
                  <DropdownMenu.RadioItem value={String(one)}
                    >{words.widthPx(one)}</DropdownMenu.RadioItem
                  >
                {/each}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Group>
            <DropdownMenu.Separator />
            <DropdownMenu.Group>
              <DropdownMenu.GroupHeading
                >{words.scheme}</DropdownMenu.GroupHeading
              >
              <DropdownMenu.RadioGroup bind:value={scheme}>
                <DropdownMenu.RadioItem value="light"
                  >{words.light}</DropdownMenu.RadioItem
                >
                <DropdownMenu.RadioItem value="dark"
                  >{words.dark}</DropdownMenu.RadioItem
                >
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Group>
            <DropdownMenu.Separator />
            <DropdownMenu.CheckboxItem bind:checked={reduce}
              >{words.reduceMotion}</DropdownMenu.CheckboxItem
            >
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        <Tip label={roomOpen ? words.closeRoom : words.openRoom}>
          {#snippet children(tip)}
            <button
              data-bar-item
              {...mergeProps(tip, {
                onclick: () => {
                  roomOpen = !roomOpen;
                  if (roomOpen) {
                    snap = head;
                  }
                },
              })}
              aria-label={roomOpen ? words.closeRoom : words.openRoom}
              aria-pressed={roomOpen}
              class="select-none touch-hit press-tint"
              type="button"
            >
              <IconSidebar data-slot="bar-symbol" aria-hidden="true" />
            </button>
          {/snippet}
        </Tip>
      </BarGlass>
    </div>
  </header>

  <!-- The page: the stage, and on a desk the room beside or under it. -->
  <div
    data-slot="graph-page"
    class={[
      "flex min-h-0 min-w-0 flex-1 gap-space-5 ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5",
      desk && arrangement === "below" ? "flex-col" : "flex-row",
      !desk && roomOpen ? "pb-c-graph-drawer-head" : "pb-space-6",
    ]}
    style:--stage-w="{width ?? ownWidth}px"
  >
    <div
      class={[
        "flex min-h-0 min-w-0 flex-col",
        desk && roomOpen && arrangement !== "below"
          ? "shrink grow-0 basis-(--stage-w) min-w-c-graph-stage-min"
          : "flex-1",
      ]}
    >
      {#if timeWords && hasRecords}
        <p class="m-0 mb-space-2 type-meta text-ink-muted">
          {words.recordsAsOf(timeWords)}
        </p>
      {/if}
      <Stage
        bind:this={stage}
        against={drawOf(kept).name}
        kept={keptArgs}
        {review}
        {role}
        {scheme}
        {shown}
        {stale}
        {width}
      />
      {#if desk && arrangement === "stage" && !single}
        <!-- The steps on the stage's own foot, the region names beside them. -->
        <div
          class="flex min-w-0 flex-wrap items-center justify-between gap-space-3 pt-space-3"
        >
          <div class="min-w-0 flex-1">{@render stepper()}</div>
          {@render machinesNav()}
        </div>
      {/if}
    </div>

    {#if desk && roomOpen}
      <!-- The room: one surface, two faces, closed by Close or Esc. -->
      <aside
        data-slot="graph-room"
        aria-label={words.statesFace}
        class={[
          "relative flex min-h-0 min-w-0 flex-col gap-space-3 rounded-lg border border-border-hairline bg-surface-raised p-space-4 pt-space-3 shadow-tile",
          arrangement === "below"
            ? "h-2/5 flex-none"
            : "grow basis-c-graph-room-w min-w-c-graph-room-w",
        ]}
      >
        <div class="flex min-w-0 items-center gap-space-2">
          {@render faces()}
          {#if arrangement === "below" && face === "states" && !single}
            <div class="min-w-0 flex-1">{@render seeingSwitch(false)}</div>
          {/if}
          <button
            type="button"
            aria-label={words.closeRoom}
            title={words.closeRoom}
            class="pointer-hit touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-pill text-ink-muted transition-control can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong"
            onclick={() => {
              roomOpen = false;
            }}
          >
            <IconClose aria-hidden="true" class="size-icon-md" />
          </button>
        </div>
        {#if face === "states"}
          {@render statesFace(
            arrangement === "below" ? "row" : "column",
            arrangement !== "stage"
          )}
        {:else}
          {@render moveFace()}
        {/if}
      </aside>
    {/if}
  </div>

  {#if !desk}
    <!-- Under the desk line: the room is the kit's bottom drawer, its stops
         head (the faces and the steps), half and whole; the page above it
         stays live. -->
    <Drawer.Root
      bind:activeSnapPoint={snap}
      bind:open={roomOpen}
      dismissible={false}
      modal={false}
      shouldScaleBackground={false}
      snapPoints={SNAPS}
    >
      <Drawer.Content
        height="cap"
        modal={false}
        onOpenAutoFocus={(event: Event) => event.preventDefault()}
        ownHead
        title={words.statesFace}
      >
        <div
          class="flex min-h-0 flex-auto flex-col gap-space-3 px-space-4 pb-(--snap-drop)"
          style:--snap-drop="calc((1 - {typeof snap === 'number' ? snap : 0}) *
          100dvh)"
        >
          <div class="flex min-w-0 items-center gap-space-2">
            {@render faces()}
            <Drawer.Close aria-label={words.closeRoom} />
          </div>
          {#if !single}
            {@render stepper()}
          {/if}
          {#if face === "states"}
            {#if !single}
              {@render seeingSwitch(false)}
            {/if}
            {@render statesFace("column", true)}
          {:else}
            {@render moveFace()}
          {/if}
        </div>
      </Drawer.Content>
    </Drawer.Root>
  {/if}
</div>
</TooltipProvider>
