declare global {
  interface Window {
    /** A measuring harness's hook: called once the page has hydrated. */
    __hydrated?: () => void;
  }
}

/** Tells a measuring harness, if one listens, that the page has hydrated. */
export function markHydrated(): void {
  window.__hydrated?.();
}
