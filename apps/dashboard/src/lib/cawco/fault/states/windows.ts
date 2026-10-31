/**
 * The windows the failure states' frames stand in (FailedParts,
 * FailedComment, FailedDecision): a desk's, 1540 by 800, and a phone's,
 * 390 by 844, each as the story's viewport and as its frame's args.
 */
const at =
  (width: number, height: number) =>
  (args: Record<string, unknown> = {}) => ({
    parameters: { viewport: width },
    args: { width, height, ...args },
  });

/** A desk window, 1540 by 800. */
export const desk = at(1540, 800);
/** A phone, 390 by 844. */
export const phone = at(390, 844);
