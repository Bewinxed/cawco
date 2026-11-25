/**
 * A reopen, read off a revision (provider spec §2.3 `Ingest.moved`): no
 * forge keeps a list that says it whole, so a revision that opens an issue
 * or pull request the mirror held closed is its reopen, keyed with the
 * revision's version (`issue:<n>:reopened@<updated ms>`). The mirror moves
 * once, so a poll and a webhook of one reopen raise it once. GitHub's,
 * GitLab's and Gitea's ingest all say it here.
 */
import { eventKeys } from "./event-keys";
import type {
  ItemRevision,
  MirroredRef,
  MirrorState,
  SourceEvent,
} from "./provider";

/** The states a reopen moves an item out of. */
const SHUT: ReadonlySet<MirrorState> = new Set(["closed", "canceled"]);
/** The states a reopen moves it into. */
const OPEN: ReadonlySet<MirrorState> = new Set(["open", "draft"]);

/**
 * A provider's `moved`: `issue.reopened` or `pr.reopened` when the
 * revision is open over a mirror that held it closed, its source named by
 * `sourceOf` (what an event route matches of the item's container).
 */
export const reopenedBy =
  (sourceOf: (item: MirroredRef) => string) =>
  (revision: ItemRevision, held: MirrorState | null): SourceEvent[] => {
    const { item, snapshot, version } = revision;
    if (
      !(item.kind === "issue" || item.kind === "pr") ||
      held === null ||
      !SHUT.has(held) ||
      snapshot.state === null ||
      !OPEN.has(snapshot.state)
    ) {
      return [];
    }
    const number = Number(item.key);
    return [
      {
        item,
        source: sourceOf(item),
        key: eventKeys.reopened(item.kind, item.key, version),
        kind: `${item.kind}.reopened`,
        actor: snapshot.author && { ...snapshot.author, unvouched: null },
        labels: snapshot.labels,
        branch: snapshot.branch ?? null,
        url: item.url,
        title: snapshot.title,
        body: snapshot.body ?? null,
        at: Number(version),
        ...(Number.isInteger(number) ? { number } : {}),
        ...(item.kind === "pr" ? { draft: snapshot.state === "draft" } : {}),
      },
    ];
  };
