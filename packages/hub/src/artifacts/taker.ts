/**
 * Who takes what the person did on an artifact: his marks (server.ts
 * `deliverArtifactMarks`) and the answers the hub sends itself
 * (artifacts/service.ts `sendAnswered`) alike, one rule for both.
 */
import { ENDED_STATUSES, type InstanceRow } from "@cawco/core";
import { noticeWords } from "@cawco/core/words/notices";

/** A reason's closing full stop, dropped where it is quoted inside a sentence. */
const CLOSING_STOP = /\.$/u;

/**
 * Why `session` takes nothing the person does on its artifacts, or nothing
 * when it does: it has ended (core `ENDED_STATUSES`: stopping, stopped,
 * discarded; the person, its parent or the hub ended it), or a send to it
 * is refused (`refusal`: its conversation gone, its work's workspace
 * archived or taken over). A sleeping session takes it: a send wakes it.
 */
export const takesNoInput = (
  session: InstanceRow,
  refusal: (id: string) => string | undefined
): string | undefined =>
  ENDED_STATUSES.has(session.status)
    ? noticeWords.sessionEnded
    : refusal(session.id);

/** Where it goes: the writer, the session that delegated it, the artifact's handler, or no one. */
export type ArtifactTaker =
  | { session: InstanceRow; to: "writer" }
  | { session: InstanceRow; to: "parent"; why: string }
  | { projectId: string; to: "handler"; why: string }
  | { to: "none" };

/**
 * Its writer while it takes input ({@link takesNoInput}); once it takes
 * none (or no session holds it), the session that delegated it while that
 * one does, which holds it (service.ts `answerable`, open_items), else, for
 * a project's artifact, its handler (hub handlers.ts: the one that lives,
 * or a fresh one; the owner's card "What a trigger wakes", over projects
 * plan §5.8's "or Caw if it has ended"), never the project's conversation.
 * `none` when no one can: the writer keeps what was not taken, with why.
 * `refusal` answers why a session takes no input, or nothing.
 */
export const artifactTaker = (
  writer: InstanceRow | undefined,
  artifact: { projectId: string | null },
  at: {
    instance: (id: string) => InstanceRow | undefined;
    refusal: (id: string) => string | undefined;
  }
): ArtifactTaker => {
  const refused = writer ? takesNoInput(writer, at.refusal) : undefined;
  if (writer && refused === undefined) {
    return { to: "writer", session: writer };
  }
  const why = refused?.replace(CLOSING_STOP, "") ?? "no session holds it";
  const parent = writer?.parentInstanceId
    ? at.instance(writer.parentInstanceId)
    : undefined;
  if (parent && takesNoInput(parent, at.refusal) === undefined) {
    return { to: "parent", session: parent, why };
  }
  return artifact.projectId
    ? { to: "handler", projectId: artifact.projectId, why }
    : { to: "none" };
};
