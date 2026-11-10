/// <reference types="unplugin-icons/types/svelte" />
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  /** Chromium's Idle Detection (wicg.github.io/idle-detection), not in TypeScript's DOM yet. */
  interface IdleDetectorClass {
    readonly requestPermission: () => Promise<PermissionState>;
    new (): IdleDetectorLike;
  }
  interface IdleDetectorLike extends EventTarget {
    readonly screenState: "locked" | "unlocked" | null;
    readonly start: (options: {
      signal: AbortSignal;
      threshold: number;
    }) => Promise<void>;
    readonly userState: "active" | "idle" | null;
  }
  /**
   * What `__cawcoDebug` holds (dev-debug.ts): the client's stores and
   * handles (client.svelte.ts), the staged usage a bench writes
   * (usage/forecast.svelte.ts), and the lists `devNote` grows.
   */
  interface CawcoDebug {
    adoptInstances: (
      rows: import("@cawco/core/protocol").InstanceRow[]
    ) => void;
    connectionState: typeof import("#lib/cawco/hub/socket.svelte.js").connectionState;
    frame: typeof import("#lib/cawco/hub/frames.js").takeFrame;
    inflight: typeof import("#lib/cawco/hub/socket.svelte.js").inflight;
    leaveHub: typeof import("#lib/cawco/hub/socket.svelte.js").leaveHub;
    plansState: typeof import("#lib/cawco/stores/plans.svelte.js").plansState;
    projectsState: typeof import("#lib/cawco/stores/projects.svelte.js").projectsState;
    sessionsState: typeof import("#lib/cawco/stores/sessions.svelte.js").sessionsState;
    standHub: (
      answer: import("#lib/cawco/hub/socket.svelte.js").BenchHub
    ) => void;
    usage: {
      staged: {
        claude: import("#lib/cawco/usage/rings.js").ClaudeRings | null;
        forecast: import("@cawco/core/accounts").ProviderForecast;
        openCode: import("#lib/cawco/usage/rings.js").RingAccount | null;
      } | null;
    };
    usageState: typeof import("#lib/cawco/stores/usage.svelte.js").usageState;
    workItemsState: typeof import("#lib/cawco/stores/work-items.svelte.js").workItemsState;
    [note: string]: unknown;
  }
  interface RequestInit {
    /** A streamed request body (undici, Node's fetch): the DOM lib does not name it yet. */
    duplex?: "half";
  }
  interface FocusOptions {
    /** Whether the focus ring draws on the element focused by script (Chrome 144, Safari 18.4; the DOM lib does not name it yet). */
    focusVisible?: boolean;
  }
  /**
   * The app's web view hears the page here (ProjectViewPane.swift): a task
   * opens the app's own sheet over the project.
   */
  interface AppHost {
    postMessage: (message: { task: string; type: "cawco:open-task" }) => void;
  }
  interface Window {
    /** The /motion/button-pending bench's work: `start`, then `stop` ends it well. */
    __buttonBench: { start: () => void; stop: () => void };
    /** Dev only: the client's stores and handles, set once client.svelte.ts has loaded. */
    __cawcoDebug: CawcoDebug;
    /** The /motion/find bench's finder. */
    __find: ReturnType<
      typeof import("#lib/cawco/find/conversation-find.svelte.js").findIn
    >;
    /** Set once the touch long-press menus are installed (utils/longpress.ts); the probe reads it. */
    __longPressInstalled?: boolean;
    /** The /motion/skeleton bench's two states, for the spec to drive. */
    __skeletonBench: { load: () => void; wait: () => void };
    /** The decision overlay's bridge, once its script has run (decisions/host/page.svelte.ts). */
    cawco?: import("./lib/cawco/decisions/host/page.svelte.js").Bridge;
    /** Chromium's Idle Detection (wicg.github.io/idle-detection), where the browser has it (lib/cawco/presence.ts). */
    IdleDetector?: IdleDetectorClass;
    /** The address preview's handle for the probe (address/flow/Page.svelte). */
    preview: unknown;
    /** Replays the button clicks app.html held before hydration. */
    releaseHeldTaps: () => void;
    /** Safari's and the app's web view's bridge to their host; a desktop browser has none. */
    webkit?: { messageHandlers?: { cawco?: AppHost } };
  }
  interface Navigator {
    /** Brave's own door, `navigator.brave.isBrave()` (Brave wiki, "Detecting Brave (for Websites)"). */
    brave?: { isBrave?: () => Promise<boolean> };
  }
  interface NotificationOptions {
    /** MDN: whether the user is notified again when this replaces an old notification; it needs the tag. */
    renotify?: boolean;
  }
  // biome-ignore lint/style/noNamespace: SvelteKit's app.d.ts convention requires the global App namespace for ambient typing hooks
  namespace App {
    interface Error {
      message: string;
      /**
       * A part of the page held this error in its boundary: the route did
       * not fail (region-held.ts). `page.error` carries it all the same.
       */
      region?: boolean;
    }
    // interface Locals {}
    interface PageData {
      /** Configure's card heights, as its layout reads them off the cookie (routes/(app)/config/+layout.server.ts). */
      cards?: import("#lib/cawco/config/cards.js").Cards;
      /** The folder-tab strips' last measured boxes, read from the pref by the app layout (+layout.server.ts). */
      foldBoxes?: Record<
        string,
        import("./lib/components/ui/fluid-tabs/fold-memory.js").FoldMeasure
      >;
      /** The tabs the server landed the board's address on (app/+layout.server.ts `landOnDesk`). */
      landed?: string[];
      /** The machines the hub holds, counted by the board's load. */
      machineCount?: number | null;
      /** The wide screen's resolved tabs, from the root layout load. */
      resolved?: string[];
      /** A project page's seed (workspace/project-seed.ts). */
      seed?: import("#lib/cawco/workspace/project-seed.js").ProjectSeed | null;
      /** A session page's transcript read on the server. */
      tail?:
        | import("#lib/cawco/stores/transcript-reads.svelte.js").ServerTail
        | null;
      /** The workspace tree the cookie kept. */
      workspace?:
        import("#lib/cawco/workspace/workspace.svelte.js").WorkspaceV1 | null;
    }
    interface PageState {
      /** As `taskOpened`, for a project folder's file opened as its own page (`?file=`). */
      fileOpened?: boolean;
      /**
       * A project's task page was opened on a phone from the page before it
       * in this tab's history: its Back is the browser's back.
       */
      taskOpened?: boolean;
    }
    // interface Platform {}
  }
}

export {};
