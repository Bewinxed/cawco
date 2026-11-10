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
import type { CommandQueueFrame } from "@cawco/core/commands/controls";
import type { MoveProgressFrame } from "@cawco/core/move";

export interface AgentPorts {
  /** A command's place in the slot queues (hub-command.ts). */
  readonly commandQueue: (frame: CommandQueueFrame) => void;
  /** A project move's progress (move.ts). */
  readonly moveProgress: (frame: MoveProgressFrame) => void;
}
