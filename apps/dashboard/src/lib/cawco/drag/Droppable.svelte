<script lang="ts" module>
  import type { createDroppable } from "@dnd-kit/svelte";

  /** What a place's snippet gets: dnd kit's droppable, attached by `{@attach}`. */
  export type DropPlace = ReturnType<typeof createDroppable>;
</script>

<script lang="ts">
  /**
   * A place things are carried to (DragProvider), where it holds no list
   * of its own to make room in, or holds none yet: a board's column, empty
   * or past its last card. dnd kit's `createDroppable` in a component of
   * its own, so it is made inside the provider whichever way its owner
   * draws.
   */
  import { CollisionPriority } from "@dnd-kit/abstract";
  import { createDroppable as droppable } from "@dnd-kit/svelte";
  import type { Snippet } from "svelte";

  let {
    id,
    label,
    accept,
    disabled = false,
    data = {},
    children,
  }: {
    id: string;
    /** Its name as the person calls it, for the screen reader. */
    label: string;
    /** The kinds of thing it takes (Sortable `type`). */
    accept?: string | string[];
    /** It takes nothing now: what is in the air may not come here. */
    disabled?: boolean;
    data?: Record<string, unknown>;
    children: Snippet<[DropPlace]>;
  } = $props();

  const place = droppable({
    get id() {
      return id;
    },
    get accept() {
      return accept;
    },
    get disabled() {
      return disabled;
    },
    get data() {
      return { ...data, label };
    },
    // Under the things in it: over a card, the card is the target.
    collisionPriority: CollisionPriority.Low,
  });
</script>

{@render children(place)}
