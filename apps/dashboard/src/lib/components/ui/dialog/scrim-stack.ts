/**
 * One scrim, however many held surfaces stand open (DESIGN.md, Materials:
 * "the page's own background at 72% with a 2px blur, behind dialogs and
 * sheets"). A dialog opened over a sheet (a document over Caw's sheet)
 * brought a second scrim, and the page lay under 92% of its background and
 * two blurs. Every kit scrim (the dialog's, alert dialog's, sheet's and
 * drawer's) joins this stack as it mounts: while one mounted before it is
 * still open, it is `data-stacked`, and draws no fill and no blur
 * (`scrimVariants`), still taking the presses outside its surface. When the
 * one under it closes, it draws the scrim.
 */
const stack: HTMLElement[] = [];

function sync(): void {
  stack.forEach((scrim, at) => {
    const under = stack
      .slice(0, at)
      .some((below) => below.dataset.state !== "closed");
    scrim.toggleAttribute("data-stacked", under);
  });
}

export function scrimStack(node: HTMLElement): () => void {
  stack.push(node);
  const watch = new MutationObserver(sync);
  watch.observe(node, { attributeFilter: ["data-state"] });
  sync();
  return () => {
    watch.disconnect();
    stack.splice(stack.indexOf(node), 1);
    sync();
  };
}
