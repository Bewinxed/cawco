/**
 * Who decided a card, on its card (core decides.ts `decidedByLine`): a page
 * that draws it provides this context, and each Decision reads it.
 */

/** The context key. */
export const DECIDED_BY = "decision-decided-by";

export interface DecidedByShown {
  /**
   * What a card held when it was settled for the person and he has since
   * picked otherwise: the member that settled it, by name, and the option's
   * label; undefined for a card he never took back.
   */
  takenBack: (card: string) => { name: string; option: string } | undefined;
}

const GITHUB_ISSUE =
  /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/(\d+)/u;

/** A source as its link reads: an issue as `owner/repo #n`, else its host and path. */
export const sourceLabel = (url: string): string => {
  const issue = GITHUB_ISSUE.exec(url);
  if (issue) {
    return `${issue[1]} #${issue[2]}`;
  }
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
};
