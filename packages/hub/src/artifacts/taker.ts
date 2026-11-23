/**
 * Who takes what the person did on an artifact: his marks (server.ts
 * `deliverArtifactMarks`) and the answers the hub sends itself
 * (artifacts/service.ts `sendAnswered`) alike, one rule for both.
 */
import { ENDED_STATUSES, type InstanceRow } from "@cawco/core/protocol";
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

/** Where it goes: the writer, a trigger on the artifact (the router decides who), or no one. */
export type ArtifactTaker =
  | { session: InstanceRow; to: "writer" }
  | { projectId: string; to: "route"; why: string }
  | { to: "none" };

/**
 * Its writer while it takes input ({@link takesNoInput}); once it takes
 * none (or no session holds it), a trigger on the artifact in its project
 * (triggers.ts: the fresh session on it, else a fresh one; the owner's card
 * "What a trigger wakes": "the session that wrote it hears it if it's
 * live; otherwise a fresh session takes it"). `none` when it is in no
 * project: the writer keeps what was not taken, with why. `refusal`
 * answers why a session takes no input, or nothing.
 */
export const artifactTaker = (
  writer: InstanceRow | undefined,
  artifact: { projectId: string | null },
  refusal: (id: string) => string | undefined
): ArtifactTaker => {
  const refused = writer ? takesNoInput(writer, refusal) : undefined;
  if (writer && refused === undefined) {
    return { to: "writer", session: writer };
  }
  const why = refused?.replace(CLOSING_STOP, "") ?? "no session holds it";
  return artifact.projectId
    ? { to: "route", projectId: artifact.projectId, why }
    : { to: "none" };
};
