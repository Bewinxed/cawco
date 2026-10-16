/**
 * Posts to other people's repositories held for the person under the
 * upstream choice's "Ask me first" (core upstream-post.ts). Every way a
 * session posts is held where the guard sees it (a workspace's gh shim, its
 * GitHub door, its git door; a GitHub connection's write tool here) and
 * raised here as the session's ask: a `permission_request` naming exactly
 * what would be posted, where, and as whom, through the same pending
 * ledger, Needs you, Telegram and push as any permission ask, drawn by the
 * same card (permission-presentation.ts `UPSTREAM_POST_TOOL`).
 *
 * The session is answered at once, that it waits for the person, and goes
 * on with its work: nothing blocks on the answer. Approved, CawCo makes the
 * post itself, once, as it was shown: the machine whose workspace held it
 * runs it with its own GitHub sign-in (agent upstream-posts.ts), or the hub
 * calls the connection's tool; the session is told what GitHub said. Denied,
 * nothing is posted, and the session is told. The same post asked again
 * while one waits is that one ask.
 *
 * The ask is the person's, not the session process's: it is kept across a
 * hub restart and stays when the session's process ends (pending.ts
 * `outlivesSession`), since what is posted is held here, not in the process.
 */
import type { Envelope, InstanceRow, PermissionResult } from "@cawco/core";
import { heldWords } from "@cawco/core/upstream-guard";
import {
  describePost,
  type PostMade,
  postKey,
  UPSTREAM_POST_TOOL,
  type UpstreamPost,
} from "@cawco/core/upstream-post";

/** What an upstream ask's payload carries for the hub, beside what the card shows. */
export interface HeldPost {
  /** The machine that makes it: the workspace's; none for a connection's, which the hub calls. */
  readonly machineId?: string;
  readonly post: UpstreamPost;
  /** Where it lands, `host/owner/repo`. */
  readonly repo: string;
  /** The call in a few words, as the session wrote it. */
  readonly what: string;
  /** The workspace that held it; none for a connection's. */
  readonly workspaceId?: string;
}

export interface UpstreamAsksDeps {
  /** Calls a connection's tool once (connections.ts `callOnce`). */
  readonly callConnection: (
    post: Extract<UpstreamPost, { via: "mcp" }>,
    requestId: string
  ) => Promise<PostMade>;
  /** Has the machine make an approved post (agent `CONTROL_UPSTREAM_POST`). */
  readonly make: (
    machineId: string,
    workspaceId: string,
    post: UpstreamPost
  ) => Promise<PostMade>;
  /** Parks an ask for the person, kept across a hub restart. */
  readonly park: (envelope: Envelope) => void;
  /** The parked ask by request id, while it is pending. */
  readonly parked: (requestId: string) => Envelope | undefined;
  /** Every parked ask. */
  readonly pending: () => Envelope[];
  /** Takes a settled ask off the pending ledger. */
  readonly settle: (requestId: string) => void;
  /** Says something to a session, as the hub. */
  readonly tell: (instanceId: string, text: string) => void;
  /** The thread a project's Caw asks in; undefined for any other session. */
  readonly threadOf: (actor: InstanceRow) => string | undefined;
}

/** A parked ask's held post; undefined for every other ask. */
export const heldPostOf = (
  envelope: Envelope | undefined
): HeldPost | undefined => {
  const held = (envelope?.payload as { upstreamPost?: HeldPost } | undefined)
    ?.upstreamPost;
  return held && typeof held === "object" && held.post ? held : undefined;
};

export const createUpstreamAsks = (deps: UpstreamAsksDeps) => {
  /** Carries out an answer: the post made once when approved, and the session told either way. */
  const carryOut = async (
    instanceId: string,
    requestId: string,
    held: HeldPost,
    result: PermissionResult
  ): Promise<void> => {
    if (result.behavior !== "allow") {
      const reason = result.message.trim();
      deps.tell(
        instanceId,
        `The owner denied \`${held.what}\` to ${held.repo}${reason ? `: ${reason}` : "."} Nothing was posted. Don't post it another way; put it in your report if it still matters.`
      );
      return;
    }
    console.log(
      `[upstream-asks] ${requestId}: approved; CawCo makes ${held.post.via} to ${held.repo}`
    );
    let made: PostMade;
    try {
      if (held.post.via === "mcp") {
        made = await deps.callConnection(held.post, requestId);
      } else if (held.machineId && held.workspaceId) {
        made = await deps.make(held.machineId, held.workspaceId, held.post);
      } else {
        made = { ok: false, said: "No machine holds this post's workspace." };
      }
    } catch (error) {
      made = {
        ok: false,
        said: error instanceof Error ? error.message : String(error),
      };
    }
    deps.tell(
      instanceId,
      made.ok
        ? `The owner approved \`${held.what}\` to ${held.repo}. CawCo posted it once, exactly as written; GitHub said:\n\n${made.said}`
        : `The owner approved \`${held.what}\` to ${held.repo}, but posting it failed, so it may not be there; CawCo did not try again. What came back:\n\n${made.said}`
    );
  };

  return {
    /**
     * Raises `held` from `actor` as the person's ask, or finds the same post
     * already waiting: answers what the session reads (it does not wait).
     */
    ask(actor: InstanceRow, held: HeldPost, account: string): string {
      const key = postKey(held.post);
      const waiting = deps
        .pending()
        .some(
          (envelope) =>
            envelope.instanceId === actor.id &&
            heldPostOf(envelope) !== undefined &&
            postKey((heldPostOf(envelope) as HeldPost).post) === key
        );
      if (waiting) {
        return heldWords(held.what, held.repo, true);
      }
      const requestId = crypto.randomUUID();
      const threadId = deps.threadOf(actor);
      deps.park({
        verb: "frames",
        machineId: actor.machineId,
        instanceId: actor.id,
        requestId,
        payload: {
          kind: "permission_request",
          instanceId: actor.id,
          requestId,
          harness: actor.harness ?? "claude",
          requestKind: "tool",
          toolName: UPSTREAM_POST_TOOL,
          input: { ...describePost(held.post, held.repo, account) },
          upstreamPost: held,
          ...(threadId ? { threadId } : {}),
        },
      });
      console.log(
        `[upstream-asks] ${actor.id} asks the person to approve ${held.what} to ${held.repo} (${requestId})`
      );
      return heldWords(held.what, held.repo, false);
    },

    /**
     * The person's answer, when `requestId` is a held post: the ask leaves
     * the ledger first, so it is answered once, then the post is made (allow)
     * or not (deny) and the session told. False for every other ask.
     */
    answer(requestId: string, result: PermissionResult): boolean {
      const envelope = deps.parked(requestId);
      const held = heldPostOf(envelope);
      if (!(envelope?.instanceId && held)) {
        return false;
      }
      deps.settle(requestId);
      carryOut(envelope.instanceId, requestId, held, result).catch(
        (error: unknown) =>
          console.warn(
            `[upstream-asks] ${requestId}: ${error instanceof Error ? error.message : String(error)}`
          )
      );
      return true;
    },
  };
};

export type UpstreamAsks = ReturnType<typeof createUpstreamAsks>;
