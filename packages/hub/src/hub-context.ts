/**
 * What the hub's route families read of the closure `createServer` builds:
 * its services, its parameters and the functions that say what a machine or
 * a session is called. A family's plugin (`routes/<family>.ts`) takes its
 * own `Pick` of this, so what it reads is named at its signature instead
 * of being every name in the closure's scope.
 *
 * Its members are the closure's own (closure-context.ts `ClosureContext`)
 * and what each section that reads the context makes, named by that
 * section's factory; those sections read ClosureContext and each other's
 * factories, never this file, which imports them.
 *
 * Built by {@link hubContextOf} at the top of the closure, before its
 * statements have made these: each member is read when asked for, once the
 * closure has run, as a closure's names are.
 */

import type { createAccountCarry } from "./account-carry";
import type { createAccountProbes } from "./account-probes";
import type { createAccountSignin } from "./account-signin";
import type { createArtifactPages } from "./artifact-pages";
import type { createAskRouting } from "./ask-routing";
import type { ClosureContext } from "./closure-context";
import type { createCompaction } from "./compaction";
import type { createContinuations } from "./continuations";
import type { createCutTurns } from "./cut-turns";
import type { createLaunches } from "./launches";
import type { createLimitMoves } from "./limit-moves";
import type { createLoginMoves } from "./login-moves";
import type { createMachineCalls } from "./machine-calls";
import type { createMachineCommands } from "./machine-commands";
import type { createRelayControl } from "./relay-control";
import type { createSends } from "./sends";
import type { createSessionNotes } from "./session-notes";
import type { createStartHolds } from "./start-holds";

export interface HubContext
  extends
    ClosureContext,
    Pick<
      ReturnType<typeof createAccountCarry>,
      "claudeSessionsOn" | "readLaunchDirs"
    >,
    Pick<
      ReturnType<typeof createAccountProbes>,
      "freshAccountReports" | "probeAccount"
    >,
    Pick<
      ReturnType<typeof createAccountSignin>,
      "homeStamps" | "unknownAccountsOf"
    >,
    Pick<ReturnType<typeof createArtifactPages>, "endPreviews" | "foldersSeen">,
    Pick<
      ReturnType<typeof createAskRouting>,
      "askRefusal" | "delegateAskParent" | "settleRefusal"
    >,
    Pick<
      ReturnType<typeof createCompaction>,
      | "answeredSinceCompaction"
      | "compactionTurnEnded"
      | "fileAtThreshold"
      | "limitAnswerFailed"
      | "observeCompaction"
      | "recoverCompaction"
    >,
    Pick<
      ReturnType<typeof createContinuations>,
      "advanceContinuation" | "continuationsWhole" | "machineFor"
    >,
    Pick<
      ReturnType<typeof createCutTurns>,
      | "diedOnSignal"
      | "goneWithProcess"
      | "keepTasks"
      | "noteMachineLine"
      | "resumeCutTurn"
    >,
    Pick<
      ReturnType<typeof createLaunches>,
      | "bounded"
      | "effortUnasked"
      | "launchSettled"
      | "launchingOn"
      | "noteSessionSettings"
      | "settleLaunchesOn"
    >,
    Pick<
      ReturnType<typeof createLimitMoves>,
      | "landSessionDir"
      | "moveOwedAtRefusal"
      | "takeCredentialTurn"
      | "takeUpMovesOn"
    >,
    Pick<ReturnType<typeof createLoginMoves>, "answerBorrow" | "sleepFinished">,
    Pick<
      ReturnType<typeof createMachineCalls>,
      "handAgain" | "lateAnswer" | "logUnroutedReply" | "resendHeld" | "waiting"
    >,
    Pick<ReturnType<typeof createMachineCommands>, "learnCheckout">,
    Pick<
      ReturnType<typeof createRelayControl>,
      "allowGranted" | "withdrawUnshown"
    >,
    Pick<
      ReturnType<typeof createSends>,
      | "decideCustody"
      | "deliverSend"
      | "deliverToSession"
      | "interruptedTurns"
      | "notesOnly"
      | "observeTurn"
      | "takeBack"
      | "takeSendSignal"
      | "takeTaken"
      | "turnUnderWay"
      | "turnsWritten"
    >,
    Pick<
      ReturnType<typeof createSessionNotes>,
      "endLeak" | "tellContainers" | "tellLeak"
    >,
    Pick<
      ReturnType<typeof createStartHolds>,
      "flushOwedStarts" | "sendSpawn"
    > {}

/** Each member's reader, so a member made later in the closure is read when it is asked for. */
type Readers = { [Member in keyof HubContext]: () => HubContext[Member] };

/** A context whose members are read through {@link Readers}, each when it is asked for. */
export const hubContextOf = (readers: Readers): HubContext => {
  const context = {} as HubContext;
  for (const member of Object.keys(readers) as (keyof HubContext)[]) {
    Object.defineProperty(context, member, {
      enumerable: true,
      get: readers[member],
    });
  }
  return context;
};
