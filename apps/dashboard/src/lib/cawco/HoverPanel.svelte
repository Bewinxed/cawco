<script lang="ts">
  /**
   * The house hover panel: the delegate tray's chip panel, and the rail's
   * session card. Its surface, motion and size hold are HoverPanelFrame's;
   * this is the panel with the session it watches.
   *
   * `watch` is the session whose live tail the content draws: watched while
   * the panel shows it, and for 2s after, so a pointer that wanders off and
   * back does not drop the stream and fetch it again. Moving to a session
   * whose tail is still being read keeps the panel's size until it lands
   * (the frame's `pending`).
   *
   * Where it stands is the caller's, as the frame's: `above` a row of chips
   * or to the `right` of a list.
   */
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import {
    cawco,
    readTranscript,
    unwatchDelegate,
    watchDelegate,
  } from "./client.svelte";
  import HoverPanelFrame from "./HoverPanelFrame.svelte";

  let {
    key,
    watch = null,
    gliding = false,
    side,
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    /** What the panel shows; null closes it. A new key cross-fades. */
    key: string | null;
    /** The session whose live tail the content draws. */
    watch?: string | null;
    /** Moving from one trigger to the next: the panel travels. */
    gliding?: boolean;
    side: "above" | "right";
    children: Snippet<[string]>;
  } = $props();

  /**
   * The watched session's tail is still being read. The read publishes in
   * chunks, so the first rows to arrive are not yet the tail's size: it is
   * pending until the read is done.
   */
  const pending = $derived.by(() => {
    if (!watch) {
      return false;
    }
    const branch = cawco.session(watch);
    return !branch || branch.loading || branch.hydrating;
  });

  const releases = new Map<string, ReturnType<typeof setTimeout>>();
  $effect(() => {
    const id = watch;
    if (!id) {
      return;
    }
    untrack(() => {
      const release = releases.get(id);
      if (release) {
        clearTimeout(release);
        releases.delete(id);
        return;
      }
      watchDelegate(id);
      if (!cawco.session(id)?.messages.length) {
        // biome-ignore lint/complexity/noVoid: fire-and-forget; the tail draws whatever has arrived.
        void readTranscript(id);
      }
    });
    return () => {
      releases.set(
        id,
        setTimeout(() => {
          releases.delete(id);
          unwatchDelegate(id);
        }, 2000)
      );
    };
  });
</script>

<HoverPanelFrame {...rest} {children} {gliding} {key} {pending} {side} />
