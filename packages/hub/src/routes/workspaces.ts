/**
 * The hub's workspaces: what they hold, retiring and discarding them.
 */

import { artifactLink } from "@cawco/core/references";
import { Elysia, t } from "elysia";
import { hidden } from "../hidden";
import { addressOf } from "../hub-auth";
import type { HubContext } from "../hub-context";
import { discardCall } from "../work-item-calls";
import { WorkItemRefusal } from "../work-item-state";
import { sessionCallerRefusal } from "./session-caller";

export const workspaceRoutes = ({
  discardAsked,
  discarded,
  hubAuth,
  identities,
  workItems,
  workspaceArchived,
  workspaceRetire,
}: Pick<
  HubContext,
  | "discardAsked"
  | "discarded"
  | "hubAuth"
  | "identities"
  | "workItems"
  | "workspaceArchived"
  | "workspaceRetire"
>) => {
  // The same call `discard_workspace` makes (work-item-calls.ts), after this
  // door's checks of who calls and what the body holds.
  const discard = discardCall({ discardAsked, discarded });
  return (
    new Elysia()
      // Archiving a workspace: its machine kills the boundary with every
      // process in it and deletes the clone. Refused while an item runs there.
      // Spent workspaces kept for unlanded work, as the last sweep read them
      // (workspace-retire.ts); `delegate_list` shows a session its own tree's.
      // Every held workspace: its item ended with work that is nowhere else,
      // and the session that started its work, told as it was held,
      // continues it or discards it (workspaces.ts `heldNotice`).
      .get("/api/workspaces/held", hidden, () => ({
        held: workItems.heldWorkspaces(),
      }))
      // A settling sweep now, rather than at its next tick: what it retired,
      // held, left for what holds it, and could not settle.
      .post("/api/workspaces/retire", hidden, () => workspaceRetire.sweep())
      // What a held workspace's clone holds that is nowhere else, as its
      // machine read it once its boundary was closed: what a discard saves
      // to a carry before deleting.
      .get("/api/workspaces/:id/held", ({ params, status }) => {
        try {
          return workItems.held(params.id);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return status(
            error instanceof WorkItemRefusal ? error.status : 502,
            message
          );
        }
      })
      // Refused (409, in words naming what and how big) when its clone holds
      // work that is nowhere else: nothing is deleted, and the workspace is
      // held. `discard: true` is a person letting that work go: its machine
      // writes its unlanded commits, changes, stashes and excluded files to a
      // carry first, whose folder the answer names as `carry`. Files a
      // tracked `.gitignore` covers go with the clone either way. Refused
      // (409) whatever `discard` says while a project's folder is inside its
      // clone or scratch dir. A preview of it does not refuse: the archive
      // ends its served server.
      // While what it serves waits on the person it is refused, unless he
      // confirmed it knowing that (`anyway`, the dashboard's confirm, which
      // reads `/waiting` first): his own word alone, never a session's.
      .post(
        "/api/workspaces/:id/archive",
        {
          body: t.Optional(
            t.Object({
              discard: t.Optional(t.Boolean()),
              anyway: t.Optional(t.Boolean()),
            })
          ),
        },
        async ({ params, body, request, server, status }) => {
          const caller = hubAuth.callerOf(request, addressOf(server, request));
          try {
            const { workspace, carry } = await workItems.archive(params.id, {
              discard: body?.discard === true,
              anyway: body?.anyway === true && caller.kind === "owner",
            });
            workspaceArchived(workspace);
            return { ...workspace, carry };
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
      // What a workspace serves that waits on the person, each by its id,
      // name and link: what an archive of it waits on, which the person's
      // confirm names (dashboard LiveSessionMenu).
      .get("/api/workspaces/:id/waiting", ({ params, status }) => {
        try {
          return {
            waiting: workItems.waiting(params.id).map((one) => ({
              ...one,
              link: artifactLink(one.id, one.title),
            })),
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return status(
            error instanceof WorkItemRefusal ? error.status : 502,
            message
          );
        }
      })
      // `discard_workspace`: a workspace a session's delegates worked in,
      // archived with its unlanded work saved to a carry, by that session
      // (or its project's conversation) alone. While what it serves waits
      // on the person it is refused; `ask` asks the person to decide
      // instead (asks.ts, an approve ask), and his approval discards it
      // anyway (`discardAsked`).
      .post(
        "/api/workspaces/:id/discard",
        {
          ...hidden,
          body: t.Object({
            from: t.String({ minLength: 1 }),
            ask: t.Optional(t.Boolean()),
            reason: t.Optional(t.String({ maxLength: 300 })),
          }),
        },
        async ({ params, body, request, status }) => {
          const stranger = sessionCallerRefusal(
            identities,
            request,
            body.from,
            "Session credential does not belong to the discard's requester",
            status
          );
          if (stranger !== undefined) {
            return stranger;
          }
          try {
            return {
              text: await discard(body.from, params.id, {
                ask: body.ask,
                reason: body.reason,
              }),
            };
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
  );
};
