/**
 * A work item's words: what the hub's report and Find say of how it ended.
 */
export const workWords = {
  /** A delegate dismissed, refused by the hub: what came of it, said after the hub's sentence (`hubRefusal`). */
  notDismissedThen: "so the delegate was not dismissed.",
  /** A delegate retried, refused by the hub: what came of it (`hubRefusal`). */
  notRetriedThen: "so the delegate was not retried.",
  /** A work item whose commits the hub pushed to `base`. */
  landedOn: (base: string) => `Landed on ${base}`,
  /**
   * A host-scope delegation refused (hub work-items.ts `hostProblem`,
   * `hostFolderProblem`): each `line` names a field and why it cannot go.
   */
  hostRefused: (lines: readonly string[]) =>
    `Host scope refuses ${lines.length === 1 ? "this" : "these"}:\n${lines.map((line) => `- ${line}`).join("\n")}`,
  /**
   * What a delegate is told of its `$TMPDIR/outputs/` (core injected.ts
   * `scratchOutputsLine`): copied to `assets`, its item's folder in its
   * project's folder.
   */
  scratchOutputsCopied: (assets: string) =>
    `Files you leave in $TMPDIR/outputs/ are copied into the project's folder at ${assets}/ (each at its path under outputs/) when you finish and before this workspace goes; the hub's report names each path for your parent, and the project's delegates read them there with folder_read.`,
  /**
   * What a host-scope delegate is told of its `$TMPDIR/outputs/` (core
   * injected.ts `withHostLine`): its one way to hand a file of its machine
   * back, copied to `assets` as it finishes. Placeholder words, for a copy
   * pass.
   */
  hostOutputsCopied: (assets: string) =>
    `Your $TMPDIR is a scratch dir of your own on this machine. Files you leave in $TMPDIR/outputs/ are copied into the project's folder at ${assets}/ (each at its path under outputs/) when you finish: the one way a file of this machine reaches your parent, wherever it runs. The hub's report names each path for your parent, and the project's delegates read them there with folder_read.`,
  /** A host-scope delegate's scratch dir asked for by a name that is no workspace id (agent host-scratch.ts): nothing is read, made or removed. */
  hostScratchUnnamed: "a host scratch dir is named by its workspace's id",
  /**
   * How a brief or a handoff names the files sent with it (core injected.ts
   * `withInputsLine`): the folder they landed in, as the receiver names it,
   * then each.
   */
  inputsIn: (folder: string) =>
    `Files sent with this message are in ${folder}: `,
  /**
   * One entry of a message's list of inputs: a file by its name, a folder
   * once by its name and how many files it lands as, and where it was read
   * when that is known (core injected.ts `inputsOnce`).
   */
  inputNamed: ({
    files,
    from,
    name,
  }: {
    files: number;
    from?: string;
    name: string;
  }) => {
    const notes = [
      ...(files > 1 ? [`${files} files`] : []),
      ...(from ? [`from ${from}`] : []),
    ];
    return notes.length > 0 ? `${name} (${notes.join(", ")})` : name;
  },
  /**
   * A handoff's inputs refused for whom they would go to (hub work-items.ts
   * `handOff`): files go only where handoff's own relations reach.
   */
  inputsNotTheirs: (receiver: string) =>
    `Inputs go only to your parent, a session you delegated or started, or your project's conversation; ${receiver} is none of them. Hand off without inputs.`,
  /**
   * The one refusal of inputs for their size (hub work-items.ts
   * `handInto`): together they need more than the disk their inputs folder
   * is on has free, asked before the first is written. `needed` and `free`
   * as core `humanSize` says them; `machine` as the fleet names it. It
   * reaches the caller under the hub's own `inputs: ` (work-items.ts
   * `inputsLine`).
   */
  inputsNoRoom: (needed: string, free: string, machine: string) =>
    `they come to ${needed}, and the disk they land on in ${machine} has ${free} free; free space there, or hand fewer files`,
  /**
   * An input that changed size between being named and being read (agent
   * inputs.ts `readInputs`): what was read of it would not be the file.
   */
  inputChanged: (named: string, was: number, now: number) =>
    `${named} was ${was} bytes when it was named and is ${now} now; hand it again once it stops changing`,
  /**
   * Inputs that failed partway across (hub work-items.ts `handInto`): what
   * had landed was taken out again, so none is presented as delivered.
   */
  inputsCleared: (why: string) =>
    `${why} What of them had landed was removed, so none of them was delivered.`,
  /** An item's outputs past the most one item declares (hub work-items.ts `outputsOf`). */
  outputsTooMany: (named: number, limit: number) =>
    `outputs names ${named} files; one item declares ${limit} at most.`,
  /**
   * A machine's ask of where a project's large files live, refused: it holds
   * no place of the project, a checkout or a delegate workspace (hub
   * server.ts `lfsMachineProject`). `machine` as the fleet names it: the
   * words are read off that machine, on the board and in a parent's report.
   */
  lfsNoPlace: (machine: string, project: string) =>
    `${machine} holds no place of ${project}, neither a checkout nor a workspace.`,
  /** What a delegate of no project is told of its `$TMPDIR/outputs/`: nothing there is collected. */
  scratchOutputsNoProject:
    "This item belongs to no project, so nothing in $TMPDIR is collected: what your parent needs goes in your report or a commit.",
  /** The heading of a report's merge checks section, over its checks' lines. */
  gateHeading: "Merge checks, run by the hub:",
  /**
   * A start refused by its caller's may-start list (core `MayStart`; hub
   * work-items.ts `mayStartRefusal`), before anything spawns: a leaf that may
   * start nothing, or none of what it asked for.
   */
  leafRefusal:
    "This session is a leaf: it may not delegate or start sessions. Do the work yourself, or handoff to your parent session.",
  /** `type`: the caller's own delegate type, when it has one. */
  mayStartOnly: (type: string | null, allowed: readonly string[]) =>
    `${type ? `This session's type ${type}` : "This session"} may start only: ${allowed.join(", ")}.`,
  /** What a delegate is told it may start, as `delegate` answers its parent. */
  startsDelegates: (allowed: readonly string[]) => {
    if (allowed.includes("any")) {
      return "It may spawn delegates of its own.";
    }
    return allowed.length === 0
      ? "It is a leaf: it cannot delegate further."
      : `It is a leaf that may start only: ${allowed.join(", ")}.`;
  },
  /**
   * A delegate whose start the hub holds while its machine takes none (hub
   * server.ts `startHold`): `why` is the hold's sentence, "Omars-MacBook-Pro
   * is installing an update". The start goes by itself once the hold ends
   * (`flushOwedStarts`). `heldStart` opens `delegate`'s answer in place of
   * "Started …:"; `heldStartListed` is its fact on `delegate_list`'s line.
   */
  heldStart: (link: string, label: string, why: string) =>
    `Held ${link}, ${label}: ${why}, so the hub holds its start and starts it once that is over. It is `,
  heldStartListed: (why: string) =>
    `start held: ${why}; it starts once that is over`,
  /** When a parent hears from its delegate, as `delegate` and a continue answer it. */
  reportArrives:
    "Its report arrives once it calls finish_item and its work passes the hub's merge checks; the report quotes the commands it ran.",
  /**
   * The title of your notice of a blocked item: held because its session
   * slept past its limit (hub work-items.ts `blockAsleep`), or because what
   * its session starts with is missing (`blockIfMissing`).
   */
  blockedTitle: (title: string) => `${title} is blocked`,
  /**
   * What a session is told of each background task a move, a restart or a
   * kill ended with its process (hub server.ts `endedByMoveWords`,
   * `cutTasksWords`).
   */
  interrupted:
    "Each was interrupted, its outcome unknown: it may or may not have finished what it started.",
  /** Why an item is blocked: its delegate type was deleted (hub work-items.ts `blockIfMissing`). */
  missingType: (name: string) =>
    `Its delegate type “${name}” was deleted, so its session isn't started again without it. Put the type back, or stop the item.`,
  /** Why an item is blocked: its machine left the fleet. */
  missingMachine: (name: string) =>
    `Its machine ${name} is no longer in the fleet, so its session can't start again. Add the machine back, or stop the item.`,
  /** Why an item is blocked: the account its session runs on is gone. */
  missingAccount: (name: string) =>
    `The account it runs on (${name}) is gone, so its session isn't started again on another one. Add the account back, or stop the item.`,
  /** How long a session with no minutes budget may sleep and be woken. */
  aDay: "a day",
  /** The limit of an item with a minutes budget. */
  budgetMinutes: (minutes: number) => `its budget's ${minutes} minutes`,
  /** Why it is held: since when it sleeps (`since`, "2026-09-15 10:00 UTC") and the limit it slept past. */
  heldAsleep: (since: string, limit: string) =>
    `Its session has been asleep since ${since}, longer than ${limit}, so the hub no longer wakes it by itself. Write to it to carry the work on, or stop it.`,
  /** Where a retired workspace's commits went (hub workspaces.ts `carryNotice`): its carry's folder on its machine. */
  carriedTo: (carry: string) =>
    `the commits it held on no remote were saved to the carry ${carry}`,
  /**
   * The notice to the session that started a workspace's work, as it
   * retires with its commits in a carry (hub workspaces.ts `carryNotice`):
   * `ws` its handle, `title` its latest item's.
   */
  carriedNotice: (
    ws: string,
    title: string,
    carry: string,
    machine: string,
    path: string
  ) =>
    `Workspace ${ws} of “${title}” retired: its work lands none, so ${workWords.carriedTo(carry)} on ${machine} (its README says how to take each part back), and its clone ${path} is gone. A handoff or a follow-up to it cuts it again with those commits.`,
  /** That notice's headline. */
  carriedHeadline: (ws: string, carry: string, machine: string) =>
    `Workspace ${ws} retired; its commits are in the carry ${carry} on ${machine}.`,
  /**
   * What a held workspace whose clone CawCo did not read is (core
   * `WorkspaceHolding.refused`, `refused` its machine's words: "<clone>/.git/config
   * sets <key>, which CawCo does not run git under"), and the ways on: the
   * session continuing it, or the person on its machine, undoes that in the
   * clone, and it retires as that work ends, or archives when asked again.
   * Discarding it as it is cannot: nothing of it can be carried unread.
   */
  refusedHeld: (
    ws: string,
    machine: string,
    refused: string,
    size: string,
    path: string
  ) =>
    `Workspace ${ws} on ${machine} was not archived and nothing was deleted: ${refused}, so CawCo could not read what its clone holds (${size} at ${path}). It is held. Continue it (delegate with workspace: "${ws}") and have that session undo that in its clone, and it retires as that work ends; or undo it yourself on ${machine}, then archive or discard it again.`,
  /** The notice to the session that started its work as it becomes held so ({@link workWords.refusedHeld}): `title` its latest item's. */
  refusedNotice: (
    ws: string,
    title: string,
    machine: string,
    refused: string,
    size: string,
    path: string
  ) =>
    `Workspace ${ws} of “${title}” is yours to decide. ${workWords.refusedHeld(ws, machine, refused, size, path)}`,
  /** That notice's headline. */
  refusedHeadline: (ws: string) =>
    `Workspace ${ws} is held: CawCo did not read its clone.`,
  /** `stop_delegate`'s word on a stopped item's workspace that holds work (`held`, in words): held, its stopper's to decide. */
  stopHolds: (ws: string, held: string) =>
    `Its workspace ${ws} holds ${held}, so it is held, not retired, once its session ends.`,
  /** The two ways out of a held workspace, as `stop_delegate` names them. */
  holdWays: (ws: string) =>
    `It is yours to decide: continue it (handoff to it, or delegate(..., workspace: "${ws}"): either continues its own session), or discard it (discard_workspace with workspace: "${ws}"), which saves that work to a carry in ~/.cawco/carries on its machine and removes the clone.`,
  /** `stop_delegate`'s word on a stopped item's workspace that holds nothing that is nowhere else. */
  stopRetires: (ws: string) =>
    `Its workspace ${ws} holds nothing that is nowhere else, so it retires once its session ends; a handoff to it cuts it again where it was.`,
  /**
   * `stop_delegate`'s word on a stopped item's workspace that holds nothing
   * that is nowhere else but serves `links` (each an artifact by its link,
   * hub work-items.ts `serving`): it stays while it serves them, never
   * retiring under them.
   */
  stopServes: (ws: string, links: readonly string[]) =>
    `Its workspace ${ws} holds nothing that is nowhere else but serves ${links.join(", ")}, so it stays while it does; discard_workspace with workspace: "${ws}" retires it.`,
  /** `stop_delegate`'s word when what the workspace holds could not be read as it stopped. */
  stopUnread: (ws: string, error: string) =>
    `What its workspace ${ws} holds could not be read now (${error}): if it holds work that is nowhere else it is held as its session ends, and you are told then.`,
  /** The hub's log line for a settle whose close failed (hub workspaces.ts `settle`): `reason` its machine's words. */
  notRetired: (reason: string) => `not retired: ${reason}`,
  /** What follows {@link workWords.notRetired} in that line: when the sweep tries it again. */
  retriedIn: (minutes: number) =>
    `Tried again in ${minutes} min, then less often.`,
  /** The hub's log line once a settle has failed `count` times in a row: said once, as its notice goes. */
  stillNotRetired: (count: number, reason: string) =>
    `still not retired after ${count} tries, so its session is told: ${reason}`,
  /** The notice to the session that started its work once its retirement keeps failing: `title` its latest item's. */
  notRetiredNotice: (
    ws: string,
    title: string,
    machine: string,
    count: number,
    reason: string
  ) =>
    `Workspace ${ws} of “${title}” on ${machine} could not be retired ${count} times in a row, and stays as it is: ${reason} CawCo tries again less often, up to once an hour, and does not tell you again. Archive or discard it (discard_workspace with workspace: "${ws}") once the cause is fixed.`,
  /** That notice's headline. */
  notRetiredHeadline: (ws: string) => `Workspace ${ws} could not be retired.`,
  /**
   * `discard_workspace` refused (hub work-items.ts `discardFor`) while what
   * the workspace serves waits on the person: `ws` its handle, `links` each
   * waiting artifact by its link. The words name each, then the session's
   * two ways forward: hand it up again from another workspace, or ask the
   * person to decide by calling discard_workspace again with `ask: true`
   * and a `reason`, which waits on his approval and, approved, discards it
   * anyway.
   */
  servesWaiting: (ws: string, links: readonly string[]) =>
    links.length === 1
      ? `Workspace ${ws} was not discarded: ${links[0]} still waits on the person. Hand it up again from a workspace that runs (artifact_create under the same name, from your own or a delegate's) and discard this one again; or call discard_workspace again with ask: true and a reason, and the person decides: approved, the workspace is discarded anyway.`
      : `Workspace ${ws} was not discarded: ${links.join(", ")} still wait on the person. Hand each up again from a workspace that runs (artifact_create under the same name, from your own or a delegate's) and discard this one again; or call discard_workspace again with ask: true and a reason, and the person decides: approved, the workspace is discarded anyway.`,
  /**
   * A workspace's archive asked by the person (`POST
   * /api/workspaces/:id/archive`, the dashboard and the app) and refused
   * because he didn't confirm what still waits on him: `ws`, `links` as
   * above. The dashboard's confirm names them first and sends the archive
   * confirmed, so this reaches a client that doesn't.
   */
  servesWaitingConfirm: (ws: string, links: readonly string[]) =>
    links.length === 1
      ? `Workspace ${ws} was not archived: ${links[0]} still waits on you there, and goes with it. Confirm to archive it anyway.`
      : `Workspace ${ws} was not archived: ${links.join(", ")} still wait on you there, and go with it. Confirm to archive it anyway.`,
  /**
   * The line an approval of `discard_workspace` shows the person (its ask's
   * `waiting`, hub server.ts): what still waits on him there, `links` each
   * by its link.
   */
  discardAskWaiting: (links: readonly string[]) =>
    links.length === 1
      ? `${links[0]} still waits on you and goes with the workspace.`
      : `${links.join(", ")} still wait on you and go with the workspace.`,
  /**
   * `discard_workspace` with `ask: true` and no `reason`, refused before
   * anything is asked: the person reads the reason first on the approval.
   */
  discardAskReason:
    "discard_workspace with ask: true needs a `reason`: one sentence on why, for which task. The person reads it on the approval; nothing was asked.",
  /** The hub's log line as a settle ends what an ended item's awake sessions left running (hub workspaces.ts `endLeftWork`). */
  workEnding: (sessions: readonly string[], hold: string) =>
    `its items have all ended, so what ${sessions.length === 1 ? `its session ${sessions[0]}` : `its sessions ${sessions.join(", ")}`} left running there ends; not retired while ${hold}`,
  /** The hub's log line for that end, failed: `reason` its machine's words. */
  workNotEnded: (reason: string) =>
    `what its ended items' sessions left running there was not ended: ${reason}`,
  /** The agent's log line for what a session left running in its workspace, ended as it was interrupted, stopped, or its items finished (agent session.ts `#endWork`). */
  workEnded: (
    instanceId: string,
    why: string,
    ended: readonly number[],
    left: readonly number[]
  ) =>
    `${instanceId}: ${why}, so what it left running in its workspace ended: pid ${ended.join(", ")}${left.length > 0 ? `; pid ${left.join(", ")} still ran after SIGKILL` : ""}`,
  /** `stop_delegate`'s word on a stopped item whose workspace is gone. */
  stopGone: (ws: string) =>
    `Its workspace ${ws} is gone or archived: nothing is held.`,
  /** What a session a stop is walking hears when it calls finish_item or starts more work (hub tree-stops.ts). */
  stoppingRefused:
    "This session is being stopped: every delegate under it ends first, then it does. Nothing new starts and nothing is finished or landed meanwhile. End your turn.",
  /** `stop_delegate`'s answer: the stop walks `label`'s tree, `under` sessions below it (hub tree-stops.ts). */
  stopAsked: (label: string, under: number) =>
    under === 0
      ? `Stopping your delegate ${label}. Its report comes once its machine confirms its session ended.`
      : `Stopping your delegate ${label} and the ${under === 1 ? "delegate" : `${under} delegates`} under it: each ends before the session that started it, ${label} last. Its report, with how each one ended, comes once its machine confirms every end.`,
  /** The headline of a stopped item's report (hub tree-stops.ts). */
  stoppedHeadline: (title: string, under: number) =>
    under === 0
      ? `${title} was stopped; its session ended.`
      : `${title} was stopped after the ${under === 1 ? "delegate" : `${under} delegates`} under it ended.`,
  /** Who asked a stop, as a stopped item's report says it. */
  stoppedBy: (who: string) => `Stopped by ${who}.`,
  /** The heading over a stopped item's delegates and how each ended. */
  stoppedDelegates: "How each delegate under it ended:",
  /**
   * A work item whose session sat in its provider's retry until its
   * deadline for that (hub provider-retries.ts): the provider's words, the
   * deadline, and when the provider said it would try again, if it said.
   */
  providerRetryEnded: (message: string, deadline: string, next?: string) =>
    `Its provider refused the turn and kept retrying ("${message}"), so the item ended at its deadline for a provider's retry, ${deadline}${next ? `: the provider's next attempt was at ${next}, past it` : ""}. Delegate the work again once the provider answers.`,
  /** The agent's log line on what a dead harness process left running and it ended (agent left-running.ts), before the processes it names. */
  leftRunningEnded:
    "its harness process died, so what it left running was ended",
  /** Beside a process of that line that had ended before the agent came to it. */
  leftRunningGoneFirst: "it had ended already",
  /** The keeper's log line once a child of its ended, before the processes it names (sessiond server.ts `#sweep`). */
  leftRunningSwept: "it ended, so what it left running is told to end",
  /**
   * A command a crash cut (hub server.ts, core `CutCommand`): the command,
   * as it was asked, and what it had printed by then; `output` undefined
   * when its harness keeps no output of a running command.
   */
  commandInterrupted: (command: string, output: string | undefined) => {
    const cut = `The command \`${command}\` was interrupted when its process went`;
    if (output === undefined) {
      return `${cut}; its harness keeps no output of a running command, so what it printed was not kept.`;
    }
    return `${cut}; it had printed ${output.trim() ? `this before it was cut:\n\`\`\`\n${output.trimEnd()}\n\`\`\`` : "nothing yet."}`;
  },
};
