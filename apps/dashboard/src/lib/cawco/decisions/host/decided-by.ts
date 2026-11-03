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

/**
 * A source as the card shows it (`settle` takes links or repository paths):
 * a web link opens, an issue read as `owner/repo #n`, else its host and
 * path; anything else is a path in a repository the dashboard has no place
 * to open (it opens only a project's folder, FolderFile), and the page
 * stands on a preview origin, where it would answer 404, so it is its words
 * alone.
 */
export const sourceShown = (
  source: string
): { href: string | null; label: string } => {
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return { href: null, label: source };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { href: null, label: source };
  }
  const issue = GITHUB_ISSUE.exec(source);
  return {
    href: source,
    label: issue
      ? `${issue[1]} #${issue[2]}`
      : `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`,
  };
};
