import { timeLeft } from "./helpers";

/**
 * What the hub's connection says while an announced update restarts the hub
 * (`hub.restart`), for the dashboard's connection band (HubBand) and the
 * native app's status line alike (WORDS.md, "Error formula": a fleet error
 * sits in the connection band). Calm: nothing failed and nothing is to be
 * pressed until the deadline passes.
 *
 * The dashboard imports this module; `bun run words` writes it into the app
 * as `Words.Connection` (CawCoCore/Words.generated.swift), and `words:check`
 * fails the typecheck chain when that file is stale. So a word is changed
 * here or nowhere.
 */
export const connectionWords = {
  /** The hub restarts for the update to `version` (null when unnamed), back within `seconds`. */
  updating: (version: string | null, seconds: number) =>
    `CawCo is updating${(version ?? "").length > 0 ? ` to ${version ?? ""}` : ""} — the hub is back within ${timeLeft(seconds)}.`,
  /** The hub answered again after the update it announced. */
  updated: (version: string | null) =>
    `CawCo updated${(version ?? "").length > 0 ? ` to ${version ?? ""}` : ""}.`,
};
