<script lang="ts" module>
  /** What the stage draws: one state, or one of its variants, of the component in front. */
  export interface Shown {
    args: Record<string, unknown>;
    line: number | null;
    /** The state's name, at the stage's head. */
    name: string;
    /** Its story, for a pin's place (`data-cawco-story`). */
    story: string;
    /** The variant's name, when it is not the state as written. */
    variant: string | null;
    width: number | null;
  }

  /** What the shown state is to the person: the kept one, one previewed, or one compared with the kept one. */
  export type ShownRole = "kept" | "previewing" | "compared";
</script>

<script lang="ts">
  /**
   * The stage (spec, The stage): the real component, mounted live with its
   * states file's records, at the width the person picks and in the scheme
   * he picks, always at 1:1: at its own width up to its room's (a form
   * asked at 1440 lays itself out at the room's width, as a window that
   * wide would), and at a width he picks wider than the room, scrolling
   * sideways, never scaled, so no type renders under its size. Its head
   * names the state it shows and whether that is the kept one, one
   * previewed, or one compared with the kept one. Nothing of the
   * surface's own stands over it: the comparison's rings stand outside each
   * element's box in a layer of the stage's own, under the pins, taking
   * no press. The drawing starts at its room's leading edge, so putting
   * the room beside it away never moves it.
   *
   * It mounts the component again for each state, since a component reads
   * its props as it opens (RoutineForm's draft); a move plays on the live
   * instance through `update`, which changes its props in place, so its own
   * motion runs (component-canvas moves.md). While comparing, the kept
   * state is drawn hidden under it at the same width, and the two are read
   * for what came in, what changed and what went (diff.ts).
   */
  import { readWithin } from "@cawco/core/bounded";
  import { queriesIn, userEventIn } from "@cawco/core/stage-play";
  import { graphWords as words } from "@cawco/core/words/graph";
  import { tick, untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconError } from "#lib/icons.js";
  import { type Difference, differences, LINES_SHOWN } from "./diff";
  import type { PlayContext, Review } from "./model";
  import { type Clip, clipOf } from "./motion";

  let {
    review,
    shown,
    kept = null,
    role,
    width,
    scheme,
    stale = false,
    against = null,
  }: {
    review: Review;
    shown: Shown;
    /** The kept state's args while another is compared with it; null when not comparing. */
    kept?: Record<string, unknown> | null;
    role: ShownRole;
    /** The width he picked; the state's own when null. */
    width: number | null;
    scheme: "light" | "dark";
    /** The hub's link is down: this is the last drawing. */
    stale?: boolean;
    /** The kept state's name while comparing. */
    against?: string | null;
  } = $props();

  /** A width no state names: the desk form (core stage.ts `FORMS.desk`). */
  const DESK = 1280;
  let room = $state(0);
  /** The width it is laid out at: his pick, else its own up to its room's. */
  const drawnWidth = $derived(
    width ?? Math.min(shown.width ?? DESK, room > 0 ? room : DESK)
  );
  let frame = $state<HTMLElement>();
  let hidden = $state<HTMLElement>();

  /** The props the live instance has: reassigned per state, changed in place by a move's `update`. */
  let live = $state<Record<string, unknown>>(
    untrack(() => ({ ...shown.args }))
  );
  let mount = $state(0);
  let fault = $state<{ message: string; stack: string } | null>(null);
  let details = $state(false);
  let mounted = $state(false);

  $effect(() => {
    // Each state mounts afresh: a component reads its props as it opens.
    const next = shown.args;
    untrack(() => {
      live = { ...next };
      fault = null;
      mounted = false;
      mount += 1;
    });
  });

  /** The wait grace (DESIGN.md, The Real Wait Rule): no skeleton before it has lasted. */
  let waited = $state(false);
  $effect(() => {
    if (mounted) {
      return;
    }
    waited = false;
    const timer = setTimeout(() => {
      waited = true;
    }, dur("--dur-wait-grace"));
    return () => clearTimeout(timer);
  });
  $effect(() => {
    if (mount === 0) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      mounted = true;
    });
    return () => cancelAnimationFrame(raf);
  });

  // The differences, once both drawings have laid out, and again as either lays itself out anew (a read-back the hub answered).
  let found = $state<Difference[]>([]);
  let laidOut = $state(0);
  const relaid = frameSize(() => {
    laidOut += 1;
  });
  $effect(() => {
    const k = hidden;
    const f = frame;
    if (laidOut < 0) {
      return;
    }
    if (!(kept && k && f && mounted && mount > 0 && drawnWidth > 0)) {
      found = [];
      return;
    }
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        found = differences(k, f, 1);
      });
    });
    return () => cancelAnimationFrame(raf);
  });

  const settle = () =>
    new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done()))
    );

  /** How long a move's play may run, then its motion (component-canvas moves.md). */
  const PLAY_MS = 6000;
  const MOTION_MS = 3000;
  /** The quiet that ends a move: no new animation and none running for this long. */
  const QUIET_MS = 250;
  /** The rest the from state comes to before the move starts: its own arrivals (a read-back the hub answered) have played. */
  const REST_MS = 600;

  const endless = (animation: Animation) =>
    animation.effect?.getComputedTiming().iterations ===
    Number.POSITIVE_INFINITY;

  /** Waits until no clip has run for {@link QUIET_MS}, at most {@link MOTION_MS}. */
  async function quietOf(seen: Map<Animation, number>): Promise<void> {
    const end = performance.now() + MOTION_MS;
    let quiet = performance.now();
    while (performance.now() < end) {
      await settle();
      if ([...seen.keys()].some((one) => one.playState === "running")) {
        quiet = performance.now();
      } else if (performance.now() - quiet > QUIET_MS) {
        return;
      }
    }
  }

  /** The play pressed inside the stage: the person's focus goes back where it was, or off the stage. */
  function giveBack(holder: HTMLElement, had: Element | null): void {
    if (!holder.contains(document.activeElement)) {
      return;
    }
    if (
      had instanceof HTMLElement &&
      had !== document.body &&
      had.isConnected
    ) {
      had.focus({ preventScroll: true });
    } else {
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }

  /** Waits until the from state has come to rest: no animation started on it for {@link REST_MS}, at most {@link MOTION_MS}. */
  async function restOf(holder: HTMLElement): Promise<void> {
    const end = performance.now() + MOTION_MS;
    const known = new Set<Animation>();
    let still = performance.now();
    while (performance.now() < end && performance.now() - still < REST_MS) {
      await settle();
      for (const animation of holder.getAnimations({ subtree: true })) {
        if (!(known.has(animation) || endless(animation))) {
          known.add(animation);
          still = performance.now();
        }
      }
    }
  }

  /**
   * Plays a move on the stage: the from state mounted, then the to state's
   * `play` run on that live instance. Answers every animation the engine
   * ran, as clips, from the move's start; throws what the play threw. With
   * `still` (reduced motion) each animation is read, then landed at once,
   * so nothing travels.
   */
  export async function playMove(
    fromArgs: Record<string, unknown>,
    play: (context: PlayContext) => Promise<void> | void,
    still = false
  ): Promise<Clip[]> {
    live = { ...fromArgs };
    mounted = false;
    mount += 1;
    await tick();
    const holder = frame;
    if (!holder) {
      return [];
    }
    await restOf(holder);
    const had = document.activeElement;
    const t0 = performance.now();
    const seen = new Map<Animation, number>();
    /** Each clip as the engine had it when it was first seen: a transition's engine drops its effect once it ends. */
    const clips: Clip[] = [];
    /** A new animation read as a clip (a loop is a state's own, not the move's); with `still`, landed at once. */
    const take = (animation: Animation) => {
      if (endless(animation)) {
        return;
      }
      const clip = clipOf(
        animation,
        Math.round(performance.now() - t0),
        clips.length
      );
      if (clip.duration > 0) {
        clips.push(clip);
      }
      if (still) {
        animation.finish();
      }
    };
    let watching = true;
    const watch = () => {
      if (!watching) {
        return;
      }
      for (const animation of holder.getAnimations({ subtree: true })) {
        if (!seen.has(animation)) {
          seen.set(animation, performance.now() - t0);
          take(animation);
        }
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    const update = async (next: Record<string, unknown>) => {
      Object.assign(live, next);
      await tick();
    };
    try {
      await readWithin(PLAY_MS, async () => {
        await play({
          args: live,
          update,
          canvas: queriesIn(holder),
          userEvent: userEventIn(holder),
        });
      });
      await quietOf(seen);
    } finally {
      watching = false;
      mounted = true;
      giveBack(holder, had);
    }
    return clips;
  }

  /** Reduced motion's Play: the end state fades in where it stands (DESIGN.md, The Reduced Motion Rule). */
  export function fadeIn(): void {
    frame?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: dur("--dur-fade"),
      easing: "linear",
    });
  }

  const lines = $derived(found.slice(0, LINES_SHOWN));
  const Component = $derived(review.component);
  const ROLE_WORDS: Record<ShownRole, string> = {
    kept: words.kept,
    previewing: words.previewing,
    compared: words.compare,
  };
  const roleWord = $derived(
    role === "compared" && against
      ? words.comparedWith(against)
      : ROLE_WORDS[role]
  );
  const ringOut = "(var(--c-change-ring-offset) + var(--c-change-ring-width))";
</script>

<section
  data-slot="stage"
  aria-label={shown.name}
  class="flex min-h-0 min-w-0 flex-1 flex-col"
>
  <!-- Its head: the state's name in the title role, what it is to him,
       and the width it is drawn at. -->
  <header
    data-slot="stage-head"
    class="flex min-h-c-btn-h min-w-0 flex-wrap items-baseline gap-x-space-3 gap-y-space-1 px-space-1 pb-space-3"
  >
    <h2 class="m-0 min-w-0 type-title text-ink-strong">
      <span class="block truncate">{shown.name}</span>
    </h2>
    <span
      data-slot="stage-role"
      data-role={role}
      class={[
        "type-label",
        role === "kept" ? "text-selected-ink" : "text-ink-muted",
      ]}>{roleWord}</span
    >
    {#if shown.variant}
      <span class="type-label text-ink-muted">· {shown.variant}</span>
    {/if}
    <span class="ms-auto type-meta text-ink-muted num">
      {words.widthPx(drawnWidth)}
    </span>
  </header>

  {#if stale}
    <p
      data-slot="stage-stale"
      role="status"
      class="m-0 mb-space-3 type-meta text-status-attn-ink"
    >
      {words.stale}
    </p>
  {/if}

  {#if kept && lines.length > 0}
    <!-- What differs, in words: one line per difference, its mark the ring's
         own (solid for came in or changed, dashed for went). -->
    <ul
      data-slot="differences"
      aria-label={words.compare}
      class="m-0 mb-space-3 flex list-none flex-col gap-space-1 p-0"
    >
      {#each lines as line, at (at)}
        <li
          class="mark-line flex min-w-0 items-center gap-space-2 type-label text-ink-row"
        >
          <span
            aria-hidden="true"
            data-box
            class={[
              "inline-block size-space-3 flex-none rounded-xs border-(length:--c-change-ring-width) border-c-change-ring",
              line.kind === "went" && "border-dashed",
            ]}
          ></span>
          <span class="min-w-0 wrap-anywhere">{line.line}</span>
        </li>
      {/each}
      {#if found.length > LINES_SHOWN}
        <li class="type-meta text-ink-muted num">
          +{found.length - LINES_SHOWN}
        </li>
      {/if}
    </ul>
  {:else if kept && mounted}
    <p class="m-0 mb-space-3 type-label text-ink-muted">{words.sameAsKept}</p>
  {/if}

  <!-- The field: the stage's room, which scrolls when the drawing is taller. -->
  <div
    data-slot="stage-scroll"
    class="relative min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain rounded-lg border border-border-hairline bg-surface-recess-deep"
    {@attach frameSize((node: HTMLElement) => {
      room = node.clientWidth;
    })}
  >
    <div class="relative w-(--frame-w)" style:--frame-w="{drawnWidth}px">
      <div
        data-slot="stage-frame"
        class={[
          "relative w-(--frame-w) bg-surface-page text-ink-strong",
          scheme === "dark" ? "dark scheme-dark" : "scheme-light",
          stale && "opacity-(--account-stale-opacity)",
        ]}
      >
        {#if kept}
          <!-- The kept state, drawn hidden under the compared one at the same
               width, read for what differs and never seen or pressed. -->
          <div
            bind:this={hidden}
            {@attach relaid}
            aria-hidden="true"
            inert
            class="pointer-events-none invisible absolute inset-x-0 top-0"
          >
            {#key kept}
              <svelte:boundary>
                <Component {...kept} />
              </svelte:boundary>
            {/key}
          </div>
        {/if}
        <div
          bind:this={frame}
          {@attach relaid}
          data-cawco-story={shown.story}
          data-cawco-source={shown.line
            ? `${review.file}:${shown.line}:1`
            : undefined}
          class="relative"
        >
          {#key mount}
            <svelte:boundary
              onerror={(error) => {
                fault = {
                  message:
                    error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? (error.stack ?? "") : "",
                };
              }}
            >
              <Component {...live} />
              {#snippet failed()}
                <span></span>
              {/snippet}
            </svelte:boundary>
          {/key}
        </div>
        {#if kept}
          <!-- The rings: outside each element's box on its own shape, in
               the stage's own layer, taking no press. -->
          <div aria-hidden="true" class="pointer-events-none absolute inset-0">
            {#each found as mark, at (at)}
              <span
                data-slot="change-ring"
                data-kind={mark.kind}
                class={[
                  "absolute start-(--ring-x) top-(--ring-y) h-(--ring-h) w-(--ring-w) rounded-(--ring-r) border-(length:--c-change-ring-width) border-c-change-ring",
                  mark.kind === "went" && "border-dashed",
                ]}
                style:--ring-x="calc({mark.box.x}px - {ringOut})"
                style:--ring-y="calc({mark.box.y}px - {ringOut})"
                style:--ring-w="calc({mark.box.w}px + 2 * {ringOut})"
                style:--ring-h="calc({mark.box.h}px + 2 * {ringOut})"
                style:--ring-r="calc({mark.radius} + var(--c-change-ring-offset))"
              ></span>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if fault}
      <!-- The component failed to mount: the error formula in the stage's place. -->
      <div
        data-slot="stage-failed"
        role="alert"
        class="absolute inset-0 flex flex-col items-start gap-space-3 overflow-auto bg-surface-recess-deep p-space-6"
      >
        <p
          class="mark-line m-0 flex items-center gap-space-2 type-label text-status-fail-ink"
        >
          <IconError
            aria-hidden="true"
            class="size-icon-md flex-none"
            data-box
          />
          <span>{words.mountFailed(review.name, shown.name)}</span>
        </p>
        <p class="m-0 max-w-c-measure type-body text-ink-row wrap-anywhere">
          {fault.message}
        </p>
        <p class="m-0 max-w-c-measure type-body text-ink-muted">
          {words.mountFailedNext}
        </p>
        <div class="flex gap-space-2">
          <Button
            onclick={() => {
              fault = null;
              mount += 1;
            }}
            size="sm"
            variant="outline">{words.tryAgain}</Button
          >
          <Button
            aria-expanded={details}
            onclick={() => {
              details = !details;
            }}
            size="sm"
            variant="ghost"
            >{details ? words.hideDetails : words.showDetails}</Button
          >
        </div>
        {#if details}
          <pre
            class="m-0 max-w-full overflow-auto rounded-md bg-code-bg p-space-3 type-code text-ink-row">{fault.stack}</pre>
        {/if}
      </div>
    {:else if !mounted && waited}
      <div class="absolute inset-0 p-space-6" aria-busy="true">
        <span class="sr-only">{words.mounting(review.name)}</span>
        <Skeleton height="board" />
      </div>
    {/if}
  </div>
</section>
