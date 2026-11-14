/**
 * What the hub says when a session carries out the person's pick on a
 * decision card about memory notes (hub memory.ts, `memory_propose` with
 * `card` and `drop`): its refusals, the closing of a proposal the pick
 * settled, and the line in the project's conversation. The calling agent
 * reads the refusals; the person reads the closing line and the notice.
 */
export const memoryCardWords = {
  /** `card` that names no card. */
  unfit: (ref: string) =>
    `${ref} names no card: give it as <page>#<card>, the page's name and the card's id.`,
  /** A page with no record in the caller's project. */
  noRecord: (page: string) =>
    `${page} has no record in this project: the page is not decided yet, or it is another project's.`,
  /** A card the page's record does not hold. */
  notOnPage: (card: string, page: string) =>
    `${page} has no card ${card} in its record.`,
  /** A card the person left open. */
  open: (ref: string) =>
    `Nothing is picked on ${ref}: carry out a card only once the person has picked on it.`,
  /** A card another member of Who decides settled. */
  settled: (ref: string, name: string) =>
    `${ref} was settled by ${name}, not picked by the person: only his own pick settles notes without asking him. Propose with ask: true, or wait for his pick.`,
  /** `card` with `ask: true`. */
  withAsk:
    "card carries out the person's pick, so there is nothing to ask him: leave ask out.",
  /** `card` from the curator's run. */
  curator:
    "The curator proposes for the person; a card's pick is carried out by the session that asked it.",
  /** `drop` without `card`. */
  dropWithoutCard:
    "drop withdraws notes only on the person's pick: name the card it comes from as card.",
  /** A note both cited and dropped. */
  citedAndDropped: (ids: string) =>
    `${ids} cannot be both cited and dropped: keep each note one way.`,
  /** Neither files nor notes to drop, or notes cited with no files to write them. */
  nothing:
    "Give the files to write, citing the notes they rest on; with card, notes to drop alone need no files.",
  /** A proposal the person is answering at this moment. */
  answering: (id: string) =>
    `${id} holds one of these notes and the person is answering it now; call again once it is answered.`,
  /** Why the hub closed a proposal the pick settled: kept in the commit, said where the ask ends. */
  closed: (ref: string) =>
    `the person's pick on ${ref} settled the notes it held`,
  /** What the proposing session reads when its proposal closed so. */
  closedTold: (id: string, ref: string) =>
    `Your proposal ${id} is closed: the person's pick on ${ref} settled notes it held. Nothing of it was written, and it no longer waits on him. Its other notes are back in the inbox; cite them again if the change is still wanted.`,
  /** The person's line of that notice, where the closed card stood. */
  closedLine: (ref: string) => `Proposal closed: settled by the pick on ${ref}`,
  /** Why a fact left for the archive: a dropped note was its only source. */
  archived: (day: string, id: string, ref: string) =>
    `Withdrawn ${day}: ${id} was their only source, dropped on the pick on ${ref}`,
  /** The note in the project's conversation. */
  noticeTitle: (who: string, ref: string) =>
    `${who} carried out the pick on ${ref}`,
} as const;
