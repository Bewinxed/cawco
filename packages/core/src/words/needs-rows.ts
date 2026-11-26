/**
 * What a Needs you row says of a conversation with things waiting on the
 * person in it (the dashboard's ConversationRow): how many.
 */
export const needsRowWords = {
  /** How many things wait on the person in one conversation, said when more than one does. */
  waiting: (count: number) => `${count} waiting`,
};
