/**
 * THE SYSTEM'S LAWS, CHECKED IN THE RUNNING PRODUCT. Each law is written in
 * ARCHITECTURE.md as prose; here it gets a name and a check on a beat the
 * product already has (the board's publish, the register, the agent's
 * heartbeat). A broken law fails loudly, by name, with the facts that broke
 * it, instead of drifting silently: TigerBeetle's TIGER_STYLE
 * (github.com/tigerbeetle/tigerbeetle/blob/main/docs/TIGER_STYLE.md),
 * "Assertions downgrade catastrophic correctness bugs into liveness bugs."
 *
 * What a broken law does is the process's own policy ({@link crashOnBrokenLaw}):
 * - The agent and the judge crash. sessiond keeps the children across the
 *   agent's restart (ARCHITECTURE.md, the sessiond boundary), so the cost is
 *   a reconnect, and the alternative is an agent that keeps acting on a state
 *   it has just proven wrong. A law whose broken state is one workspace's
 *   alone is repaired in that workspace instead, and never reaches here
 *   (`live-workspace-judge-answers`).
 * - The hub throws: the law is logged by name and opens a defect task for
 *   agents in the project whose repository is CawCo's own (hub laws.ts,
 *   law-tasks.ts), and what it was found in goes no further: a board row
 *   left out, a send failed on its row, a transcript read again, a request
 *   failed in plain words. One hub is the operator's only view, so a broken
 *   law never takes the board down, and it never reaches the person's
 *   screen: he does not fix the code.
 */

/**
 * Every law, by name, with the sentence that states it. A law's name is what
 * the log line, its defect task and a grep for it all read.
 */
export const LAWS = {
  /**
   * The derived-liveness law (ARCHITECTURE.md), at the board: a session served
   * `running` is on a machine the hub holds a socket for now. The overlay
   * (`withSessionPresence`) makes it so; this pairs it with an assertion on
   * the rows as they leave for a reader, after every overlay laid on them.
   *
   * Born red, once: the overlay's `running` case, which 9b05ac78f added, taken
   * out of the tree that brought this law in (9b05ac78f^ itself, 2026-08-29,
   * does not run on its dependencies), and a scratch hub serving a stored `running`
   * row on a machine with no socket. `GET /api/instances` answered 500:
   * "Law broken: running-session-machine-connected. Every session served as
   * running is on a machine the hub holds a socket for now. Session
   * red-law-a was about to be served running on machine d04ca118428001f1,
   * which holds no socket at the hub." The dashboard socket was sent no
   * board frame. With the overlay back, the same row read `unknown`, 200,
   * and no law.
   */
  "running-session-machine-connected":
    "Every session served as running is on a machine the hub holds a socket for now.",
  /**
   * An agent registers before it probes anything (ea944761a): the first
   * register a process sends follows no harness probe, so a machine whose
   * harness CLIs answer slowly still reads online at once.
   */
  "register-spawned-nothing":
    "An agent's first register is sent before any harness probe has started.",
  /**
   * At the agent, on boundary/'s beat (`judgesAnswer`): a workspace a
   * session's process runs in has a judge its hook names, of this build,
   * answering, whatever became of that session's attach (dad89261b).
   *
   * Not an `invariant()`: what it finds broken is one workspace's judge,
   * which the agent repairs there (boundary/looks.ts `repairJudge`: the judge
   * started again, else what uses the workspace ended) and stays up. Its exit
   * cut every other workspace's call off, and its start revived the same
   * state, which the next close broke again (obelisk, 2026-10-18).
   *
   * Born red: boundary/looks.ts `judgesAnswer` records its line.
   */
  "live-workspace-judge-answers":
    "Every workspace a session's process runs in has a judge of this build answering its hook.",
  /**
   * At the hub, where a send is kept for its machine and where a machine's
   * window ends (`failOwedAway`): what waits for its machine waits only
   * while that machine reads reconnecting (its window's deadline ahead) or
   * paused, never while it reads offline with no deadline (dad89261b).
   *
   * Born red: sends.ts `owedForMachine` records its line.
   */
  "owed-send-machine-has-deadline":
    "A send kept for its machine waits only while that machine reads reconnecting or paused, never offline with no deadline.",
  /**
   * Every message CawCo sends a session under the artifact origin is drawn as
   * one of the artifact notices (injected.ts `ARTIFACT_NOTICES`), at the send's
   * row (transcript-rules.ts `sendRow`): one no kind reads would otherwise be
   * drawn as the person's own words, as the sheet's saves and errors notices
   * were until each had its kind.
   *
   * Born red, once (2026-10-16): the saves kind taken out of
   * `ARTIFACT_NOTICES`, and `sendRow` given a read record on the artifact
   * origin carrying `artifactSavesNotice` for the sheet "card-sheet". It
   * threw: "Law broken: artifact-notice-drawn. … Send red-saves-1 to session
   * red-session came on the artifact origin, and no artifact notice reads it,
   * so it was about to be drawn as the person's words: "[CawCo] The person
   * changed the sheet "card-sheet" …"". With the kind back, the same record
   * drew `ui.system_note` `artifact_responses`, "Changes saved to card-sheet".
   */
  "artifact-notice-drawn":
    "Every message CawCo sends a session on the artifact origin is drawn as an artifact notice, never as the person's words.",
} as const;

export type Law = keyof typeof LAWS;

/**
 * What a broken law was found about, by id, for the defect task it opens
 * (hub law-tasks.ts): each one the break's facts name.
 */
export interface LawAbout {
  machine?: string;
  send?: string;
  session?: string;
}

/** A law found broken: its name, the facts, and what they were about. */
export class InvariantBroken extends Error {
  readonly about: LawAbout;
  readonly law: Law;
  readonly words: string;
  constructor(law: Law, words: string, about: LawAbout = {}) {
    super(`Law broken: ${law}. ${LAWS[law]} ${words}`);
    this.name = "InvariantBroken";
    this.law = law;
    this.words = words;
    this.about = about;
  }
}

export const isInvariantBroken = (error: unknown): error is InvariantBroken =>
  error instanceof InvariantBroken;

/**
 * How this process ends on a broken law, when it crashes on one (the
 * agent's and the judge's, set once as each starts); none, it throws (the
 * hub's, and the default).
 */
let crash: ((code: number) => never) | undefined;

/**
 * This process crashes on a broken law, by `exit`, its own `process.exit`:
 * named by the process, so this module, which a browser loads, reads no
 * global a browser lacks (scripts/browser-core-check.ts).
 */
export const crashOnBrokenLaw = (exit: (code: number) => never): void => {
  crash = exit;
};

/**
 * Asserts `cond`, a law of the system. Broken, it names the law, the facts
 * (`words`) and the ids they are about (`about`), each read only then, and
 * throws {@link InvariantBroken}; in a process whose policy is `crash` it
 * says the same on stderr and the process exits with 70 (EX_SOFTWARE), so
 * nothing above it can catch the break and carry on.
 */
export function invariant(
  cond: unknown,
  law: Law,
  words: string | (() => string),
  about?: () => LawAbout
): asserts cond {
  if (cond) {
    return;
  }
  const broken = new InvariantBroken(
    law,
    typeof words === "function" ? words() : words,
    about?.()
  );
  if (crash) {
    console.error(`[law] ${broken.message}`);
    crash(70);
  }
  throw broken;
}
