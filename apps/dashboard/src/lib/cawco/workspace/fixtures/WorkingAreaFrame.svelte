<script lang="ts" module>
  import { type Pin, writePin } from "@cawco/core/comments/model";
  import {
    PREVIEW_ENTER_PATH,
    PREVIEW_PING_PATH,
  } from "@cawco/core/preview/routes";
  import { Doc, encodeStateAsUpdate } from "yjs";

  /**
   * No hub stands behind a states file, and the panel's frame is this page's
   * own origin: its reach check and its pass are answered here, once a page.
   */
  // A proxy of the native fetch, so what else it carries (Bun types its
  // `preconnect`) stays as it is.
  globalThis.fetch = new Proxy(globalThis.fetch, {
    apply: (standFor, _this, [input, init]: Parameters<typeof fetch>) => {
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
    },
  });

  const ago = (minutes: number) =>
    new Date(Date.now() - minutes * 60_000).toISOString();

  /** A person's comment on the ask in the composer, and what came back. */
  const pin = (
    number: number,
    title: string,
    said: string,
    minutes: number,
    replies: { text: string; asks?: true }[] = [],
    resolved?: "person" | "agent"
  ): Pin =>
    ({
      id: `working-area-pin-${number}`,
      number,
      kind: "comment",
      by: "person",
      at: ago(minutes),
      sentAt: ago(minutes),
      title,
      anchor: { selector: `[data-pin="${number}"]`, source: null, text: title },
      elements: [],
      ...(resolved
        ? { resolvedAt: ago(minutes - 6), resolvedBy: resolved }
        : {}),
      thread: [
        { id: `said-${number}`, by: "person", text: said, at: ago(minutes) },
        ...replies.map((reply, n) => ({
          id: `reply-${number}-${n}`,
          by: "agent" as const,
          at: ago(minutes - 2 - n),
          ...reply,
        })),
      ],
    }) as unknown as Pin;

  /** The comments on the ask: one waiting on him, three open, two resolved. */
  const PINS = [
    pin(
      6,
      "Allow once",
      "Should Allow once be the one that stands out? I almost always want this.",
      9,
      [
        {
          text: "It can be. Allow once filled and Always allow quiet would make the safe choice the easy one, but Always allow then reads as secondary on every ask. Which do you want?",
          asks: true,
        },
      ]
    ),
    pin(
      5,
      "bun run --cwd apps/dashboard build",
      "The command wraps to two lines at phone width and the flag splits from its value.",
      14
    ),
    pin(
      4,
      "Build the dashboard to check the new panel compiles",
      "This description repeats what the command says. Can it go?",
      22,
      [
        {
          text: "It comes from the agent's own words for the call, so it says why, not what. I kept it and set it in the muted ink under the command.",
        },
      ]
    ),
    pin(
      3,
      "Caw · cockpit",
      "Who's asking should be the first thing I read, not the last.",
      31,
      [
        {
          text: "Moved it to the top line, before the tool.",
        },
      ]
    ),
    pin(
      2,
      "Deny",
      "Deny needs a way to say why, otherwise the agent just tries again.",
      48,
      [
        {
          text: "Deny now opens a line to say why, and the reason goes back with the refusal.",
        },
      ],
      "agent"
    ),
    pin(
      1,
      "Reconnecting…",
      "The wait line jumps when the hub comes back.",
      70,
      [{ text: "It holds its height now and cross-fades." }],
      "person"
    ),
  ];

  /** Drawings made on this page: each frame's conversation is its own, so what one keeps (its Comments panel, its mode) is never another's. */
  let drawn = 0;
  const nextId = () => {
    drawn += 1;
    return `0f1e2d3c-0000-4000-8000-${String(drawn).padStart(12, "0")}`;
  };

  /** y-websocket's sync step 2 carrying the comments above, answered to each sync step 1. */
  const SEEDED_SYNC = (() => {
    const doc = new Doc();
    for (const one of PINS) {
      writePin(doc, one);
    }
    const update = encodeStateAsUpdate(doc);
    // The update's length as lib0's var-uint: seven bits a byte, low first,
    // the top bit saying another byte follows.
    const length: number[] = [];
    let rest = update.length;
    while (rest >= 128) {
      length.push((rest % 128) + 128);
      rest = Math.floor(rest / 128);
    }
    length.push(rest);
    return new Uint8Array([0, 1, ...length, ...update]);
  })();

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
        setTimeout(() =>
          this.onmessage?.({ data: SEEDED_SYNC.slice().buffer })
        );
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
    for (const type of ["cawco:stage-reached", "cawco:stage-laid", "cawco:stage-scrolled", "cawco:stage-fault", "cawco:stage-differences", "cawco:stage-time", "cawco:stage-dials-written"]) {
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

  /**
   * Shown in CawCo's own panel, the overlay marks the page's root as headed,
   * and a side card under that mark meets its edges (SideSurface). This
   * drawing's card is the subject, so it keeps its float.
   */
  const keepFloat = () => {
    const root = document.documentElement;
    const lift = () => root.removeAttribute("data-cawco-headed");
    lift();
    const watch = new MutationObserver(lift);
    watch.observe(root, {
      attributes: true,
      attributeFilter: ["data-cawco-headed"],
    });
    return () => watch.disconnect();
  };

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
  import type { PreviewMode } from "@cawco/core/comments/model";
  import type { PulseFrame } from "@cawco/core/frames";
  import type { InstanceRow, WorkItemSummary } from "@cawco/core/protocol";
  import { canvasPath } from "@cawco/core/stage";
  import { untrack } from "svelte";
  import { fleetPane } from "#lib/cawco/preview/fleet-pane.svelte.js";
  import {
    type PanePreview,
    setPaneFleet,
  } from "#lib/cawco/preview/pane-fleet.js";
  import SessionPane from "#lib/cawco/SessionPane.svelte";
  import { blankSession } from "#lib/cawco/stores/sessions.svelte.js";
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
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { store } from "#lib/platform/storage.js";

  let {
    path = canvasPath(["src/lib/cawco/transcript/Prompt.stories.ts"], {}),
    artifactName = "Ask in the composer",
    ask = "Judge the ask in each state: pin anything that reads wrong",
    comments = "open",
    mode = "interact",
  }: {
    /** Where the panel's frame opens, on this page's own origin. */
    path?: string;
    artifactName?: string;
    ask?: string;
    /** Whether the Comments panel stands, as the panel keeps it per conversation. */
    comments?: "open" | "shut";
    /** The preview's mode, as the panel keeps it per conversation. */
    mode?: PreviewMode;
  } = $props();

  const ID = nextId();
  /** The artifact this drawing's conversation made: its own, as every artifact is one session's. */
  const ARTIFACT = ID.replace("0f1e2d3c", "0a0a0a0a");
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
        sessionsState: {
          sessions: Record<string, ReturnType<typeof blankSession>>;
        };
        workItemsState: { workItems: Record<string, WorkItemSummary> };
        previewsState: { previews: Record<string, PanePreview> };
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
  debug.sessionsState.sessions[ID] = session;
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
    debug.workItemsState.workItems[item.id] = item;
    entered.set(item.instanceId, "none");
  });

  const port = Number(location.port) || 80;
  // The panel's preview follows the story's args: the canvas keeps one live
  // instance and hands it each story's args in turn (component-canvas: a
  // story's args are inputs the live instance takes at any time).
  $effect.pre(() => {
    debug.previewsState.previews[ID] = {
      kind: "preview",
      instanceId: ID,
      artifact: {
        id: ARTIFACT,
        kind: "component",
        name: "working-area-content",
        title: artifactName,
        ask,
      },
      artifacts: [ARTIFACT],
      // This page's own origin, however the panel reached it: through a preview
      // name its address has no port of its own.
      origin: location.origin,
      port,
      revision: "working-area-1",
      show: "working-area-1",
      source: { port, path },
      state: "open",
    } as PanePreview;
  });

  // The Comments panel stands or not, as the panel keeps it per conversation.
  store(
    "local",
    `cawco-preview-comments:${ID}`,
    untrack(() => comments)
  );
  store(
    "local",
    `cawco-preview-mode:${ID}`,
    untrack(() => mode)
  );

  setPaneFleet(fleetPane);
  const layerId = $props.id();
  const layer = provideHangLayer(layerId);

  const leaf = $state<LeafNode>({
    id: "working-area",
    t: "l",
    tabs: [ID, ...OTHERS.map(([id]) => id)],
    active: ID,
  });

  /**
   * The frame is a desk window's shape at whatever width the canvas draws it
   * (the stage's own 16:10, core stage.ts), so a wider stage is filled, never
   * framed in air; its height is the shell's the app's parts read.
   */
  let shellHeight = $state(0);
  const lent = $derived(composerBindings.get(ID));
</script>

<div
  class="@container/shell contain-layout relative flex aspect-16/10 w-full flex-col bg-surface-shelf text-ink-strong"
  data-hang-layer={layer.id}
  data-working-area
  style:--shell-h={`${shellHeight}px`}
  {@attach frameSize(
    (node: HTMLElement) => node.clientHeight,
    (value) => {
      shellHeight = value;
    }
  )}
  {@attach relayInFrames}
  {@attach keepFloat}
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
      <!-- The composer's box, as PaneLeaf docks it: over the transcript's
           share, and put away with the transcript when a side surface
           expands over the whole conversation. -->
      <div
        data-slot="dock"
        data-pane-leaf-away={lent.transcriptShare === 0 || undefined}
        class="pointer-events-none absolute inset-y-0 start-0 z-1 w-(--share) data-pane-leaf-away:invisible"
        inert={lent.transcriptShare === 0}
        style:--share="{lent.transcriptShare * 100}%"
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
