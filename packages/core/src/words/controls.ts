/**
 * What a machine says of a control it refuses as it arrives (core
 * control-args.ts `readControl`, `readCall`): a payload that is no control,
 * arguments that are not the control's own, and what each argument's schema
 * says is missing. A refused control ran nothing.
 */
export const controlWords = {
  /** A control's arguments that are not its own, with what is wrong with them. */
  argumentsRefused: (method: string, why: string) =>
    `${method} was refused before it ran: its arguments are not its own (${why}). Nothing ran.`,
  /** A `control` envelope whose payload is no control. */
  payloadRefused: (why: string) =>
    `A control was refused before it ran: its payload is not a control (${why}). Nothing ran.`,
  /** A machine's answer to a call that is not the call's reply, by the fields that broke it. */
  replyMalformed: (call: string, fields: string) =>
    `The machine answered ${call} with something that is not its answer (${fields}). Nothing it said was taken; ask again.`,
  /** What an argument or an answer is meant to be, as a refusal of one that is not names it. */
  meant: {
    discardHolds: "what a discard would take",
    folderListing: "a folder's listing",
    forgeWrite: "a forge write",
    lentSignIn: "a lent sign-in",
    mcpServers: "a session's MCP servers",
    moveSnapshot: "a move's snapshot",
    permissionAnswer: "a permission's answer",
    storedRun: "what a session ran with",
    updatePolicy: "an update policy",
  },
  /** A setting's control that names no setting: refused, so the session keeps the one it has. */
  noSetting: (setting: string) => `names no ${setting} to set`,
  empty: "is empty",
  noSend: "names no send to withdraw",
  noCommand: "names no command to run",
  notAbsolute: "is not an absolute path on the machine",
  notCommit: "is not a full commit id",
  notUrl: "is not a URL",
  notSession: "is not a session id",
  notWorkspace: "is not a workspace id",
  noTree: "names no tree to let go",
  noBrowserKey: "names no browser",
  noSourceKey: "names no source key",
  noCredential: "Session credential is missing.",
} as const;
