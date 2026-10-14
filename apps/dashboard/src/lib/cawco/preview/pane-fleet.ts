/**
 * What an artifact's pane (PreviewPane and what it draws: the pins, the
 * artifact menu, a page's place picker) reads of the fleet, and the two
 * stores that serve it: the fleet store beside a conversation
 * (fleet-pane.svelte.ts, set by the app's layout), and an artifact's own
 * tab's one-session socket (artifact-session.svelte.ts, set by that tab).
 * The pane is the same component in both; it reads the store its tree set.
 */
import type { PreviewFrame } from "@cawco/core";
import { createContext } from "svelte";
import type { FolderReader } from "#lib/components/features/DirectoryPicker.svelte";

/** A session's panel as the pane holds it: the hub's frame, and what the page told the pane. */
export type PanePreview = PreviewFrame & {
  /** The page's own title, as its overlay said. */
  title?: string;
  /** The page's first capture, base64 PNG. */
  thumbnail?: string;
};

/** The session that made the artifact: what names it, where it runs, its project. */
export interface PaneSession {
  cwd: string;
  id: string;
  machineId: string;
  projectId?: string | null;
  title?: string | null;
}

export interface PaneMachine {
  hostname: string;
  machineId: string;
  online: boolean;
  os: string;
}

export interface PaneFleet {
  /** Closes the session's panel. */
  closePreview: (instanceId: string) => Promise<void>;
  /** A machine's folders, for a page's place picker. */
  readonly folders: FolderReader;
  /** Every machine of the fleet. */
  readonly machines: readonly PaneMachine[];
  /** The session's panel; the pane writes the page's title and capture onto it. */
  preview: (instanceId: string) => PanePreview | undefined;
  session: (instanceId: string) => PaneSession | undefined;
  /** The session's conversation, where the artifact's own tab's Close goes. */
  sessionHref: (instanceId: string) => string;
  /** The session is in a turn: a pin its last send carried is live. */
  working: (instanceId: string) => boolean;
}

export const [paneFleet, setPaneFleet] = createContext<PaneFleet>();
