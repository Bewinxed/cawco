import {
  EFFORT_LEVELS,
  WIRE_PERMISSION_MODES,
} from "@cawco/core/harness/kinds";
import { t } from "elysia";
import { harnessSchema } from "./harness-schema";

/**
 * A permission mode as a route takes it: core's `PermissionMode`, the
 * offered `PERMISSION_MODES` and the two the installable TestFlight builds
 * were built to send. `settleMode` refuses a mode the machine does not
 * report, in the machine's own list.
 */
export const permissionModeSchema = t.Union(
  WIRE_PERMISSION_MODES.map((mode) => t.Literal(mode))
);

/** Continue in new session: every field of the summariser and target is the caller's to name. */
export const continueBody = t.Object({
  // Who writes the summary; left out, the source's provider's policy
  // (core `Compaction.summarizer`). Unread with `asksOnly`, which writes none.
  summarizer: t.Optional(
    t.Object({
      harness: harnessSchema,
      model: t.Optional(t.String({ minLength: 1 })),
    })
  ),
  // The new session opens on the messages it was asked alone (the person's,
  // a delegate's parent's brief and hand-offs), verbatim and in order:
  // nothing is summarised and nothing the agent did is carried.
  asksOnly: t.Optional(t.Literal(true)),
  target: t.Object({
    harness: harnessSchema,
    model: t.Optional(t.String({ minLength: 1 })),
    machineId: t.Optional(t.String({ minLength: 1 })),
    cwd: t.Optional(t.String({ minLength: 1 })),
    effort: t.Optional(t.Union(EFFORT_LEVELS.map((level) => t.Literal(level)))),
    // The mode the new session is asked to run in. Asked none, it takes the
    // mode of the session that asked for it (`askedBy`) as it starts
    // (`continuationCauseMode`). A harness with modes gets an explicit mode,
    // and with neither nothing starts; one with none (pi) records none and
    // refuses one asked of it. The hub's `settleMode` decides.
    permissionMode: t.Optional(permissionModeSchema),
    scratch: t.Optional(
      t.Object({
        worktree: t.Optional(t.Boolean()),
        baseCwd: t.Optional(t.String()),
      })
    ),
    bootstrap: t.Optional(t.Object({ repo: t.String(), baseDir: t.String() })),
    projectId: t.Optional(t.String()),
  }),
  note: t.Optional(t.String()),
  // The session whose `continue_session` asked, for the hub's log line;
  // absent, a person asked, and the source files its open items first.
  askedBy: t.Optional(t.String({ minLength: 1 })),
  // What rides the new session's opening message beside its words, as a
  // send carries it. The summariser is never handed them.
  images: t.Optional(
    t.Array(t.Object({ mediaType: t.String(), data: t.String() }))
  ),
  attachments: t.Optional(
    t.Array(
      t.Union([
        t.Object({
          kind: t.Literal("text"),
          name: t.String(),
          content: t.String(),
        }),
        t.Object({
          kind: t.Literal("file"),
          name: t.String(),
          mediaType: t.String(),
          size: t.Integer({ minimum: 0 }),
          ref: t.String({ pattern: "^/api/files/" }),
        }),
      ])
    )
  ),
});
