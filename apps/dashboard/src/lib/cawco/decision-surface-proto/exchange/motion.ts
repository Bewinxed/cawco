/**
 * How something new arrives in the Exchange (DESIGN.md, Motion grammar:
 * enter on ease-out over --dur-pop; a fade alone under reduced motion):
 * from its own place, by `@starting-style`, so a message, a pane or a
 * sheet that is added plays it on the live instance.
 */
export const ARRIVE =
  "transition-[opacity,translate] duration-(--dur-pop) ease-out starting:opacity-0 motion-safe:starting:translate-y-space-2";

/** A row or block whose fill changes in place: the change crosses over. */
export const RETINT =
  "motion-safe:transition-[background-color] motion-safe:duration-(--dur-fade) motion-safe:ease-out";
