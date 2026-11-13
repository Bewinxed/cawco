/// <reference types="unplugin-icons/types/svelte" />
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  interface Window {
    /** The decision overlay's bridge, once its script has run (decisions/host/page.svelte.ts). */
    cawco?: import("./lib/cawco/decisions/host/page.svelte.js").Bridge;
    /** The address preview's handle for the probe (address/flow/Page.svelte). */
    preview: unknown;
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
    interface PageData {
      /** Configure's card heights, as its layout reads them off the cookie (routes/(app)/config/+layout.server.ts). */
      cards?: import("#lib/cawco/config/cards.js").Cards;
      /** The folder-tab strips' last measured boxes, read from the pref by the app layout (+layout.server.ts). */
      foldBoxes?: Record<
        string,
        import("./lib/components/ui/fluid-tabs/fold-memory.js").FoldMeasure
      >;
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
