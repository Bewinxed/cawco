<script lang="ts" module>
  import type { DragDropEventMap } from "@dnd-kit/abstract";
  import type { DragDropManager, Draggable, Droppable } from "@dnd-kit/dom";

  type Events = DragDropEventMap<Draggable, Droppable, DragDropManager>;
  export type DragStart = Events["dragstart"];
  export type DragOver = Events["dragover"];
  export type DragMove = Events["dragmove"];
  export type DragEnd = Events["dragend"];

  /**
   * What every draggable and droppable carries for the screen reader: its
   * name as the person calls it, and, in a list, how many it stands among.
   */
  export interface DragData {
    label: string;
    of?: number;
    /**
     * What the pointer takes it by: the thing itself (the default), or the
     * part of it marked `data-drag-grab` (a block's head: its body is its
     * content's). The keys take it by its handle either way.
     */
    takenBy?: "thing" | "grab";
    [key: string]: unknown;
  }
</script>

<script lang="ts">
  import { dragWords } from "@cawco/core/words/drag";
  /**
   * The one way anything in CawCo is dragged: dnd kit (@dnd-kit/svelte) with
   * the house's feel. Every reorder and move stands inside one of these, and
   * its things are `createSortable`s (a list that makes room as the thing
   * passes) or `createDraggable`s and `createDroppable`s (a thing carried
   * to a place), each carrying `DragData`.
   *
   * - The thing itself is carried, never a picture of it: dnd kit's Feedback
   *   lifts it into the top layer and moves it under the pointer, its place
   *   held open behind it while the others make room on the house's slide
   *   (--dur-panel, ease-drawer), and flies it to where it lands on the same
   *   clock. lift.ts gives it its weight (it grows, casts its shadow and
   *   leans into the hand's travel on the house spring).
   * - A mouse or pen takes it once the press travels; a finger once it has
   *   rested on it (dnd kit's defaults: 250ms, 5px), so a swipe still
   *   scrolls; a press on a control inside it stays that control's. The
   *   keys: Space picks up what has the focus, the arrows carry it, Space
   *   puts it down, Escape puts it back. A screen reader hears each step in
   *   the house's words (core words/drag).
   * - Escape, a lost press, or a drop on nothing: it flies back where it was,
   *   and `onDragEnd` hears `canceled`.
   */
  import {
    Accessibility,
    type defaultPreset,
    Feedback,
    DragDropManager as Manager,
    PointerActivationConstraints,
  } from "@dnd-kit/dom";
  import { isSortable } from "@dnd-kit/dom/sortable";
  import {
    DragDropProvider,
    KeyboardSensor,
    PointerSensor,
  } from "@dnd-kit/svelte";
  import type { Snippet } from "svelte";
  import { dur, ease } from "../motion/curves.svelte";
  import { type Lifted, lift } from "./lift";

  /**
   * dnd kit's own defaults, named: a finger rests 250ms within 5px before
   * the thing lifts (a swipe that travels first is the page's scroll), and
   * a mouse or pen's press travels 5px (a click that wobbles is a click).
   */
  const TOUCH_HOLD = 250;
  const TOUCH_SLOP = 5;
  const TRAVEL = 5;

  let {
    children,
    onDragStart,
    onDragOver,
    onDragMove,
    onDragEnd,
  }: {
    children: Snippet;
    onDragStart?: (event: DragStart) => void;
    onDragOver?: (event: DragOver) => void;
    onDragMove?: (event: DragMove) => void;
    onDragEnd?: (event: DragEnd) => void;
  } = $props();

  const nameOf = (thing: { data: unknown; id: unknown } | null): string => {
    const label = (thing?.data as DragData | undefined)?.label;
    return label ?? String(thing?.id ?? "");
  };
  /** Its place among the others, from 1, and how many: a sortable's alone. */
  const placeOf = (
    thing: Draggable | Droppable | null
  ): { at: number; of: number } | null => {
    const of = (thing?.data as DragData | undefined)?.of;
    // A sortable is its draggable and its droppable at once: one guard reads either.
    const sortable = thing as Parameters<typeof isSortable>[0];
    return of && isSortable(sortable) ? { at: sortable.index + 1, of } : null;
  };

  /** dnd kit's plugins with the house's drop and its words: read on the client, as the provider starts. */
  const plugins = (defaults: typeof defaultPreset.plugins) => [
    ...defaults.filter(
      (plugin) => plugin !== Feedback && plugin !== Accessibility
    ),
    Feedback.configure({
      dropAnimation: {
        duration: dur("--dur-panel"),
        easing: ease("--ease-drawer"),
      },
      keyboardTransition: {
        duration: dur("--dur-panel"),
        easing: ease("--ease-drawer"),
      },
    }),
    Accessibility.configure({
      screenReaderInstructions: { draggable: dragWords.instructions },
      announcements: {
        dragstart: ({ operation: { source } }: DragStart) =>
          source ? dragWords.pickedUp(nameOf(source)) : undefined,
        dragover: ({ operation: { source, target } }: DragOver) => {
          if (!source || source.id === target?.id) {
            return;
          }
          const name = nameOf(source);
          const place = placeOf(target);
          if (place) {
            return dragWords.movedTo(name, place.at, place.of);
          }
          return target
            ? dragWords.over(name, nameOf(target))
            : dragWords.overNothing(name);
        },
        dragend: ({ operation: { source, target }, canceled }: DragEnd) => {
          if (!source) {
            return;
          }
          const name = nameOf(source);
          if (canceled || !target) {
            return dragWords.putBack(name);
          }
          const place = placeOf(source);
          return place
            ? dragWords.droppedAt(name, place.at, place.of)
            : dragWords.droppedIn(name, nameOf(target));
        },
      },
    }),
  ];

  /**
   * A thing is taken by itself and by its handle, where it has one: the
   * handle is the keys' (a column holding fields is no button), the whole
   * thing the pointer's. A mouse or pen takes it once the press has
   * travelled, handle or not, so a click on a card that is a link still
   * opens it; a finger once it has rested (dnd kit's touch default). The
   * keys pick it up with Space alone: Enter keeps following a link.
   */
  const sensors = [
    PointerSensor.configure({
      activatorElements: (source) => [
        (source.data as DragData | undefined)?.takenBy === "grab"
          ? (source.element?.querySelector("[data-drag-grab]") ?? undefined)
          : source.element,
        source.handle,
      ],
      activationConstraints: (event) =>
        event.pointerType === "touch"
          ? [
              new PointerActivationConstraints.Delay({
                value: TOUCH_HOLD,
                tolerance: TOUCH_SLOP,
              }),
            ]
          : [new PointerActivationConstraints.Distance({ value: TRAVEL })],
    }),
    KeyboardSensor.configure({
      keyboardCodes: {
        ...KeyboardSensor.defaults.keyboardCodes,
        start: ["Space"],
      },
    }),
  ];

  /**
   * The manager is made with the house's sensors and plugins, not handed
   * them later: the provider sets its props in an effect, which runs after
   * the effects of the things inside it, so each thing would bind dnd kit's
   * default sensors first (its handle alone, never the thing itself). The
   * plugins read the stylesheet, which a server render has none of.
   */
  const live = typeof document !== "undefined";
  const manager = new Manager({
    plugins: live ? plugins : undefined,
    sensors,
  });
  // Handed in, the provider leaves it standing as it goes: it goes with this.
  $effect(() => () => manager.destroy());

  /** The thing in the hand, while there is one. */
  let held: Lifted | null = null;

  /**
   * What Feedback carries: the thing itself, or the face a DragOverlay draws
   * for it (a block's head), drawn by the frame after the drag starts.
   */
  const carried = (fallback: Element | undefined): HTMLElement | null => {
    const lifted = document.querySelector("[data-dnd-dragging]");
    const element = lifted ?? fallback;
    return element instanceof HTMLElement ? element : null;
  };

  function start(event: DragStart) {
    const { x, y } = event.operation.position.current;
    const source = event.operation.source?.element;
    const drag = event.operation.source;
    requestAnimationFrame(() => {
      const element = carried(source);
      if (element && drag === manager.dragOperation.source) {
        held = lift(element, { x, y });
      }
    });
    onDragStart?.(event);
  }
  function move(event: DragMove) {
    if (held) {
      held.move(event.operation.position.current.x);
      // A card carried into another column is drawn again there, and dnd
      // kit carries the new one: the lift goes with it.
      const now = carried(undefined);
      if (now) {
        held.follow(now);
      }
    }
    onDragMove?.(event);
  }
  function end(event: DragEnd) {
    held?.land();
    held = null;
    onDragEnd?.(event);
  }
</script>

<DragDropProvider
  {manager}
  onDragEnd={end}
  onDragMove={move}
  {onDragOver}
  onDragStart={start}
  plugins={live ? plugins : undefined}
  {sensors}
>
  {@render children()}
</DragDropProvider>
