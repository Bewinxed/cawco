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
    /** The list it stands in, by its name, where there are several (a board's column, a group's tabs). */
    where?: string;
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
   *   leans into the hand's travel on the house spring), and follow.ts lets
   *   it float: it trails the hand on a spring and settles under it.
   * - A mouse or pen takes it once the press travels; a finger once it has
   *   rested on it (dnd kit's defaults: 250ms, 5px), so a swipe still
   *   scrolls; a press on a control inside it stays that control's. The
   *   keys: Space picks up what has the focus, the arrows carry it, Space
   *   puts it down, Escape puts it back. A screen reader hears each step in
   *   the house's words (core words/drag).
   * - Escape, or a lost press: it flies back where it was on the drop's
   *   clock, and `onDragEnd` hears `canceled`. While a thing is in the air
   *   Escape is the drag's alone: nothing else on the page hears it (a
   *   panel stays open), and a pointer's Escape keeps its flight home
   *   (motion/keyed `spareKey`: it ends the pointer's gesture, it is no
   *   key's action). A drag the keys carry lands at once, as every key's.
   * - What it says is said once the page has drawn the move, so its place
   *   and how many it stands among are the ones on screen: each arrow press
   *   is heard, in the house's words.
   */
  import {
    Accessibility,
    AutoScroller,
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
  import { type Snippet, tick } from "svelte";
  import { dur, ease } from "../motion/curves.svelte";
  import { spareKey } from "../motion/keyed.svelte";
  import { Follow } from "./follow";
  import { type Lifted, lift } from "./lift";

  /**
   * dnd kit's own defaults, named: a finger rests 250ms within 5px before
   * the thing lifts (a swipe that travels first is the page's scroll), and
   * a mouse or pen's press travels 5px (a click that wobbles is a click).
   */
  const TOUCH_HOLD = 250;
  const TOUCH_SLOP = 5;
  const TRAVEL = 5;
  /**
   * A thing carried into the outer fifth of a scroller (`SCROLL_ZONE`, dnd
   * kit's own) scrolls it, faster the deeper it goes: `SCROLL_ACCELERATION`
   * px a frame at the very edge, falling in a straight line to none at the
   * zone's inner side. On a phone's board (354px, a 71px zone) that is
   * about 300px a second at the edge, under a column a second, and half of
   * it half way in, so a person stops on the column they want. dnd kit's 25
   * crossed the board's ten columns in about three seconds.
   */
  const SCROLL_ZONE = 0.2;
  const SCROLL_ACCELERATION = 5;
  /** What a press inside a thing belongs to, never the drag. */
  const CONTROLS =
    "button, input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='button'], [role='menuitem'], [role='checkbox'], [role='switch'], [role='slider']";

  let {
    children,
    onDragStart,
    onDragOver,
    onDragMove,
    onDragEnd,
    fliesHome,
  }: {
    children: Snippet;
    /**
     * Whether, let go now, the thing flies to its place on dnd kit's drop
     * (asked as it moves): not where its owner flies it itself (a tab
     * landing in another pane, motion/share).
     */
    fliesHome?: () => boolean;
    onDragStart?: (event: DragStart) => void;
    onDragOver?: (event: DragOver) => void;
    onDragMove?: (event: DragMove) => void;
    onDragEnd?: (event: DragEnd) => void;
  } = $props();

  const nameOf = (thing: { data: unknown; id: unknown } | null): string => {
    const label = (thing?.data as DragData | undefined)?.label;
    return label ?? String(thing?.id ?? "");
  };
  /** Its place among the others, from 1, how many, and in which list: a sortable's alone. */
  const placeOf = (
    thing: Draggable | Droppable | null
  ): { at: number; of: number; where?: string } | null => {
    const data = thing?.data as DragData | undefined;
    // A sortable is its draggable and its droppable at once: one guard reads either.
    const sortable = thing as Parameters<typeof isSortable>[0];
    return data?.of && isSortable(sortable)
      ? { at: sortable.index + 1, of: data.of, where: data.where }
      : null;
  };

  /** The drop's flight: the house's slide. */
  const houseDrop = () => ({
    duration: dur("--dur-panel"),
    easing: ease("--ease-drawer"),
  });

  /** dnd kit's plugins with the house's drop and its words: read on the client, as the provider starts. */
  const plugins = (defaults: typeof defaultPreset.plugins) => [
    ...defaults.filter(
      (plugin) =>
        plugin !== Feedback &&
        plugin !== Accessibility &&
        plugin !== AutoScroller
    ),
    AutoScroller.configure({
      acceleration: SCROLL_ACCELERATION,
      threshold: { x: SCROLL_ZONE, y: SCROLL_ZONE },
    }),
    Feedback.configure({
      dropAnimation: houseDrop(),
      keyboardTransition: {
        duration: dur("--dur-panel"),
        easing: ease("--ease-drawer"),
      },
    }),
    // Its instructions for each thing; what it says as it moves is said
    // here, once the move is drawn (`say`).
    Accessibility.configure({
      screenReaderInstructions: { draggable: dragWords.instructions },
      announcements: { dragstart: () => undefined, dragend: () => undefined },
    }),
  ];

  /**
   * A thing is taken by itself and by its handle, where it has one: the
   * handle is the keys' (a column holding fields is no button), the whole
   * thing the pointer's. A mouse or pen takes it once the press has
   * travelled, handle or not, so a click on a card that is a link still
   * opens it; a finger once it has rested (dnd kit's touch default). The
   * keys pick it up with Space alone: Enter keeps following a link. A
   * press on a control inside the thing (a button, a field, a menu's item)
   * is that control's; a link inside it (a tab's) carries it once the
   * press travels, and is followed by a click that does not.
   */
  const sensors = [
    PointerSensor.configure({
      preventActivation: (event, source) => {
        const { target } = event;
        if (!(target instanceof Element) || source.handle?.contains(target)) {
          return false;
        }
        const control = target.closest(CONTROLS);
        return (
          control !== null &&
          control !== source.element &&
          (source.element?.contains(control) ?? false)
        );
      },
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
  const modifiers = [Follow];
  const manager = new Manager({
    plugins: live ? plugins : undefined,
    sensors,
    modifiers,
  });
  // Handed in, the provider leaves it standing as it goes: it goes with this.
  $effect(() => () => manager.destroy());

  /** The thing in the hand, while there is one. */
  let held: Lifted | null = null;
  /** Hears the thing dnd kit carries drawn again (a card into another column): the lift goes to it before that frame paints. */
  let redrawn: MutationObserver | null = null;

  /**
   * What Feedback carries: the thing itself, or the face a DragOverlay draws
   * for it (a block's head), drawn by the frame after the drag starts.
   */
  const carried = (fallback: Element | undefined): HTMLElement | null => {
    const lifted = document.querySelector("[data-dnd-dragging]");
    const element = lifted ?? fallback;
    return element instanceof HTMLElement ? element : null;
  };

  // --- what it says ---------------------------------------------------------

  /** The page's one line for what a drag says, under everything. */
  let line: HTMLElement | null = null;
  $effect(() => {
    const said = document.createElement("p");
    said.className = "sr-only";
    said.setAttribute("aria-live", "assertive");
    said.setAttribute("aria-atomic", "true");
    document.body.append(said);
    line = said;
    return () => {
      said.remove();
      line = null;
    };
  });
  const say = (words: string | undefined) => {
    if (line && words && line.textContent !== words) {
      line.textContent = words;
    }
  };
  /** Where the thing in the air stands now, as drawn. */
  const whereNow = (): string | undefined => {
    const { source, target } = manager.dragOperation;
    if (!source) {
      return;
    }
    const name = nameOf(source);
    const place = placeOf(source);
    if (place?.where) {
      return dragWords.movedToIn(name, place.where, place.at, place.of);
    }
    if (place) {
      return dragWords.movedTo(name, place.at, place.of);
    }
    return target ? dragWords.over(name, nameOf(target)) : undefined;
  };

  // --- the drag -------------------------------------------------------------

  /**
   * Escape while a thing is in the air: the drag's, and no one else's. Heard
   * on the window before anything under it (a panel's own Escape).
   */
  function putBackOnEscape(event: KeyboardEvent) {
    if (event.key !== "Escape" || manager.dragOperation.status.idle) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!(manager.dragOperation.activatorEvent instanceof KeyboardEvent)) {
      spareKey();
    }
    manager.actions.stop({ event, canceled: true });
  }
  $effect(() => {
    window.addEventListener("keydown", putBackOnEscape, { capture: true });
    return () =>
      window.removeEventListener("keydown", putBackOnEscape, { capture: true });
  });

  function start(event: DragStart) {
    const { x, y } = event.operation.position.current;
    const source = event.operation.source?.element;
    const drag = event.operation.source;
    say(drag ? dragWords.pickedUp(nameOf(drag)) : undefined);
    pickedAt = whereNow();
    requestAnimationFrame(() => {
      const element = carried(source);
      if (!(element && drag === manager.dragOperation.source)) {
        return;
      }
      held = lift(element, { x, y });
      redrawn = new MutationObserver(() => {
        const now = carried(undefined);
        if (!now) {
          return;
        }
        held?.follow(now);
        // A list that moves the thing's own node to its new place (a
        // card taking the place of the one below it) takes it out of the
        // top layer: a node moved closes its popover, and dnd kit leaves it
        // closed, the thing gone from under the hand. It is lifted again
        // before the frame paints.
        if (now.hasAttribute("popover") && !now.matches(":popover-open")) {
          now.showPopover();
        }
      });
      redrawn.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-dnd-dragging"],
      });
    });
    onDragStart?.(event);
  }
  /** Where it stood as it was picked up: said once it stands elsewhere. */
  let pickedAt: string | undefined;
  /**
   * A drag the keys carry stands on its place once the list has made room
   * for it. dnd kit's keyboard step for a sortable puts the thing on the
   * element its sortable names, which here is the thing itself in the air
   * (the Svelte binding keeps the list's order in its state, never moving
   * nodes itself): it stayed where the key left it, so the next press read
   * the card it had just passed as still below it and came back. The place
   * held open for it (dnd kit's placeholder) is where it stands, centre
   * on centre (the lift's scale leaves the corners a little out).
   */
  function standOnPlace() {
    const { dragOperation } = manager;
    const drawn = document
      .querySelector("[data-dnd-dragging]")
      ?.getBoundingClientRect();
    const place = document
      .querySelector("[data-dnd-placeholder]")
      ?.getBoundingClientRect();
    if (!(
      drawn?.width &&
      place &&
      dragOperation.activatorEvent instanceof KeyboardEvent
    )) {
      return;
    }
    const by = {
      x: place.left + place.width / 2 - (drawn.left + drawn.width / 2),
      y: place.top + place.height / 2 - (drawn.top + drawn.height / 2),
    };
    if (Math.abs(by.x) > 0.5 || Math.abs(by.y) > 0.5) {
      manager.actions.move({ by });
    }
  }

  function over(event: DragOver) {
    onDragOver?.(event);
    // Said once the move it makes is drawn.
    tick().then(() => {
      standOnPlace();
      const now = whereNow();
      if (now !== pickedAt) {
        pickedAt = undefined;
        say(now);
      }
    });
  }
  function move(event: DragMove) {
    if (fliesHome) {
      const feedback = manager.plugins.find(
        (plugin): plugin is Feedback => plugin instanceof Feedback
      );
      if (feedback) {
        feedback.dropAnimation = fliesHome() ? houseDrop() : null;
      }
    }
    held?.move(event.operation.position.current.x);
    onDragMove?.(event);
  }
  function end(event: DragEnd) {
    redrawn?.disconnect();
    redrawn = null;
    held?.land();
    held = null;
    const { source, target } = event.operation;
    if (source) {
      const name = nameOf(source);
      const place = placeOf(source);
      if (event.canceled) {
        say(dragWords.putBack(name));
      } else if (place?.where) {
        say(dragWords.droppedAtIn(name, place.where, place.at, place.of));
      } else if (place) {
        say(dragWords.droppedAt(name, place.at, place.of));
      } else if (target) {
        say(dragWords.droppedIn(name, nameOf(target)));
      }
    }
    onDragEnd?.(event);
  }
</script>

<DragDropProvider
  {manager}
  onDragEnd={end}
  onDragMove={move}
  onDragOver={over}
  onDragStart={start}
  plugins={live ? plugins : undefined}
  {modifiers}
  {sensors}
>
  {@render children()}
</DragDropProvider>
