/** `listener` hears `type` on the window before the page's own handlers do (the capture phase); calling the answer stops it. */
export const heardFirst = <K extends keyof WindowEventMap>(
  type: K,
  listener: (event: WindowEventMap[K]) => void
): (() => void) => {
  window.addEventListener(type, listener, true);
  return () => window.removeEventListener(type, listener, true);
};
