/**
 * What the hub's log says of the person (hub notifications.ts, push.ts):
 * where they are and why, each return, the restart's reading back, and an
 * item held at their desk. One source, so a probe reading the log finds
 * these words by import, never by a copy.
 */
export const presenceLogWords = {
  /** Every line about the person opens with this. */
  subject: "[presence] the person",
  /** The person changed: their state, where, and why. */
  turned: (state: string, why: string) =>
    `[presence] the person: ${state}: ${why}`,
  /** The person as the hub reads them at its start, before any device beats again. */
  atStart: (state: string, why: string) =>
    `[presence] the person at the hub's start: ${state}: ${why}`,
  /** Here, on a chat, by its id. */
  hereOn: (chat: string) => `here, on ${chat}`,
  /** Here, on no chat: a blurred or hidden tab, another app, another machine. */
  elsewhere: "here, elsewhere",
  /** Away, since when (ISO), or since never. */
  awaySince: (since: string) => `away since ${since}`,
  /** Appear away. */
  appearingAway: (since: string) => `away (Appear away, since ${since})`,
  /** The person's input after an away stretch: a return. */
  back: (since: string) =>
    `[presence] the person is back, after away since ${since}: their next message to each session carries its recap`,
  /** The restart read each device's last word back. */
  readBack: (count: number, seconds: number) =>
    `[presence] read back ${count} device(s) as the hub last heard them ${seconds}s ago`,
  /** A push held at the desk the person is at, shown on a tab there. */
  heldAtDesk: (collapseId: string) =>
    `push ${collapseId}: held, the person is at a desk`,
};
