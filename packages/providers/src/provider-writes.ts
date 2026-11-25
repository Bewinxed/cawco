/**
 * A provider's {@link Writes} made from one handler per op (provider spec
 * §2.3): each provider's `writes.ts` names its handlers, and an op it has
 * none for is refused in the service's name.
 */
import { Effect } from "effect";
import { eventKeys } from "./event-keys";
import type {
  ItemRef,
  ItemRevision,
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

/** An issue as a forge answered a write of it: what its revision and the events the write caused are read from. */
export interface WrittenIssue {
  body: string | null;
  /** When it was closed, as the forge says it; none while it is open. */
  closedAt: string | null | undefined;
  createdAt: string;
  externalId: string;
  labels: readonly string[];
  open: boolean;
  title: string;
  updatedAt: string;
}

/** An issue write: what makes it, or changes it. */
type IssueWrite = Extract<WriteOp, { op: "issue.create" | "issue.update" }>;

/**
 * The events a write of an issue itself caused, by the keys a poll reads
 * them under (event-keys.ts): its opening when it made it, its close at the
 * `closedAt` it set, its reopen at the version it left, and each label it
 * put on that `before` (its labels before the write) did not hold.
 */
export const issueWriteEvents = (
  key: string,
  issue: Pick<WrittenIssue, "closedAt" | "labels" | "open" | "updatedAt">,
  op: IssueWrite,
  before: readonly string[]
): string[] => [
  ...(op.op === "issue.create" ? [eventKeys.opened("issue", key)] : []),
  ...(op.stateToken !== undefined &&
  op.stateToken !== "open" &&
  !issue.open &&
  issue.closedAt
    ? [eventKeys.closed("issue", key, Date.parse(issue.closedAt))]
    : []),
  ...(op.op === "issue.update" && op.stateToken === "open" && issue.open
    ? [eventKeys.reopened("issue", key, String(Date.parse(issue.updatedAt)))]
    : []),
  ...(op.labels ?? [])
    .filter((label) => issue.labels.includes(label) && !before.includes(label))
    .map((label) => eventKeys.labeled("issue", key, label)),
];

/** An issue as GitLab's REST API and gitea-mcp both answer a write of it: the fields they share, by their names. */
export interface ForgeIssueAnswer {
  closed_at?: string | null;
  created_at: string;
  id: number;
  state: string;
  title: string;
  updated_at: string;
}

/** An issue a forge answered a write of, as its ref, its revision and the events the write caused; its labels and body as the forge's own answer reads them. */
export const writtenIssue = (
  item: ItemRef,
  answer: ForgeIssueAnswer,
  read: Pick<WrittenIssue, "body" | "labels">,
  op: IssueWrite,
  before: readonly string[]
): { events: string[]; item: ItemRef; revision: ItemRevision } => {
  const issue: WrittenIssue = {
    ...read,
    externalId: String(answer.id),
    title: answer.title,
    open: answer.state !== "closed",
    closedAt: answer.closed_at,
    createdAt: answer.created_at,
    updatedAt: answer.updated_at,
  };
  return {
    item,
    revision: {
      item,
      version: String(Date.parse(issue.updatedAt)),
      snapshot: {
        externalId: issue.externalId,
        title: issue.title,
        state: issue.open ? "open" : "closed",
        stateName: issue.open ? "" : "Closed",
        stateToken: issue.open ? "open" : "closed",
        author: null,
        labels: [...issue.labels],
        body: issue.body,
        createdAt: Date.parse(issue.createdAt),
      },
    },
    events: issueWriteEvents(item.key, issue, op, before),
  };
};
