/**
 * What the Standing card reads beside the project's own row (ProjectRow):
 * the facts the hub has no read of yet, each shaped as the card draws it.
 * Each is a call the server lacks today, mocked at the card's props.
 */
import type { BuiltInKind, BuiltInMember } from "@cawco/core/decides";

/** One kind of choice and who settles it in this project. */
interface KindSettled {
  /** Who settles it, as Who decides names its members (core words/decides.ts). */
  by: BuiltInMember;
  kind: BuiltInKind;
  /** Settled by the project's own rule, not the fleet's. */
  own: boolean;
}

/**
 * Who decides as the project stands: the fleet's rule on every kind, its own
 * on some, or its rule file failed to read and every choice comes to the
 * person.
 */
export type DecidesStanding =
  | { state: "fleet"; kinds: KindSettled[] }
  | { state: "own"; kinds: KindSettled[] }
  | { state: "unread"; reason: string };

/** What a place's machine says of its folder (none of it in ProjectPlace today). */
export interface PlaceFolder {
  /** CawCo made the folder; the person named every other one. */
  made: boolean;
  /** The folder is no longer where the place points. */
  missing: boolean;
}

/** An account as the card offers it: the name it carries everywhere, and whether any machine is signed in to it. */
export interface AccountChoice {
  id: string;
  name: string;
  provider: string;
  signedIn: boolean;
}
