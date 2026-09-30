/**
 * A fit that measures in the next frame's callbacks, once however often it
 * is asked for before then. A change of state — a mount, a value swapped
 * in — never measures in the task that made it: that task has just written
 * the page, and reading layout back there makes the browser lay it out
 * mid-task (a swipe's release paid 30ms for it). A frame's callbacks run
 * before its style and layout, so the first frame painted is already the
 * fitted one. A `still` fit lands with the field's own transition off: the
 * size is the text's, not a change to watch. The transition comes back a
 * frame later, once that frame's style has taken the new size.
 */
function nextFrame(node: HTMLElement, fit: () => void) {
  let frame = 0;
  let unstill = 0;
  let still = false;
  return {
    request(instant: boolean) {
      still ||= instant;
      if (frame) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (still) {
          still = false;
          node.style.transition = "none";
          unstill = requestAnimationFrame(() => {
            node.style.transition = "";
          });
        }
        fit();
      });
    },
    cancel() {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(unstill);
    },
  };
}

/**
 * A textarea that grows with what is in it, the same way on every engine:
 * its height is measured from the text (scrollHeight) and set in pixels, so
 * a CSS height transition carries each new line in instead of the field
 * jumping. `min-height` and `max-height` in CSS still bound it; past the
 * ceiling it scrolls. Attach with the value it shows:
 * `{@attach autosize(() => value)}`.
 *
 * A field handed a different text wholesale (a group's one composer, lent
 * to whichever conversation its swipe lands on) glides to the new text's
 * size as it does for a typed line. Only the first fit, on mount, lands
 * still.
 *
 * - `held`: while it says so, a new value keeps the size the field has, and
 *   the field glides to the value's size once let go; typing fits at once.
 * - `fold`: asked with the text's full height at each fit; when it says so
 *   the field stands at its stylesheet height (one line) instead, scrolled
 *   to its first line.
 * - `measured`: told the text's full height at each fit.
 */
export function autosize(
  value: () => unknown,
  {
    held = () => false,
    fold = () => false,
    measured,
  }: {
    held?: () => boolean;
    fold?: (natural: number) => boolean;
    measured?: (natural: number) => void;
  } = {}
) {
  return (node: HTMLTextAreaElement) => {
    // Measured on a hidden twin, never on the field: collapsing the field to
    // measure it would cancel the height transition it is running.
    const twin = node.cloneNode() as HTMLTextAreaElement;
    twin.removeAttribute("id");
    twin.removeAttribute("name");
    // The field is sized from its value alone. A placeholder is one line by
    // design, but a textarea counts a wrapped placeholder in scrollHeight,
    // so an empty field measured with one would grow a line after load.
    twin.removeAttribute("placeholder");
    // One row, so an empty field measures one line: without `rows` a
    // textarea stands two rows tall, and scrollHeight never reads less than
    // the box it scrolls in.
    twin.rows = 1;
    twin.setAttribute("aria-hidden", "true");
    twin.tabIndex = -1;
    twin.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;height:auto;min-height:0;max-height:none;overflow:hidden;inset-block-start:0;inset-inline-start:-9999px;transition:none";
    node.after(twin);
    let width = 0;
    let natural = 0;
    const fit = () => {
      width = node.offsetWidth;
      twin.style.width = `${width}px`;
      twin.value = node.value;
      const border = node.offsetHeight - node.clientHeight;
      natural = twin.scrollHeight + border;
      measured?.(natural);
      const folded = fold(natural);
      const next = folded ? "" : `${natural}px`;
      if (node.style.height !== next) {
        node.style.height = next;
      }
      if (folded) {
        node.scrollTop = 0;
      }
    };
    const later = nextFrame(node, fit);
    let first = true;
    $effect(() => {
      value();
      fold(natural);
      if (held()) {
        return;
      }
      later.request(first);
      first = false;
    });
    // Typing fits at once: the keystroke that adds a line grows the field
    // in the frame it paints.
    node.addEventListener("input", fit);
    // A narrower field wraps into more lines. Refit on the next frame:
    // resizing the field inside its own observer's callback would report
    // the resize back to that observer in the same frame. The observer's
    // own box says how wide it is; asking the field would lay it out again.
    const sizes = new ResizeObserver(([entry]) => {
      if (Math.abs(entry.borderBoxSize[0].inlineSize - width) > 0.5) {
        later.request(false);
      }
    });
    sizes.observe(node);
    return () => {
      node.removeEventListener("input", fit);
      sizes.disconnect();
      later.cancel();
      twin.remove();
    };
  };
}

/**
 * An input as wide as what is typed in it, tweening a character at a time
 * (a CSS width transition carries it). It only sizes where its stylesheet
 * asks for it with `--autowidth: 1`, so one field can be content-sized in
 * one place and fill its row in another.
 */
export function autowidth(value: () => unknown) {
  return (node: HTMLInputElement) => {
    const twin = document.createElement("span");
    twin.setAttribute("aria-hidden", "true");
    twin.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;white-space:pre;inset-block-start:0;inset-inline-start:-9999px";
    node.after(twin);
    const fit = () => {
      const style = getComputedStyle(node);
      if (style.getPropertyValue("--autowidth").trim() !== "1") {
        node.style.width = "";
        return;
      }
      twin.style.font = style.font;
      twin.style.letterSpacing = style.letterSpacing;
      twin.textContent = node.value || node.placeholder || " ";
      const pad =
        Number.parseFloat(style.paddingInlineStart) +
        Number.parseFloat(style.paddingInlineEnd) +
        Number.parseFloat(style.borderInlineStartWidth) +
        Number.parseFloat(style.borderInlineEndWidth);
      node.style.width = `${Math.ceil(twin.getBoundingClientRect().width + pad + 2)}px`;
    };
    const later = nextFrame(node, fit);
    $effect(() => {
      value();
      later.request(false);
    });
    node.addEventListener("input", fit);
    return () => {
      node.removeEventListener("input", fit);
      later.cancel();
      twin.remove();
    };
  };
}
