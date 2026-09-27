/**
 * A textarea that grows with what is in it, the same way on every engine:
 * its height is measured from the text (scrollHeight) and set in pixels, so
 * a CSS height transition carries each new line in instead of the field
 * jumping. `min-height` and `max-height` in CSS still bound it; past the
 * ceiling it scrolls. Attach with the value it shows:
 * `{@attach autosize(() => value)}`.
 */
export function autosize(value: () => unknown) {
  return (node: HTMLTextAreaElement) => {
    // Measured on a hidden twin, never on the field: collapsing the field to
    // measure it would cancel the height transition it is running.
    const twin = node.cloneNode() as HTMLTextAreaElement;
    twin.removeAttribute("id");
    twin.removeAttribute("name");
    twin.setAttribute("aria-hidden", "true");
    twin.tabIndex = -1;
    twin.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;height:auto;min-height:0;max-height:none;overflow:hidden;inset-block-start:0;inset-inline-start:-9999px;transition:none";
    node.after(twin);
    const fit = () => {
      twin.style.width = `${node.offsetWidth}px`;
      twin.value = node.value;
      const border = node.offsetHeight - node.clientHeight;
      const next = `${twin.scrollHeight + border}px`;
      if (node.style.height !== next) {
        node.style.height = next;
      }
    };
    $effect(() => {
      value();
      fit();
    });
    node.addEventListener("input", fit);
    // A narrower field wraps into more lines. Refit on the next frame:
    // resizing the field inside its own observer's callback would report
    // the resize back to that observer in the same frame.
    let width = node.offsetWidth;
    const sizes = new ResizeObserver(() => {
      if (Math.abs(node.offsetWidth - width) > 0.5) {
        width = node.offsetWidth;
        requestAnimationFrame(fit);
      }
    });
    sizes.observe(node);
    return () => {
      node.removeEventListener("input", fit);
      sizes.disconnect();
      twin.remove();
    };
  };
}
