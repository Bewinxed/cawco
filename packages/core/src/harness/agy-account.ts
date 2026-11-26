/**
 * What one Antigravity account signs agy in with: one of the four methods
 * agy's ACP offers (`initialize`'s `authMethods` on 1.5.18), with exactly
 * the fields that method needs, so a launch is built from a value the
 * type-checker holds complete. CawCo never falls back from an account's
 * method to another (tsk-340, "Compliance posture"). Browser-safe: types
 * and plain values only.
 *
 * - `oauth-personal`: a Google account, signed in by agy itself.
 * - `oauth-business`: Gemini Enterprise, signed in by agy itself, with the
 *   Google Cloud project and location its settings name.
 * - `gemini-api-key`: an AI Studio key, handed to agy as `GEMINI_API_KEY`.
 * - `agent-platform`: Vertex AI, by a key (`GOOGLE_API_KEY`) or by a Google
 *   Cloud project and location with Application Default Credentials from
 *   gcloud's own default place.
 */

/** The account provider an Antigravity account is of. */
export const AGY_PROVIDER = "antigravity";

/** agy's ACP sign-in methods, by their ids. */
export const AGY_METHODS = [
  "oauth-personal",
  "oauth-business",
  "gemini-api-key",
  "agent-platform",
] as const;

type AgyMethod = (typeof AGY_METHODS)[number];

/** A Google Cloud project and location, as agy's settings name them (`gcp`). */
interface GcpPlace {
  readonly location: string;
  readonly project: string;
}

/** One account's sign-in, complete for its method. */
export type AgySignIn =
  | { readonly method: "oauth-personal" }
  | { readonly method: "oauth-business"; readonly gcp: GcpPlace }
  | { readonly method: "gemini-api-key"; readonly key: string }
  | { readonly method: "agent-platform"; readonly key: string }
  | { readonly method: "agent-platform"; readonly gcp: GcpPlace };

/**
 * What an account's record on its machine holds (core paths/harnesses.ts
 * `agyAccountRecord`): its method and the place it names, never a key.
 */
export interface AgyAccountRecord {
  readonly gcp?: GcpPlace;
  readonly method: AgyMethod;
}
