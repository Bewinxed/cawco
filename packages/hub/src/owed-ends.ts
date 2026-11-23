/**
 * THE RULE FOR WHAT ENDS A NOTICE OWED TO A SESSION NOTHING WILL WAKE.
 *
 * A send the hub keeps owed (`sent_messages.owed_held`) goes once something
 * releases it: a send that may wake its session, the end of its account's
 * limit, its machine's pause or grace (sends.ts `releaseOwed`,
 * `failOwedAway`). CawCo's own notices to a session at rest that only tell
 * it something (a browser's, a rule's, its containers', a word it only
 * needs to know while its cache is cold: hub-words.ts) may not wake it
 * (server.ts `startsTurnIn`), so they wait for the person or its parent,
 * and a session nobody writes to again kept them for good: 256 of them on
 * obelisk's hub
 * on 2026-11-14, 225 owed to sessions that errored in one incident on
 * 2026-10-23 (task tsk-372, project assets `01589412/owed-sends.md`).
 *
 * A notice (a `system` send that is not the person's own act, core
 * `byPerson`, nor a person's Continue's filing step, `COMPACTION_ORIGIN`)
 * ends undelivered when:
 * - `ended`: its session never runs again, by the product's own states:
 *   `discarded` (core protocol.ts: "gone for good"), its conversation gone
 *   (core relaunch.ts `conversation-gone`: "it never runs on it again"), or
 *   no row the hub holds for it;
 * - `waited`: it was accepted more than {@link OWED_NOTICE_DAYS} days ago.
 *
 * The person's own words and its parent's are no notices: they wake any
 * session, so none of them waits for a session at rest, and a session's end
 * already fails what it never read of theirs, the parent told
 * (ask-routing.ts `forgetPending`, `keep: "none"`; sends.ts `tellSender`).
 * What waits for them stays theirs.
 *
 * Read by the hub (sends.ts `endOwedNotices`) and by the count taken on a
 * database copy before a hub runs it (scripts/owed-notices.ts).
 */
import { byPerson, NOTICES_ENDED } from "@cawco/core/harness";
import { COMPACTION_ORIGIN } from "@cawco/core/harness/kinds";
import type { LastErrorKind } from "@cawco/core/relaunch";
import type {
  NeutralOrigin,
  NeutralSystemMessage,
} from "@cawco/core/session-messages";
import { DAY_MS } from "@cawco/core/time";
import type { UnsentWhy } from "@cawco/core/words/unsent";

/**
 * How many days a notice stays owed before it ends undelivered. Our call,
 * from the owed sends on a copy of obelisk's hub taken 2026-11-14
 * (`01589412/owed-sends.md`): of 256, none younger than a day, one between
 * one and seven days (held for its account's limit, 3.7 days old), and 255
 * older than seven days, the oldest from 2026-10-18, all kept for sessions
 * at rest that nothing had written to since. The longest hold that ends by
 * itself is an account's weekly limit, which resets within seven days; a
 * machine's grace ends in minutes. Twice that week leaves every hold that
 * ends by itself to end first, and ends what only a person could release
 * and nobody has.
 */
export const OWED_NOTICE_DAYS = 14;

/** {@link OWED_NOTICE_DAYS} in milliseconds. */
const OWED_NOTICE_BOUND_MS = OWED_NOTICE_DAYS * DAY_MS;

/** Whether `origin` is one of CawCo's notices, not the person's act nor their Continue's step. */
const isNotice = (origin: NeutralOrigin | undefined): boolean =>
  origin?.kind === "system" &&
  !byPerson(origin) &&
  origin.name !== COMPACTION_ORIGIN;

/** Whether the session never runs again, by its row's own states; true for a session the hub holds no row of. */
const runsNoMore = (
  row: { lastErrorKind?: LastErrorKind | null; status: string } | undefined
): boolean =>
  !row ||
  row.status === "discarded" ||
  row.lastErrorKind === "conversation-gone";

/** Why an owed send ends undelivered now, or nothing when it stays owed. */
export const owedNoticeEnd = (
  send: { acceptedAt: number; origin: NeutralOrigin | undefined },
  row: { lastErrorKind?: LastErrorKind | null; status: string } | undefined,
  now: number
): UnsentWhy | undefined => {
  if (!isNotice(send.origin)) {
    return;
  }
  if (runsNoMore(row)) {
    return "ended";
  }
  return now - send.acceptedAt > OWED_NOTICE_BOUND_MS ? "waited" : undefined;
};

/**
 * The notices owed to a session that one look ended undelivered (core
 * `NOTICES_ENDED`), as its row keeps the line: the same on the live stream
 * and a later transcript read.
 */
export const unsentLine = (
  row: { sessionId: string | null },
  line: { at: number; id: string; content: string }
): NeutralSystemMessage & { uuid: string } => ({
  type: "system",
  subtype: NOTICES_ENDED,
  uuid: line.id,
  session_id: row.sessionId ?? "",
  content: line.content,
  timestamp: new Date(line.at).toISOString(),
});
