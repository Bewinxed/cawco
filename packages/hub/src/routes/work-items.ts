/**
 * Work items and the landing gate: starting, waiting on, finishing and reading them.
 */

import { Elysia, t, ValidationError } from "elysia";
import type { DelegateResult } from "../delegation-actions";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";
import { FolderRefusal } from "../project-folder";
import { BUDGET, LANDS } from "../tasks";
import { firstValidationIssue } from "../validation-issue";
import { WorkItemRefusal } from "../work-item-state";
import {
  SESSION_TITLE_DESCRIPTION,
  WAIT_ITEM_LIMIT,
  type WorkItemStart,
} from "../work-items";
import { harnessSchema } from "./harness-schema";
import { sessionCallerRefusal } from "./session-caller";

/** What `POST /api/work-items` answers: the item started, its session and workspace; or queued for owned files, with neither yet. */
const delegated = (
  started: WorkItemStart | { queued: string; text: string },
  asked: string
): DelegateResult =>
  "queued" in started
    ? {
        state: "queued",
        queued: started.queued,
        title: asked.trim(),
        text: started.text,
      }
    : {
        state: "started",
        workItemId: started.item.id,
        workspaceId: started.workspace.id,
        ...(started.workspace.tmp
          ? { workspaceTmp: started.workspace.tmp }
          : {}),
        instanceId: started.item.instanceId,
        title: started.item.title,
        text: started.text,
      };

export const workItemRoutes = ({
  coldWork,
  db,
  delegateTypeFor,
  delegatedAttempt,
  identities,
  retryFromTray,
  sessionName,
  treeStops,
  workItems,
}: Pick<
  HubContext,
  | "coldWork"
  | "db"
  | "delegateTypeFor"
  | "delegatedAttempt"
  | "identities"
  | "retryFromTray"
  | "sessionName"
  | "treeStops"
  | "workItems"
>) =>
  new Elysia()
    // What the landing gate passed on a git tree, for a release of a commit
    // holding it (scripts/release.ts, no dashboard call): the commands of
    // the steps that passed on it, as gate.md writes them.
    .get(
      "/api/landing-gate",
      {
        ...hidden,
        query: t.Object({ tree: t.String({ pattern: "^[0-9a-f]{40,64}$" }) }),
      },
      ({ query }) => ({
        tree: query.tree,
        passed: workItems.gatePassesOn(query.tree),
      })
    )
    // A parent's delegate tray as it opens; `work_item` frames keep it live.
    .get(
      "/api/work-items",
      { query: t.Object({ parent: t.String() }) },
      ({ query }) => workItems.trayOf(query.parent)
    )

    // Dismissed from the tray: gone from it on every screen, and after
    // reload, with why: the reader's reason, or the later item that
    // replaced it.
    .post(
      "/api/work-items/:id/dismiss",
      {
        body: t.Union([
          t.Object({ reason: t.String({ minLength: 1 }) }),
          t.Object({ replacedBy: t.String({ minLength: 1 }) }),
        ]),
      },
      ({ params, body, status }) => {
        const why = "reason" in body ? { reason: body.reason.trim() } : body;
        if ("reason" in why && !why.reason) {
          return status(400, "Say why it is no longer owed.");
        }
        try {
          const item = workItems.dismiss(params.id, why);
          return item ?? status(404, `no work item ${params.id}`);
        } catch (error) {
          return status(
            409,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    )
    // Retry from the tray: the reader's word to the failed delegate's own
    // session, through the one send path, which reopens the same item once
    // its process reads it (workItems.reopen). Answers when the send has
    // been read (the item running again) or has failed, with why.
    .post("/api/work-items/:id/retry", async ({ params, status }) => {
      const item = workItems.item(params.id);
      if (!item) {
        return status(404, `no work item ${params.id}`);
      }
      const refused = await retryFromTray(item);
      return refused
        ? status(409, refused)
        : (workItems.summary(item.id) ?? status(404, "gone"));
    })
    // Delegation: one work item, in a new workspace or as the follow-up in
    // an existing one. The hub validates, files and spawns it all here —
    // `delegate` is nothing but this request (see work-items.ts).
    .post(
      "/api/work-items",
      {
        ...hidden,
        body: t.Object({
          parentInstanceId: t.String({ minLength: 1 }),
          prompt: t.String(),
          title: t.String(),
          type: t.Optional(t.String()),
          harness: t.Optional(harnessSchema),
          model: t.Optional(t.String()),
          account: t.Optional(t.String()),
          skills: t.Optional(t.Array(t.String())),
          mayStart: t.Optional(t.Array(t.String())),
          // Its session starts clean (core `SpawnPayload.clean`).
          clean: t.Optional(t.Boolean()),
          cwd: t.Optional(t.String()),
          machineId: t.Optional(t.String()),
          workspace: t.Optional(t.String()),
          from: t.Optional(t.String()),
          fork: t.Optional(t.Boolean()),
          // Each a path or a held kind (hub handed-input.ts), checked in words by work-items.
          inputs: t.Optional(t.Array(t.Unknown())),
          lands: t.Optional(LANDS),
          host: t.Optional(t.Boolean()),
          outputs: t.Optional(t.Array(t.String())),
          group: t.Optional(t.String()),
          owns: t.Optional(t.Array(t.String())),
          budget: t.Optional(BUDGET),
          // The task of the caller's project it is an attempt at (dispatch.ts `AttemptAsk`).
          task: t.Optional(t.String({ minLength: 1 })),
        }),
        // A 400 that says which field is missing or malformed, in words:
        // a delegate without a title is refused, never named from its brief.
        error({ error, status }) {
          if (error instanceof ValidationError) {
            const first = firstValidationIssue(error);
            // A missing field has no path of its own; its name is in params.
            const field =
              first?.params?.requiredProperties?.[0] ??
              first?.path.slice(1) ??
              "";
            return status(
              400,
              field === "title"
                ? `title is required: ${SESSION_TITLE_DESCRIPTION}`
                : `${field || "body"}: ${first?.message ?? error.message}`
            );
          }
        },
      },
      async ({ body, request, status, server }) => {
        server?.timeout(request, 0);
        const stranger = sessionCallerRefusal(
          identities,
          request,
          body.parentInstanceId,
          "Session credential does not belong to the work item's parent",
          status
        );
        if (stranger !== undefined) {
          return stranger;
        }
        if (!(
          body.parentInstanceId.trim() &&
          db.getInstancesByIds([body.parentInstanceId])[0]
        )) {
          return status(
            400,
            "work item needs a known non-empty parentInstanceId"
          );
        }
        try {
          const { task, ...plain } = body;
          if (task) {
            return await delegatedAttempt({ ...plain, task });
          }
          const started = await workItems.delegate({
            ...plain,
            ...(await delegateTypeFor(plain)),
          });
          return delegated(started, plain.title);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          // Anything that is not the hub's own refusal is the machine's:
          // offline, or git turning the checkout down.
          return status(
            error instanceof WorkItemRefusal || error instanceof FolderRefusal
              ? error.status
              : 502,
            message
          );
        }
      }
    )
    .post(
      "/api/work-items/wait",
      {
        ...hidden,
        body: t.Object(
          {
            instanceId: t.String({ minLength: 1 }),
            minutes: t.Integer({ minimum: 1, maximum: 120 }),
            reason: t.String({ minLength: 1 }),
          },
          { additionalProperties: false }
        ),
        error({ error, status }) {
          if (error instanceof ValidationError) {
            return status(400, WAIT_ITEM_LIMIT);
          }
        },
      },
      ({ body, request, status }) => {
        const stranger = sessionCallerRefusal(
          identities,
          request,
          body.instanceId,
          "Session credential does not belong to the waiting instanceId",
          status
        );
        if (stranger !== undefined) {
          return stranger;
        }
        try {
          return {
            text: workItems.waitItem(
              body.instanceId,
              body.minutes,
              body.reason
            ),
          };
        } catch (error) {
          return status(
            error instanceof WorkItemRefusal ? error.status : 502,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    )
    // `finish_item`: the hub runs the item's landing gate, lands it, and
    // answers what the tool returns. The gate may run for an hour (an iOS
    // build), so the HTTP idle timer does not apply.
    .post(
      "/api/work-items/finish",
      {
        ...hidden,
        body: t.Object({
          instanceId: t.String({ minLength: 1 }),
          headline: t.String({ minLength: 1 }),
          summary: t.String(),
          findings: t.Optional(
            t.Array(t.Object({ title: t.String(), detail: t.String() }))
          ),
          blocked: t.Optional(
            t.Object({ command: t.String(), error: t.String() })
          ),
          ship: t.Optional(t.Object({ notes: t.String({ minLength: 1 }) })),
        }),
      },
      async ({ body, status, request, server }) => {
        const stranger = sessionCallerRefusal(
          identities,
          request,
          body.instanceId,
          "Session credential does not belong to the finishing instanceId",
          status
        );
        if (stranger !== undefined) {
          return stranger;
        }
        server?.timeout(request, 0);
        const { instanceId, ...finished } = body;
        try {
          return { text: await workItems.finishItem(instanceId, finished) };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return status(
            error instanceof WorkItemRefusal ? error.status : 502,
            message
          );
        }
      }
    )
    // `stop_delegate`: a delegate and its tree stopped by its parent or its
    // project's conversation (tree-stops.ts), answering how many sessions under it
    // end first. Its report comes once every end is confirmed.
    .post(
      "/api/work-items/stop",
      {
        ...hidden,
        body: t.Object({
          from: t.String({ minLength: 1 }),
          instanceId: t.String({ minLength: 1 }),
        }),
      },
      ({ body, request, status }) => {
        const stranger = sessionCallerRefusal(
          identities,
          request,
          body.from,
          "Session credential does not belong to the stop's requester",
          status
        );
        if (stranger !== undefined) {
          return stranger;
        }
        const [requester] = db.getInstancesByIds([body.from]);
        // A delegate named by a former id is stopped by its id now.
        const [row] = db.getInstancesByIds([db.instanceIdOf(body.instanceId)]);
        if (!(
          requester &&
          row &&
          (row.parentInstanceId === requester.id ||
            workItems.ledBy(row.id, requester.id))
        )) {
          return status(
            403,
            "you can only stop your own delegates, or the work items of the project whose conversation you are"
          );
        }
        return treeStops.stop(row.id, {
          kind: "session",
          name: sessionName(requester),
        });
      }
    )
    // `stop_delegate` on a queued delegate: withdrawn by its parent or its
    // project's conversation; 404 when the target names no queued delegate.
    .post(
      "/api/work-items/queued/withdraw",
      {
        ...hidden,
        body: t.Object({
          from: t.String({ minLength: 1 }),
          target: t.String({ minLength: 1 }),
        }),
      },
      ({ body, request, status }) => {
        const stranger = sessionCallerRefusal(
          identities,
          request,
          body.from,
          "Session credential does not belong to the withdraw's requester",
          status
        );
        if (stranger !== undefined) {
          return stranger;
        }
        try {
          const text = workItems.withdrawQueued(body.from, body.target);
          return text === undefined
            ? status(404, `no queued delegate ${body.target}`)
            : { text };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return status(
            error instanceof WorkItemRefusal ? error.status : 502,
            message
          );
        }
      }
    )
    .get("/api/work-items/:id", hidden, ({ params, status }) => {
      const item = workItems.item(params.id);
      return item ?? status(404, `no work item ${params.id}`);
    })
    // What the item's workspace holds on no remote now (workspaces.ts
    // `unlandedOf`), or why it could not be read: what `stop_delegate`
    // answers its caller about the hold its stop leaves.
    .get("/api/work-items/:id/unlanded", hidden, async ({ params, status }) => {
      const item = workItems.item(params.id);
      return item
        ? {
            unlanded: await coldWork(item.instanceId),
            // What its workspace serves, which holds its retirement.
            serving: workItems.serving(item.workspaceId),
          }
        : status(404, `no work item ${params.id}`);
    });
