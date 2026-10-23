/**
 * The person's Find, with its secrets named (the owner's pick on
 * "find-secrets", 2026-10-22: "A secret in your results shows as dots, and
 * clicking it shows that one"). Pasted screenshots of the dashboard reach
 * agents' chats, so a password drawn plainly in Find reaches an agent
 * through the picture.
 *
 * While "Hide secrets in Find" is on (its one row, db `find_settings`; on
 * unless the person turns it off), every answer of `GET /api/find` says
 * where each secret stands in each result's own words: its title, a
 * conversation's purpose and last report, and every moment's excerpt
 * (`secrets`, core find.ts). The recognizer is the one the agents' redaction
 * reads (secret-filter.ts `secretRangesOf`); the words themselves are sent
 * whole, so the person's click shows that one in place. Off, an answer names
 * none, and every screen draws its words as they are.
 *
 * An agent's `find` (find-tool.ts) never reads this: what it is answered is
 * redacted outright.
 */
import type {
  FindAnswer,
  FindMoment,
  FindResult,
  FindSecrets,
  SecretSpan,
} from "@cawco/core";
import { unmarked } from "@cawco/core/find-match";
import { secretRangesOf } from "./secret-filter";

/** One text of a result that may hold a secret, and where its spans go. */
interface Said {
  field: keyof FindSecrets | { moment: number };
  text: string;
}

/** Every text of `result` the person's Find draws: its title, purpose, last report and moments' excerpts. */
const saidOf = (result: FindResult): Said[] => {
  const said: Said[] = [{ field: "title", text: result.title }];
  if (result.kind === "conversation") {
    if (result.purpose) {
      said.push({ field: "purpose", text: result.purpose });
    }
    if (result.lastReport) {
      said.push({ field: "report", text: result.lastReport.headline });
    }
  }
  if (result.kind === "conversation" || result.kind === "thread") {
    result.moments.forEach((moment, index) => {
      said.push({ field: { moment: index }, text: unmarked(moment.excerpt) });
    });
  }
  return said;
};

/** `result` with the spans its texts hold; unchanged when they hold none. */
const marked = (
  result: FindResult,
  said: Said[],
  spans: SecretSpan[][]
): FindResult => {
  const secrets: FindSecrets = {};
  const moments = new Map<number, SecretSpan[]>();
  said.forEach((each, index) => {
    const found = spans[index] ?? [];
    if (found.length === 0) {
      return;
    }
    if (typeof each.field === "string") {
      secrets[each.field] = found;
    } else {
      moments.set(each.field.moment, found);
    }
  });
  const named = Object.keys(secrets).length > 0 ? { secrets } : {};
  if (result.kind !== "conversation" && result.kind !== "thread") {
    return { ...result, ...named };
  }
  const withSpans = result.moments.map((moment, index): FindMoment => {
    const found = moments.get(index);
    return found ? { ...moment, secrets: found } : moment;
  });
  return { ...result, ...named, moments: withSpans };
};

/** `answer` with every secret its results' words hold named ({@link FindSecrets}, `FindMoment.secrets`). */
export const withSecrets = async (answer: FindAnswer): Promise<FindAnswer> => {
  const said = answer.results.map(saidOf);
  const spans = await secretRangesOf(
    said.flatMap((texts) => texts.map((each) => each.text))
  );
  let at = 0;
  return {
    ...answer,
    results: answer.results.map((result, index) => {
      const texts = said[index] ?? [];
      const own = spans.slice(at, at + texts.length);
      at += texts.length;
      return marked(result, texts, own);
    }),
  };
};
