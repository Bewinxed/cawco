/**
 * A provider's {@link Writes} made from one handler per op (provider spec
 * §2.3): each provider's `writes.ts` names its handlers, and an op it has
 * none for is refused in the service's name.
 */
import { Effect } from "effect";
import type {
  WriteHandlers,
  WriteOp,
  WriteOpName,
  Writes,
  Written,
} from "./provider";
import { type ProviderFailure, refusedWith } from "./read-stop";

/** A provider's {@link Writes} from its handlers: an op it has none for is refused in `service`'s name. */
export const writesOf = <Client>(
  service: string,
  handlers: WriteHandlers<Client>
): Writes<Client> => {
  const none = (op: WriteOp): Effect.Effect<Written, ProviderFailure> =>
    Effect.fail(refusedWith(`${service} has no write ${op.op}.`));
  // Each case reads the op as its own: its handler takes it as it is.
  const run = (
    client: Client,
    container: string,
    op: WriteOp
  ): Effect.Effect<Written, ProviderFailure> => {
    switch (op.op) {
      case "issue.create":
        return handlers[op.op]?.(client, container, op) ?? none(op);
      case "issue.update":
        return handlers[op.op]?.(client, container, op) ?? none(op);
      case "comment.create":
        return handlers[op.op]?.(client, container, op) ?? none(op);
      case "change-request.open":
        return handlers[op.op]?.(client, container, op) ?? none(op);
      case "issue.find-marked":
        return handlers[op.op]?.(client, container, op) ?? none(op);
      case "board.place":
        return handlers[op.op]?.(client, container, op) ?? none(op);
      case "board.columns":
        return handlers[op.op]?.(client, container, op) ?? none(op);
      case "repo.create":
        return handlers[op.op]?.(client, container, op) ?? none(op);
    }
  };
  const ops = Object.keys(handlers).filter((op): op is WriteOpName =>
    Object.hasOwn(handlers, op)
  );
  return { handlers, ops, run };
};
