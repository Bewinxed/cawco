<script lang="ts">
  /**
   * Option 2, the field: the set of states is the surface. One zoomable
   * field (Svelte Flow, laid out by dagre): every state a card, every move
   * a double arrow and every link a single labelled one, every group a
   * named region. The kept state is not shown anywhere else: its card grows
   * into the live component where it stands (the one TaskColumn, gliding to
   * its new place as the next card is kept, so its own move plays there),
   * and its neighbours make room. Walk follows the sequence card by card,
   * the camera gliding along; Fit pulls back to everything. A card a pointer
   * rests on (or a finger holds) previews in the live card with the
   * differences washed; on a wide window it grows live beside instead. The
   * arrow into the live card is the move's scrubber; its length opens the
   * clips. Each card the person has stood on is marked seen, and the walk
   * head says how many: proof of having looked, no verdict word.
   */
  import "#lib/vendor-css/xyflow.css";
  import { designGraphWords } from "@cawco/core/words/design-graph";
  import { graphProtoWords as words } from "@cawco/core/words/graph-proto";
  import {
    type Edge,
    MarkerType,
    type Node,
    SvelteFlow,
    ViewportPortal,
  } from "@xyflow/svelte";
  import { tick, untrack } from "svelte";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import GlassGroup from "#lib/cawco/preview/graph/GlassGroup.svelte";
  import { SYMBOL } from "#lib/cawco/preview/graph/symbol.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    IconChevronLeft,
    IconChevronRight,
    IconEye,
    IconZoomIn,
    IconZoomOut,
  } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import Adjust from "../shared/Adjust.svelte";
  import { Judge } from "../shared/judge.svelte";
  import ProtoBar from "../shared/ProtoBar.svelte";
  import {
    ASK,
    COMPONENT_NAME,
    LINKS,
    SEQUENCE,
    STATES,
    stateOf,
  } from "../shared/review.svelte";
  import Stage from "../shared/Stage.svelte";
  import ViewSettings from "../shared/ViewSettings.svelte";
  import CardNode, { type CardData } from "./CardNode.svelte";
  import FieldCamera from "./FieldCamera.svelte";
  import FieldEdge, { type FieldEdgeData } from "./FieldEdge.svelte";
  import { laidField } from "./layout";
  import RegionNode, { type RegionData } from "./RegionNode.svelte";

  let {
    height = 900,
    kept = SEQUENCE[0],
    camera: cameraMode = "walk",
  }: {
    height?: number;
    kept?: string;
    /** The camera the visit opens on: walking the sequence, or the whole field. */
    camera?: "walk" | "fit";
  } = $props();

  // svelte-ignore state_referenced_locally
  const judge = new Judge(kept);
  // svelte-ignore state_referenced_locally
  let mode = $state<"walk" | "fit">(cameraMode);

  let width = $state(0);
  const phone = $derived(width > 0 && width < 640);
  /** A window that holds the live card and a second at production width: a held card grows live beside. */
  const wide = $derived(width >= 3 * (judge.width + 48) + 400);

  /** The kept card as the field draws it: a scrub's destination holds still while the move is held. */
  const shown = $derived(judge.scrubbing?.to ?? judge.kept);
  let held = $state<string | null>(null);
  $effect(() => {
    judge.peek = held && held !== shown && !wide ? held : null;
  });

  /* --- Layout -------------------------------------------------------------- */

  let liveSize = $state({ w: 0, h: 0 });
  const CARD = {
    w: numberOf("--c-graph-node-w"),
    h: 2 * numberOf("--c-row-h") + numberOf("--space-3"),
  };
  /** Room over each region's states for its one heading. */
  const HEADING = numberOf("--space-6");
  /** A state's box: a card, or the live card's measured size where it is kept (a first guess until measured). */
  const sizeOf = (story: string) => {
    if (story !== shown) {
      return CARD;
    }
    return liveSize.w > 0
      ? { w: liveSize.w, h: liveSize.h }
      : { w: judge.width + 48, h: CARD.h * 4 };
  };
  const layout = $derived(
    laidField(
      STATES.map((one) => ({
        id: one.story,
        group: one.group,
        ...sizeOf(one.story),
      })),
      LINKS.map((one) => ({ from: one.from, to: one.to })),
      {
        node: numberOf("--space-5"),
        rank: 2 * numberOf("--space-8"),
        margin: numberOf("--space-6"),
        pad: numberOf("--space-3"),
      }
    )
  );
  const keptBox = $derived(
    layout.states.get(shown) ?? { x: 0, y: 0, w: 0, h: 0 }
  );

  const nodeTypes = { card: CardNode, region: RegionNode };
  const edgeTypes = { field: FieldEdge };

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  $effect(() => {
    // Each node keeps what Svelte Flow measured of it, so its handles stand where they stood (StateGraph does the same).
    const measured = new Map(
      untrack(() => nodes).map((one) => [one.id, one.measured])
    );
    const regions: Node[] = [...layout.groups].map(([group, box]) => ({
      id: `g:${group}`,
      type: "region",
      position: { x: box.x, y: box.y - HEADING },
      width: box.w,
      height: box.h + HEADING,
      zIndex: -1,
      draggable: false,
      selectable: false,
      focusable: false,
      data: {
        name: group,
        kept: stateOf(shown).group === group,
      } satisfies RegionData,
    }));
    const cards: Node[] = [...layout.states].map(([story, box]) => ({
      id: story,
      type: "card",
      measured: measured.get(story),
      position: { x: box.x, y: box.y },
      width: box.w,
      height: box.h,
      draggable: false,
      selectable: false,
      focusable: false,
      data: {
        story,
        judge,
        kept: story === shown,
        held: held === story,
        onkeep: (to: string) => {
          held = null;
          judge.go(to);
        },
        onhold: (to: string | null) => {
          held = to;
        },
      } satisfies CardData,
    }));
    nodes = [...regions, ...cards];
  });
  $effect(() => {
    edges = LINKS.map((link) => {
      const lit = judge.scrubbing
        ? judge.scrubbing.from === link.from && judge.scrubbing.to === link.to
        : link.kind === "move" && link.to === shown;
      return {
        id: `${link.from}>${link.to}`,
        type: "field",
        source: link.from,
        target: link.to,
        sourceHandle: "out",
        targetHandle: "in",
        selectable: false,
        focusable: false,
        zIndex: lit ? 2 : 1,
        markerEnd: {
          type: MarkerType.Arrow,
          color: lit ? "var(--c-graph-edge-chosen)" : "var(--c-graph-edge-ink)",
          width: numberOf("--c-edge-head-leg"),
          height: numberOf("--c-edge-head-leg"),
        },
        data: {
          from: link.from,
          to: link.to,
          kind: link.kind,
          label: link.label,
          lit,
          judge,
        } satisfies FieldEdgeData,
      };
    });
  });

  /* --- The camera ----------------------------------------------------------- */

  let camera = $state<ReturnType<typeof FieldCamera>>();
  const FOOT = numberOf("--c-steps-bar-h") + numberOf("--space-4");
  $effect(() => {
    const box = keptBox;
    const look = mode;
    if (!camera || liveSize.w === 0) {
      return;
    }
    tick().then(() => {
      if (look === "fit") {
        camera?.fit();
      } else {
        camera?.walkTo(box, phone ? Math.min(1, (width - 16) / box.w) : 1, {
          top: 0,
          foot: FOOT,
        });
      }
    });
  });

  let liveRoot = $state<HTMLElement | null>(null);
  let besideRoot = $state<HTMLElement | null>(null);
  const heldBox = $derived(held && wide ? layout.states.get(held) : undefined);
  const stoodOn = $derived(
    STATES.filter((one) => judge.seen.includes(one.story)).length
  );
  /** The live card's own height cap: the panel's room under the bar and over the walk head. */
  const cap = $derived(Math.round(height * 0.62));

  const keyed = (event: KeyboardEvent) => {
    if (
      (event.target as HTMLElement).closest("input, textarea, [role=slider]")
    ) {
      return;
    }
    if (event.key === "ArrowRight") {
      judge.step(1);
    } else if (event.key === "ArrowLeft") {
      judge.step(-1);
    } else if (event.key === "c") {
      judge.commenting = !judge.commenting;
    } else {
      return;
    }
    event.preventDefault();
  };
</script>

{#snippet liveCard(story: string, live: boolean)}
  {@const state = stateOf(story)}
  <div
    class={[
      "flex flex-col gap-space-2 rounded-lg p-space-2 shadow-raised",
      live
        ? "bg-selected-bg inset-ring-2 inset-ring-brand-solid"
        : "bg-surface-raised inset-ring inset-ring-border-control",
    ]}
  >
    <div class="flex flex-col gap-space-row px-space-1">
      <span
        class={["type-label", live ? "text-selected-ink" : "text-ink-strong"]}
        >{live ? state.name : words.held(state.name)}</span
      >
      <span
        class="line-clamp-2 max-w-(--w) type-meta text-ink-muted"
        style:--w="{judge.width + 24}px">{state.note}</span
      >
    </div>
    <div
      class="nowheel overflow-y-auto overscroll-contain"
      style:max-height="{cap}px"
    >
      {#if live}
        <Stage
          against={besideRoot}
          bind:root={liveRoot}
          {judge}
          live
          marking={heldBox ? "went" : null}
          peek={judge.peek}
          story={judge.kept}
        />
      {:else}
        <Stage
          against={liveRoot}
          bind:root={besideRoot}
          {judge}
          marking="came"
          pins={false}
          {story}
        />
      {/if}
    </div>
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: the surface's keys (← → step, C comments) answer wherever focus stands inside it, as an application region's do. -->
<div
  aria-label={COMPONENT_NAME}
  bind:clientWidth={width}
  class="relative flex flex-col overflow-hidden bg-surface-recess text-ink-strong"
  data-proto="field"
  onkeydown={keyed}
  role="application"
  style:height="{height}px"
>
  <ProtoBar compact={phone} {judge}>
    {#snippet centre()}
      {#if !phone}
        <GlassGroup label={words.waysOfSeeing}>
          <Tabs
            onValueChange={(value) => {
              mode = value === "fit" ? "fit" : "walk";
            }}
            size="compact"
            value={mode}
          >
            <TabsList aria-label={words.waysOfSeeing}>
              <TabItem label={words.walk} value="walk" />
              <TabItem label={words.fit} value="fit" />
            </TabsList>
          </Tabs>
        </GlassGroup>
      {/if}
    {/snippet}
  </ProtoBar>
  <p class="m-0 flex-none px-space-4 pb-space-2 type-body text-ink-strong">
    {ASK}
  </p>

  <div
    class="relative min-h-0 flex-1"
    data-field
    style:--xy-background-color="transparent"
  >
    <SvelteFlow
      colorMode={theme.current}
      deleteKey={null}
      {edgeTypes}
      elementsSelectable={false}
      maxZoom={1.6}
      minZoom={0.2}
      nodesConnectable={false}
      nodesDraggable={false}
      nodesFocusable={false}
      {nodeTypes}
      panOnDrag
      panOnScroll
      proOptions={{ hideAttribution: true }}
      zoomOnPinch
      zoomOnScroll={false}
      bind:edges
      bind:nodes
    >
      <FieldCamera bind:this={camera} />
      <ViewportPortal target="front">
        <!-- The live card: one object, gliding to the kept card's place (The One Object Rule). -->
        <div
          bind:offsetHeight={
            () => liveSize.h,
            (h) => {
              liveSize = { ...liveSize, h };
            }
          }
          bind:offsetWidth={
            () => liveSize.w,
            (w) => {
              liveSize = { ...liveSize, w };
            }
          }
          class="nopan nodrag absolute top-0 left-0 z-10 transition-transform duration-(--dur-panel) ease-drawer motion-reduce:transition-none"
          data-live-card={shown}
          style:transform="translate({keptBox.x}px, {keptBox.y}px)"
        >
          {@render liveCard(shown, true)}
        </div>
        {#if heldBox && held}
          <!-- A wide window: the held card grows live where it stands, beside the kept one (T4). -->
          <div
            class="nopan nodrag pointer-events-none absolute top-0 left-0 z-20"
            data-beside={held}
            style:transform="translate({heldBox.x}px, {heldBox.y}px)"
          >
            {@render liveCard(held, false)}
          </div>
        {/if}
      </ViewportPortal>
    </SvelteFlow>

    <!-- The walk head and the zoom: floating groups at the foot, 44px each under a finger. -->
    <div
      class="pointer-events-none absolute inset-x-space-3 bottom-space-3 flex flex-wrap items-end justify-center gap-space-2"
    >
      {#if phone}
        <GlassGroup class="pointer-events-auto">
          <ViewSettings {judge} />
          <Adjust {judge} />
        </GlassGroup>
      {/if}
      <GlassGroup class="pointer-events-auto" label={designGraphWords.slider}>
        <button
          aria-label={words.firstStep}
          class="{SYMBOL} grid-flow-col"
          disabled={judge.at <= 0}
          onclick={() => judge.end("first")}
          title={words.firstStep}
          type="button"
          ><IconChevronLeft /><IconChevronLeft class="-ms-space-3" /></button
        >
        <button
          aria-label={designGraphWords.previousStep}
          class={SYMBOL}
          disabled={judge.at <= 0}
          onclick={() => judge.step(-1)}
          title={designGraphWords.previousStep}
          type="button"><IconChevronLeft /></button
        >
        <span
          class="relative min-w-c-steps-stop-min-w px-space-1 text-center type-label tabular-nums"
          >{judge.at >= 0
            ? designGraphWords.stepOf(judge.at + 1, SEQUENCE.length)
            : stateOf(judge.kept).name}</span
        >
        <button
          aria-label={designGraphWords.nextStep}
          class={SYMBOL}
          disabled={judge.at >= SEQUENCE.length - 1}
          onclick={() => judge.step(1)}
          title={designGraphWords.nextStep}
          type="button"><IconChevronRight /></button
        >
        <button
          aria-label={words.lastStep}
          class="{SYMBOL} grid-flow-col"
          disabled={judge.at === SEQUENCE.length - 1}
          onclick={() => judge.end("last")}
          title={words.lastStep}
          type="button"
          ><IconChevronRight /><IconChevronRight class="-ms-space-3" /></button
        >
        <span
          class="relative flex items-center gap-space-1 pe-space-2 ps-space-1 type-meta text-ink-muted tabular-nums"
          data-stood-on
          ><IconEye class="size-icon-sm" />{words.stoodOn(
            stoodOn,
            STATES.length
          )}</span
        >
      </GlassGroup>
      <GlassGroup class="pointer-events-auto" label={designGraphWords.zoom}>
        <button
          aria-label={designGraphWords.zoomOut}
          class={SYMBOL}
          onclick={() => camera?.zoomOut()}
          title={designGraphWords.zoomOut}
          type="button"><IconZoomOut /></button
        >
        <button
          aria-pressed={mode === "fit"}
          class="{SYMBOL} w-auto px-space-2"
          onclick={() => {
            mode = mode === "fit" ? "walk" : "fit";
          }}
          type="button"
          ><span class="type-label"
            >{mode === "fit" ? words.walk : words.fit}</span
          ></button
        >
        <button
          aria-label={designGraphWords.zoomIn}
          class={SYMBOL}
          onclick={() => camera?.zoomIn()}
          title={designGraphWords.zoomIn}
          type="button"><IconZoomIn /></button
        >
      </GlassGroup>
    </div>
  </div>
</div>
