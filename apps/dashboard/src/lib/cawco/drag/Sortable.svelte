<script lang="ts" module>
  import type { createSortable } from "@dnd-kit/svelte/sortable";

  /** What a sortable thing's snippet gets: dnd kit's sortable, attached by `{@attach}`. */
  export type SortableThing = ReturnType<typeof createSortable>;
</script>

<script lang="ts">
  /**
   * One thing in a list that makes room as another passes (DragProvider):
   * dnd kit's `createSortable` in a component of its own, as dnd kit asks,
   * so the thing keeps one sortable across the reorders that move it. Its
   * snippet attaches what it draws: `thing.attach` on the thing, and
   * `thing.attachHandle` on a handle the keys take it by, when the thing is
   * not itself a control. Its place among the others moves on the house's
   * slide (--dur-panel, ease-drawer).
   */
  import { createSortable as sortable } from "@dnd-kit/svelte/sortable";
  import type { Snippet } from "svelte";
  import { dur, ease } from "../motion/curves.svelte";

  let {
    id,
    index,
    group,
    label,
    of,
    type,
    accept,
    disabled = false,
    takenBy = "thing",
    slides = true,
    data = {},
    children,
  }: {
    id: string;
    /** Its place in the list as drawn now, from 0. */
    index: number;
    /** The list it stands in, where things move between lists. */
    group?: string;
    /** Its name as the person calls it, for the screen reader. */
    label: string;
    /** How many it stands among. */
    of: number;
    /** Its kind, which `accept` names: things move only among their own kind. */
    type?: string;
    accept?: string | string[];
    disabled?: boolean | { draggable?: boolean; droppable?: boolean };
    /** What the pointer takes it by: the thing itself, or its `data-drag-grab` part (DragData). */
    takenBy?: "thing" | "grab";
    /**
     * Its place moves on the house's slide; off where its list moves its
     * rows itself (a pane's tab strip, a list with `reflow()`): two clocks
     * on one row start a second flight from where the first had got to,
     * and the row jumps.
     */
    slides?: boolean;
    /** More for whoever hears the drag (its stage, its page). */
    data?: Record<string, unknown>;
    children: Snippet<[SortableThing]>;
  } = $props();

  /**
   * The house's slide, read off the stylesheet once a browser draws it (a
   * server render has none): dnd kit's own until then, which the first
   * frame never shows.
   */
  let slide = $state<{ duration: number; easing: string }>();
  $effect(() => {
    slide = { duration: dur("--dur-panel"), easing: ease("--ease-drawer") };
  });

  const thing = sortable({
    get id() {
      return id;
    },
    get index() {
      return index;
    },
    get group() {
      return group;
    },
    get disabled() {
      return disabled;
    },
    get data() {
      return { ...data, label, of, takenBy };
    },
    get type() {
      return type;
    },
    get accept() {
      return accept;
    },
    get transition() {
      return slides ? slide : null;
    },
  });
</script>

{@render children(thing)}
