/**
 * What a task's review says (the dashboard's TaskReview, on the task's
 * sheet): what is under review, the note you leave,
 * and where Approve and Send back take the task, with who takes it up.
 */
export const taskReviewWords = {
  /** The line naming the commits its words say landed, before them. */
  landed: "Landed",
  /** No session has worked on the task: its own words are the stage. */
  noSession: "No session has worked on it.",
  /** No session handed in a result, and the task has no words of its own. */
  nothingToReview:
    "No session handed in a result, and the task has no description. Its history says how it got here.",
  /** The note field under the decision, its label and placeholder. */
  note: "What should change",
  /** Under the note: where it goes. */
  noteGoes: "Goes on the task as your comment. The task stays where it is.",
  /** Leaves the note on the task, nothing else. */
  comment: "Comment",
  commenting: "Commenting…",
  approve: (stage: string): string => `Approve → ${stage}`,
  approving: "Approving…",
  sendBack: (stage: string): string => `Send back → ${stage}`,
  sendingBack: "Sending back…",
  /** Who takes the task up once it is sent back, by the hub's `sendBack.by`. */
  backToAttempt: "Its session carries on, your note with it.",
  backToStart: "A new session starts on it, your note with it.",
  backToNobody: (stage: string): string =>
    `Nobody is on this yet. In ${stage} it waits until someone starts it.`,
};

/**
 * What a task's sheet says of the decision cards it waits on (TaskNeeds on
 * Details, TaskReview's result band): yours while not picked, and once
 * picked, what was picked.
 */
export const taskNeedsWords = {
  /** The head over the cards it waits on that are not picked yet. */
  picksHead: (count: number): string =>
    count === 1 ? "Waits on your pick" : "Waits on your picks",
  /** Each card's act: open it where it is picked. */
  pick: "Pick",
  pickOn: (question: string): string => `Pick: ${question}`,
  /** Under them: what a pick does. */
  picksLine: "It starts once you pick.",
  /** A settled card wait in the review: what it waited on, before its chip. */
  waited: "Waited on your pick:",
};
