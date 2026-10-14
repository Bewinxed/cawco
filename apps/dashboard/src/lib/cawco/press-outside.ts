/**
 * The house's outside-press rule for a panel open in the page (a pinned
 * delegate panel, a pin's card): a press anywhere in the document outside
 * `node` puts it away. It is heard on `pointerdown`, in the capture phase,
 * so a handler of the page's that stops the press cannot keep the panel
 * open, and the press that lands on another opener (a pin's row) closes
 * this one before that one opens. Answers what stops listening.
 */
export function pressOutside(
  node: Element,
  outside: (event: PointerEvent) => void
): () => void {
  const press = (event: PointerEvent) => {
    if (!(event.target instanceof Node && node.contains(event.target))) {
      outside(event);
    }
  };
  document.addEventListener("pointerdown", press, true);
  return () => document.removeEventListener("pointerdown", press, true);
}
