/**
 * What one Antigravity account signs agy in with: one of the four methods
 * agy's ACP offers (`initialize`'s `authMethods` on 1.5.18), with exactly
 * the fields that method needs, so a launch is built from a value the
 * type-checker holds complete. CawCo never falls back from an account's
 * method to another (tsk-340, "Compliance posture"). Browser-safe: types,
 * plain values and pure functions only.
 *
 * - `oauth-personal`: a Google account, signed in by agy itself.
 * - `oauth-business`: Gemini Enterprise, signed in by agy itself, with the
 *   Google Cloud project and location its settings name.
 * - `gemini-api-key`: an AI Studio key, handed to agy as `GEMINI_API_KEY`.
 * - `agent-platform`: Vertex AI on a Google Cloud project and location, with
 *   Application Default Credentials from gcloud's own default place. agy
 *   1.5.18's ACP signs it in on those alone: with no project and location it
 *   refuses a key ("GOOGLE_API_KEY Express Mode without project/location is
 *   not supported"), and with them it reads gcloud's credentials whatever
 *   `GOOGLE_API_KEY` holds (item 5's probe, tsk-340).
 */

import { accountsWords } from "../words/accounts";
import { agyWords } from "../words/agy";

/** The account provider an Antigravity account is of. */
export const AGY_PROVIDER = "antigravity";

/**
 * agy's model groups, by the ids its `/usage` gives their windows
 * (`gemini-5h`, `gemini-weekly`, `3p-5h`, `3p-weekly`; agy 1.5.18, the
 * project's `assets/49917009/usage.json`): "Within each group, models share a
 * weekly limit and a 5-hour limit". `scope` is the scope label the group's
 * windows carry (core usage/types.ts `LimitWindow.scopeLabel`), and `holds`
 * whether one of agy's model ids is in the group. The groups' own lists say
 * which: Google's models, every id `gemini-…` (the Orchestrators are
 * `gemini-pro-orchestrator…`), are `gemini`; the third-party ones agy lists
 * beside them (`claude-…`, `gpt-oss-…`) are `3p`.
 */
export const AGY_MODEL_GROUPS = [
  {
    id: "gemini",
    scope: agyWords.groups.gemini,
    holds: (model: string): boolean => model.startsWith("gemini-"),
  },
  {
    id: "3p",
    scope: agyWords.groups.thirdParty,
    holds: (model: string): boolean => !model.startsWith("gemini-"),
  },
] as const;

/** agy's ACP sign-in methods, by their ids. */
export const AGY_METHODS = [
  "oauth-personal",
  "oauth-business",
  "gemini-api-key",
  "agent-platform",
] as const;

export type AgyMethod = (typeof AGY_METHODS)[number];

/**
 * The account kind a method's account is (core accounts.ts `AccountKind`):
 * `oauth` for a browser sign-in agy runs itself, `api_key` for a method the
 * person connects with a key or a Google Cloud place, no browser.
 */
export const agyMethodKind = (method: AgyMethod): "oauth" | "api_key" =>
  method === "oauth-personal" || method === "oauth-business"
    ? "oauth"
    : "api_key";

/** A Google Cloud project and location, as agy's settings name them (`gcp`). */
export interface GcpPlace {
  readonly location: string;
  readonly project: string;
}

/** One account's sign-in, complete for its method. */
export type AgySignIn =
  | { readonly method: "oauth-personal" }
  | { readonly method: "oauth-business"; readonly gcp: GcpPlace }
  | { readonly method: "gemini-api-key"; readonly key: string }
  | { readonly method: "agent-platform"; readonly gcp: GcpPlace };

/**
 * What an account's record on its machine holds (core paths/harnesses.ts
 * `agyAccountRecord`): its method and the place it names, never a key.
 */
export interface AgyAccountRecord {
  readonly gcp?: GcpPlace;
  readonly method: AgyMethod;
}

/** A place both of whose names are written, trimmed; none when either is empty. */
export const placeOf = (gcp: GcpPlace | undefined): GcpPlace | undefined => {
  const project = gcp?.project.trim();
  const location = gcp?.location.trim();
  return project && location ? { project, location } : undefined;
};

/**
 * Why an account of `kind` cannot be made on `record`, in the words the
 * person reads; undefined when it can. The method must be of the account's
 * kind ({@link agyMethodKind}); a place given must have both its names;
 * Gemini Enterprise must name one. Whether a key method holds its key is
 * the machine's to say when it is connected.
 */
export const agyRecordRefusal = (
  record: AgyAccountRecord,
  kind: string
): string | undefined => {
  const method = accountsWords.agyMethods[record.method];
  if (agyMethodKind(record.method) !== kind) {
    return agyWords.methodNotKind(method);
  }
  if (record.gcp && !placeOf(record.gcp)) {
    return agyWords.halfPlace;
  }
  if (record.method === "oauth-business" && !record.gcp) {
    return agyWords.noBusinessPlace;
  }
  if (record.method === "agent-platform" && !record.gcp) {
    return agyWords.noPlatformPlace;
  }
  if (
    record.gcp &&
    record.method !== "oauth-business" &&
    record.method !== "agent-platform"
  ) {
    return agyWords.noPlace(method);
  }
  return undefined;
};
