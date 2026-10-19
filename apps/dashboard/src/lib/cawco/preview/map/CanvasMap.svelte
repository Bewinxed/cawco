<script lang="ts">
  /**
   * A component canvas's Map mode (canvas-view.svelte.ts `map`), over the
   * page in the panel's well, the page staying loaded under it: the
   * canvas's component in the middle, what renders it (used in) in rows
   * above, what it renders (made of) in rows below, an edge from each user
   * to it and from it to each part, as the stage's design map answers them
   * (the hub's `GET …/artifacts/:id/map`). Each card counts its states and
   * frames drawn; the chosen one, the canvas's own until another is
   * pressed, draws its canvas live, the others the report's thumbnail of
   * their frames. On Svelte Flow, as the decision graph, with its dots and
   * zoom tools. In a pane under 640px it is a list: Used in, This canvas,
   * Made of.
   */
  import type { CanvasMap, CanvasMapNode } from "@cawco/core/stage";
  import {
    Background,
    BackgroundVariant,
    type Edge,
    MarkerType,
    type Node,
    Panel,
    SvelteFlow,
  } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import { fetchCanvasMap } from "#lib/cawco/artifact-api.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import FlowAutoFit from "#lib/components/features/flow/FlowAutoFit.svelte";
  import FlowZoomTracker from "#lib/components/features/flow/FlowZoomTracker.svelte";
  import { FIT, ZOOM } from "#lib/components/features/flow/fit.js";
  import WorkflowCanvasTools from "#lib/components/features/workflows/WorkflowCanvasTools.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconAlert, IconRefresh } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import type { CanvasChosen } from "../canvas-view.svelte";
  import MapCard, { type MapRole } from "./MapCard.svelte";
  import MapFit from "./MapFit.svelte";
  import MapNode from "./MapNode.svelte";

  let {
    address,
    artifactId,
    instanceId,
    ready,
    revision,
    view,
  }: {
    /** The canvas page's address on the pane's origin, absolute; null until the pane has one. */
    address: string | null;
    artifactId: string;
    instanceId: string;
    /** The pane's own page has loaded (its pass entered, in host mode): a live card may load beside it. */
    ready: boolean;
    /** The show's revision: a new one reads the map again. */
    revision: string;
    /** The canvas view: a live card draws in its scheme and motion. */
    view: CanvasChosen;
  } = $props();

  /**
   * A narrow pane, by the head's own line (`@container (width < 640px)`,
   * PreviewPane): a mark that stands only under it (`.narrow-sense`), read
   * as it comes and goes. A list there, the graph past it.
   */
  let sense = $state<HTMLElement>();
  let narrow = $state(false);
  $effect(() => {
    const mark = sense;
    if (!mark) {
      return;
    }
    const read = () => {
      narrow = mark.getClientRects().length > 0;
    };
    const watch = new ResizeObserver(read);
    watch.observe(mark);
    read();
    return () => watch.disconnect();
  });
  const nodeTypes = { component: MapNode };
  /** Cards to a row before the next row: our call, the five a desk pane holds at the map's fit. */
  const PER_ROW = 5;

  let map = $state<CanvasMap | null>(null);
  let failure = $state<string | null>(null);
  let asked = $state(0);
  /** The chosen card's file: the canvas's own until another is pressed. */
  let chosen = $state<string | null>(null);
  $effect(() => {
    const ids = { instanceId, artifactId };
    // biome-ignore lint/complexity/noVoid: read-only dependencies — a new show or Try again reads the map again
    void [revision, asked];
    let live = true;
    failure = null;
    fetchCanvasMap(ids.instanceId, ids.artifactId).then(
      (read) => {
        if (!live) {
          return;
        }
        map = read;
        const files = [read.center, ...read.usedIn, ...read.madeOf].map(
          (one) => one.file
        );
        if (!(chosen && files.includes(chosen))) {
          chosen = read.center.file;
        }
      },
      (error: unknown) => {
        if (live) {
          failure = failureWords(error);
        }
      }
    );
    return () => {
      live = false;
    };
  });

  /** A card's canvas page, live: the canvas's own address for its component, another states file's for the rest, as a second page that never posts a report. */
  function liveOf(node: CanvasMapNode, role: MapRole): string | null {
    if (!(address && ready) || node.statesFiles.length === 0) {
      return null;
    }
    const url = new URL(address);
    if (role !== "center") {
      url.searchParams.delete("file");
      url.searchParams.delete("spec");
      for (const file of node.statesFiles) {
        url.searchParams.append("file", file);
      }
    }
    url.searchParams.set("by", "map");
    if (view.scheme !== "page") {
      url.searchParams.set("scheme", view.scheme);
    }
    if (view.motion === "reduce") {
      url.searchParams.set("motion", "reduce");
    }
    return url.href;
  }

  const choose = (file: string) => {
    chosen = file;
  };
  const cardOf = (node: CanvasMapNode, role: MapRole) => ({
    node,
    role,
    chosen: node.file === chosen,
    live: node.file === chosen ? liveOf(node, role) : null,
    onchoose: choose,
  });

  /** The map's lengths, read off the tokens once the map stands: a card's width and the gaps between cards, rows and groups. */
  let root = $state<HTMLElement>();
  let lengths = $state<{
    across: number;
    between: number;
    card: number;
    down: number;
  } | null>(null);
  $effect(() => {
    const at = root;
    if (!at) {
      return;
    }
    const of = (token: string) => {
      const probe = document.createElement("div");
      probe.style.position = "absolute";
      probe.style.inlineSize = `var(${token})`;
      at.append(probe);
      const { width } = probe.getBoundingClientRect();
      probe.remove();
      return width;
    };
    lengths = {
      card: of("--c-map-node-w"),
      across: of("--space-5"),
      between: of("--space-6"),
      down: of("--space-8"),
    };
  });
  /** A card's height as Svelte Flow measured it (MapFit); its width until then. */
  let rowHeight = $state(0);

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  let zoom = $state(1);
  $effect(() => {
    if (!(map && lengths) || narrow) {
      nodes = [];
      edges = [];
      return;
    }
    const { card, across, between, down } = lengths;
    const row = rowHeight || card;
    const rowsOf = (list: CanvasMapNode[]) =>
      Array.from({ length: Math.ceil(list.length / PER_ROW) }, (_, at) =>
        list.slice(at * PER_ROW, (at + 1) * PER_ROW)
      );
    const placed = (
      list: CanvasMapNode[],
      role: Exclude<MapRole, "center">,
      top: (at: number) => number
    ): Node[] =>
      rowsOf(list).flatMap((cards, at) => {
        const wide = cards.length * card + (cards.length - 1) * across;
        return cards.map((node, n) => ({
          id: `${role}:${node.file}`,
          type: "component",
          position: { x: -wide / 2 + n * (card + across), y: top(at) },
          draggable: false,
          selectable: false,
          connectable: false,
          focusable: false,
          data: cardOf(node, role),
        }));
      });
    // A card rebuilt (another chosen, the rows at their measured height) keeps
    // the size Svelte Flow measured: one without it stays hidden, since its
    // box never changes size to be measured again.
    const measured = new Map(
      untrack(() => nodes).map((one) => [one.id, one.measured])
    );
    nodes = [
      ...placed(
        map.usedIn,
        "usedIn",
        (at) => -(down + row) - at * (row + between)
      ),
      {
        id: "center",
        type: "component",
        position: { x: -card / 2, y: 0 },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
        data: cardOf(map.center, "center"),
      },
      ...placed(
        map.madeOf,
        "madeOf",
        (at) => row + down + at * (row + between)
      ),
    ].map((one) => ({ ...one, measured: measured.get(one.id) }));
    const edge = (source: string, target: string): Edge => ({
      id: `${source}->${target}`,
      source,
      target,
      sourceHandle: "out",
      targetHandle: "in",
      type: "smoothstep",
      selectable: false,
      focusable: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "var(--border-control)",
      },
    });
    edges = [
      ...map.usedIn.map((one) => edge(`usedIn:${one.file}`, "center")),
      ...map.madeOf.map((one) => edge("center", `madeOf:${one.file}`)),
    ];
  });

  /**
   * The list opens on the canvas's own card: the group it stands in at the
   * list's top, what renders it a scroll up. Once, as the list comes.
   */
  const openAtCanvas = (group: HTMLElement) => {
    const list = group.parentElement;
    if (list) {
      list.scrollTop =
        group.offsetTop - Number.parseFloat(getComputedStyle(list).paddingTop);
    }
  };

  const name = $derived(map?.center.name ?? "");
  const groups = $derived(
    map
      ? [
          {
            key: "usedIn" as const,
            words: "Used in",
            empty: `Nothing renders ${name} yet.`,
            nodes: map.usedIn,
          },
          {
            key: "center" as const,
            words: "This canvas",
            empty: "",
            nodes: [map.center],
          },
          {
            key: "madeOf" as const,
            words: "Made of",
            empty: `${name} renders no other component.`,
            nodes: map.madeOf,
          },
        ]
      : []
  );
</script>

<div
  data-slot="canvas-map"
  class="absolute inset-0 overflow-hidden bg-surface-recess"
  bind:this={root}
>
  <span
    aria-hidden="true"
    class="absolute hidden @max-phone:block size-px pointer-events-none"
    bind:this={sense}
  ></span>
  {#if failure}
    <div
      class="absolute inset-0 overflow-auto px-space-6 bg-surface-well"
      role="alert"
    >
      <EmptyState icon={IconAlert} title="The map didn't load">
        {#snippet line()}
          {failure}
        {/snippet}
        {#snippet action()}
          <Button
            icon={IconRefresh}
            label="Try again"
            onclick={() => {
              asked += 1;
            }}
            size="sm"
            variant="outline"
          />
        {/snippet}
      </EmptyState>
    </div>
  {:else if !map}
    <p
      class="m-0 p-space-5 text-ink-muted type-meta animate-wait-grace-show motion-safe:animate-wait-grace-in"
      role="status"
    >
      Reading the canvas's map
    </p>
  {:else if narrow}
    <div
      data-slot="map-list"
      class="absolute inset-0 grid content-start gap-space-5 overflow-y-auto overscroll-contain p-space-4"
    >
      {#each groups as group (group.key)}
        <section
          aria-label={group.words}
          class="grid gap-space-2"
          {@attach group.key === "center" && openAtCanvas}
        >
          <h3 class="m-0 text-ink-muted type-caps">{group.words}</h3>
          {#if group.nodes.length === 0}
            <p class="m-0 text-ink-muted type-meta">{group.empty}</p>
          {:else}
            <ul class="grid gap-space-3 m-0 p-0 list-none">
              {#each group.nodes as node (node.file)}
                <li>
                  <MapCard {...cardOf(node, group.key)} class="w-auto" />
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
    </div>
  {:else}
    <div
      data-slot="map-graph"
      class="absolute inset-0"
      style:--xy-edge-stroke="var(--border-control)"
      style:--xy-edge-stroke-width="var(--c-graph-edge)"
    >
      <SvelteFlow
        colorMode={theme.current}
        deleteKey={null}
        elementsSelectable={false}
        fitView
        fitViewOptions={FIT}
        {...ZOOM}
        nodesConnectable={false}
        nodesDraggable={false}
        nodesFocusable={false}
        {nodeTypes}
        panOnDrag
        bind:edges
        bind:nodes
      >
        <Background gap={16} size={1} variant={BackgroundVariant.Dots} />
        <FlowZoomTracker
          onZoomChange={(value) => {
            zoom = value;
          }}
        />
        <FlowAutoFit nodeCount={nodes.length} />
        <MapFit
          onrow={(height) => {
            rowHeight = height;
          }}
          {rowHeight}
        />
        <Panel position="top-left">
          <p
            class="m-0 max-w-c-map-node-w text-ink-muted type-meta text-pretty"
          >
            Above, what renders {name} ({map.usedIn.length}). Below, what
            {name} renders ({map.madeOf.length}).
          </p>
        </Panel>
        <Panel position="bottom-center">
          <WorkflowCanvasTools
            onfit={() => undefined}
            onzoom={() => undefined}
            {zoom}
          />
        </Panel>
      </SvelteFlow>
    </div>
  {/if}
</div>
