import type { HarnessKind } from "@cawco/core/harness/kinds";
import { type ModelListing, modelRun } from "@cawco/core/model-names";
import {
  clockWords,
  markWords,
  spanWords,
} from "@cawco/core/words/account-lines";
import { accountsWords } from "@cawco/core/words/accounts";
import { spawnWords } from "@cawco/core/words/spawn";
import type { Standing } from "./placement";
import { unreachable } from "./unreachable";

/**
 * The model every start runs on is named by the hub before it spawns
 * (spawns.ts `placeSpawn`), never left to its harness: a start that picks
 * one runs on it, with placement's check that an account has room for it;
 * a start that picks none runs on its harness's own default when an
 * account can take it, else on the first model its harness lists there
 * that one can, else it is refused before anything spawns. A model that
 * runs on no CawCo account (a provider of the machine's own) is never
 * taken for a start that picked none: nothing the hub holds says it can
 * run. This module is the order and the refusal's words; spawns.ts runs
 * placement over them.
 */

/** A model, as its harness runs it, and the account it ran on, that a refused first turn already tried (start-model-moves.ts). */
export interface TriedPick {
  accountId: string;
  model: string;
}

/** A model a start picked: none for no model, and for `default`, which every harness lists as its own pick. */
export const pickedModel = (
  model: string | null | undefined
): string | undefined => (model && model !== "default" ? model : undefined);

/**
 * The model a start's harness would run on by itself, as its machine said
 * it for the start's directory (pi merges `<cwd>/.pi/settings.json` over its
 * global settings, server.ts `ownDefaultOf`): `model` null when it would
 * run on none CawCo can see. Absent where nothing was asked: the harness's
 * listing names it (its `default` row).
 */
export interface OwnDefault {
  model: string | null;
}

/**
 * The models a start that picked none is tried on, in order: its harness's
 * own default first ({@link OwnDefault}, else the listing's `default` row),
 * then every model the harness lists there in the order it lists them,
 * which is the order the model picker offers them in. Each by the id it
 * runs (core `modelRun`): Claude Code's aliases as the model they name, so
 * the harness is handed an id and never decides one. `own`: the default,
 * null when the harness names none.
 */
export const startCandidates = (
  listing: ModelListing,
  asked: OwnDefault | undefined
): { models: string[]; own: string | null } => {
  const rows = listing.read ? listing.rows : [];
  const listedDefault = rows.find((row) => row.value === "default");
  let own = asked?.model ?? null;
  if (asked === undefined && listedDefault) {
    own = modelRun(listedDefault);
  }
  const listed = rows
    .filter((row) => row.value !== "default")
    .map((row) => modelRun(row));
  return {
    own,
    models: [...new Set([...(own === null ? [] : [own]), ...listed])],
  };
};

/** Why a harness lists nothing a start that picked no model could run. */
export const nothingListed = (
  harness: HarnessKind,
  machine: string,
  listing: ModelListing
): string =>
  listing.read
    ? spawnWords.startModel.noneListed(
        accountsWords.harnesses[harness],
        machine
      )
    : spawnWords.startModel.unread(
        accountsWords.harnesses[harness],
        machine,
        listing.why
      );

/** One provider's accounts as a refusal reads them: its name, and each account's {@link Standing}. */
export interface ProviderStandings {
  accounts: { name: string; standing: Standing }[];
  provider: string;
  /** What else refused it on an account that has room (a fork, an account the start named), in placement's words. */
  refusals: string[];
}

/** "bewinxed@gmail.com is benched, back in 5d 19h (19:30)": one account that can't take the start. */
const accountLine = (
  name: string,
  standing: Exclude<Standing, { kind: "room" }>,
  machine: string,
  now: number
): string => {
  const words = spawnWords.startModel;
  const back = (at: number | null): string | null =>
    at === null
      ? null
      : words.back(words.at(spanWords(at - now), clockWords(at)));
  switch (standing.kind) {
    case "signed-out":
      return words.account(name, words.signedOut(machine), null);
    case "not-allowed":
      return words.account(name, words.notAllowed(standing.by), null);
    case "out-of-credit":
      return markWords(
        { kind: "credit", provider: standing.provider, since: standing.since },
        name,
        now
      );
    case "not-enabled":
      return markWords(
        { kind: "access", model: standing.model, since: standing.since },
        name,
        now
      );
    case "benched":
      return words.account(name, words.benched, back(standing.backAt));
    case "past-reserve":
      return words.account(
        name,
        words.pastReserve(standing.reservePct ?? 0),
        back(standing.backAt)
      );
    case "at-limit":
      return words.account(
        name,
        standing.creditOff ? words.noCredit(standing.creditOff) : words.atLimit,
        back(standing.backAt)
      );
    default:
      throw unreachable(standing);
  }
};

/**
 * Why no model a harness lists on a machine can start for a start that
 * picked none: the models that run on no CawCo account (its own default
 * named when it is one), each provider's accounts and why each can't take
 * it, and when the soonest is back.
 */
export const noModelRuns = (
  harness: HarnessKind,
  machine: string,
  unaccounted: { more: number; own: string | null },
  providers: readonly ProviderStandings[],
  now: number
): string => {
  const words = spawnWords.startModel;
  const reasons: string[] = [];
  if (unaccounted.own !== null || unaccounted.more > 0) {
    reasons.push(words.unaccounted(unaccounted.own, unaccounted.more));
  }
  const backs: number[] = [];
  for (const one of providers) {
    const lines: string[] = [];
    for (const { name, standing } of one.accounts) {
      if (standing.kind === "room") {
        continue;
      }
      if ("backAt" in standing && standing.backAt !== null) {
        backs.push(standing.backAt);
      }
      lines.push(accountLine(name, standing, machine, now));
    }
    if (lines.length > 0) {
      reasons.push(words.provider(one.provider, lines));
    }
    reasons.push(...one.refusals);
  }
  const first = backs.length > 0 ? Math.min(...backs) : null;
  return words.refused(
    accountsWords.harnesses[harness],
    machine,
    reasons,
    first === null ? null : words.at(spanWords(first - now), clockWords(first))
  );
};
