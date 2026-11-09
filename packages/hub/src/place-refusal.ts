import { ArtifactRefusal } from "./artifacts/refusals";

/**
 * Why a place was not added, or a name not taken: the route's status and
 * its sentence, which a setup page's send answers as it answers any
 * refusal of its own.
 */
export class PlaceRefusal extends ArtifactRefusal {
  declare readonly status: 400 | 404;
}
