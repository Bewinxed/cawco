<script lang="ts" module>
  import type { createDraggable } from "@dnd-kit/svelte";

  /** What a carried thing's snippet gets: dnd kit's draggable, attached by `{@attach}`. */
  export type CarriedThing = ReturnType<typeof createDraggable>;
</script>

<script lang="ts">
  /**
   * A thing carried to a place that is no list of its own (DragProvider):
   * a session's row in the rail, carried into a pane. dnd kit's
   * `createDraggable` in a component of its own, so it is made inside the
   * provider whichever way its owner draws. Its row stays in the rail while
   * a copy of it rides under the hand (dnd kit's `clone` feedback).
   */
  import { Feedback } from "@dnd-kit/dom";
  import { createDraggable as draggable } from "@dnd-kit/svelte";
  import type { Snippet } from "svelte";

  let {
    id,
    label,
    type,
    disabled = false,
    data = {},
    children,
  }: {
    id: string;
    /** Its name as the person calls it, for the screen reader. */
    label: string;
    /** Its kind, which a place's `accept` names. */
    type?: string;
    disabled?: boolean;
    data?: Record<string, unknown>;
    children: Snippet<[CarriedThing]>;
  } = $props();

  const thing = draggable({
    get id() {
      return id;
    },
    get type() {
      return type;
    },
    get disabled() {
      return disabled;
    },
    get data() {
      return { ...data, label };
    },
    plugins: [Feedback.configure({ feedback: "clone" })],
  });
</script>

{@render children(thing)}
