/**
 * The house edge fade (edge-fade.css: an edge fades only while there is more
 * to scroll to, over `--c-edge-fade-len`, 40px), drawn from the scroller's
 * own position rather than a scroll-driven animation, so a still capture
 * (one taken with animations held or turned off) keeps it: the scroller says
 * which edges have more past them (`data-more-start`, `data-more-end`) and
 * the `.edges` mask (preview.css) fades those edges alone.
 */
export function edges(node) {
  const mark = () => {
    const more = node.scrollHeight - node.clientHeight;
    node.toggleAttribute("data-more-start", more > 1 && node.scrollTop > 1);
    node.toggleAttribute(
      "data-more-end",
      more > 1 && node.scrollTop < more - 1
    );
  };
  mark();
  node.addEventListener("scroll", mark, { passive: true });
  const sizes = new ResizeObserver(mark);
  sizes.observe(node);
  const changes = new MutationObserver(() => {
    for (const child of node.children) {
      sizes.observe(child);
    }
    mark();
  });
  changes.observe(node, { childList: true, subtree: true, attributes: true });
  for (const child of node.children) {
    sizes.observe(child);
  }
  return () => {
    node.removeEventListener("scroll", mark);
    sizes.disconnect();
    changes.disconnect();
  };
}
