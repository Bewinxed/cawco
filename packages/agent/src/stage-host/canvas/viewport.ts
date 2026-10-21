/**
 * A frame is a viewport to the story's floating layers too (width.ts makes
 * it one to its CSS and matchMedia). A menu, a popover or a tooltip placed
 * by floating-ui (bits-ui's floating layer, its `collisionBoundary` empty
 * by default) collides with the viewport alone: what `getViewportRect`
 * reads, `visualViewport` (its width, height and offsets) and else the
 * root's `clientWidth`, and what script reads as `innerWidth`. Those answer
 * at the frame a floating layer opens from (runtime.ts says which), its
 * left and right as the frame stands, never cut by the window: a layer
 * placed in a 1440 frame collides where the app's 1440 window has it
 * collide, wherever the frame stands on the screen. What the window cuts
 * off is the canvas's to bring back into sight, by moving the frame
 * (runtime.ts `keepInSight`), never by squeezing the layer. Its top and
 * height stay the window's, so a layer still flips up and down as the
 * window allows. The canvas reads the window's own through `windowWidth`
 * and `windowHeight`.
 *
 * Which layer asks: floating-ui's `getViewportRect(element)` is handed the
 * floating layer itself, and reads `element.ownerDocument` (its
 * `getWindow` and `getDocumentElement`) just before it reads the
 * viewport. An element's `ownerDocument` is read through here, so the
 * element asked last is the layer asking, call by call (`asking`).
 */

type Getter<T> = () => T;

/** A property's own getter, read where the platform keeps it: the window's attributes on the window, an element's on its prototype. */
function getterOf<T>(
  on: object,
  proto: object,
  name: string
): (self: unknown) => T {
  const descriptor =
    Object.getOwnPropertyDescriptor(on, name) ??
    Object.getOwnPropertyDescriptor(proto, name);
  const get = descriptor?.get;
  if (!get) {
    throw new Error(`[cawco] ${name} has no getter to stand a frame in for`);
  }
  return (self) => get.call(self) as T;
}

const innerWidthOf = getterOf<number>(window, Window.prototype, "innerWidth");
const innerHeightOf = getterOf<number>(window, Window.prototype, "innerHeight");
const visualViewportOf = getterOf<VisualViewport | null>(
  window,
  Window.prototype,
  "visualViewport"
);
const clientWidthOf = getterOf<number>(
  document.documentElement,
  Element.prototype,
  "clientWidth"
);
const ownerDocumentOf = getterOf<Document>(
  Node.prototype,
  Node.prototype,
  "ownerDocument"
);
/** The element whose document was read last: the floating layer, as floating-ui asks the viewport for it. */
let asking: Element | null = null;

/** The window's own width, whatever a frame answers. */
export const windowWidth: Getter<number> = () => innerWidthOf(window);
/** The window's own height. */
export const windowHeight: Getter<number> = () => innerHeightOf(window);

/** The window's visual viewport answering at a frame's left and width: its events still the window's. */
function asFrame(real: VisualViewport, frame: DOMRect): VisualViewport {
  return {
    get height() {
      return real.height;
    },
    get offsetTop() {
      return real.offsetTop;
    },
    get pageTop() {
      return real.pageTop;
    },
    get scale() {
      return real.scale;
    },
    width: frame.width,
    offsetLeft: frame.left,
    pageLeft: real.pageLeft - real.offsetLeft + frame.left,
    onresize: null,
    onscroll: null,
    onscrollend: null,
    addEventListener: real.addEventListener.bind(real),
    removeEventListener: real.removeEventListener.bind(real),
    dispatchEvent: real.dispatchEvent.bind(real),
  } as VisualViewport;
}

/**
 * Has the viewport answer at `frame(asking)`'s box, where it names one
 * (null: the window's own), `asking` the element that asks (the layer
 * floating-ui places): the visual viewport, the root's client width and
 * `innerWidth`, at the frame's own left and right.
 */
export function frameAsViewport(
  frame: (asking: Element | null) => DOMRect | null
): void {
  Object.defineProperty(Element.prototype, "ownerDocument", {
    configurable: true,
    get(this: Element) {
      asking = this;
      return ownerDocumentOf(this);
    },
  });
  const box = (): DOMRect | null => frame(asking);
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    get: () => box()?.width ?? windowWidth(),
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    get: () => {
      const real = visualViewportOf(window);
      const at = box();
      return real && at ? asFrame(real, at) : real;
    },
  });
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return box()?.width ?? clientWidthOf(this);
    },
  });
}
