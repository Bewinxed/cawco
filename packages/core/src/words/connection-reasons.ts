/**
 * The reasons the hub puts on a connection's row (`connections.reason`),
 * which Configure › Connections shows under the row in place of its own
 * words, on the dashboard and in the native app alike: the hub's words,
 * read from the row, so the app's copy of the shared words holds none of
 * them.
 */
export const connectionReasons = {
  /** It is to be looked at (its tools listed), which says its state. */
  notLookedAt: "Not looked at yet.",
  /**
   * What the connection held (its key, its sign-in, its app's
   * registration) was stored before an update in a form that did not read
   * as it was moved (hub db/sealed-facts-unread.ts): nothing of it is sent,
   * and it needs connecting again, the way its row offers (its key, its
   * sign-in, its app; a gh connection removed and connected again).
   */
  savedUnread:
    "Its saved key or sign-in didn't read after the update, so nothing is sent with it. Connect it again.",
} as const;
