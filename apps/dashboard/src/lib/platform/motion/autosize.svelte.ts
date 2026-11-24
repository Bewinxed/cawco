import { frameObserver } from "../frame-observer";
import { type GrowTarget, growCut } from "./grow-cut";

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
function nextFrame(node: HTMLElement, fit: (watched: boolean) => void) {
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
        const watched = !still;
        if (still) {
          still = false;
          node.style.transition = "none";
          unstill = requestAnimationFrame(() => {
            node.style.transition = "";
          });
        }
        fit(watched);
      });
    },
    cancel() {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(unstill);
    },
  };
}

/**
 * What lays a textarea's words out, which its mirror takes from it: its
 * face, its spacing, its wrapping and its border's widths (drawn clear).
 */
const FACE = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "font-variant",
  "font-feature-settings",
  "font-variation-settings",
  "font-kerning",
  "letter-spacing",
  "word-spacing",
  "text-transform",
  "text-indent",
  "tab-size",
  "line-height",
  "overflow-wrap",
  "word-break",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
] as const;

/**
 * After the mirror's text: a zero-width space holds a last empty line open,
 * which a trailing newline alone does not (the composer's flight layers do
 * the same).
 */
const HOLD_LAST_LINE = "​";

/** What a fit reads off the field itself: its width, padding, face and ceiling. */
interface FieldRead {
  cap: number;
  /** A textarea's face, as its mirror takes it (none for an editable box, whose twin is its copy). */
  face: [string, string][];
  padding: string;
  /** The reader can stretch it by its corner: it stays a scroll container. */
  stretch: boolean;
  width: number;
}

/** What a delivery read: the field, the twin's height, and the text write it was laid out from. */
interface Seen {
  at: number;
  field: FieldRead;
  natural: number;
}

/** Each field's last height change drawn by its cut (motion/grow-cut), by field. */
const runs = new WeakMap<HTMLElement, Animation>();

/**
 * The run drawing `field`'s height change, while it runs: its clock, which
 * ends as the change is drawn whole. Null once it has ended, been cut short,
 * or when the field's height changes with no cut.
 */
export function heightRunOf(field: HTMLElement): Animation | null {
  const run = runs.get(field);
  return run && run.playState !== "finished" && run.playState !== "idle"
    ? run
    : null;
}

/**
 * A text field that grows with what is in it, the same way on every engine:
 * a textarea, or an editable box (the composer's MentionField). Its height
 * is its text's, measured on a hidden twin and set in pixels, so a CSS
 * height transition carries each new line in instead of the field jumping,
 * or with `cut`, its box's clip on the compositor (motion/grow-cut).
 * `min-height` and `max-height` in CSS still bound it; past the ceiling it
 * scrolls. Attach with the value it shows:
 * `{@attach autosize(() => value)}`.
 *
 * A keystroke writes and never reads. The field's text goes into the twin
 * in the next frame's callbacks (once however many keys came before it): a
 * textarea's into a `div` mirror wearing its face, whose own height follows
 * its words (a textarea's never does), an editable box's as a copy of its
 * nodes, so chips wrap as they do in it. The twin and the field are heard
 * through the house's one ResizeObserver (frameObserver): the twin's height
 * and the field's metrics are read inside the delivery, on the layout that
 * frame has just done, which costs no layout of its own, and the field's
 * new height is written in the next frame's callbacks, before that frame's
 * layout. Read in the keystroke instead, each key laid the page out
 * mid-task (ParkedPrompt:Minimized, 155 characters at 4×: 358 forced
 * layouts, 2 dropped frames).
 *
 * For the frame between the words wrapping and the height following them,
 * the field below its ceiling clips what overflows it (`data-autosize`
 * without `data-capped`, design.css) rather than scrolling to the caret's
 * new line and back: that frame looks like the grow's first. At its ceiling
 * (`data-capped`) it scrolls; the fit that takes it there scrolls a caret
 * at the end into view. A field the reader may stretch by its corner stays
 * a scroll container, which its grip needs, and is not marked.
 *
 * A change no key made (a draft handed in wholesale, a fold turning, the
 * field let go) is measured in the next frame's callbacks instead, its
 * height written there: whoever reads the fitted field in that frame (a
 * queued message lifted into it, flying to the height it grows to) finds
 * it fitted. A field handed a different text wholesale (a group's one
 * composer, lent to whichever conversation its swipe lands on) glides to
 * the new text's size as it does for a typed line. Only the first fit, on
 * mount, lands still, so the first frame painted is already the fitted one.
 *
 * - `held`: while it says so, a new value keeps the size the field has, and
 *   the field glides to the value's size once let go; typing fits.
 * - `fold`: asked with the text's full height at each fit; when it says so
 *   the field stands at its stylesheet height (one line) instead, scrolled
 *   to its first line. A fit that folds the field or opens it marks it
 *   `data-folding` for as long as the height change that fit started runs
 *   (with a cut, its run), so folding and opening can have a clock of
 *   their own (the cut's `clock`, or the stylesheet's transition).
 * - `measured`: told the text's full height at each fit.
 * - `cut`: the box each change of height is drawn on (motion/grow-cut):
 *   laid out at once, its edge and what stands around it moving on the
 *   compositor. A fit no one watches lands as laid out: the first, and a
 *   refit for a new width (the field follows the page being laid out
 *   around it, frame by frame, as everything else does).
 */
export function autosize(
  value: () => unknown,
  {
    held = () => false,
    fold = () => false,
    measured,
    cut,
  }: {
    held?: () => boolean;
    fold?: (natural: number) => boolean;
    measured?: (natural: number) => void;
    cut?: () => GrowTarget | null;
  } = {}
) {
  return (node: HTMLElement) => {
    const area = node instanceof HTMLTextAreaElement ? node : null;
    // Measured on a hidden twin, never on the field: collapsing the field to
    // measure it would cancel the height change it is running.
    const twin = area ? document.createElement("div") : node.cloneNode();
    if (!(twin instanceof HTMLElement)) {
      return;
    }
    for (const name of [
      "id",
      "name",
      // The field is sized from its value alone: a placeholder is one line
      // by design.
      "placeholder",
      "data-placeholder",
      // Not a field: nothing finds it as one, nor types in it.
      "contenteditable",
      "role",
      "aria-label",
      "aria-controls",
      "aria-activedescendant",
    ]) {
      twin.removeAttribute(name);
    }
    twin.setAttribute("aria-hidden", "true");
    twin.tabIndex = -1;
    twin.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:auto;min-height:0;max-height:none;overflow:hidden;inset-block-start:0;inset-inline-start:-9999px;transition:none${
      area
        ? ";box-sizing:border-box;border-style:solid;border-color:transparent;white-space:pre-wrap"
        : ""
    }`;
    node.after(twin);
    /** The text's full height at the last fit. */
    let natural = 0;
    /** Whether the last fit left the field folded; unknown before the first. */
    let wasFolded: boolean | undefined;
    /** The fold change the mark stands for: a later one takes it over. */
    let turn = 0;
    /**
     * The mark stays only while the height change this fit started runs,
     * and goes as it ends or is cut short. A fold whose height did not move
     * (a draft emptied in the same frame as the field took focus, or with
     * less motion) starts none, and the mark goes at once: kept until a
     * transition that never ran had ended, it stood for good, and every line
     * typed after it grew on the fold's clock.
     */
    const markFold = (drawn: Animation | null) => {
      turn += 1;
      const mine = turn;
      // With a cut, the change is the cut's run; without one, the field's
      // own height transition.
      const glide = grow
        ? drawn
        : node
            .getAnimations()
            .find(
              (run) =>
                run instanceof CSSTransition &&
                run.transitionProperty === "height"
            );
      const done = () => {
        if (turn === mine) {
          delete node.dataset.folding;
        }
      };
      if (glide) {
        glide.finished.then(done, done);
      } else {
        done();
      }
    };
    const readField = (): FieldRead => {
      // Its padding as the field resolves it, in px. The twin stands out of
      // flow, so a padding the stylesheet gives in percent (or a calc with
      // one, as design.css `pe-measure`) resolves against another box there
      // and would wrap the twin's text at another width than the field's.
      const style = getComputedStyle(node);
      return {
        width: node.offsetWidth,
        padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
        cap: Number.parseFloat(style.maxHeight) || Number.POSITIVE_INFINITY,
        face: area
          ? FACE.map((name) => [name, style.getPropertyValue(name)])
          : [],
        stretch: style.resize !== "none" && style.resize !== "",
      };
    };
    /** The width, padding and face the twin was last given. */
    let shapedFor = "";
    /** Gives the twin the field's width, padding and face; true when any changed. */
    const shape = (field: FieldRead): boolean => {
      const key = `${field.width}|${field.padding}|${field.face.join(";")}`;
      if (key === shapedFor) {
        return false;
      }
      shapedFor = key;
      twin.style.width = `${field.width}px`;
      twin.style.padding = field.padding;
      for (const [name, face] of field.face) {
        twin.style.setProperty(name, face);
      }
      node.toggleAttribute("data-autosize", !field.stretch);
      return true;
    };
    /** Text writes into the twin so far; a read knows which it was laid out from. */
    let wrote = 0;
    const writeText = () => {
      if (area) {
        twin.textContent = area.value + HOLD_LAST_LINE;
      } else {
        // An empty box measures one line, as an empty textarea of one row.
        const copy = node.cloneNode(true);
        twin.replaceChildren(
          ...(copy.hasChildNodes()
            ? copy.childNodes
            : [document.createTextNode(" ")])
        );
      }
      wrote += 1;
    };
    const grow = cut ? growCut(cut) : null;
    /**
     * Writes the field's height: with a cut, drawn by it where someone
     * watches the change, and laid out as it lands where no one does. Hands
     * back the cut's run, while it is drawn ({@link heightRunOf}).
     */
    const heightTo = (next: string, shown: boolean): Animation | null => {
      if (grow && !shown) {
        grow.land();
      }
      if (node.style.height === next) {
        return null;
      }
      const write = () => {
        node.style.height = next;
      };
      if (!(grow && shown)) {
        write();
        return null;
      }
      const drawn = grow.draw(write);
      if (drawn) {
        runs.set(node, drawn);
      }
      return drawn;
    };
    /** At the ceiling now, from below it: a caret at the end is scrolled to, as typing there would have. */
    const toCaret = () => {
      const focus = document.activeElement;
      if (!(focus && (focus === node || node.contains(focus)))) {
        return;
      }
      let atEnd = false;
      if (area) {
        atEnd = area.selectionEnd === area.value.length;
      } else {
        const selection = getSelection();
        if (!(selection?.focusNode && node.contains(selection.focusNode))) {
          return;
        }
        const after = document.createRange();
        after.selectNodeContents(node);
        after.setStart(selection.focusNode, selection.focusOffset);
        atEnd = after.toString() === "";
      }
      if (atEnd) {
        node.scrollTop = node.scrollHeight;
      }
    };
    /** Sets the field's height for a text `whole` tall. */
    const fit = (whole: number, cap: number, shown: boolean) => {
      natural = whole;
      measured?.(natural);
      const folded = fold(natural);
      // Set no taller than the ceiling, so the glide runs over the height
      // the field shows rather than spending its start past the ceiling.
      const next = folded ? "" : `${Math.min(natural, cap)}px`;
      // Marked before the height is written, so the style that starts the
      // change already has the fold's clock.
      const turning = wasFolded !== undefined && folded !== wasFolded;
      wasFolded = folded;
      if (turning) {
        node.dataset.folding = "";
      }
      const capped = !folded && natural > cap + 0.5;
      const capping = capped && node.dataset.capped === undefined;
      node.toggleAttribute("data-capped", capped);
      const drawn = heightTo(next, shown);
      if (turning) {
        markFold(drawn);
      }
      if (folded && turning) {
        node.scrollTop = 0;
      } else if (capping) {
        toCaret();
      }
    };
    /** The last delivery's read. */
    let seen: Seen | null = null;
    /** The text write the last fit was laid out from. */
    let fitted = -1;
    /** The next fit follows a new width or face: no one watches it. */
    let refit = false;
    /** A key has changed the text since the last fit: it fits even while held. */
    let typed = false;
    const sizes = frameObserver(
      () => {
        const now = seen;
        if (!now) {
          return;
        }
        // A new width or face: the twin takes it and is read again. An empty
        // field is one line at any width, and takes it with its next text.
        const empty = area ? area.value === "" : !node.textContent;
        if (!(empty && shapedFor) && shape(now.field)) {
          refit = true;
          if (!sizes.readInFrame()) {
            sizes.readNext();
          }
          return;
        }
        if (now.at === fitted || (held() && !typed)) {
          return;
        }
        fitted = now.at;
        const shown = !refit;
        refit = false;
        typed = false;
        fit(now.natural, now.field.cap, shown);
      },
      {
        read: () => {
          seen = {
            at: wrote,
            field: readField(),
            natural: twin.offsetHeight,
          };
        },
      }
    );
    /** The text into the twin in the next frame's callbacks, read in that frame's delivery and fitted in the frame after. */
    let frame = 0;
    const soon = () => {
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        if (seen) {
          shape(seen.field);
        }
        writeText();
        if (!sizes.readInFrame()) {
          sizes.readNext();
        }
      });
    };
    // A change no key made, measured in the next frame's callbacks, before
    // that frame's layout. The first lands still, its first frame fitted.
    const framed = nextFrame(node, (watched) => {
      const field = readField();
      shape(field);
      writeText();
      seen = { at: wrote, field, natural: twin.offsetHeight };
      // It fits the field's whole text, a key's change in it too.
      fitted = wrote;
      typed = false;
      fit(seen.natural, field.cap, watched);
    });
    let mounting = true;
    $effect(() => {
      value();
      fold(natural);
      if (held()) {
        return;
      }
      // A keystroke's change is already on its way (`typing`).
      if (!typed) {
        framed.request(mounting);
      }
      mounting = false;
    });
    // Heard before the field's own listeners (a capture on the target runs
    // first): a value binding's write re-runs the effect above within its
    // listener, which must already know a key made the change.
    const typing = () => {
      typed = true;
      soon();
    };
    node.addEventListener("input", typing, { capture: true });
    sizes.observe(twin);
    sizes.observe(node, { box: "border-box" });
    return () => {
      node.removeEventListener("input", typing, { capture: true });
      cancelAnimationFrame(frame);
      sizes.disconnect();
      framed.cancel();
      grow?.stop();
      twin.remove();
      node.removeAttribute("data-autosize");
      node.removeAttribute("data-capped");
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
