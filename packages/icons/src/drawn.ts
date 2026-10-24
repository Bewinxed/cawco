/**
 * The glyphs CawCo draws itself, where Solar has the meaning only inside a
 * container of its own (a circle or a rounded square round the glyph):
 * DESIGN.md, The Bare Glyph Rule. Each is Solar's own inner glyph, lifted
 * out of its container and redrawn to fill the 24px grid in the set's
 * grammar: a 1.5 stroke with round caps and joins (Solar's bold-duotone
 * draws the same stroke as a filled outline), a solid body where Solar's
 * bold cut fills one, and the second layer in the same `currentColor` at
 * 50% opacity, the half-ink part chosen as Solar's own bare glyphs choose
 * it (the longer or the secondary stroke: `add`, `check`,
 * `exclamation-mark`).
 *
 * unplugin-icons serves them as the `cawco` collection (`~icons/cawco/<name>`,
 * an inline custom collection: the dashboard's vite.config.ts, its optimizer
 * build, and core's decision-host.ts), so each is the same component a
 * Solar icon is, at the same 1.2em box. The barrel (index.ts) names them.
 */

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;

const STROKE =
  'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"';

export const DRAWN_ICONS: Record<string, string> = {
  /**
   * Replaces `branching-paths-down-bold-duotone`: its stem and the two
   * branches it parts into, out of the rounded square, the branch it keeps
   * in full ink as Solar's line-duotone cut does. A subagent.
   */
  "branch-down": svg(
    `<g ${STROKE}><path d="M12 3.375V12.375C12 15.6887 14.6863 18.375 18 18.375H21"/><path d="M18.75 16.125L21 18.375L18.75 20.625"/><g opacity=".5"><path d="M12 3.375V12.375C12 15.6887 9.31371 18.375 6 18.375H3"/><path d="M5.25 16.125L3 18.375L5.25 20.625"/></g></g>`
  ),
  /**
   * Replaces `branching-paths-up-bold-duotone`: the same paths turned up,
   * the left branch in full ink as Solar's line-duotone cut has it. A fork.
   */
  "branch-up": svg(
    `<g ${STROKE}><path d="M12 20.625V11.625C12 8.31129 9.31371 5.625 6 5.625H3"/><path d="M5.25 7.875L3 5.625L5.25 3.375"/><g opacity=".5"><path d="M12 20.625V11.625C12 8.31129 14.6863 5.625 18 5.625H21"/><path d="M18.75 7.875L21 5.625L18.75 3.375"/></g></g>`
  ),
  /**
   * Replaces `dollar-bold-duotone` (a coin: the dollar sign on a disc): the
   * sign alone, Solar's line-duotone `dollar` S at 1.5×, its bar at half ink.
   */
  dollar: svg(
    `<g ${STROKE}><path d="M12 3V21" opacity=".5"/><path d="M16.5 8.25C16.5 6.17893 14.4853 4.5 12 4.5C9.51472 4.5 7.5 6.17893 7.5 8.25C7.5 10.3211 9.51472 12 12 12C14.4853 12 16.5 13.6789 16.5 15.75C16.5 17.8211 14.4853 19.5 12 19.5C9.51472 19.5 7.5 17.8211 7.5 15.75"/></g>`
  ),
  /**
   * Replaces `info-circle-bold-duotone`: the "i" alone, a dot over a stem,
   * Solar's `exclamation-mark` turned over (its dot in full ink, its stem
   * at half), the dot at the circled glyph's own 1px radius.
   */
  info: svg(
    `<g fill="currentColor"><circle cx="12" cy="3.25" r="1"/><path d="M11.25 8.25C11.25 7.83579 11.5858 7.5 12 7.5C12.4142 7.5 12.75 7.83579 12.75 8.25V20.75C12.75 21.1642 12.4142 21.5 12 21.5C11.5858 21.5 11.25 21.1642 11.25 20.75V8.25Z" opacity=".5"/></g>`
  ),
  /**
   * Replaces `plug-circle-bold-duotone` (a plug whose cable rings it): the
   * plug alone, its prongs and solid head in full ink, its cable straight
   * down at half. An MCP server.
   */
  plug: svg(
    `<path fill="currentColor" d="M6.25 8.5C6.25 7.94772 6.69772 7.5 7.25 7.5H16.75C17.3023 7.5 17.75 7.94772 17.75 8.5V10.5C17.75 13.6756 15.1756 16.25 12 16.25C8.82436 16.25 6.25 13.6756 6.25 10.5V8.5Z"/><g ${STROKE}><path d="M9.5 2.75V7.5M14.5 2.75V7.5"/><path d="M12 16.25V21.25" opacity=".5"/></g>`
  ),
  /**
   * Replaces `code-square-bold-duotone` (code in a rounded square), for a
   * shell: Solar's `programming` prompt out of its square, a chevron and
   * the cursor's underscore, the chevron opened to Solar's `alt-arrow`
   * proportions so it holds at 14px, the cursor at half ink.
   */
  terminal: svg(
    `<g ${STROKE}><path d="M4 6.5L9.5 12L4 17.5"/><path d="M13 17.5H20" opacity=".5"/></g>`
  ),
};
