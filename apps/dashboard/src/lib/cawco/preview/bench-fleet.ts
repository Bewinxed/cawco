/**
 * A fleet store holding one session whose panel shows `preview`, for a
 * page that draws the real PreviewPane with no hub: the `/motion/
 * artifact-head` bench and the design graph's preview (`/dev/design-graph`).
 */
import type { Bounded } from "@cawco/core/bounded";
import type { FsEntry } from "@cawco/core/protocol";
import type { PaneFleet, PanePreview } from "./pane-fleet";

export const benchFleet = (
  instance: string,
  preview: () => PanePreview,
  machineId: string
): PaneFleet => ({
  browser: () => null,
  closePreview: () => Promise.resolve(),
  folders: {
    list: () =>
      Promise.resolve({ kind: "answered", value: [] } as Bounded<FsEntry[]>),
    recent: () => null,
    unanswered: () => "",
  },
  machines: [],
  preview: (id) => (id === instance ? preview() : undefined),
  session: (id) => (id === instance ? { id, cwd: "/", machineId } : undefined),
  sessionHref: () => "/",
  working: () => false,
});
