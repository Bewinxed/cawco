/**
 * Caw's size as a notice's mark and beside his greeting, read from its
 * token (`c-notice-caw`, design/tokens/cawco.tokens.json), since CawFace
 * takes his size as a number.
 */
export const noticeCaw = (): number =>
  Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--c-notice-caw"
    )
  );
