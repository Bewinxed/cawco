/**
 * The composer field's hint: in full wherever the field's own width holds it
 * on one line, else its first part. The server draws the short one, so no
 * first paint shows a hint cut off, and the field's measured width brings in
 * the full one once it is on the page. It is the field that is measured, not
 * the viewport: a narrow pane on a wide screen is narrow.
 */
import { untrack } from "svelte";
import { frameObserver } from "#lib/platform/frame-observer.js";
import { layoutScale } from "./grown";

/** What the hint reads of the composer's props. */
export interface FieldHintParts {
  /** What the field is called, read out, where its placeholder is not its name. */
  label: () => string | undefined;
  /** One string where it fits every field, or its `full` words and the `short` first part. */
  placeholder: () => string | { full: string; short: string } | undefined;
}

/** The hint's trailing ellipsis, which its name drops. */
const TRAILING_ELLIPSIS = /…$/u;

export class FieldHint {
  /** The hint the field shows. */
  hint = $state("");
  readonly #parts: FieldHintParts;
  /** The field's hint in full, and its first part, which fits any field. */
  readonly full = $derived.by(() => {
    const placeholder = this.#parts.placeholder();
    return typeof placeholder === "string"
      ? placeholder
      : (placeholder?.full ??
          "Message the agent…  /  for commands, @ to mention");
  });
  readonly short = $derived.by(() => {
    const placeholder = this.#parts.placeholder();
    return typeof placeholder === "string"
      ? placeholder
      : (placeholder?.short ?? "Message the agent…");
  });
  /** What the field is called, read out: its hint without the trailing ellipsis. */
  readonly label = $derived.by(
    () => this.#parts.label() ?? this.short.replace(TRAILING_ELLIPSIS, "")
  );

  constructor(parts: FieldHintParts) {
    this.#parts = parts;
    this.hint = untrack(() => this.short);
  }

  /** Fits the hint to the field's room, and keeps it fitted as the field resizes. */
  fit = (node: HTMLElement) => {
    const probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;inset-block-start:0;inset-inline-start:-9999px";
    probe.textContent = this.full;
    node.after(probe);
    /** The probe dressed as the field's hint is: its face and its tracking. */
    let dressed = "";
    const dress = (font: string, tracking: string) => {
      dressed = `${font}|${tracking}`;
      probe.style.font = font;
      probe.style.letterSpacing = tracking;
    };
    /** Which hint the field's room holds, read only: the probe dressed already. */
    const measure = () => {
      const style = getComputedStyle(node);
      const room =
        node.clientWidth -
        Number.parseFloat(style.paddingInlineStart) -
        Number.parseFloat(style.paddingInlineEnd);
      // Laid out, as the room is: a panel rising out of its scale shows the
      // probe narrower than the hint will stand.
      return {
        font: style.font,
        tracking: style.getPropertyValue("--hint-track"),
        hint:
          probe.getBoundingClientRect().width / layoutScale(node) <= room
            ? this.full
            : this.short,
      };
    };
    const fit = () => {
      const style = getComputedStyle(node);
      dress(style.font, style.getPropertyValue("--hint-track"));
      ({ hint: this.hint } = measure());
    };
    // Fitted now, so the first frame has its hint. A resize is read inside
    // the delivery, on the layout the frame has just done, and written in
    // the next frame (frameObserver `read`): read in the next frame's
    // callbacks instead, every frame of a rail drag laid the page out for
    // it. A face that changed since the probe was dressed dresses it there,
    // and is read again in the next delivery.
    fit();
    let measured: ReturnType<typeof measure> | null = null;
    const sizes = frameObserver(
      () => {
        if (!measured) {
          return;
        }
        const { font, tracking } = measured;
        if (`${font}|${tracking}` !== dressed) {
          dress(font, tracking);
          sizes.readNext();
        }
        ({ hint: this.hint } = measured);
        measured = null;
      },
      {
        read: () => {
          measured = measure();
        },
      }
    );
    sizes.observe(node);
    // The body face may land after the first measure, at a new width.
    let live = true;
    document.fonts.ready.then(() => {
      if (live) {
        fit();
      }
    });
    return () => {
      live = false;
      sizes.disconnect();
      probe.remove();
    };
  };
}
