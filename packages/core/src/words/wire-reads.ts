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
  /** What a payload is meant to be, as a refusal of one that is not names it. */
  meant: {
    fs: "a file request",
    heartbeat: "a beat's answer",
    launch: "a launch's grant",
    register: "a register's answer",
    send: "a send",
    spawn: "a start",
    stop: "a stop",
  },
} as const;
