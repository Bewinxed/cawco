/**
 * The page's scroll belongs to the person while the stage mounts or plays a
 * story.
 *
 * A component scrolls the page as it mounts or as a play presses it: it
 * focuses a field, brings a row into view, or puts the window back at its
 * top (RoutineForm's Name label, the Long list's head stood above the
 * stage's top). The stage once put the page's scroll back on every scroll
 * event while a mount or a play ran, which put back his wheel as well: a
 * save that redrew the drawing fought his scrolling for up to three
 * seconds.
 *
 * So while {@link stillPage} runs a mount or a play, the component's own
 * attempts on the page's scroller are stopped where they are made:
 * `scroll`, `scrollTo` and `scrollBy` on the window or the page's scroller,
 * setting its `scrollTop` or `scrollLeft`, and `scrollIntoView`, which
 * scrolls only the scrollers inside the page that hold the element. A
 * focus is taken with `preventScroll` (held-focus.ts reads
 * {@link pageStill}). The scrollers inside the component keep working, and
 * the person's wheel, keys and scrollbar never pass through these calls.
 * The stage's own scrolls pass through {@link stageScroll}.
 */

/** How many mounts and plays run now. */
let holds = 0;
/** The stage's own scroll runs now ({@link stageScroll}). */
let stageOwn = false;

/** Whether a component's attempt on the page's scroll is stopped now. */
export const pageStill = (): boolean => holds > 0 && !stageOwn;

/** `run` (a mount, a play) with the component's own attempts on the page's scroll stopped until it ends. */
export async function stillPage<T>(run: () => Promise<T>): Promise<T> {
  holds += 1;
  try {
    return await run();
  } finally {
    holds -= 1;
  }
}

/** One of the stage's own scrolls of the page (a drawing opened at its top, a mark brought into view): never stopped. */
export function stageScroll(scroll: () => void): void {
  const was = stageOwn;
  stageOwn = true;
  try {
    scroll();
  } finally {
    stageOwn = was;
  }
}

/** Whether `el` scrolls the page: its scrolling element, or the root or body standing for it. */
const isPage = (el: Element): boolean =>
  el === document.scrollingElement ||
  el === document.documentElement ||
  el === document.body;

const SCROLLS = /^(auto|scroll|hidden)$/u;

/** The nearest box round `el` that scrolls, crossing out of a shadow root; null past the root. */
function scrollerOf(el: Element): Element | null {
  let at: Element | null = el;
  for (;;) {
    const root: Node = at.getRootNode();
    at = at.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    if (!at) {
      return null;
    }
    if (isPage(at)) {
      return at;
    }
    const style = getComputedStyle(at);
    const scrolls =
      (SCROLLS.test(style.overflowY) && at.scrollHeight > at.clientHeight) ||
      (SCROLLS.test(style.overflowX) && at.scrollWidth > at.clientWidth);
    if (scrolls) {
      return at;
    }
  }
}

/** How far to scroll a box `size` long so `start`–`end` (from its start) stands as `align` asks (CSSOM View's scroll-into-view steps). */
function alignBy(
  start: number,
  end: number,
  size: number,
  align: ScrollLogicalPosition
): number {
  const length = end - start;
  switch (align) {
    case "start":
      return start;
    case "end":
      return end - size;
    case "center":
      return (start + end - size) / 2;
    case "nearest":
      if ((start >= 0 && end <= size) || (start < 0 && end > size)) {
        return 0;
      }
      return (start < 0 && length <= size) || (end > size && length > size)
        ? start
        : end - size;
  }
}

/** Patches the page's scroll calls so {@link stillPage} stops a component's attempts on the page's scroll. Once per page. */
export function holdPageScroll(): void {
  const page = { scroll, scrollTo, scrollBy };
  const proto = Element.prototype;
  const nativeBy = proto.scrollBy;
  for (const name of ["scroll", "scrollTo", "scrollBy"] as const) {
    const ownOfWindow = page[name];
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: (...args: unknown[]) => {
        if (!pageStill()) {
          Reflect.apply(ownOfWindow, window, args);
        }
      },
    });
    const ownOfElement = proto[name];
    Object.defineProperty(proto, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value(this: Element, ...args: unknown[]) {
        if (!(pageStill() && isPage(this))) {
          Reflect.apply(ownOfElement, this, args);
        }
      },
    });
  }
  for (const name of ["scrollTop", "scrollLeft"] as const) {
    const own = Object.getOwnPropertyDescriptor(proto, name);
    const set = own?.set;
    if (!(own && set)) {
      continue;
    }
    Object.defineProperty(proto, name, {
      ...own,
      set(this: Element, value: number) {
        if (!(pageStill() && isPage(this))) {
          set.call(this, value);
        }
      },
    });
  }
  const intoView = proto.scrollIntoView;
  proto.scrollIntoView = function (
    this: Element,
    arg?: boolean | ScrollIntoViewOptions
  ) {
    if (!pageStill()) {
      intoView.call(this, arg);
      return;
    }
    const options: ScrollIntoViewOptions =
      typeof arg === "object" && arg !== null
        ? arg
        : { block: arg === false ? "end" : "start", inline: "nearest" };
    // Each scroller holding it inside the page brings it into view, the innermost first; the page's own stays.
    for (
      let box = scrollerOf(this);
      box && !isPage(box);
      box = scrollerOf(box)
    ) {
      const at = this.getBoundingClientRect();
      const port = box.getBoundingClientRect();
      const top = port.top + box.clientTop;
      const left = port.left + box.clientLeft;
      const by = {
        top: alignBy(
          at.top - top,
          at.bottom - top,
          box.clientHeight,
          options.block ?? "start"
        ),
        left: alignBy(
          at.left - left,
          at.right - left,
          box.clientWidth,
          options.inline ?? "nearest"
        ),
      };
      if (by.top !== 0 || by.left !== 0) {
        const step: ScrollToOptions = {
          ...by,
          behavior: options.behavior ?? "auto",
        };
        Reflect.apply(nativeBy, box, [step]);
      }
    }
  };
}
