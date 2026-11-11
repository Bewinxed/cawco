/**
 * The transcripts stored on the Recent bench's two machines, as each
 * machine's `listSessions` answers them (core `NeutralSessionInfo`, its
 * fields as each harness fills them: Claude's summary, first prompt, branch
 * and file size; OpenCode's title; pi's first message), with the person's
 * last prompt in each (`wroteAt`) and the file's last change after it.
 * The bench stands them in its client (dev `standCatalog`); the
 * stored-transcripts probe hands the same listing to the hub's find.
 *
 * - `inStorefront`: Claude Code's, typed in a terminal in a project's
 *   folder, so in Recent under it;
 * - `inSocials` (OpenCode's, in a subfolder of a project's) and
 *   `inPaperwork` (pi's): in a project's folder, and their harness records
 *   nothing that says a person started them, so only Jump finds them;
 * - `byProgram`: Claude Code's, in a project's folder, run by a program
 *   (`claude -p`), so only Jump finds it;
 * - `inWorkspace` (a workspace checkout) and `inDownloads`: in no project's
 *   folder, so only Jump finds them;
 * - `behindListed`: the transcript of a session the hub lists ("Checkout
 *   returns 404 after payment"), its row the one it has;
 * - `behindDone`: the transcript of a session the person pressed Done on,
 *   which stays hidden;
 * - `behindOlder`: the transcripts of sessions the hub holds and its board
 *   no longer lists (the bench's: a session the person stopped days ago,
 *   its two delegates, and a check nobody wrote in), each that session's
 *   row or none, never a stored one.
 *
 * Each of Claude Code's says who started it (`startedBy`, from its
 * transcript's `entrypoint`): a person, or a program for what CawCo and
 * `claude -p` ran.
 */
import type { NeutralSessionInfo } from "@cawco/core/harness";
import {
  DAY_MS as DAY,
  HOUR_MS as HOUR,
  MINUTE_MS as MINUTE,
} from "@cawco/core/time";

export const OBELISK = "obelisk-of-light";
export const MINI = "mac-mini";

/** The stored transcripts' session ids, by what each shows. */
export const STORED = {
  inStorefront: "0c1a0d00-5f0e-4b6a-9d2e-3a7c1b2e4f01",
  inSocials: "ses_7f3a9c2b1e0d4a6b8c5e2f1a",
  inPaperwork: "01a1c445-5f77-73e8-9c29-b9f35dc2c149",
  byProgram: "0c1a0d00-5f0e-4b6a-9d2e-3a7c1b2e4f03",
  inWorkspace: "0c1a0d00-5f0e-4b6a-9d2e-3a7c1b2e4f02",
  inDownloads: "01a1c445-5f77-73e8-9c29-b9f35dc2c150",
} as const;

/**
 * Each machine's listing at `now`. `behindListed` and `behindDone` are the
 * session ids of the bench's listed session and its Done one; `behindOlder`
 * those of the sessions its board no longer lists.
 */
export function storedListing(
  now: number,
  behindListed: string,
  behindDone: string,
  behindOlder: readonly string[] = []
): Record<string, NeutralSessionInfo[]> {
  return {
    [OBELISK]: [
      ...behindOlder.map((sessionId, n): NeutralSessionInfo => ({
        sessionId,
        harness: "claude",
        startedBy: "program",
        firstPrompt: "Move last quarter's invoices onto the new ledger",
        cwd: "/srv/storefront",
        fileSize: 512_000 + n,
        createdAt: now - 5 * DAY,
        wroteAt: now - 4 * DAY - n * HOUR,
        lastModified: now - 4 * DAY - n * HOUR + 5 * MINUTE,
      })),
      {
        sessionId: STORED.inStorefront,
        harness: "claude",
        startedBy: "person",
        summary: "Idempotent payment webhooks",
        firstPrompt:
          "Stripe retries the payment_intent.succeeded webhook and we charge twice; make the handler idempotent",
        gitBranch: "fix/webhook-idempotency",
        cwd: "/srv/storefront",
        fileSize: 1_843_220,
        createdAt: now - 2 * HOUR,
        // The person's last prompt; the agent's run went on after it.
        wroteAt: now - 50 * MINUTE,
        lastModified: now - 4 * MINUTE,
      },
      {
        sessionId: STORED.byProgram,
        harness: "claude",
        startedBy: "program",
        firstPrompt: "Summarise yesterday's failed orders as JSON",
        cwd: "/srv/storefront",
        fileSize: 18_204,
        createdAt: now - 6 * HOUR,
        wroteAt: now - 6 * HOUR,
        lastModified: now - 6 * HOUR + MINUTE,
      },
      {
        sessionId: STORED.inSocials,
        harness: "opencode",
        customTitle: "Carousel captions for launch week",
        cwd: "/srv/socials/drafts",
        createdAt: now - 5 * HOUR,
        wroteAt: now - 3 * HOUR,
        lastModified: now - 2 * HOUR,
      },
      {
        sessionId: STORED.inWorkspace,
        harness: "claude",
        startedBy: "person",
        summary: "Probe kit: cut the flaky waits",
        firstPrompt: "The probe kit's waits flake under load; cut them",
        gitBranch: "ws/1a2b3c4d",
        cwd: "/home/rand/.worktrees/cockpit-1a2b3c4d",
        fileSize: 402_118,
        createdAt: now - DAY - 3 * HOUR,
        wroteAt: now - DAY - 2 * HOUR,
        lastModified: now - DAY - HOUR,
      },
      {
        sessionId: behindListed,
        harness: "claude",
        startedBy: "program",
        summary: "Checkout returns 404 after payment",
        firstPrompt: "Checkout returns 404 after payment",
        cwd: "/srv/storefront",
        fileSize: 96_410,
        createdAt: now - 2 * HOUR,
        wroteAt: now - 25 * MINUTE,
        lastModified: now - 23 * MINUTE,
      },
      {
        sessionId: behindDone,
        harness: "claude",
        startedBy: "program",
        summary: "Refund flow edge cases",
        firstPrompt: "Refund flow edge cases",
        cwd: "/srv/storefront",
        fileSize: 211_004,
        createdAt: now - 3 * HOUR,
        wroteAt: now - 90 * MINUTE,
        lastModified: now - 80 * MINUTE,
      },
    ],
    [MINI]: [
      {
        sessionId: STORED.inPaperwork,
        harness: "pi",
        firstPrompt: "Sort the 2026 tax receipts by month and total each",
        cwd: "/srv/Paperwork",
        createdAt: now - DAY - 6 * HOUR,
        wroteAt: now - DAY - 4 * HOUR,
        lastModified: now - DAY - 4 * HOUR + 3 * MINUTE,
      },
      {
        sessionId: STORED.inDownloads,
        harness: "pi",
        firstPrompt: "Rename the scanned PDFs by the date printed on each",
        cwd: "/Users/rand/Downloads",
        createdAt: now - 3 * DAY,
        wroteAt: now - 3 * DAY + 10 * MINUTE,
        lastModified: now - 3 * DAY + 12 * MINUTE,
      },
    ],
  };
}
