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
  interface Window {
    /** Set once the touch long-press menus are installed (utils/longpress.ts); the probe reads it. */
    __longPressInstalled?: boolean;
    /** Chromium's Idle Detection (wicg.github.io/idle-detection), where the browser has it (lib/cawco/presence.ts). */
    IdleDetector?: IdleDetectorClass;
    /** Replays the button clicks app.html held before hydration. */
    releaseHeldTaps: () => void;
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
