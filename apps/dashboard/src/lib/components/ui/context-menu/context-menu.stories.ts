/**
 * The kit's ContextMenu (Component Story Format 3, live components) in a
 * frame of its own (context-menu-frame): open on a session's row. The meta's
 * args are every story's.
 */
import ContextMenuFrame from "./context-menu-frame.svelte";

export default {
  title: "Kit/Context menu",
  component: ContextMenuFrame,
  args: {
    items: ["Open in a new tab", "Rename", "Move to studio-mac"],
    danger: "Stop the session",
    height: 240,
  },
};

/** Open on a session's row. */
export const Open = {};
