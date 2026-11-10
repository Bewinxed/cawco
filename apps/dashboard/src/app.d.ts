/// <reference types="unplugin-icons/types/svelte" />
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  interface Window {
    /** Set once the touch long-press menus are installed (utils/longpress.ts); the probe reads it. */
    __longPressInstalled?: boolean;
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
    // interface PageData {}
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
