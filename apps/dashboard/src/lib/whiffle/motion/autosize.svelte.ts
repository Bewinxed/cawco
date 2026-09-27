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
    const fit = () => {
      const was = node.style.height;
      // Measure at the natural height with no transition in the way, then
      // put the old height back so the change to the new one animates.
      node.style.transition = "none";
      node.style.height = "auto";
      const border = node.offsetHeight - node.clientHeight;
      const next = node.scrollHeight + border;
      node.style.height = was;
      node.getBoundingClientRect();
      node.style.transition = "";
      node.style.height = `${next}px`;
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
    };
  };
}
