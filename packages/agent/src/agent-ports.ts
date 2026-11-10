/**
 * Everything the daemon's modules send out through, in one value the daemon
 * constructs before it starts any of them (daemon.ts `startDaemon`). A module
 * takes its part where it is started or called (`Pick<AgentPorts, …>`), so
 * none runs with a callback nobody installed: the type has every field, and
 * the daemon's literal fails to compile without one.
 *
 * Every frame port forwards to the hub connection that is up (daemon.ts
 * `HubLine`). With none up, before the first or between two, the frame is
 * dropped.
 */
import type { AccountBorrowFrame } from "@cawco/core/accounts";
import type { BrowserFrame, BrowserHandedBackFrame } from "@cawco/core/browser";
import type { CommandQueueFrame } from "@cawco/core/commands/controls";
import type { MoveProgressFrame } from "@cawco/core/move";
import type { Envelope } from "@cawco/core/protocol";
import type { StageCloneFrame, StageFrame } from "@cawco/core/stage";
import type { RelayFrame } from "@cawco/core/stream-relay";

export interface AgentPorts {
  /** A borrower's ask for a fresh access token of a lender's sign-in (provider-accounts.ts). */
  readonly borrowAsk: (frame: AccountBorrowFrame) => void;
  /** The machine's browsers whole, told on each change (browser/browsers.ts). */
  readonly browsers: (frame: BrowserFrame) => void;
  /** A command's place in the slot queues (hub-command.ts). */
  readonly commandQueue: (frame: CommandQueueFrame) => void;
  /** An envelope a harness builds itself, or the supervisor hands off (session.ts `emit`). */
  readonly emit: (envelope: Envelope) => void;
  /** The machine this agent is: the browsers' and the relay's frames name it. */
  readonly machineId: string;
  /** A project move's progress (move.ts). */
  readonly moveProgress: (frame: MoveProgressFrame) => void;
  /** What the OpenCode harness does for the accounts here (provider-accounts.ts). */
  readonly opencodeAccounts: OpencodeAccountsHost;
  /** The stream relay's state (browser/relay.ts). */
  readonly relay: (frame: RelayFrame) => void;
  /** A take-over the agent ended itself (browser/shield.ts). */
  readonly shield: (frame: BrowserHandedBackFrame) => void;
  /** A workspace's stage, where it is now (stage.ts). */
  readonly stage: (frame: StageFrame) => void;
  /** A place's stage clone, as the hub files it as a workspace (stage-clone.ts). */
  readonly stageClone: (frame: StageCloneFrame) => void;
}

/**
 * One of OpenCode's own sign-ins on this machine: a credential on the
 * machine's OpenCode server. 2.0 keeps them in that server's database, not in
 * a file (a 1.x `auth.json` is imported into it when 2.0 first converts the
 * 1.x database).
 */
export interface OpencodeOwnCredential {
  id: string;
  integrationID: string;
  value: Record<string, unknown>;
}

/** What the OpenCode harness does for the accounts here, through its servers. */
export interface OpencodeAccountsHost {
  /** Every session in the account's server's database moved to the machine's server, and that server ended. */
  carryOut: (accountId: string) => Promise<void>;
  /** The credential OpenCode uses for each provider on the machine's server (CawCo's own never). */
  ownCredentials: () => Promise<OpencodeOwnCredential[]>;
  /** One of those removed from the machine's server. */
  removeOwnCredential: (id: string) => Promise<void>;
}
