/** What the fleet says of an account's limits, spans, moves and rebalances. */

import type {
  AccountMove,
  EndedBy,
  HeldAccount,
  MoveBecause,
  RebalanceNotice,
  WaitReason,
} from "../accounts";
import { RESTART_WAIT_CAP_MS } from "../binary-updates";
import { MINUTE_MS } from "../time";
import { accountsWords } from "./accounts";
import { configurePage } from "./configure";

/** "12 min", "2h 10m", "3d 4h": a span ahead, rounded up to the minute. */
export const spanWords = (ms: number): string => {
  const minutes = Math.max(1, Math.ceil(ms / MINUTE_MS));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

/** "20:10": a moment as a clock shows it, in the reader's own time. */
export const clockWords = (at: number): string =>
  new Date(at).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** A day as a line names it: "2 Oct". */
export const dayWords = (at: number): string =>
  new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** "412k tokens"; a context never reported is "its whole context". */
export const tokenWords = (tokens: number | null): string =>
  tokens === null
    ? "its whole context"
    : `${Math.round(tokens / 1000).toLocaleString("en")}k tokens`;

/** Why a held session waits, by its reason, for a line that names no accounts (stored before holds named them). */
const WAIT_WHY: Record<WaitReason, (tokens: string) => string> = {
  fork: () => "A fork stays on the account its origin's cache is on",
  off: () => "Moving to another account at the limit is switched off",
  full: () => "No other account has room for it",
  free: (tokens) =>
    `Its cache lasts past the reset, so waiting costs nothing · moving would re-read ${tokens} cold`,
  room: (tokens) =>
    `Another account has room, but re-reading ${tokens} there would take more than half of what it has left`,
  soon: (tokens) =>
    `The reset comes sooner than re-reading ${tokens} elsewhere is worth`,
  work: () => "Its work item carries on here after the reset",
};

/** "37% left": what an account has left, percent, rounded down to the whole one. */
const leftWords = (pct: number): string =>
  `${Math.max(0, Math.floor(pct))}% left`;

/** One other account and why it didn't take the session, or that it could: "design@ 1% left, runs out by 11:52". */
export const heldAccountWords = (one: HeldAccount): string => {
  const { name } = one.account;
  const until =
    one.backAt === undefined ? "" : ` until ${clockWords(one.backAt)}`;
  const { reason } = one;
  switch (reason.kind) {
    case "signin":
      return `${name} not signed in here`;
    case "allowed":
      return `${name} not allowed by this ${reason.by}`;
    case "benched":
      return `${name} benched${until}`;
    case "reserve":
      return `${name} past its ${reason.pct}% reserve`;
    case "unread":
      return `${name} limits unread`;
    case "limit":
      return `${name} at its limit${until}`;
    case "backup":
      return `${name} never a backup`;
    case "alone":
      return `${name} takes one move at a time until its window is measured, and one is landing there`;
    case "room":
      return `${name} ${leftWords(reason.leftPct)}, its move takes ${Math.max(1, Math.ceil(reason.movePct))}%`;
    case "runsOut":
      return `${name} ${leftWords(reason.leftPct)}, runs out by ${clockWords(reason.at)}`;
    case "fits":
      return `${name} could take it, ${leftWords(reason.leftPct)}${reason.carries ? ", its cache carrying" : ""}`;
  }
};

/**
 * Why a held session waits, under its line, at `now`: its reason, in the
 * words of each (no account can take it; its cache lasts past the reset; the
 * reset is near), then every other account and why it didn't take it, or
 * that it could, and the account that frees first and takes it before its
 * own resets. A line with no list (stored before holds named them) says its
 * reason alone.
 */
const waitingDetail = (
  move: Extract<AccountMove, { kind: "waiting" }>,
  now: number
): string => {
  const tokens = tokenWords(move.tokens);
  const then = move.frees
    ? `it moves to ${move.frees.name} at ${clockWords(move.until)}, before ${move.account.name} resets`
    : "";
  if (!move.accounts) {
    return [WAIT_WHY[move.why](tokens), ...(then ? [then] : [])].join(" · ");
  }
  const left = move.until - now;
  let lead = WAIT_WHY[move.why](tokens);
  if (move.why === "full") {
    lead = "No account can take it now";
  } else if (move.why === "soon") {
    lead = `${move.account.name} resets${left > 0 ? ` in ${spanWords(left)}` : ""}, sooner than re-reading ${tokens} elsewhere is worth`;
  }
  return [
    lead,
    ...(move.accounts.length === 0
      ? ["no other account is signed in for it"]
      : move.accounts.map(heldAccountWords)),
    ...(then ? [then] : []),
  ].join(" · ");
};

/** A stop (Caw off) in words at `now`: it counts down to its account's reset, then asks for a message. */
const stoppedWords = (
  move: Extract<AccountMove, { kind: "stopped" }>,
  now: number
): { line: string; detail: string } => {
  const left = move.resetsAt === null ? 0 : move.resetsAt - now;
  return {
    line: `Stopped at ${move.account.name}'s limit · Caw is off`,
    detail:
      left > 0
        ? `Nothing sends it on while Caw is off · ${move.account.name} resets in ${spanWords(left)}`
        : "Nothing sends it on while Caw is off · send it a message to carry on",
  };
};

/** A move's line and detail: at a cold wake, ahead of a forecast run-out, at a limit, or as a person asked. */
const movedWords = (
  move: Extract<AccountMove, { kind: "moved" }>,
  now: number
): { line: string; detail: string } => {
  if (move.because?.kind === "cold") {
    return {
      line: `Moved to ${move.to.name}${move.because.wake ? " at wake" : " between turns"} · cache was cold, so nothing extra was re-read`,
      detail: `Moved here from ${move.from.name}`,
    };
  }
  const cost = costWords(move.cost, move.to.name);
  if (move.compact) {
    return compactedMoveWords(move, cost, now);
  }
  const reread = move.sameOrganization
    ? "Same organization, cache kept"
    : `Re-read ${tokenWords(move.tokens)}${cost}`;
  if (move.removed) {
    return {
      line: accountsWords.removedMove(move.to.name, move.from.name),
      detail: reread,
    };
  }
  if (move.signedOut) {
    return {
      line: accountsWords.signedOutMove(
        move.to.name,
        move.from.name,
        move.signedOutOn ?? null
      ),
      detail: reread,
    };
  }
  if (move.because?.kind === "refused") {
    return {
      line: `Moved to ${move.to.name}: ${accountsWords.refusedFrom(move.from.name)}`,
      detail: reread,
    };
  }
  const line = move.sameOrganization
    ? `Moved to ${move.to.name} · same organization, cache kept`
    : `Moved to ${move.to.name} · re-read ${tokenWords(move.tokens)}${cost}`;
  if (move.because?.kind === "forecast") {
    return {
      line,
      detail: `${move.from.name} was forecast to run out at ${clockWords(move.because.runsOutAt)}`,
    };
  }
  const ended = move.ended ? endedWorkWords(move.ended) : "";
  if (move.asked) {
    return {
      line: `${line}${ended}`,
      detail: `Moved here from ${move.from.name}, as asked`,
    };
  }
  return { line: `${line}${ended}`, detail: limitHitWords(move, now) };
};

/**
 * What a move ended, after its line: " · a command was running and was ended
 * by the move; run it again if its result matters". Nothing when it ended
 * nothing.
 */
const endedWorkWords = (ended: { tasks: number; wakeups: number }): string => {
  if (ended.tasks === 1) {
    return " · a command was running and was ended by the move; run it again if its result matters";
  }
  if (ended.tasks > 1) {
    return ` · ${ended.tasks} commands were running and were ended by the move; run them again if their results matter`;
  }
  return ended.wakeups > 0
    ? ` · ${ended.wakeups === 1 ? "a wake-up it had scheduled was" : `${ended.wakeups} wake-ups it had scheduled were`} ended by the move`
    : "";
};

/** What sent a move, as its line's last clause reads it: the account it left, and why. */
interface MoveSent {
  asked?: true;
  because?: MoveBecause;
  from: { name: string };
  removed?: true;
  resetsAt: number | null;
  signedOut?: true;
  signedOutOn?: string;
  window: string | null;
}

/** Whose limit sent it and when that resets: "A hit its weekly limit · resets in 3d 4h". */
const limitHitWords = (move: MoveSent, now: number): string => {
  const left = move.resetsAt === null ? 0 : move.resetsAt - now;
  return [
    `${move.from.name} hit its ${move.window ? `${move.window} ` : ""}limit`,
    ...(left > 0 ? [`resets in ${spanWords(left)}`] : []),
  ].join(" · ");
};

/** A move's cost as its line says it: " (≈3% of B’s 5-hour window)", or nothing when unpriced. */
const costWords = (
  cost: { pct: number; window: string } | undefined,
  to: string
): string =>
  cost
    ? ` (≈${Math.max(1, Math.round(cost.pct))}% of ${to}'s ${cost.window ? `${cost.window} ` : ""}window)`
    : "";

/**
 * What sent a move at its limit, as its line's last clause says it: the
 * window that refused it and when that resets ("A hit its 5-hour limit ·
 * resets in 3h 10m"), or its refused sign-in.
 */
const hitWords = (move: MoveSent, now: number): string => {
  if (move.because?.kind === "refused") {
    return accountsWords.refusedFrom(move.from.name);
  }
  if (move.signedOut) {
    return accountsWords.signedOutFrom(
      move.from.name,
      move.signedOutOn ?? null
    );
  }
  return move.removed
    ? accountsWords.removedFrom(move.from.name)
    : limitHitWords(move, now);
};

/**
 * What sent a move ahead of its account's limit, as its line's last clause
 * says it: its account's forecast run-out, its extra usage, or a person.
 */
const aheadWords = (move: MoveSent, now: number): string => {
  if (move.because?.kind === "forecast") {
    return `ahead of ${move.from.name}’s run-out at ${clockWords(move.because.runsOutAt)}`;
  }
  if (move.because?.kind === "extra-usage") {
    return `${move.from.name} is on extra usage`;
  }
  return move.asked ? "as asked" : hitWords(move, now);
};

/** A line with a clause after its first: "Moved to B, compacting next · no summary: … · re-read 412k tokens". */
const afterFirst = (line: string, clause: string | undefined): string => {
  if (!clause) {
    return line;
  }
  const [head, ...rest] = line.split(" · ");
  return [head, clause, ...rest].join(" · ");
};

/** What a harness's own /compact did with the open items, on every harness: filed first and listed back after it. */
const COMPACTED_WORDS =
  "Its open items were filed first and are listed back to it";

/**
 * A move compacted by its harness's own /compact, by where that stands:
 * after the move, on `to` ("Moved to B, compacting next"), or before it, on
 * `from` ("Compacting before its move to B", then "Compacted on A, then
 * moved to B"), or stopped, the whole conversation kept. One whose summary
 * could not be written says why after its first clause.
 */
const compactedMoveWords = (
  move: Extract<AccountMove, { kind: "moved" }>,
  cost: string,
  now: number
): { line: string; detail: string } => {
  const said = move.compactFirst
    ? compactedFirstWords(move, cost, now)
    : compactedAfterWords(move, cost, now);
  return {
    line: afterFirst(
      said.line,
      move.summaryRefused ? `no summary: ${move.summaryRefused}` : undefined
    ),
    detail: said.detail,
  };
};

/** The harness whose /compact runs, by name. */
const compactHarness = (move: Extract<AccountMove, { kind: "moved" }>) =>
  accountsWords.harnesses[move.compactBy ?? "claude"];

/** A compaction on `to` after the move, by its stage. */
const compactedAfterWords = (
  move: Extract<AccountMove, { kind: "moved" }>,
  cost: string,
  now: number
): { line: string; detail: string } => {
  const to = move.to.name;
  const tokens = tokenWords(move.tokens);
  const harness = compactHarness(move);
  const hit = move.relaunched
    ? `its process ended before it took that turn, so the hub started it again · ${hitWords(move, now)}`
    : hitWords(move, now);
  switch (move.compact) {
    case "filing":
      return {
        line: `Moved to ${to}, compacting next · re-read ${tokens}${cost}`,
        detail: `It files its open items, then ${harness} compacts it; what is sent to it waits until then · stop the turn to send it now · ${hit}`,
      };
    case "compacting":
      return {
        line: `Moved to ${to}, compacting · re-read ${tokens}${cost}`,
        detail: `${harness}’s own /compact; what is sent to it waits until then · stop the turn to send it now · ${hit}`,
      };
    case "compacted":
      return {
        line: `Moved to ${to}, then compacted · re-read ${tokens} once${cost}`,
        detail: `${COMPACTED_WORDS} · ${hit}`,
      };
    case "stopped":
    case undefined:
      return {
        line: `Moved to ${to} · compaction stopped, ${tokens} kept`,
        detail: `It goes on with its whole conversation · ${hit}`,
      };
  }
};

/** A compaction on `from` before the move, by its stage: the move follows it, whole once it stopped. */
const compactedFirstWords = (
  move: Extract<AccountMove, { kind: "moved" }>,
  cost: string,
  now: number
): { line: string; detail: string } => {
  const { name: to } = move.to;
  const { name: from } = move.from;
  const tokens = tokenWords(move.tokens);
  const harness = compactHarness(move);
  const why = move.relaunched
    ? `its process ended before it took that turn, so the hub started it again · ${aheadWords(move, now)}`
    : aheadWords(move, now);
  switch (move.compact) {
    case "filing":
      return {
        line: `Compacting before its move to ${to} · ${tokens} on ${from}`,
        detail: `It files its open items, then ${harness} compacts it on ${from}; what is sent to it waits until it has moved · stop the turn to move it whole now · ${why}`,
      };
    case "compacting":
      return {
        line: `Compacting before its move to ${to} · ${tokens} on ${from}`,
        detail: `${harness}’s own /compact, on ${from}; what is sent to it waits until it has moved · stop the turn to move it whole now · ${why}`,
      };
    case "compacted":
      return {
        line: `Compacted on ${from}, then moved to ${to} · re-read ${tokens}${cost}`,
        detail: `${COMPACTED_WORDS} · ${why}`,
      };
    case "stopped":
    case undefined:
      return {
        line: `Moved to ${to} whole · compaction stopped, re-read ${tokens}${cost}`,
        detail: `It goes on with its whole conversation · ${why}`,
      };
  }
};

/** A move whole announced ahead of its moment, counting down to it at `now`. */
const movingWords = (
  move: Extract<AccountMove, { kind: "moving" }>,
  now: number
): { line: string; detail: string } => {
  const left = move.at - now;
  return {
    line:
      left > 0
        ? `Moves whole to ${move.to.name} in ${spanWords(left)}`
        : `Moves whole to ${move.to.name}`,
    detail: `Re-read ${tokenWords(move.tokens)}${costWords(move.cost, move.to.name)} · stop the session to keep it on ${move.from.name}`,
  };
};

/**
 * An account line in words at `now`: its line, and the second line drawn on
 * hover, focus, or at wide widths. A wait counts down to its reset and, once
 * that has passed, says the session went on there.
 */
export const accountMoveWords = (
  move: AccountMove,
  now: number
): { line: string; detail: string } => {
  switch (move.kind) {
    case "moved":
      return movedWords(move, now);
    case "waiting": {
      const left = move.until - now;
      const next = move.frees ?? move.account;
      return {
        line:
          left > 0
            ? `Waiting for ${next.name} to reset · ${spanWords(left)}`
            : `Continued on ${next.name}`,
        detail: waitingDetail(move, now),
      };
    }
    case "moving":
      return movingWords(move, now);
    case "stopped":
      return stoppedWords(move, now);
    case "signed-out":
      return {
        line: `Sign in to ${move.account.name} · its sign-in was refused`,
        detail: `No other account can take it, so what it is sent waits until ${move.account.name} is signed in again in ${configurePage("accounts")}`,
      };
    case "ended":
      return endedWords(move.by);
    case "unmoved":
      return {
        line: `${unmovedWords(move)}: ${move.reason}`,
        detail: unmovedNext(move),
      };
    case "continued":
      return continuedWords(move, now);
  }
};

/**
 * What costs most among `moves`, as a run's line names it: a compaction
 * ("compacted on B"), else the largest re-read of a cold cache ("re-read
 * 737k tokens on B"). Undefined when every move kept its cache.
 */
const costliestWords = (moves: readonly AccountMove[]): string | undefined => {
  const moved = moves.filter(
    (move): move is Extract<AccountMove, { kind: "moved" }> =>
      move.kind === "moved"
  );
  const compacted = moved.findLast(
    (move) => move.compact !== undefined && move.compact !== "stopped"
  );
  if (compacted) {
    return `compacted on ${(compacted.compactFirst ? compacted.from : compacted.to).name}`;
  }
  const [cold] = moved
    .filter(
      (move) =>
        !move.sameOrganization &&
        move.because?.kind !== "cold" &&
        move.tokens !== null
    )
    .sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0));
  return cold
    ? `re-read ${tokenWords(cold.tokens)} on ${cold.to.name}`
    : undefined;
};

/**
 * A run of account lines with no turn between them, as one line in words at
 * `now` (oldest first; the transcript folds them, and opening the line shows
 * each in {@link accountMoveWords}' words): where the session is now, by its
 * newest line, and the move that cost most when an earlier one did. Its
 * detail counts the run, then says the newest line's detail. One line is
 * that line's own words.
 */
export const accountRunWords = (
  moves: readonly AccountMove[],
  now: number
): { line: string; detail: string } => {
  const newest = moves.at(-1);
  if (!newest) {
    return { line: "", detail: "" };
  }
  const own = accountMoveWords(newest, now);
  if (moves.length === 1) {
    return own;
  }
  // The newest line's reason goes under it, so the line keeps room for
  // what an earlier move cost.
  const where = newest.kind === "unmoved" ? unmovedWords(newest) : own.line;
  const earlier = costliestWords(moves.slice(0, -1));
  return {
    line: earlier ? `${where} · earlier ${earlier}` : where,
    detail: [
      `${moves.length} account changes in a row`,
      newest.kind === "unmoved" ? newest.reason : own.detail,
    ].join(" · "),
  };
};

/** What failed, by its action: "Couldn't move from A to B", "Couldn't continue on B". */
const unmovedWords = (
  move: Extract<AccountMove, { kind: "unmoved" }>
): string => {
  if (move.action === "move") {
    return `${move.waits ? "Can't move" : "Couldn't move"}${move.from ? ` from ${move.from.name}` : ""}${move.to ? ` to ${move.to.name}` : ""}${move.waits ? " yet" : ""}`;
  }
  return `Couldn't continue${move.to ? ` on ${move.to.name}` : ""}`;
};

/** What starts a stopped session again: a stop holds it for its person or its parent. */
const STOPPED_NEXT =
  "A message from a person or its parent starts it again, with its conversation";

/** A process ended, in words: who ended it, and what starts it again. Never a failure. */
const endedWords = (by: EndedBy): { line: string; detail: string } => {
  switch (by.kind) {
    case "person":
      return { line: "Stopped by a person", detail: STOPPED_NEXT };
    case "session":
      return { line: `Stopped by ${by.name}`, detail: STOPPED_NEXT };
    case "hub":
      return { line: `Stopped: ${by.why}`, detail: STOPPED_NEXT };
    case "outside":
      break;
  }
  return {
    line: `Ended from outside CawCo (${by.signal})`,
    detail: by.resumes
      ? "Something on its machine ended its process; the turn it was in is handed back, which starts it again"
      : "Something on its machine ended its process; its next message starts it again",
  };
};

/** What happens next after a failed move or continuation: where it stays, and what carries it on. */
const unmovedNext = (
  move: Extract<AccountMove, { kind: "unmoved" }>
): string => {
  if (move.asked || !move.from) {
    return "It goes on in the conversation it has";
  }
  const from = move.from.name;
  if (move.waits) {
    return `It moves${move.to ? ` to ${move.to.name}` : ""} when that work ends, or once it has been held ${RESTART_WAIT_CAP_MS / 60_000} minutes: then the move ends it, and the session is told there what ended`;
  }
  return move.signedOut
    ? `It stays on ${from}, held: the hub tries again within 5 minutes, and it carries on on ${from} once ${from} is signed in again in ${configurePage("accounts")}`
    : `It stays on ${from}, held: the hub tries again within 5 minutes, and it carries on on ${from} when ${from} resets`;
};

/** Trailing stops a clause ends on, so a sentence ends on one of its own. */
const TRAILING_STOP = /[\s.]+$/u;

/**
 * An account line as one sentence, for a log: its line, then its detail,
 * the same words its transcript line and the second line under it say.
 */
export const accountMoveSentence = (move: AccountMove, now: number): string => {
  const { line, detail } = accountMoveWords(move, now);
  // A line still under way ends on its ellipsis, which stands for the stop.
  const head = line.endsWith("…")
    ? line
    : `${line.replace(TRAILING_STOP, "")}.`;
  return `${head} ${detail.replace(TRAILING_STOP, "")}.`;
};

/**
 * A continuation that was its move (the policy's summary, {@link Compaction}):
 * where it went on, what stayed behind, what it opened on, where its summary
 * was written, and what sent it.
 */
const continuedMoveWords = (
  move: Extract<AccountMove, { kind: "continued" }>,
  as: NonNullable<Extract<AccountMove, { kind: "continued" }>["move"]>,
  now: number
): { line: string; detail: string } => {
  const from = move.from?.name ?? "the conversation before";
  const sent: MoveSent = { ...as, from: { name: from } };
  return {
    line: `Continued${move.to ? ` on ${move.to.name}` : ""} from a summary · ${tokenWords(move.tokens)} stayed on ${from}`,
    detail: [
      "It goes on from the summary, its open items, the files it touched and its last few turns",
      ...(move.writtenOn ? [`summary written on ${move.writtenOn.name}`] : []),
      as.at === "limit" ? hitWords(sent, now) : aheadWords(sent, now),
    ].join(" · "),
  };
};

/** A continuation in words: where it went on, what stayed behind, and where its summary was written. */
const continuedWords = (
  move: Extract<AccountMove, { kind: "continued" }>,
  now: number
): { line: string; detail: string } => {
  if (move.move && !move.asks) {
    return continuedMoveWords(move, move.move, now);
  }
  const stayed = `${tokenWords(move.tokens)} stayed ${move.from ? `on ${move.from.name}` : "in the conversation before"}`;
  if (move.asks) {
    return {
      line: `Restarted${move.to ? ` on ${move.to.name}` : ""} from the person's messages · ${stayed}`,
      detail: [
        ...(move.by ? [`Asked by ${move.by}`] : []),
        "nothing was summarised: the fresh conversation opened on the person's own messages alone",
      ].join(" · "),
    };
  }
  const written = move.writtenOn
    ? `summary written on ${move.writtenOn.name}`
    : "summary written as it was asked";
  return {
    line: `Continued${move.to ? ` on ${move.to.name}` : ""} from a summary · ${stayed}`,
    detail: move.by
      ? `Asked by ${move.by} · ${written}`
      : `S${written.slice(1)}`,
  };
};

/** "2 sessions", "1 session". */
const sessionsWords = (n: number): string =>
  `${n} session${n === 1 ? "" : "s"}`;

const thousands = (tokens: number | null): string =>
  tokens === null ? "its whole context" : `${Math.round(tokens / 1000)}k`;

/** "3 sessions on pm@ (Petralab) forecast to run out at 20:10; 3 moved to design@ between turns (cache shared)". */
const runningLine = (group: RebalanceNotice["running"][number]): string => {
  const on = group.organization
    ? `${group.from.name} (${group.organization})`
    : group.from.name;
  const why = group.cacheKept ? "cache shared" : "re-read on the move";
  const left =
    group.left > 0
      ? `; ${group.left} more when ${group.left === 1 ? "its turn ends" : "their turns end"}`
      : "";
  return `${sessionsWords(group.moved + group.left)} on ${on} forecast to run out at ${clockWords(group.runsOutAt)}; ${group.moved} moved to ${group.to.name} between turns (${why})${left}`;
};

/** One held session moved: "180k re-read ≈ 2% of design@'s weekly window". */
const heldMoveWords = (
  one: RebalanceNotice["held"][number]["moved"][number]
): string => {
  if (one.cacheKept) {
    return `${thousands(one.tokens)} to ${one.to.name}, cache kept`;
  }
  return one.cost
    ? `${thousands(one.tokens)} re-read ≈ ${Math.max(1, Math.round(one.cost.pct))}% of ${one.to.name}'s ${one.cost.window ? `${one.cost.window} ` : ""}window`
    : `${thousands(one.tokens)} re-read on ${one.to.name}`;
};

/** "2 held sessions on gmail re-decided: 1 moved (…), 1 kept waiting (612k; shrink at the limit)". */
const heldLine = (group: RebalanceNotice["held"][number]): string => {
  const total = group.moved.length + group.waiting.length;
  const parts: string[] = [];
  if (group.moved.length > 0) {
    parts.push(
      `${group.moved.length} moved (${group.moved.map(heldMoveWords).join("; ")})`
    );
  }
  if (group.waiting.length > 0) {
    parts.push(
      `${group.waiting.length} kept waiting (${group.waiting.map(thousands).join(", ")}; shrink at the limit)`
    );
  }
  return `${total} held ${total === 1 ? "session" : "sessions"} on ${group.from.name} re-decided: ${parts.join(", ")}`;
};

/**
 * A rebalance notice in words: its headline ("design@ added"), then one line
 * per thing it did, as the Accounts page lists them.
 */
export const rebalanceWords = (
  notice: RebalanceNotice
): { title: string; lines: string[] } => {
  const lines = [
    ...notice.running.map(runningLine),
    ...notice.held.map(heldLine),
  ];
  return { title: `${cameWords(notice.came)} on ${notice.machine}`, lines };
};

/** "design@ and marketing@ added", "pm@ back from its bench", "design@ added, pm@ back from its bench". */
const cameWords = (came: RebalanceNotice["came"]): string => {
  const named = (how: "added" | "back") =>
    came.filter((one) => one.how === how).map((one) => one.account.name);
  const list = (names: string[]) =>
    names.length < 2
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const added = named("added");
  const back = named("back");
  return [
    ...(added.length > 0 ? [`${list(added)} added`] : []),
    ...(back.length > 0
      ? [`${list(back)} back from ${back.length === 1 ? "its" : "their"} bench`]
      : []),
  ].join(", ");
};
