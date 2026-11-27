/**
 * What `artifact_read`'s picture says when the page it draws was let go:
 * it went quiet (no request, no answer, no paint for the fleet's quiet
 * spell, core bounded.ts `QUIET_MS`) or its browser closed (agent
 * artifact-picture.ts `drawPage`).
 */
export const pictureWaitWords = {
  /** The page's load, its server's wake included, went quiet or lost its browser. */
  notLoaded: (name: string, quietFor: string, closed: boolean) =>
    closed
      ? `${name} wasn't drawn: the browser drawing it closed while its page loaded.`
      : `${name} wasn't drawn: its page went quiet for ${quietFor} before it loaded, its server's wake included.`,
  /** The screenshot went quiet or lost its browser. */
  notShot: (name: string, quietFor: string, closed: boolean) =>
    closed
      ? `${name} wasn't drawn: the browser drawing it closed while it took the picture.`
      : `${name} wasn't drawn: its page went quiet for ${quietFor} while the picture was taken.`,
};
