/**
 * Who decided a card, on its card (core decides.ts `decidedByLine`): the
 * sources DecidedBy lists under the line.
 */
import { linkOfUrl } from "@cawco/providers/registry";

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
  const item = linkOfUrl(source);
  // The repository as the link writes it: the item's own container is lower case.
  const repo = parsed.pathname.split("/").slice(1, 3).join("/");
  return {
    href: source,
    label:
      item?.provider === "github" && item.kind !== "discussion"
        ? `${repo} ${item.ref}`
        : `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`,
  };
};
