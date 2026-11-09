import { StatusRefusal } from "../refusal";

/** A refusal of an artifact tool or route: its status, and the sentence the agent or the person reads. */
export class ArtifactRefusal extends StatusRefusal<
  400 | 403 | 404 | 409 | 413 | 422 | 503 | 504
> {}

/**
 * A Send that carries nothing new: every pick has gone to the session (by
 * the hub's own send or an earlier press). Agents and the API hear it as
 * the 409 it is; the page's own Send reads it as sent (sync.ts
 * `artifactSend`), since what he asked for already holds.
 */
export class NothingNewToSend extends ArtifactRefusal {
  constructor() {
    super(409, "Nothing new to send: every pick here has gone to the session.");
  }
}
