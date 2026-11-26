/**
 * What a reader says of a message it refuses as it arrives off a socket: a
 * value a stored type's schema did not read (core stored-as.ts), and a
 * message from the hub that is not one the hub sends a machine, or whose
 * payload is not its verb's (core machine-inbound.ts `readMachineInbound`),
 * or one a page reads off its socket (the dashboard's hub/hub-message.ts).
 * A refused message ran nothing.
 */
export const wireReadWords = {
  /** A value a stored type's schema did not read, by the fields it broke. */
  notStored: (what: string, fields: string) => `is not ${what} (${fields})`,
  /** A message from the hub that is no envelope. */
  notEnvelope: (why: string) =>
    `A message from the hub was refused as it reached this machine: it is not an envelope (${why}). Nothing ran.`,
  /** A message from the hub under a verb the hub never sends a machine. */
  unknownVerb: (verb: string) =>
    `A message from the hub was refused as it reached this machine: the hub sends a machine no "${verb}". Nothing ran.`,
  /** A message from the hub whose payload is not its verb's. */
  payloadRefused: (verb: string, why: string) =>
    `The hub's ${verb} was refused as it reached this machine: its payload is not a ${verb} (${why}). Nothing ran.`,
  /** A message off a page's socket that is not the `what` it names itself, said in the page's console and left untaken. */
  pageRefused: (what: string, why: string) =>
    `[hub] a ${what} from the hub was not taken: it is not one (${why})`,
  /**
   * A line off a pi host's NDJSON stream (agent pi-sessiond.ts, pi-host.ts)
   * that is no command (`command`, read by the host) or no event (`event`,
   * read by its agent) of the host's protocol, by the fields it broke.
   */
  piHostRefused: (what: "command" | "event", why: string) =>
    `A pi host ${what} was refused as it was read: it is not one (${why})`,
  /** The same of an Antigravity host's line (agent agy-sessiond.ts, agy-host.ts). */
  agyHostRefused: (what: "command" | "event", why: string) =>
    `An Antigravity host ${what} was refused as it was read: it is not one (${why})`,
  /** A pi host's frame whose message is not a session's message (core session-messages.ts `isNeutralMessage`). */
  notNeutralMessage: "is not a session's message",
  /** What a payload is meant to be, as a refusal of one that is not names it. */
  meant: {
    attachment: "a text attachment",
    failureKind: "a failure's kind",
    image: "a turn's image",
    fs: "a file request",
    heartbeat: "a beat's answer",
    launch: "a launch's grant",
    permission: "a permission's answer",
    register: "a register's answer",
    send: "a send",
    spawn: "a start",
    stop: "a stop",
  },
} as const;
