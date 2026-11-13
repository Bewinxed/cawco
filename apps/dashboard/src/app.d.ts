/// <reference types="unplugin-icons/types/svelte" />
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
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
    /** The /motion/skeleton bench's two states, for the spec to drive. */
    __skeletonBench: { load: () => void; wait: () => void };
    /** Replays the button clicks app.html held before hydration. */
    releaseHeldTaps: () => void;
    /** Safari's and the app's web view's bridge to their host; a desktop browser has none. */
    webkit?: { messageHandlers?: { cawco?: AppHost } };
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
    /** What a route's load hands the shell, read from `page.data` by the components that draw it. */
    interface PageData {
      /** Each tab's shape as last measured, from the layout's cookie. */
      foldBoxes?: Record<
        string,
        import("./lib/components/ui/fluid-tabs/fold-memory").FoldMeasure
      >;
      /** The conversations' names the layout's server load read, by session. */
      names?: Record<string, import("./lib/platform/hub-read").HubRead<string>>;
      /** The first paint's board: what the server read of the hub (stores/board.svelte.ts `servedBoard`). */
      board?: import("./lib/cawco/served-board").ServedBoard<
        import("./lib/cawco/projects").ProjectRow
      > | null;
      /** The server's copy of each kept preference (platform/prefs.ts). */
      kept?: Partial<Record<import("./lib/platform/prefs").Pref, string>>;
      /** The conversations the layout landed the board's address on. */
      landed?: string[];
      /** The tabs whose names the server resolved. */
      resolved?: string[];
      /** A project page's server-read start, when the page is one. */
      seed?: import("./lib/cawco/workspace/project-seed").ProjectSeed | null;
      /** The transcript's server-read tail, when the page is a session's. */
      tail?:
        import("./lib/cawco/stores/transcript-reads.svelte").ServerTail | null;
      /** The workspace the server's cookie held. */
      workspace?:
        import("./lib/cawco/workspace/workspace.svelte").WorkspaceV1 | null;
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
