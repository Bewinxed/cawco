/**
 * The hub's half of the handover's state (core handover.ts): each machine's
 * presence, read from one deadline, stepped by the hub's events. The hub
 * runs the commands a step gives back (server.ts `hubStep`); this holds
 * only the state they come from. One of the hub's services (hub-layer.ts).
 */
import {
  type HandoverCommand,
  type HandoverEvent,
  step as handoverStep,
  initialHandover,
  presenceOf,
} from "@cawco/core/handover";
import { Context, Effect, Layer } from "effect";

const make = () => {
  let handover = initialHandover();
  /** `event` stepped into the state: the commands it gives, for the hub to run in order. */
  const step = (event: HandoverEvent): HandoverCommand[] => {
    const stepped = handoverStep(handover, event);
    handover = stepped.state;
    return stepped.commands;
  };
  /** A machine as everything that reads its presence reads it now. */
  const machinePresence = (machineId: string) =>
    presenceOf(handover, machineId, Date.now());
  return { machinePresence, step };
};

/** What `make` makes, as one of the hub's services (hub-layer.ts). */
export class HandoverState extends Context.Service<
  HandoverState,
  ReturnType<typeof make>
>()("HandoverState") {}

export const HandoverStateLayer = Layer.effect(HandoverState)(
  Effect.sync(make)
);
