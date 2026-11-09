/**
 * Shapes the hub's sections read of each other, away from any one section's file.
 */

import type { AccountProvider, HomeStore } from "@cawco/core/accounts";
import type { FleetVersioned } from "@cawco/core/fleet";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { MachinePath } from "@cawco/core/machine-path";
import type { NamedSpawn } from "@cawco/core/protocol";
import type { DbShape } from "./db";
import type { HubSocket } from "./wire-socket";

/**
 * A step or a read that could not finish because its machine went away. Not
 * a failure: a continuation waits, and the machine's next register carries it
 * on; a route answers it as the machine away (`awayStatus`: 503 naming it),
 * which a reader reads again once the machine is back.
 */
export class MachineAway extends Error {
  readonly machineId: string;
  /** `words`: the hub's `machineFault`, the machine by its name. */
  constructor(machineId: string, words: string) {
    super(words);
    this.name = "MachineAway";
    this.machineId = machineId;
  }
}

/**
 * Where a conversation lives, resolved from its id alone. `sessionId` is the
 * key the machine stores the transcript under — the SDK's, which for a session
 * the hub spawned is not the instance id the reader addressed it by.
 */
export interface SessionLocation {
  cwd: string;
  harness: HarnessKind;
  id: string;
  machineId: string;
  sessionId: string;
}

/**
 * What locating a conversation came to: found, on no machine (every machine
 * asked answered so), or not known because `machines` did not answer.
 */
export type Located =
  | { kind: "found"; at: SessionLocation }
  /** Kept on a machine that is away, by that machine's last catalog. */
  | { kind: "away"; machineId: string }
  | { kind: "nowhere" }
  | { kind: "unanswered"; machines: string[] };

/**
 * What a delegate's report carries beside its body: the turn it closes, that
 * it is a hub notice rather than a turn's end, and the delegate's
 * one-or-two-sentence `headline` from `finish_item`.
 */
export interface ReportTold {
  completion?: { resultId: string; completedAt?: string };
  headline?: string;
  notice?: boolean;
  /** The folder paths its finish copied its outputs to. */
  outputs?: string[];
}

/** A folder-sourced skill's PUT body, as the route has read it and the install reads it (`installFromFolder`). */
export interface FolderSkillBody {
  areaId?: string | null;
  contentHash?: string;
  enabled?: boolean;
  projectId?: string | null;
  source: string;
}

/** A fleet item's copy before or after a fetch: its version, its hash and where it came from. */
export type FetchedCopy = FleetVersioned & { hash?: string; source?: string };

/**
 * Whether a launch's account is only asked about (`ask`: what would it run
 * on, or why not, placing nothing) or taken for a launch that goes now
 * (`claim`: a row with no account is placed on one, {@link claimAccount}).
 */
export type AccountUse = "ask" | "claim";

/** A spawn as it leaves the hub ({@link settleMode}): its harness named, and every folder it names a path on its machine. */
export type SettledSpawn = NamedSpawn & {
  cwd: MachinePath;
  bootstrap?: { repo: string; baseDir: MachinePath };
  scratch?: { worktree?: boolean; baseCwd?: MachinePath };
};

/** What the last move of each credential came to, by {@link createLoginMoves}' `moveResults`. */
export type LoginMoveResults = Map<
  string,
  {
    accountId: string;
    at: number;
    error?: string;
    machineId: string;
    provider: AccountProvider;
    /** Where the moved credential is kept now, as its owner names it. */
    kept?: string;
    store: HomeStore;
    storeProvider: string;
  }
>;

/** A session's row as the hub stores it. */
export type StoredRow = ReturnType<DbShape["getInstancesByIds"]>[number];

/** Why a session leaves its account ({@link oweMoveOff}). */
export type MoveOffWhy = "refused" | "removed" | "signed-out";

/**
 * What becomes of a pending send its harness has not taken up, once a
 * transcript read has looked: `fail` — it did not go, for the reason given:
 * the session will never run again; `owe` — the process it was handed to
 * is gone and the session runs again, so it is owed to the next process
 * (`oweUnread`), a machine that cannot be asked counting as having
 * taken none; `wait` — a live process may still hand it over and say so;
 * `unheld` — what the process holds is known, so a send it neither stored
 * nor said it held ({@link SentMessageRow.held}), or one a later send
 * overtook, never reached it, and is owed to it again. That is decided only
 * on a read the machine answered.
 */
export type Unstored = "fail" | "owe" | "wait" | "unheld";

export interface ContinueOutcome {
  /** Whether the source had been compacted: its live context starts at a summary. */
  compacted: boolean;
  /** Messages read: the live chain, the whole transcript, and the live scope. */
  entries: { live: number; whole: number; scope: number };
  liveContextTokens: number;
  /** The new session's first message, as sent. */
  opening: string;
  openingTokens: number;
  sizes: { artifacts: number; middle: number; tail: number };
  summariseInputTokens: number;
  /** Null when there was nothing before the tail, so no summariser ran. */
  summariserInstanceId: string | null;
  summary: string | null;
  targetInstanceId: string;
}

/** A socket the hub may close, and the address it came from. */
export type AuthSocket = HubSocket & {
  close: (code?: number, reason?: string) => void;
  /** Its upgrade's headers: the SSH door's mark among them (ssh-door.ts). */
  readonly headers?: Record<string, string | undefined>;
  readonly remoteAddress?: string;
};
