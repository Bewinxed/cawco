/**
 * What `delegate_list` with a `target` says of one delegate, as its parent
 * reads it (hub presenters/sessions.ts `delegatePeekWords`): who it is, what
 * it does now, its last steps, its context, what it has made and its last
 * words. Agent-facing words: no screen draws them.
 */
export const delegatePeekWords = {
  /** Its turn runs and a call is open: the call, and how long it has run. */
  nowStep: (step: string, lasted: string) => `Now: ${step}, for ${lasted}.`,
  /** Its turn runs between calls: it thinks or writes. */
  nowThinking: (since: string) =>
    `Now: thinking or writing, its last step ${since}.`,
  /** No turn runs. */
  nowIdle: (lasted: string) => `Now: idle for ${lasted}.`,
  /** Its session has ended. */
  nowEnded: "Now: ended.",
  stepsHeading: (shown: number) =>
    `Last ${shown === 1 ? "step" : `${shown} steps`}, newest first:`,
  stepsNone: "Steps: none yet.",
  stepsUnread: (why: string) =>
    `Steps: its transcript could not be read: ${why}`,
  /** A step that ended in an error. */
  failed: "failed",
  /** A step whose result has not landed. */
  running: "running",
  /** More steps than the answer names. */
  stepsMore: (total: number) =>
    `${total} steps; detailed for all. Older steps: delegate_list with this target, response_format detailed and page 1, 2, … (50 a page, each with its time).`,
  /** The walk back through its transcript stopped before the page's steps. */
  stepsCut: (pages: number) =>
    `Only its newest ${pages} transcript pages were read; steps older than these are not counted.`,
  context: (tokens: string, share: string) =>
    `Context: ${tokens} tokens in its window${share}.`,
  contextShare: (percent: number, window: string) =>
    `, ${percent}% of its model's ${window}`,
  contextWindowUnknown: (why: string) =>
    `; its model's window is unknown (${why})`,
  contextNone:
    "Context: its harness has reported no figure for its window yet.",
  madeHeading: "Made so far:",
  commits: (count: number, subjects: readonly string[]) =>
    `- ${count === 1 ? "1 commit" : `${count} commits`} on no remote${subjects.length > 0 ? `: ${subjects.map((subject) => `“${subject}”`).join("; ")}` : ""}`,
  uncommitted: (count: number) =>
    `- ${count === 1 ? "1 uncommitted changed file" : `${count} uncommitted changed files`}`,
  outputs: (paths: readonly string[]) =>
    paths.length === 0
      ? "- nothing in $TMPDIR/outputs/"
      : `- in $TMPDIR/outputs/: ${paths.join(", ")}`,
  outputsUnread:
    "- its clone is closed, so its outputs folder and commit subjects were not read",
  handed: (links: readonly string[]) =>
    links.length === 0
      ? "- no artifact handed up to you"
      : `- handed up to you: ${links.join(", ")}`,
  madeUnread: (why: string) => `- its workspace could not be read: ${why}`,
  lastWords: (when: string, text: string) => `Last words (${when}): ${text}`,
  lastWordsNone: "Last words: none yet.",
};

/**
 * What a parent is told while its delegate waits on the person (hub
 * delegate-waits.ts): the ask the person alone holds, an ask it was handed
 * that went to the person, and how each ended. Its transcript draws each as
 * a note titled by its line (core injected.ts `delegateWaitNotice`); the
 * agent reads the body.
 */
export const delegateWaitWords = {
  /** The note's kind, as the parent's transcript draws it. */
  noteKind: "Delegate",
  /** The note's title, by what it tells. */
  waitsLine: (delegate: string) => `${delegate} waits on the person`,
  /**
   * A delegate's state in `delegate_list` while it waits on the person
   * itself (hub work-items.ts `onPerson`): `what`, each card as its link and
   * each ask as {@link listedAsk}.
   */
  listed: (what: string) => `waits on the person: ${what}`,
  /** One ask in {@link listed}, `what` quoted. */
  listedAsk: (what: string) => `the ask ${what}`,
  personsNowLine: (delegate: string) => `${delegate}'s ask is the person's now`,
  endedLine: (delegate: string) => `${delegate}'s ask to the person ended`,
  tookOverLine: (delegate: string) =>
    `The person took over ${delegate}'s browser`,
  /** An ask only the person answers: a browser to take over, or anything else. */
  browserHeld: (delegate: string, origin: string, reason: string) =>
    `Your delegate ${delegate} asked the person to take over its browser on ${origin}: “${reason}”.`,
  held: (delegate: string, what: string) =>
    `Your delegate ${delegate} asked the person: “${what}”.`,
  personOnly:
    "Only the person can answer it, so answer_delegate is refused for it. Its work waits on them: tell them if they may not have seen it, and plan around the wait. You hear here when it ends.",
  /** An ask handed to the parent that went to the person when the parent ended its rest unanswered. */
  personsNow: (delegate: string, request: string) =>
    `Your delegate ${delegate}'s ask (request ${request}) went unanswered while you were at rest, so it waits on the person now, on every screen and their phone. You may still answer it with answer_delegate. You hear here when it ends.`,
  /** How the ask ended, after what it asked. */
  ended: (delegate: string, what: string, how: string) =>
    `Your delegate ${delegate}'s ask “${what}” ended: ${how}`,
  approved: (by: string) => `${by} approved it.`,
  denied: (by: string) => `${by} denied it.`,
  answered: (by: string) =>
    `${by} answered it; your delegate reads the answer.`,
  declined: (by: string) =>
    `${by} declined it; your delegate was told their words.`,
  /** Who answered, by where: the person on a named device, the person, another session. */
  thePersonOn: (device: string) => `the person, on ${device},`,
  thePerson: "the person",
  /** An approval its delegate had open as it entered Full Send. */
  fullSend: "Full Send",
  harness: "it was answered in its session's own interface.",
  tookOver:
    "the person took over its browser. Its call waits until they hand it back; you hear here when they do.",
  handedBack: (origin: string | null) =>
    `the person handed its browser back${origin ? ` on ${origin}` : ""}, and your delegate goes on.`,
  connected: "the person signed the hub in, and your delegate goes on.",
  withdrawn: "it was withdrawn before anyone answered it.",
  /**
   * An ask the hub closed on its own because it no longer applied (`why`:
   * the hub's reason, a sentence with no stop): what the parent weighs in
   * deciding whether to ask or propose again from where things stand now.
   */
  closed: (why: string) =>
    `CawCo closed it before anyone answered, as it no longer applies: ${why}.`,
  /** An ask whose call ended with the hub that held it, told as the next hub starts. */
  endedWithHub:
    "it ended with a hub restart, and your delegate's call was refused; nobody answered it.",
  /** Settled by the hub with no answer it can name (a move whose job ended). */
  settled: "it no longer waits on anyone.",
  /** A parent's answer_delegate to an ask only the person answers, refused. */
  refused:
    "That ask waits on the person; only they answer it. Tell them, or plan around the wait.",
};
