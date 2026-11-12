/**
 * The inline inset that stands words on a centred composer's drawn start
 * edge, from the box the composer is centred in: its column
 * (--spacing-c-composer-w) centred, plus half its desk nudge (--spacing-c-composer-nudge),
 * which the centring halves. Its `100%` resolves where it is used, against
 * the box the words stand in, so that box is as wide as the composer's.
 * Under 900px the composer goes edge to edge and its users take --spacing-space-3.
 * New project's ask and Caw's panel hero use it (DESIGN.md, The Alignment
 * Rule: words over a field take its edge).
 */
export const COMPOSER_EDGE =
  "calc((100% - var(--spacing-c-composer-w) + var(--spacing-c-composer-nudge)) / 2)";
