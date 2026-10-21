<!--
  Every drawn state, one per `?scene=` (scripts/render.ts captures each).
  ctx-*: the decided parts shown as context; p1-* to p4-*: the four picks,
  each option in the states that decide it.
-->
<script lang="ts">
  import { Button } from "$kit/components/ui/button/index.js";
  import { floatingSurface } from "$kit/components/ui/popover/popover-content.svelte";
  import { Textarea } from "$kit/components/ui/textarea/index.js";
  import { IconSend } from "$kit/icons.js";
  import { AGENT, COMMENTS, type Comment, type PinState, UNSENT } from "./data";
  import Composer from "./parts/Composer.svelte";
  import Float from "./parts/Float.svelte";
  import Marker from "./parts/Marker.svelte";
  import MarkerBoard from "./parts/MarkerBoard.svelte";
  import Panel from "./parts/Panel.svelte";
  import Pin from "./parts/Pin.svelte";
  import RailList from "./parts/RailList.svelte";
  import SamplePage from "./parts/SamplePage.svelte";
  import ThreadView from "./parts/ThreadView.svelte";

  const scene = new URLSearchParams(location.search).get("scene") ?? "ctx-rail";

  /** The review's pins on the page, by the element each stands on. */
  interface Placed {
    dot?: "live" | "unread" | null;
    focused?: boolean;
    n: number | null;
    state: PinState;
    /** The pressed point across its element, where a scene moves it off the usual spot. */
    x?: string;
  }
  const statesOf = (rows: Comment[]): Record<string, Placed> => {
    const by = (n: number) => rows.find((row) => row.n === n);
    return {
      save: { n: 14, state: by(14)?.state ?? "sent", dot: by(14)?.live ? "live" : null },
      page: { n: 13, state: by(13)?.state ?? "sent", dot: by(13)?.live ? "live" : null },
      schedule: { n: 12, state: by(12)?.state ?? "sent", dot: by(12)?.live ? "live" : null },
    };
  };

  const QUIET_UNSENT: Comment[] = [
    { ...UNSENT[0], state: "unsent" },
    { ...COMMENTS[1], live: false },
    COMMENTS[2],
  ];
  const QUIET_SENT: Comment[] = [
    { ...UNSENT[0], state: "sent", age: "now", live: true },
    { ...COMMENTS[1], live: false },
    COMMENTS[2],
  ];
  const ALL_SENT: Comment[] = [
    { ...UNSENT[0], state: "sent", age: "now", live: true },
    { ...UNSENT[1], state: "sent" },
    { ...UNSENT[2], state: "sent" },
  ];
</script>

<!-- The review's pins: 14 on Save, 12 on Schedule, 13 on the whole page at the well's top-right corner. -->
{#snippet reviewPins(name: string, placed: Record<string, Placed>, shape: "tail" | "stem" = "tail", provisionalOn: string | null = null)}
  {#if name === provisionalOn}
    <Pin n={null} {shape} state="provisional" x="38%" y="34px" />
  {:else if name === "page" && placed.page}
    <span class="absolute end-space-2 top-space-2 z-10" data-pin="13">
      <Marker
        dot={placed.page.dot}
        n={13}
        state={placed.page.state}
        tail="none"
      />
    </span>
  {:else if placed[name]}
    <Pin
      dot={placed[name].dot}
      focused={placed[name].focused}
      n={placed[name].n}
      {shape}
      state={placed[name].state}
      x={placed[name].x ?? (name === "schedule" ? "calc(100% - 24px)" : "calc(100% - 14px)")}
      y={name === "schedule" ? "26px" : "6px"}
    />
  {/if}
{/snippet}

{#snippet sendFoot(count: number)}
  <div class="flex flex-col gap-space-2">
    <Textarea placeholder="Add a note for the agent" rows={1} />
    <div class="flex justify-end">
      <Button size="sm"><IconSend /><span>Send</span><span class="num">{count}</span></Button>
    </div>
  </div>
{/snippet}

<main class="p-5" data-scene={scene}>
  {#if scene === "ctx-rail"}
    {@const placed = statesOf(COMMENTS)}
    <Panel comments>
      {#snippet page()}<SamplePage>{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</SamplePage>{/snippet}
      {#snippet rail()}<RailList rows={COMMENTS} />{/snippet}
    </Panel>
  {:else if scene === "ctx-whole"}
    {@const placed = statesOf(COMMENTS)}
    <Panel comments height="auto">
      {#snippet page()}<SamplePage outlined="page">{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</SamplePage>{/snippet}
      {#snippet rail()}<RailList rows={COMMENTS} />{/snippet}
    </Panel>
  {:else if scene === "ctx-empty"}
    <!--
      The empty-comment rule, in two frames of the page: pressed with nothing typed, then after Esc or a press outside.
      The form's save error isn't drawn here, so the composer under Prompt covers no line in part. The pin stands
      in the field, as pick 4 presses it, leaving the outline's corners to Prompt's tag.
    -->
    <div class="flex gap-space-4" data-board>
      {#each ["Pressed, nothing typed", "After Esc or a click outside"] as frame, at (frame)}
        <figure class="flex flex-col gap-space-2">
          <div
            class="relative h-[480px] w-[370px] overflow-hidden rounded-lg bg-surface-page shadow-tile"
            data-frame
          >
            <SamplePage errorLine={false} outlined={at === 0 ? "prompt" : null}>
              {#snippet pin(name)}
                {#if at === 0 && name === "prompt"}
                  <Pin n={null} state="provisional" x="45%" y="34px" />
                  <div
                    class={[floatingSurface(), "absolute end-0 top-[calc(100%+var(--space-2))] z-20 w-(--c-pin-card-w) p-space-3"]}
                    data-float
                  >
                    <Composer target="Prompt" />
                  </div>
                {/if}
              {/snippet}
            </SamplePage>
            <span aria-hidden="true" class="pointer-events-none absolute inset-0 z-30 rounded-lg border-2 border-brand-solid"></span>
          </div>
          <figcaption class="type-meta text-ink-muted">{frame}</figcaption>
        </figure>
      {/each}
    </div>
  {:else if scene === "p1-rail"}
    {@const placed = { ...statesOf(COMMENTS), save: { n: 14, state: "sent" as const, focused: true } }}
    <Panel comments>
      {#snippet page()}<SamplePage outlined="save">{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</SamplePage>{/snippet}
      {#snippet rail()}<ThreadView as="rail" />{/snippet}
    </Panel>
  {:else if scene === "p1-card"}
    <!--
      Pin 14 stands on Save's start, so the card it flips left covers Cancel whole and leaves Save in view
      (on Save's end it would cut "Save" in half, and the pin can't stand far enough out to cover it whole).
    -->
    {@const placed = { ...statesOf(COMMENTS), save: { n: 14, state: "sent" as const, focused: true, x: "6px" } }}
    <Panel>
      {#snippet page()}<SamplePage outlined="save">{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</SamplePage>{/snippet}
    </Panel>
    <Float anchor="[data-pin='14'] [data-pin-front]"><ThreadView as="card" /></Float>
  {:else if scene === "p2-tail" || scene === "p2-stem"}
    {@const shape = scene === "p2-tail" ? "tail" : "stem"}
    <Panel mode="interact" open={9}>
      {#snippet page()}
        <SamplePage>
          {#snippet pin(name)}
            {#if name === "heading"}<Pin n={7} {shape} x="calc(100% - 3px)" y="12px" />{/if}
            {#if name === "name"}<Pin n={103} place={shape === "tail" ? "up-left" : "up-right"} shift={shape === "stem" ? "-12px" : "0px"} {shape} x="calc(100% - 6px)" y="34px" />{/if}
            {#if name === "schedule"}<Pin deck={[111, 110]} n={112} {shape} x="calc(100% - 14px)" y="34px" />{/if}
            {#if name === "prompt"}<Pin n={98} {shape} x="40%" y="34px" />{/if}
            {#if name === "save"}<Pin n={108} {shape} x="calc(100% - 14px)" y="6px" />{/if}
          {/snippet}
        </SamplePage>
      {/snippet}
    </Panel>
  {:else if scene === "p2-tail-board"}
    <MarkerBoard shape="tail" />
  {:else if scene === "p2-stem-board"}
    <MarkerBoard shape="stem" />
  {:else if scene === "p3-send-unsent"}
    {@const placed = statesOf(UNSENT)}
    <Panel comments send={3}>
      {#snippet page()}<SamplePage>{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</SamplePage>{/snippet}
      {#snippet rail()}<RailList rows={UNSENT}>{#snippet foot()}{@render sendFoot(3)}{/snippet}</RailList>{/snippet}
    </Panel>
  {:else if scene === "p3-send-sent"}
    {@const placed = statesOf(ALL_SENT)}
    <Panel ask={`Sent to ${AGENT}`} comments>
      {#snippet page()}<SamplePage>{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</SamplePage>{/snippet}
      {#snippet rail()}<RailList rows={ALL_SENT} />{/snippet}
    </Panel>
  {:else if scene === "p3-quiet-unsent"}
    {@const placed = statesOf(QUIET_UNSENT)}
    <Panel comments>
      {#snippet page()}<SamplePage>{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</SamplePage>{/snippet}
      {#snippet rail()}<RailList rows={QUIET_UNSENT} sentLine />{/snippet}
    </Panel>
  {:else if scene === "p3-quiet-sent"}
    {@const placed = statesOf(QUIET_SENT)}
    <Panel comments>
      {#snippet page()}<SamplePage>{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</SamplePage>{/snippet}
      {#snippet rail()}<RailList rows={QUIET_SENT} sentLine />{/snippet}
    </Panel>
  {:else if scene === "p4-el-empty" || scene === "p4-el-typed"}
    {@const placed = statesOf(COMMENTS)}
    <Panel>
      {#snippet page()}<SamplePage outlined="prompt">{#snippet pin(name)}{@render reviewPins(name, placed, "tail", "prompt")}{/snippet}</SamplePage>{/snippet}
    </Panel>
    <Float anchor="[data-pin='new'] [data-pin-front]">
      <Composer target="Prompt" value={scene === "p4-el-typed" ? "Two rows is too short; show the whole prompt." : ""} />
    </Float>
  {:else if scene === "p4-rail-empty" || scene === "p4-rail-typed"}
    {@const placed = statesOf(COMMENTS)}
    <Panel comments>
      {#snippet page()}<SamplePage outlined="prompt">{#snippet pin(name)}{@render reviewPins(name, placed, "tail", "prompt")}{/snippet}</SamplePage>{/snippet}
      {#snippet rail()}
        <RailList rows={COMMENTS}>
          {#snippet foot()}<Composer target="Prompt" value={scene === "p4-rail-typed" ? "Two rows is too short; show the whole prompt." : ""} />{/snippet}
        </RailList>
      {/snippet}
    </Panel>
  {/if}
</main>
