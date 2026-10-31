<script lang="ts">
  /**
   * Option 3, the pair: nothing is judged alone. Here is the kept state, Next
   * the state compared with it (the sequence's next step unless the person
   * stood another there), both live at production width where the window
   * holds two. The seam between them is the move: drag its knob down to
   * hold the move mid-way, let go past half and Next is promoted into Here
   * (the column plays its own move in Here's box) while the step after it
   * arrives in Next; before half it goes back. Differences on Next's head
   * washes both. Under two production widths Next folds to a 44px edge:
   * hold it to stand Next over Here, its differences washed. The steps row
   * at the foot drags up into the whole set (the branch's StateGraph), where
   * a press stands a state in Next. Done is the bar's one prominent action:
   * the owner says he has finished judging, with the open count.
   */
  import { graphProtoWords as words } from "@cawco/core/words/graph-proto";
  import GlassGroup from "#lib/cawco/preview/graph/GlassGroup.svelte";
  import StateGraph from "#lib/cawco/preview/graph/StateGraph.svelte";
  import { SYMBOL } from "#lib/cawco/preview/graph/symbol.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconChevronDown,
    IconChevronUp,
    IconLayers,
    IconPlay,
    IconStructure,
  } from "#lib/icons.js";
  import Adjust from "../shared/Adjust.svelte";
  import Clips from "../shared/Clips.svelte";
  import { FILE, pointAt, SECTION_GRAPH } from "../shared/graph";
  import { Judge } from "../shared/judge.svelte";
  import ProtoFrame from "../shared/ProtoFrame.svelte";
  import {
    COMPONENT_NAME,
    linkBetween,
    linksFrom,
    SEQUENCE,
    STATES,
    stateOf,
  } from "../shared/review.svelte";
  import Stage from "../shared/Stage.svelte";
  import Stepper from "../shared/Stepper.svelte";
  import ViewSettings from "../shared/ViewSettings.svelte";

  let {
    height = 900,
    kept = SEQUENCE[0],
    differences = false,
    set = false,
  }: {
    height?: number;
    kept?: string;
    /** Differences on Next's head, as the visit opens. */
    differences?: boolean;
    /** The whole set open at the foot, as when the agent gave no sequence. */
    set?: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally
  const judge = new Judge(kept);
  // svelte-ignore state_referenced_locally
  let diff = $state(differences);
  // svelte-ignore state_referenced_locally
  let setOpen = $state(set);

  /** The state that follows one: its next step, else the first state a move or link leads to. */
  const following = (story: string): string | null => {
    const at = SEQUENCE.indexOf(story);
    if (at >= 0 && at < SEQUENCE.length - 1) {
      return SEQUENCE[at + 1] as string;
    }
    return linksFrom(story)[0]?.to ?? null;
  };
  /** Next, where the person stood one; else what follows Here. */
  let chosen = $state<string | null>(null);
  /** The state a seam scrub is moving into: Next holds still while Here moves toward it. */
  let seamTo = $state<string | null>(null);
  const next = $derived(
    seamTo ?? (chosen && chosen !== judge.kept ? chosen : following(judge.kept))
  );

  let width = $state(0);
  const twoUp = $derived(width >= 2 * (judge.width + 48) + 160);
  let hereRoot = $state<HTMLElement | null>(null);
  let nextRoot = $state<HTMLElement | null>(null);
  /** Next brought over Here by a held edge. */
  let over = $state(false);
  $effect(() => {
    judge.peek = over && next ? next : null;
  });

  /** Walking promotes Next into Here; the step after arrives in Next. */
  const promote = async (to: string) => {
    chosen = null;
    await judge.go(to);
  };

  /* --- The seam: the move from Here into Next ----------------------------- */

  let scrub = $state<number | null>(null);
  /** The state a seam scrub moves out of: the seam stays that move's while Here moves. */
  let seamFrom = $state<string | null>(null);
  const seamHere = $derived(seamFrom ?? judge.kept);
  const fractionAt = (event: PointerEvent, el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
  };
  const seamKnob = $derived.by(() => {
    if (scrub !== null) {
      return scrub;
    }
    const { runner } = judge;
    if ((runner.running || runner.held) && runner.length > 0) {
      return runner.at / runner.length;
    }
    return 0;
  });
  const seamLink = $derived(next ? linkBetween(seamHere, next) : null);
  let clipsOpen = $state(false);

  /** ← and →: back a step, or Next promoted into Here. */
  const stepPair = (delta: -1 | 1) => {
    if (delta === 1) {
      if (next) {
        promote(next);
      }
      return;
    }
    chosen = null;
    judge.step(-1);
  };

  /* --- Done: the one verdict word ------------------------------------------ */

  let done = $state<"open" | "handing" | "handed">("open");
  const openCount = $derived(judge.remarks.length);
</script>

{#snippet head(story: string, role: "here" | "next")}
  {@const state = stateOf(story)}
  <div class="flex min-w-0 flex-col gap-space-row px-space-1">
    <span class="flex items-center gap-space-2">
      <span class="type-caps text-ink-subtle"
        >{role === "here" ? words.here : words.next}</span
      >
      <span class="min-w-0 flex-1 truncate type-label text-ink-strong"
        >{state.name}</span
      >
      {#if role === "next"}
        <button
          aria-label={words.differences}
          aria-pressed={diff}
          class="{SYMBOL} mark-line w-auto grid-flow-col gap-space-1 px-space-2"
          onclick={() => {
            diff = !diff;
          }}
          type="button"
          ><IconLayers /><span class="type-label">{words.differences}</span
          ></button
        >
        <button
          class="{SYMBOL} w-auto px-space-2"
          onclick={() => promote(story)}
          type="button"><span class="type-label">{words.swap}</span></button
        >
      {/if}
    </span>
    <span
      class="line-clamp-2 max-w-(--w) type-meta text-ink-muted"
      style:--w="{judge.width + 24}px">{state.note}</span
    >
  </div>
{/snippet}

<ProtoFrame bind:width {height} {judge} onstep={stepPair} proto="pair">
  {#snippet action()}
    {#if done === "handed"}
      <span class="flex min-w-0 items-center gap-space-2" data-done>
        <span class="truncate type-meta text-ink-muted"
          >{words.handedOver(COMPONENT_NAME, openCount)}</span
        >
        <Button
          onclick={() => {
            done = "open";
          }}
          size="sm"
          variant="ghost">{words.undo}</Button
        >
      </span>
    {:else}
      <Button
        data-done
        disabled={done === "handing"}
        onclick={() => {
          done = "handing";
          setTimeout(() => {
            done = "handed";
          }, 600);
        }}
        size="sm"
        >{openCount > 0 ? words.doneOpen(openCount) : words.done}</Button
      >
    {/if}
  {/snippet}

  <div class="min-h-0 flex-1 overflow-auto px-space-4 pt-space-2 pb-space-4">
    {#if twoUp}
      <!-- Here, the seam, Next: both live at production width. -->
      <div class="mx-auto flex w-max items-start gap-space-3" data-pair>
        <div class="flex flex-col gap-space-2">
          {@render head(judge.kept, "here")}
          <Stage
            against={nextRoot}
            bind:root={hereRoot}
            {judge}
            live
            marking={diff ? "went" : null}
            story={judge.kept}
          />
        </div>
        <!-- The seam is the move: its knob scrubs down the seam, its play runs it. -->
        <div
          class="mark-line flex w-c-touch-floor flex-none flex-col items-center gap-space-2 self-stretch pt-space-7"
          data-seam
        >
          {#if next && seamLink?.kind === "move"}
            <button
              data-box
              aria-label={words.playMove(
                stateOf(seamHere).name,
                stateOf(next).name
              )}
              class="{SYMBOL} bg-surface-raised shadow-xs"
              onclick={() => next && promote(next)}
              title={words.playMove(stateOf(seamHere).name, stateOf(next).name)}
              type="button"><IconPlay /></button
            >
            <div
              data-box
              aria-label={words.holdMove(
                stateOf(seamHere).name,
                stateOf(next).name
              )}
              aria-orientation="vertical"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(seamKnob * 100)}
              class="relative w-c-touch-floor flex-1 cursor-ns-resize touch-none focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
              onpointerdown={async (event) => {
                if (!next) {
                  return;
                }
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  // A pointer the browser no longer tracks: the gesture carries on uncaptured.
                }
                seamFrom = judge.kept;
                const to = next;
                const from = seamFrom;
                seamTo = to;
                scrub = fractionAt(event, event.currentTarget);
                await judge.scrubStart(from, to);
                if (scrub !== null) {
                  judge.scrub(scrub);
                }
              }}
              onpointermove={(event) => {
                if (scrub !== null) {
                  scrub = fractionAt(event, event.currentTarget);
                  judge.scrub(scrub);
                }
              }}
              onpointerup={async () => {
                if (scrub === null) {
                  return;
                }
                const f = scrub;
                scrub = null;
                await judge.scrubEnd(f);
                seamTo = null;
                seamFrom = null;
                chosen = null;
              }}
              role="slider"
              tabindex="0"
            >
              <span
                class="absolute inset-y-0 left-1/2 w-space-1 -translate-x-1/2 border-x border-(color:--c-graph-edge-ink)"
              ></span>
              <span
                class="top-(--y) absolute left-1/2 size-space-4 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-ink-solid shadow-xs"
                style:--y="{seamKnob * 100}%"
              ></span>
            </div>
            <span class="type-meta text-ink-subtle tabular-nums"
              >{judge.lengthOf(seamHere, next) === null &&
              judge.move?.to !== judge.kept
                ? words.notMeasured
                : words.ms(judge.runner.length)}</span
            >
            <button
              data-box
              aria-expanded={clipsOpen}
              aria-label={words.clips(judge.runner.clips.length)}
              class={SYMBOL}
              onclick={() => {
                clipsOpen = !clipsOpen;
              }}
              title={words.clips(judge.runner.clips.length)}
              type="button"
              >{#if clipsOpen}<IconChevronUp />{:else}<IconChevronDown
                />{/if}</button
            >
          {:else if next && seamLink}
            <span
              data-box
              class="w-px flex-1 bg-c-graph-edge-ink"
              aria-hidden="true"
            ></span>
            <span class="text-center type-meta text-ink-subtle"
              >{seamLink.label}</span
            >
          {/if}
        </div>
        <div class="flex flex-col gap-space-2">
          {#if next}
            {@render head(next, "next")}
            <Stage
              against={hereRoot}
              bind:root={nextRoot}
              {judge}
              marking={diff ? "came" : null}
              story={next}
            />
          {:else}
            <p
              class="w-(--w) m-0 type-body text-ink-muted"
              style:--w="{judge.width}px"
            >
              {words.nothingFollows(stateOf(judge.kept).name)}
            </p>
          {/if}
        </div>
      </div>
      {#if clipsOpen}
        <div class="mx-auto mt-space-4 max-w-c-doc-max" data-clips-fold>
          <Clips {judge} />
        </div>
      {/if}
    {:else}
      <!-- Under two production widths: Here, and Next folded to its edge. -->
      <div class="mx-auto flex w-max items-stretch gap-space-2">
        <div class="flex min-w-0 flex-col gap-space-2">
          {@render head(judge.kept, "here")}
          <Stage
            bind:root={hereRoot}
            {judge}
            live
            peek={judge.peek}
            story={judge.kept}
          />
        </div>
        {#if next}
          <button
            aria-label={words.showNext(stateOf(next).name)}
            class="mark-line sticky end-0 flex w-c-touch-floor flex-none touch-none flex-col items-center gap-space-2 rounded-lg bg-surface-raised py-space-3 inset-ring inset-ring-border-hairline select-none not-aria-pressed:hover:bg-surface-hover aria-pressed:bg-surface-pressed"
            aria-pressed={over}
            data-next-edge
            onkeydown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                over = true;
              }
            }}
            onkeyup={() => {
              over = false;
            }}
            onpointercancel={() => {
              over = false;
            }}
            onpointerdown={() => {
              over = true;
            }}
            onpointerleave={() => {
              over = false;
            }}
            onpointerup={() => {
              over = false;
            }}
            type="button"
          >
            <span class="type-caps text-ink-subtle">{words.next}</span>
            <!-- The name stood letter over letter down the edge, as the 44px edge holds it. -->
            <span
              data-box
              aria-hidden="true"
              class="flex flex-col items-center type-label text-ink-strong"
            >
              {#each [...stateOf(next).name] as letter, at (at)}
                <span class="leading-none"
                  >{letter === " " ? "\u00a0" : letter}</span
                >
              {/each}
            </span>
            <IconPlay class="mt-auto size-icon-md text-ink-muted" />
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- The steps row at the foot; dragged up (or the whole set's symbol), the set sheet. -->
  <section
    aria-label={words.setSheet}
    class={[
      "flex flex-none flex-col gap-space-2 rounded-t-panel border-t border-border-control bg-surface-raised px-space-3 pt-space-2 pb-space-3 shadow-drawer",
      setOpen && "h-c-graph-drawer-stop",
    ]}
    data-sheet={setOpen ? "set" : "steps"}
  >
    <button
      aria-label={setOpen ? words.inOrder : words.setSheet}
      aria-pressed={setOpen}
      class="mx-auto flex h-space-4 w-c-grabber-w flex-none items-center justify-center rounded-pill focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
      data-grabber
      onclick={() => {
        setOpen = !setOpen;
      }}
      type="button"
      ><span class="h-c-grabber-h w-full rounded-pill bg-ink-subtle/40"
      ></span></button
    >
    {#if setOpen}
      <p class="m-0 type-meta text-ink-muted">{words.pressForNext}</p>
      <div class="flex min-h-0 flex-1 flex-col">
        <StateGraph
          file={FILE}
          graph={SECTION_GRAPH}
          height={Math.max(160, height * 0.55 - 120)}
          kept={pointAt(judge.kept)}
          onkeep={(point) => {
            chosen = point.story === judge.kept ? null : point.story;
          }}
          onpreview={() => undefined}
          peek={next ? pointAt(next) : null}
          sectionName={COMPONENT_NAME}
        />
      </div>
    {:else}
      <div class="flex gap-space-1 overflow-x-auto pb-space-1" data-steps>
        {#each [...SEQUENCE, ...STATES.map((one) => one.story).filter((one) => !SEQUENCE.includes(one))] as story, at (story)}
          {#if at === SEQUENCE.length}
            <span
              aria-hidden="true"
              class="w-px flex-none self-stretch bg-border-hairline"
            ></span>
          {/if}
          <button
            aria-current={story === judge.kept ? "step" : undefined}
            class={[
              "flex min-h-c-btn-h-sm flex-none items-center gap-space-1 rounded-md px-space-2 type-label whitespace-nowrap touch-hit focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring",
              story === judge.kept &&
                "bg-selected-bg text-selected-ink inset-ring-2 inset-ring-brand-solid",
              story === next &&
                "bg-surface-hover text-ink-strong inset-ring inset-ring-border-control",
              story !== judge.kept &&
                story !== next &&
                "bg-surface-raised text-ink-strong inset-ring inset-ring-border-hairline hover:bg-surface-hover",
            ]}
            data-step={story}
            onclick={() => promote(story)}
            type="button"
          >
            {#if story === judge.kept}<span class="type-caps">{words.here}</span
              >{:else if story === next}<span class="type-caps text-ink-subtle"
                >{words.next}</span
              >{/if}
            {stateOf(story).name}
            {#if judge.remarksOn(story).length > 0}
              <span class="type-meta tabular-nums"
                >· {judge.remarksOn(story).length}</span
              >
            {/if}
          </button>
        {/each}
      </div>
      {@const outs = linksFrom(judge.kept)}
      {#if outs.length > 0}
        <p
          class="m-0 flex flex-wrap items-center gap-space-1 type-meta text-ink-muted"
        >
          {words.nextFromHere}:
          {#each outs as link (link.to)}
            <button
              class="rounded-sm px-space-1 type-meta text-ink-strong underline decoration-border-control underline-offset-2 hover:bg-surface-hover"
              onclick={() => {
                chosen = link.to;
              }}
              type="button"
              >{stateOf(link.to).name}{link.label
                ? ` (${link.label})`
                : ""}</button
            >
          {/each}
        </p>
      {/if}
    {/if}
    <div class="flex flex-wrap items-center gap-space-2">
      <Stepper
        canNext={!!next}
        ends={false}
        {judge}
        onnext={() => stepPair(1)}
        onprev={() => stepPair(-1)}
      />
      <span class="flex-1"></span>
      <GlassGroup>
        {#if width < 640}
          <ViewSettings {judge} />
          <Adjust {judge} />
        {/if}
        <button
          aria-label={words.setSheet}
          aria-pressed={setOpen}
          class={SYMBOL}
          onclick={() => {
            setOpen = !setOpen;
          }}
          title={words.setSheet}
          type="button"><IconStructure /></button
        >
      </GlassGroup>
    </div>
  </section>
</ProtoFrame>
