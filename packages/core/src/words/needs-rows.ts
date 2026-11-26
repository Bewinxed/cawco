/**
 * What a Needs you row says of a piece of stopped work the hub grouped
 * (hub needs-rows.ts, the dashboard's NeedsWork): a task its questions
 * stand under, when the task itself is not waiting on the person.
 */
export const needsRowWords = {
  /** A task whose questions wait on the person while it is in `stage`: its row's line. */
  taskQuestions: (stage: string) => `Stage: ${stage}`,
};
