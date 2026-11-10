/// <reference types="unplugin-icons/types/svelte" />
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  interface Window {
    /** Replays the button clicks app.html held before hydration. */
    releaseHeldTaps: () => void;
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
      /** The hub's pulses as the layout's server load read them. */
      pulses?: Record<string, import("@cawco/core/protocol").SessionPulse>;
      /** A project page's server-read start, when the page is one. */
      seed?: import("./lib/cawco/workspace/project-seed").ProjectSeed | null;
      /** The transcript's server-read tail, when the page is a session's. */
      tail?:
        import("./lib/cawco/stores/transcript-reads.svelte").ServerTail | null;
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
