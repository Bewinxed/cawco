/**
 * A skeleton the server and the browser draw differently is patched over
 * in silence: Svelte 5 sets a mismatched attribute or text as it hydrates
 * and says nothing, so a drawing seeded from anything but its slot and its
 * place (a clock, Math.random) would show one picture in the first paint
 * and another a moment later. Under `vite dev`, every change hydration
 * makes inside a skeleton's bones is reported as an error, naming its slot,
 * what changed, and how it read before.
 */

let watching: MutationObserver | null = null;

/** Whether the nodes it added or took away hold anything: hydration may add an empty text node. */
const carries = (record: MutationRecord): boolean =>
  [...record.addedNodes, ...record.removedNodes].some(
    (node) => node instanceof Element || Boolean(node.textContent)
  );

const BONES = '[data-slot="skeleton-of"] > [data-bones]';

function report(records: MutationRecord[]): void {
  for (const record of records) {
    const target =
      record.target instanceof Element
        ? record.target
        : record.target.parentElement;
    const bones = target?.closest(BONES);
    if (!bones || target === bones) {
      continue;
    }
    // Hydration sets some attributes again at the value they hold.
    if (record.type === "attributes") {
      if (
        target?.getAttribute(record.attributeName ?? "") === record.oldValue
      ) {
        continue;
      }
    } else if (
      record.type === "characterData" &&
      record.target.textContent === record.oldValue
    ) {
      continue;
    } else if (record.type === "childList" && !carries(record)) {
      continue;
    }
    const what = {
      attributes: `its ${record.attributeName} on <${target?.tagName.toLowerCase()}>`,
      characterData: "its words",
      childList: "its elements",
    }[record.type];
    console.error(
      `The skeleton "${bones.getAttribute("data-bones")}" was drawn differently by the server: hydration changed ${what} (it read ${JSON.stringify(record.oldValue)}).`
    );
  }
}

/** Starts listening, before the page hydrates (hooks.client.ts `init`). */
export function watchSkeletonHydration(): void {
  watching = new MutationObserver(report);
  watching.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true,
    childList: true,
  });
}

/** Stops, once the page has hydrated (the root layout's mount). */
export function endSkeletonHydrationCheck(): void {
  if (watching) {
    report(watching.takeRecords());
    watching.disconnect();
    watching = null;
  }
}
