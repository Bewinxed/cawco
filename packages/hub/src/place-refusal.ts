import { StatusRefusal } from "./refusal";

/**
 * Why a place was not added, or a name not taken: the route's status and
 * its sentence, which a setup page's send answers as it answers any
 * refusal of its own.
 */
export class PlaceRefusal extends StatusRefusal<
  400 | 404 | 409 | 413 | 503 | 504
> {}
