<script lang="ts">
  /**
   * Find's places, grown out of the composer at every width: the pill's own
   * material and edge continued up from its top, across its width, with no
   * seam between them (the pill squares its top corners while they stand,
   * Composer `data-places`), so the find field and its places read as one
   * thing. It is opened and folded from the find field's place. It stands
   * over the transcript's foot without moving it (the composer's brief, The
   * Composer Layer Rule); the transcript's foot grows by it (Composer
   * `onfoot`), so the words stepped to land above it, at the conversation's
   * end too.
   *
   * It holds its pane's composer layer while it stands: the plan or the
   * tray's shelf opening takes it, and it folds.
   */
  import { findInWords } from "@cawco/core/words/find-in";
  import type { Attachment } from "svelte/attachments";
  import { dockShellVariants } from "#lib/components/ui/dock-shell/index.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { holdComposerLayer } from "../transcript/composer-layer.svelte";
  import type { ConversationFind } from "./conversation-find.svelte";
  import FindPlaces from "./FindPlaces.svelte";

  let {
    find,
    onheight,
  }: {
    find: ConversationFind;
    /** Its drawn height, as it unfolds and changes, and 0 as it goes: what the transcript's foot grows by. */
    onheight?: (px: number) => void;
  } = $props();

  /**
   * How tall it may stand: at most the room over the composer to the dock's
   * top, and no more than a little over half of it, so the place stepped to
   * stays readable above it. Our own call, from the shaping frames.
   */
  const room: Attachment<HTMLElement> = (node) => {
    const pill = node.offsetParent;
    const dock = node.closest('[data-slot="dock"]');
    if (pill && dock) {
      const over =
        pill.getBoundingClientRect().top - dock.getBoundingClientRect().top;
      const most = Math.max(0, over - 16);
      node.style.setProperty(
        "--find-room",
        `${Math.min(most, Math.max(200, over * 0.55))}px`
      );
    }
  };

  const measured: Attachment<HTMLElement> = (node) => {
    const stop = frameSize(
      (box: HTMLElement) => box.offsetHeight,
      (height) => {
        onheight?.(height);
      }
    )(node);
    return () => {
      stop?.();
      onheight?.(0);
    };
  };

  holdComposerLayer(
    () => find.viewId,
    "find",
    () => {
      find.listOpen = false;
    }
  );
</script>

<!-- It unfolds up out of the pill's top and folds back into it (`unfold`):
     a press plays it, a key lands it (motion/keyed). Under the pill's own
     edge (z 1 to the form's 2), so the pill's top hairline is the one line
     between them. -->
<section
  data-slot="find-layer"
  aria-label={findInWords.places}
  class={dockShellVariants({
    class:
      "absolute start-0 end-0 bottom-full z-1 flex flex-col max-h-(--find-room) p-0 overflow-clip rounded-b-none border-b-0 pointer-events-auto",
  })}
  {@attach room}
  {@attach measured}
  transition:unfold
>
  <FindPlaces {find} />
</section>
