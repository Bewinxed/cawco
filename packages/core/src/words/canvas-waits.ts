/**
 * What a canvas write says when the screen that draws it went quiet: the
 * hub machine's page opened on it and never joined its doc, or no screen
 * drew the write and none was heard for the fleet's quiet spell (core
 * bounded.ts `QUIET_MS`). Read by the session that wrote it.
 */
export const canvasWaitWords = {
  /** The hub machine's page on the canvas went quiet before it joined the canvas's doc. */
  pageUnjoined: (quietFor: number) =>
    `The canvas page went quiet for ${quietFor} s before it joined the canvas, so it was closed.`,
  /** The hub's machine answered the open, yet no screen of the canvas stands joined. */
  screenUnjoined: (name: string) =>
    `The canvas ${name} wasn't drawn: the hub's machine opened it, but its page didn't join the canvas.`,
  /** No screen drew the write, and none was heard while it waited. */
  undrawn: (quietFor: number) =>
    `The canvas wasn't changed: no screen drew it, and none was heard for ${quietFor} s. Try again.`,
};
