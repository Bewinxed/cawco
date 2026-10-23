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
 * A moment's excerpt is a few words of its turn, and a password typed in
 * prose is told by its sentence ("my sudo password is …"), whose telling
 * word may stand outside them: the machines are asked for the words around
 * each excerpt (`context`), the recognizer reads those, and what it finds is
 * mapped back into the excerpt. Those words never leave the hub.
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
import type { HeldMoment } from "./find";
import { secretRangesOf } from "./secret-filter";

/**
 * One text of a result that may hold a secret, and where its spans go:
 * `text` is what the recognizer reads, and `shift` maps a span found in it
 * back into the words the screen draws (its words from `from` to `to`), or says the text
 * is those words.
 */
interface Said {
  field: keyof FindSecrets | { moment: number };
  shift: { by: number; from: number; to: number } | null;
  text: string;
}

const ELLIPSIS = "…";
const SPACES = /\s+/g;

/**
 * What the recognizer reads for a moment: the words around its excerpt
 * (`HeldMoment.context`, the machine's or a thread message's whole), so a
 * password typed in prose is told by its sentence even when the word that
 * tells it stands outside the excerpt; the excerpt alone when it carries
 * none, or its words are not found in them.
 */
const momentSaid = (moment: HeldMoment, index: number): Said => {
  const plain = unmarked(moment.excerpt);
  const lead = plain.startsWith(ELLIPSIS) ? ELLIPSIS.length : 0;
  const tail = plain.endsWith(ELLIPSIS) ? ELLIPSIS.length : 0;
  const core = plain.slice(lead, plain.length - tail);
  const field = { moment: index };
  for (const context of moment.context === undefined
    ? []
    : [moment.context, moment.context.replace(SPACES, " ")]) {
    const at = core ? context.indexOf(core) : -1;
    if (at >= 0) {
      return {
        field,
        text: context,
        shift: { by: at - lead, from: lead, to: lead + core.length },
      };
    }
  }
  return { field, text: plain, shift: null };
};

/** Every text of `result` the person's Find draws: its title, purpose, last report and moments' excerpts. */
const saidOf = (result: FindResult): Said[] => {
  const said: Said[] = [{ field: "title", text: result.title, shift: null }];
  if (result.kind === "conversation") {
    if (result.purpose) {
      said.push({ field: "purpose", text: result.purpose, shift: null });
    }
    if (result.lastReport) {
      said.push({
        field: "report",
        text: result.lastReport.headline,
        shift: null,
      });
    }
  }
  if (result.kind === "conversation" || result.kind === "thread") {
    result.moments.forEach((moment, index) => {
      said.push(momentSaid(moment, index));
    });
  }
  return said;
};

/** Spans found in a moment's context, as the excerpt's own: those outside it gone, those across its edges cut there. */
const shifted = (spans: SecretSpan[], shift: Said["shift"]): SecretSpan[] =>
  shift === null
    ? spans
    : spans.flatMap(([start, end]): SecretSpan[] => {
        const from = Math.max(shift.from, start - shift.by);
        const to = Math.min(shift.to, end - shift.by);
        return to > from ? [[from, to]] : [];
      });

/** A moment without the words around it: they never leave the hub. */
const bare = ({ context: _context, ...moment }: HeldMoment): FindMoment =>
  moment;

/** `result` with the spans its texts hold; unchanged when they hold none. */
const marked = (
  result: FindResult,
  said: Said[],
  spans: SecretSpan[][]
): FindResult => {
  const secrets: FindSecrets = {};
  const moments = new Map<number, SecretSpan[]>();
  said.forEach((each, index) => {
    const found = shifted(spans[index] ?? [], each.shift);
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
  const withSpans = result.moments.map((held, index): FindMoment => {
    const moment = bare(held);
    const found = moments.get(index);
    return found ? { ...moment, secrets: found } : moment;
  });
  return { ...result, ...named, moments: withSpans };
};

/**
 * `answer` as the person's screens get it: while secrets are hidden
 * (`hide`), every secret its results' words hold named ({@link FindSecrets},
 * `FindMoment.secrets`); either way, no moment's surrounding words.
 */
export const forScreens = (
  answer: FindAnswer,
  hide: boolean
): Promise<FindAnswer> | FindAnswer =>
  hide
    ? withSecrets(answer)
    : {
        ...answer,
        results: answer.results.map((result) =>
          result.kind === "conversation" || result.kind === "thread"
            ? { ...result, moments: result.moments.map(bare) }
            : result
        ),
      };

/** `answer` with every secret its results' words hold named ({@link FindSecrets}, `FindMoment.secrets`). */
const withSecrets = async (answer: FindAnswer): Promise<FindAnswer> => {
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
