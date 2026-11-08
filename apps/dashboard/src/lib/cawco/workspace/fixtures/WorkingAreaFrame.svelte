<script lang="ts" module>
  import { PREVIEW_ENTER_PATH, PREVIEW_PING_PATH } from "@cawco/core/frames";

  /**
   * No hub stands behind a states file, and the panel's frame is this page's
   * own origin: its reach check and its pass are answered here, once a page.
   */
  const standFor = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const { url } = new Request(input);
    if (url.endsWith(PREVIEW_PING_PATH) || url.includes(PREVIEW_ENTER_PATH)) {
      return Promise.resolve(new Response("ok"));
    }
    if (url.endsWith("/api/preview-ticket")) {
      return Promise.resolve(Response.json({ ticket: "working-area" }));
    }
    // Placeholder data: what a pane would read of the hub is seeded below, so
    // a read of it stays in flight, and what the pane already shows stands.
    if (new URL(url).pathname.startsWith("/api/")) {
      return new Promise<Response>(() => undefined);
    }
    return standFor(input, init);
  };

  /** A comments doc with nothing in it: y-websocket's sync step 2 of an empty update, answered to each sync step 1. */
  const EMPTY_SYNC = new Uint8Array([0, 1, 2, 0, 0]);

  /** The pane's comments socket, answered here: the hub is never dialled. */
  class CommentsStandIn {
    binaryType = "arraybuffer";
    readyState = 0;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    constructor() {
      setTimeout(() => {
        this.readyState = 1;
        this.onopen?.(new Event("open"));
      });
    }

    send(data: ArrayBuffer | Uint8Array): void {
      const said = new Uint8Array(data as ArrayBuffer);
      if (said[0] === 0 && said[1] === 0) {
        setTimeout(() => this.onmessage?.({ data: EMPTY_SYNC.slice().buffer }));
      }
    }

    close(): void {
      this.readyState = 3;
      this.onclose?.({ code: 1000 });
    }
  }

  globalThis.WebSocket = new Proxy(globalThis.WebSocket, {
    construct: (socket, [url, protocols]) =>
      String(url).includes("/ws/artifact/")
        ? new CommentsStandIn()
        : new socket(url, protocols),
  });

  /**
   * What the preview overlay says between a stage page and its panel (the
   * proxy injects the overlay; a page nested in a states file has none, and
   * under the panel's own overlay a nested one stands down). Runs in the
   * frame, so its posts come from the frame's window.
   */
  const RELAY = `(() => {
    const say = (message) => parent.postMessage(message, location.origin);
    const ready = () => say({ type: "cawco:ready", url: location.href, title: document.title });
    const sheets = () => {
      for (const sheet of Object.values(window.__cawcoSheetsOnPage ?? {})) {
        say({ type: "cawco:sheet", sheet });
      }
    };
    addEventListener("cawco:sheet", (event) => say({ type: "cawco:sheet", sheet: event.detail }));
    for (const type of ["cawco:stage-reached", "cawco:stage-laid", "cawco:stage-fault", "cawco:stage-differences", "cawco:stage-time", "cawco:stage-dials-written"]) {
      addEventListener(type, (event) => say({ type, ...event.detail }));
    }
    addEventListener("message", (event) => {
      if (event.source !== parent || !event.data?.type) return;
      const { type, ...detail } = event.data;
      if (type === "cawco:hello") { ready(); sheets(); }
      else if (type === "cawco:canvas-view") dispatchEvent(new CustomEvent(type, { detail: detail.view }));
      else if (type.startsWith("cawco:stage-")) dispatchEvent(new CustomEvent(type, { detail }));
    });
    ready();
    sheets();
  })();`;

  /** Puts the relay in the panel's frame each time it loads (a load doesn't bubble, so this listens in capture). */
  const relayInFrames = (node: HTMLElement) => {
    const loaded = (event: Event) => {
      if (event.target instanceof HTMLIFrameElement) {
        const inner = event.target.contentDocument;
        const script = inner?.createElement("script");
        if (inner && script) {
          script.textContent = RELAY;
          inner.head.append(script);
        }
      }
    };
    node.addEventListener("load", loaded, true);
    return () => node.removeEventListener("load", loaded, true);
  };
</script>

<script lang="ts">
  /**
   * The working area as a states file draws it: the real tab strip, the real
   * SessionPane (its transcript and, through SideSplit, the preview panel
   * beside it) and the group's composer, laid out as PaneLeaf lays them out.
   * Only the client's state is seeded, as the /motion benches seed it (dev's
   * `__cawcoDebug`); the app never mounts this.
   */
  import type { PulseFrame } from "@cawco/core/frames";
  import type { InstanceRow, WorkItemSummary } from "@cawco/core/protocol";
  import { canvasPath } from "@cawco/core/stage";
  import { untrack } from "svelte";
  import { blankSession } from "#lib/cawco/client.svelte.js";
  import { fleetPane } from "#lib/cawco/preview/fleet-pane.svelte.js";
  import {
    type PanePreview,
    setPaneFleet,
  } from "#lib/cawco/preview/pane-fleet.js";
  import SessionPane from "#lib/cawco/SessionPane.svelte";
  import { store } from "#lib/cawco/storage.js";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { composerFleet } from "#lib/cawco/transcript/composer-fleet.js";
  import { entered } from "#lib/cawco/transcript/tray.svelte.js";
  import type { Message } from "#lib/cawco/types.js";
  import {
    composerBindings,
    composerOf,
  } from "#lib/cawco/workspace/composer-dock.svelte.js";
  import PaneTabs from "#lib/cawco/workspace/PaneTabs.svelte";
  import type { LeafNode } from "#lib/cawco/workspace/workspace.svelte.js";
  import { provideHangLayer } from "#lib/components/ui/hang-card/hang-layer.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";

  let {
    height = 900,
    path = canvasPath(["src/lib/cawco/transcript/Prompt.stories.ts"], {}),
    artifactName = "Ask in the composer",
    ask = "Judge the ask in each state: pin anything that reads wrong",
  }: {
    /** The frame's height: a story's, never the window's, which the stage grows to fit the frame. */
    height?: number;
    /** Where the panel's frame opens, on this page's own origin. */
    path?: string;
    artifactName?: string;
    ask?: string;
  } = $props();

  const ID = "0f1e2d3c-0000-4000-8000-000000000a01";
  const ARTIFACT = "00000000-0000-4000-8000-000000000a0a";
  const OTHERS: [string, string][] = [
    ["0f1e2d3c-0000-4000-8000-000000000a02", "Fix tray chip overflow"],
    ["0f1e2d3c-0000-4000-8000-000000000a03", "Audit chip colours for contrast"],
  ];
  const now = Date.now();

  const SAID: [string, string][] = [
    [
      "The delegate card still reads like a log. Can we try it blind, from what a person needs while it runs?",
      "Yes. I'll hand a designer the states and nothing of today's card, so what comes back owes nothing to it.\n\nThe brief covers the whole life: waiting, working, checks, landed and failed.",
    ],
    [
      "Show me the longest name it could get.",
      "It's on the canvas as Long name: the title takes two lines and the path in the running line stays on one.",
    ],
    [
      "Open it next to this so I can comment.",
      "It's open beside the conversation. Pin anything that reads wrong and I'll fix it here.",
    ],
  ];

  function history(): Message[] {
    return SAID.flatMap(([asked, answer], n) => {
      const at = new Date(now - (30 - n * 8) * 60_000).toISOString();
      return [
        {
          id: `${ID}-user-${n}`,
          instanceId: ID,
          type: "user",
          content: asked,
          timestamp: at,
        } as Message,
        {
          id: `${ID}-asst-${n}`,
          instanceId: ID,
          type: "assistant",
          content: answer,
          timestamp: at,
        } as Message,
      ];
    });
  }

  const debug = (
    globalThis as unknown as {
      __cawcoDebug: {
        frame: (frame: PulseFrame) => void;
        state: {
          status: string;
          sessions: Record<string, ReturnType<typeof blankSession>>;
          workItems: Record<string, WorkItemSummary>;
          previews: Record<string, PanePreview>;
        };
        adoptInstances: (rows: InstanceRow[]) => void;
      };
    }
  ).__cawcoDebug;

  const rowOf = (id: string, title: string): InstanceRow =>
    ({
      id,
      cwd: "/home/you/cockpit",
      harness: "claude",
      kind: "mainline",
      launchDir: "known",
      machineId: "build-box-frankfurt-02",
      sessionId: null,
      status: "running",
      title,
      updatedAt: now,
    }) as InstanceRow;

  debug.adoptInstances([
    rowOf(ID, "Delegate card, blind attempt"),
    ...OTHERS.map(([id, title]) => rowOf(id, title)),
  ]);

  const session = blankSession(ID);
  session.machineId = "build-box-frankfurt-02";
  session.cwd = "/home/you/cockpit";
  session.messages = history();
  session.initialized = true;
  debug.state.sessions[ID] = session;
  debug.frame({
    kind: "pulse",
    instanceId: ID,
    pulse: {
      activity: "working",
      at: now,
      busy: true,
      currentTool: null,
      instanceId: ID,
      runningSubagents: 0,
    },
  });

  const WORK = [
    "Move every remaining dashboard surface onto the new tokens",
    "Add a tray width test matrix",
  ];
  WORK.forEach((title, i) => {
    const item = {
      id: `wi-area-${i}`,
      instanceId: `ds-area-${i}`,
      parentInstanceId: ID,
      conversationInstanceId: null,
      machinePaused: null,
      stalled: null,
      title,
      state: "running",
      createdAt: now - (20 - i) * 60_000,
      endedAt: null,
      dismissedAt: null,
      dismissReason: null,
      replacedBy: null,
      firstLines: { brief: title, result: "", error: "" },
      queued: null,
      checkQueue: null,
      waitReason: null,
      waitUntil: null,
    } as WorkItemSummary;
    debug.state.workItems[item.id] = item;
    entered.set(item.instanceId, "none");
  });

  const port = Number(location.port) || 80;
  debug.state.previews[ID] = {
    kind: "preview",
    instanceId: ID,
    artifact: {
      id: ARTIFACT,
      kind: "component",
      name: "working-area-content",
      title: untrack(() => artifactName),
      ask: untrack(() => ask),
    },
    artifacts: [ARTIFACT],
    // This page's own origin, however the panel reached it: through a preview
    // name its address has no port of its own.
    origin: location.origin,
    // The route a panel takes to its frame on a proxied name is the whole origin (core `previewRoute`); a port alone reads as :80 there.
    origin: location.origin,
    port,
    revision: "working-area-1",
    source: { port, path: untrack(() => path) },
    state: "open",
  } as PanePreview;

  // The comments column stands open, as the panel keeps it per conversation.
  store("local", `cawco-preview-comments:${ID}`, "open");

  setPaneFleet(fleetPane);
  const layerId = $props.id();
  const layer = provideHangLayer(layerId);

  const leaf = $state<LeafNode>({
    id: "working-area",
    t: "l",
    tabs: [ID, ...OTHERS.map(([id]) => id)],
    active: ID,
  });

  const lent = $derived(composerBindings.get(ID));
</script>

<TooltipProvider>
  <div
    class="@container/shell contain-layout relative flex h-(--frame-h) flex-col bg-surface-shelf text-ink-strong"
    data-hang-layer={layer.id}
    data-working-area
    style:--frame-h={`${height}px`}
    style:--shell-h={`${height}px`}
    {@attach relayInFrames}
  >
    <div
      data-slot="leaf"
      class="@container/leaf relative flex min-h-0 min-w-0 flex-auto flex-col overflow-hidden bg-surface-recess"
    >
      <PaneTabs {leaf} />
      <div
        data-slot="stack"
        class="relative flex min-h-0 min-w-0 flex-auto overflow-hidden"
      >
        <div data-slot="pane" class="absolute inset-0 flex">
          <SessionPane
            active
            browsing={null}
            browsingCwd=""
            browsingHarness="claude"
            focused
            viewId={ID}
            visible
          />
        </div>
      </div>
      {#if lent}
        <div
          data-slot="dock"
          class="pointer-events-none absolute inset-y-0 start-0 z-1 w-(--transcript-share)"
          style:--transcript-share="{lent.transcriptShare * 100}%"
        >
          <Composer
            fleet={composerFleet}
            {...composerOf(lent)}
            showing={ID}
            trayRows={[
              { delegatesOf: lent.delegatesOf, id: ID, prompts: lent.prompts },
            ]}
          />
        </div>
      {/if}
    </div>
  </div>
</TooltipProvider>
