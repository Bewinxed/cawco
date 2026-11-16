/**
 * What a session's move to another account says while it waits for its
 * moment (hub `owedMoves`), and of a model picked meanwhile: the line its
 * menu and rows show (dashboard accounts/switch.svelte.ts `movingWords`,
 * workspace/SessionDetails.svelte), the hub's refusal of a pick the account
 * it is moving to can't take (limit-moves.ts `pickWithMove`), and a move the
 * hub refused, naming the account it stays on.
 */
import { andList } from "./helpers";

/** What a waiting move waits on, as its line ends: core protocol `OwedMoveWait`, or its machine away. */
export type MoveWait =
  | { kind: "turn" }
  | { kind: "work" }
  | { kind: "machine"; host: string }
  | { kind: "now" };

/** How many of an account's models a refused pick names. */
const MODELS_NAMED = 6;

/** "when this turn ends": the moment a waiting move goes, as its line ends. */
const whenWords = (wait: MoveWait): string => {
  switch (wait.kind) {
    case "turn":
      return " when this turn ends";
    case "work":
      return " when its background work ends";
    case "machine":
      return ` when ${wait.host} is connected again`;
    case "now":
      return "…";
  }
};

export const owedMoveWords = {
  /**
   * The menu's line for a move that waits: "Moves to jude@petralab.ai when
   * this turn ends", and with a model picked meanwhile, "Moves to
   * jude@petralab.ai on Opus 4.5 when this turn ends". Going now, it is
   * "Moving to …".
   */
  moving: (to: string, model: string | undefined, wait: MoveWait): string =>
    `${wait.kind === "now" ? "Moving" : "Moves"} to ${to}${model ? ` on ${model}` : ""}${whenWords(wait)}`,
  /**
   * The session card's line for a move that waits, beside chips that
   * already show the account and the model it moves to: only when it goes.
   * "Moves when this turn ends"; going now, "Moving…".
   */
  waiting: (wait: MoveWait): string =>
    wait.kind === "now" ? "Moving…" : `Moves${whenWords(wait)}`,
  /**
   * The menu's line for a model picked while the session waits to relaunch
   * on the account it already names (a model that crossed providers): "Runs
   * GPT-5 when this turn ends".
   */
  runs: (model: string, wait: MoveWait): string =>
    `Runs ${model}${wait.kind === "now" ? " as it relaunches" : whenWords(wait)}`,
  /** A person's move the hub refused: what stays, and why. */
  notMoved: (title: string, from: string, to: string, why: string): string =>
    `${title} stays on ${from}, not moved to ${to}: ${why}. Nothing changed; move it again once that is fixed.`,
  /**
   * Why a model picked while the session waits to move can't go with it, as
   * the clause after "The model was not changed:" (dashboard
   * stores/commands.svelte.ts `failureNotice`). Each names the account it
   * is moving to.
   */
  pickRefused: {
    /** The model is another provider's than the account's. */
    otherProvider: (to: string, provider: string, model: string): string =>
      `${to}, the account this session is moving to, is a ${provider} account and doesn't run ${model}`,
    /** The model runs on no account, and the session is moving to one. */
    noAccount: (to: string, model: string): string =>
      `${model} runs on no account, and this session is moving to ${to}`,
    /** The account's catalog doesn't list it. */
    notOffered: (to: string, model: string, offered: readonly string[]) =>
      offered.length === 0
        ? `${to}, the account this session is moving to, lists no models`
        : `${to}, the account this session is moving to, doesn't offer ${model}; it offers ${andList(offered.slice(0, MODELS_NAMED))}${offered.length > MODELS_NAMED ? ` and ${offered.length - MODELS_NAMED} more` : ""}`,
    /** The account's catalog was never read, so the model can't be checked against it. */
    unread: (to: string, model: string, why: string | undefined): string =>
      `${to}'s models haven't been read${why ? ` (${why})` : ""}, so ${model} can't be checked against the account this session is moving to`,
  },
};
