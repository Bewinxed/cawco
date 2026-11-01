<script lang="ts">
  /**
   * The dock: the kept move's clips over time, standing at the stage's foot
   * only while the move into the kept state animates (projects plan §5.10).
   * One row per clip: its target and its kind in the label column, then its
   * bar on the lane, in its kind's own colour (the owner's pick), at its
   * delay and as long as it runs. The play button stands on the label
   * column's start, so it lines up with the labels under it; the playhead
   * crosses every lane while the move plays.
   *
   * A clip's readouts are chips in its row (the owner's pick "In the row"),
   * the variable first and its figure after it: the length's token and its
   * milliseconds, then the curve. Pressing one opens its choices in a
   * popover at that chip. Dragging the bar's end snaps its length to the
   * duration tokens; holding ⌥ frees it, and its chip turns dashed for the
   * agent to name (pick "Snap, and ⌥ frees it"). Each drop or pick replays
   * the move once (pick "Replay once"). Once anything is edited, Original |
   * Edited in the head swaps what plays; under Original the edited bars
   * turn to outlines, and the original's dashed outline stands under each
   * edited bar either way (pick "Original | Edited").
   */
  import { graphWords } from "@cawco/core/words/graph";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { IconPause, IconPlay } from "#lib/icons.js";
  import type { Clip, GraphMove } from "./graph";

  /** The lengths a drag snaps to: the house's duration tokens, short to long. */
  const LADDER = [
    ["--dur-control", 120],
    ["--dur-exit", 160],
    ["--dur-morph", 180],
    ["--dur-fade", 200],
    ["--dur-pop", 260],
    ["--dur-panel", 280],
    ["--dur-lift", 340],
    ["--dur-settle", 400],
  ] as const;
  /** The house's curves (DESIGN.md, Motion grammar), offered first; the agent may write any. */
  const CURVES = [
    ["--ease-out", "var(--ease-out)"],
    ["--ease-in-out", "var(--ease-in-out)"],
    ["--ease-drawer", "var(--ease-drawer)"],
    ["linear", "linear"],
  ] as const;

  let {
    move,
    fromTitle,
    toTitle,
    edits,
    showing,
    progress,
    playing,
    onplay,
    onshow,
    onedit,
  }: {
    move: GraphMove;
    fromTitle: string;
    toTitle: string;
    /** The person's edits, by clip id, over the agent's clips. */
    edits: Record<string, Partial<Clip>>;
    /** What plays: the agent's original, or the edits. */
    showing: "original" | "edited";
    /** Where the playhead stands, 0 to 1; null at rest. */
    progress: number | null;
    playing: boolean;
    onplay: () => void;
    onshow: (which: "original" | "edited") => void;
    /**
     * A clip changed. `commit` false while a drag runs; a drop, a chip's
     * change or a curve's pick commits, and the move replays after it.
     */
    onedit: (id: string, change: Partial<Clip>, commit?: boolean) => void;
  } = $props();

  const edited = $derived(Object.keys(edits).length > 0);
  const clips = $derived(
    move.clips.map((clip) => ({ ...clip, ...(edits[clip.id] ?? {}) }))
  );
  /** The lane's length: the longest of the original and the edit, and a tick past it. */
  const span = $derived(
    Math.ceil(
      Math.max(
        200,
        ...clips.map((one) => one.delay + one.duration),
        ...move.clips.map((one) => one.delay + one.duration)
      ) / 100
    ) * 100
  );
  const ticks = $derived(
    Array.from({ length: span / 100 + 1 }, (_, index) => index * 100)
  );
  const pct = (ms: number) => `${(ms / span) * 100}%`;
  /** The playhead's place on the lane, 0 to 1: the move's played share of its length, over the lane's span. */
  const head = $derived(
    progress === null
      ? 0
      : Math.min(
          1,
          (progress *
            Math.max(...clips.map((one) => one.delay + one.duration))) /
            span
        )
  );

  /** A drag on a bar's end: its length follows the pointer, snapped unless ⌥ is held. */
  let dragging = $state<string | null>(null);
  function drag(clip: Clip, event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    const lane = handle.closest<HTMLElement>("[data-lane]");
    if (!lane) {
      return;
    }
    handle.setPointerCapture(event.pointerId);
    dragging = clip.id;
    let last: Partial<Clip> = {};
    const at = (next: PointerEvent) => {
      const box = lane.getBoundingClientRect();
      const ms = ((next.clientX - box.left) / box.width) * span - clip.delay;
      if (next.altKey) {
        const free = Math.max(20, Math.round(ms / 10) * 10);
        return { duration: free, token: null };
      }
      const nearest = LADDER.reduce((best, one) =>
        Math.abs(one[1] - ms) < Math.abs(best[1] - ms) ? one : best
      );
      return { duration: nearest[1], token: nearest[0] };
    };
    const moveTo = (next: PointerEvent) => {
      last = at(next);
      onedit(clip.id, last, false);
    };
    const up = () => {
      dragging = null;
      handle.removeEventListener("pointermove", moveTo);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      if (last.duration !== undefined) {
        onedit(clip.id, last);
      }
    };
    handle.addEventListener("pointermove", moveTo);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  const curveName = (clip: Clip) =>
    clip.easingToken ??
    CURVES.find((one) => one[1] === clip.easing)?.[0] ??
    clip.easing;
</script>

<div class="@container min-w-0">
  <section
    aria-label={`${fromTitle} → ${toTitle}`}
    data-slot="dock"
    class="grid min-w-0 grid-cols-(--dock-cols) gap-x-space-4 @max-phone:grid-cols-(--dock-cols-narrow) rounded-lg border border-border-control bg-surface-raised shadow-overlay"
    style:--dock-cols="var(--c-dock-label-w) minmax(0, 1fr) auto"
    style:--dock-cols-narrow="minmax(0, 1fr) auto"
  >
    <!-- The head: play on the label column's start, the move's name, the
       compare switch once there are edits, and the lane's ruler. -->
    <div
      class="col-span-full grid grid-cols-subgrid items-center gap-y-space-1 border-b border-border-hairline px-space-3 py-space-2"
    >
      <div
        class={[
          "mark-line flex min-w-0 items-center gap-space-2 @max-phone:row-start-1",
          edited ? "@max-phone:col-start-1" : "@max-phone:col-span-full",
        ]}
      >
        <button
          aria-label={playing ? graphWords.pause : graphWords.play}
          class="grid size-c-btn-h-sm flex-none place-items-center rounded-md text-ink-strong transition-control touch-hit can-hover:hover:bg-surface-hover active:scale-(--press-scale)"
          data-box
          onclick={onplay}
          title={playing ? graphWords.pause : graphWords.play}
          type="button"
        >
          {#if playing}
            <IconPause aria-hidden="true" class="size-icon-md" />
          {:else}
            <IconPlay aria-hidden="true" class="size-icon-md" />
          {/if}
        </button>
        <span
          class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
          >{fromTitle} → {toTitle}</span
        >
      </div>
      <div
        aria-hidden="true"
        class="relative h-space-5 min-w-0 @max-phone:col-span-full @max-phone:row-start-2"
      >
        {#each ticks as tick, index (tick)}
          <span
            class={[
              "absolute start-(--at) top-1/2 -translate-y-1/2 type-meta mono-figure text-ink-subtle",
              index === 0 && "translate-x-0",
              index === ticks.length - 1 && "-translate-x-full",
              index > 0 && index < ticks.length - 1 && "-translate-x-1/2",
            ]}
            style:--at={pct(tick)}>{tick}</span
          >
        {/each}
      </div>
      <div
        class="flex justify-end @max-phone:col-start-2 @max-phone:row-start-1"
      >
        {#if edited}
          <Tabs.Root
            onValueChange={(value) => onshow(value as "original" | "edited")}
            value={showing}
          >
            <Tabs.List>
              <Tabs.Trigger value="original">{graphWords.original}</Tabs.Trigger
              >
              <Tabs.Trigger value="edited">{graphWords.edited}</Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
        {/if}
      </div>
    </div>

    <ul
      class="col-span-full m-0 grid list-none grid-cols-subgrid gap-y-space-1 p-space-3"
    >
      {#each clips as clip, index (clip.id)}
        {@const original = move.clips[index]}
        {@const changed = edits[clip.id] !== undefined}
        {@const shown = showing === "original" ? original : clip}
        <li
          class="col-span-full grid grid-cols-subgrid items-center gap-y-space-1"
          style:--clip={`var(--clip-${clip.kind})`}
        >
          <span
            class="flex min-w-0 items-baseline gap-space-2 ps-space-2 @max-phone:col-start-1 @max-phone:row-start-1"
          >
            <span class="min-w-0 truncate type-label text-ink-row"
              >{clip.target}</span
            >
            <span class="flex-none type-meta text-(--clip)">{clip.kind}</span>
          </span>
          <div
            data-lane
            class="relative h-c-btn-h-sm min-w-0 @max-phone:col-span-full @max-phone:row-start-2"
          >
            {#if changed}
              <!-- The agent's original, always under an edited bar. -->
              <span
                aria-hidden="true"
                class="absolute inset-y-0 start-(--at) w-(--len) rounded-sm border border-dashed border-(--clip)"
                style:--at={pct(original.delay)}
                style:--len={pct(original.duration)}
              ></span>
            {/if}
            <span
              class="absolute inset-y-0 start-(--at) flex w-(--len) min-w-0 items-center rounded-sm border border-(--clip) bg-(--clip)/18 data-outline:bg-transparent motion-safe:transition-[width,inset-inline-start] motion-safe:duration-(--dur-morph) motion-safe:ease-in-out data-dragging:transition-none"
              data-dragging={dragging === clip.id || undefined}
              data-outline={(showing === "original" && changed) || undefined}
              style:--at={pct(shown.delay)}
              style:--len={pct(shown.duration)}
            >
              <!-- The end grabs: its length, snapped to the tokens. -->
              <span
                aria-hidden="true"
                class="absolute inset-y-0 -end-space-1 w-space-3 cursor-ew-resize touch-none"
                onpointerdown={(event) => drag(clip, event)}
              ></span>
            </span>
            {#if progress !== null}
              <!-- The playhead, one piece a lane, the gap above it included. -->
              <span
                aria-hidden="true"
                class="pointer-events-none absolute -top-space-1 bottom-0 start-(--at) w-px bg-brand-solid"
                style:--at={`${head * 100}%`}
              ></span>
            {/if}
          </div>
          <!-- The chips: the row's last column, the variable first. -->
          <span
            class="flex items-center justify-end gap-space-1 @max-phone:col-start-2 @max-phone:row-start-1"
          >
            <Popover.Root>
              <Popover.Trigger>
                {#snippet child({ props })}
                  <button
                    {...props}
                    class="inline-flex h-space-6 items-center gap-space-1 rounded-sm border border-border-control bg-surface-raised px-space-2 whitespace-nowrap transition-control can-hover:hover:bg-surface-hover data-free:border-dashed data-free:border-(--clip)"
                    data-free={shown.token === null || undefined}
                    title={shown.token === null
                      ? graphWords.freeLength
                      : graphWords.duration}
                    type="button"
                  >
                    <code class="type-code text-ink-muted"
                      >{shown.token ?? "—"}</code
                    >
                    <span class="type-meta mono-figure num text-ink-strong"
                      >{shown.duration}ms</span
                    >
                  </button>
                {/snippet}
              </Popover.Trigger>
              <Popover.Content align="start">
                <ul class="m-0 grid list-none p-0">
                  {#each LADDER as [token, ms] (token)}
                    <li>
                      <button
                        class="flex w-full items-center justify-between gap-space-5 rounded-xs px-space-3 py-space-2 text-start transition-control can-hover:hover:not-aria-current:bg-surface-hover aria-current:bg-selected-bg"
                        aria-current={shown.token === token
                          ? "true"
                          : undefined}
                        onclick={() => onedit(clip.id, { duration: ms, token })}
                        type="button"
                      >
                        <code class="type-code text-ink-row">{token}</code>
                        <span class="type-meta mono-figure num text-ink-muted"
                          >{ms}ms</span
                        >
                      </button>
                    </li>
                  {/each}
                </ul>
              </Popover.Content>
            </Popover.Root>
            <Popover.Root>
              <Popover.Trigger>
                {#snippet child({ props })}
                  <button
                    {...props}
                    class="inline-flex h-space-6 items-center rounded-sm border border-border-control bg-surface-raised px-space-2 whitespace-nowrap transition-control can-hover:hover:bg-surface-hover"
                    title={graphWords.curve}
                    type="button"
                  >
                    <code class="type-code text-ink-muted"
                      >{curveName(shown)}</code
                    >
                  </button>
                {/snippet}
              </Popover.Trigger>
              <Popover.Content align="start">
                <ul class="m-0 grid list-none p-0">
                  {#each CURVES as [token, css] (token)}
                    <li>
                      <button
                        class="flex w-full items-center rounded-xs px-space-3 py-space-2 text-start transition-control can-hover:hover:not-aria-current:bg-surface-hover aria-current:bg-selected-bg"
                        aria-current={curveName(shown) === token
                          ? "true"
                          : undefined}
                        onclick={() =>
                          onedit(clip.id, {
                            easing: css,
                            easingToken: token === "linear" ? null : token,
                          })}
                        type="button"
                      >
                        <code class="type-code text-ink-row">{token}</code>
                      </button>
                    </li>
                  {/each}
                </ul>
              </Popover.Content>
            </Popover.Root>
          </span>
        </li>
      {/each}
    </ul>
  </section>
</div>
