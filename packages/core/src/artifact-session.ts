/** The socket an artifact's own tab follows its session on. */

/**
 * The socket an artifact's own tab (the dashboard's `/artifact/<id>`) follows
 * the session that made it on, `<path><instanceId>/<artifactId>`: nothing
 * else of the fleet reaches that tab. It also carries the tab's `fs`
 * envelopes (a page's place picker browsing a machine's folders), answered on
 * it as on the dashboard's socket.
 */
export const ARTIFACT_SESSION_PATH = "/ws/artifact-session/";

/**
 * The codes the hub closes an artifact tab's socket with when it refuses it,
 * the close's reason being the sentence the tab shows. A tab opens no socket
 * again after one: what refused it stays true until the person acts.
 */
export const ARTIFACT_SESSION_REFUSED = {
  /** The device is not paired, or its pairing was removed. */
  unpaired: 4401,
  /** The artifact was deleted, or the session that made it was. */
  gone: 4404,
} as const;
