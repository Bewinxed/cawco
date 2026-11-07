/**
 * No secret reaches an agent through the hub's own words about what was
 * said, nor a project's git. Every text an agent's `find` answers with
 * (find-tool.ts: excerpts, detailed turns, `around`'s turns; an excerpt
 * read without its sentence by {@link outOfSentenceRanges}) and every
 * `memory_note` before it is written (memory.ts) pass {@link redactSecrets}
 * first; each match is said as {@link REDACTED_SECRET}. The person's own Find
 * is not filtered: while "Hide secrets in Find" is on, its answer names where
 * each secret stands ({@link secretRangesOf}, find-secrets.ts), and their
 * screen draws it as dots until they show it. The kinds of match:
 *
 * - **Credentials by shape**: secretlint's recommended preset
 *   (@secretlint/secretlint-rule-preset-recommend: AWS, GCP, private keys,
 *   npm, basic auth in URLs, Slack, SendGrid, Shopify, Stripe, GitHub,
 *   GitLab, Grafana, OpenAI, Anthropic, Groq, Hugging Face, Linear, Notion,
 *   1Password, database connection strings, Vault, Vercel, Databricks,
 *   Docker, Figma, Cloudflare, Tailscale), run through its own core
 *   (`lintSource`), each report's `range` cut out.
 * - **A credential typed in prose**: a sentence that mentions a password,
 *   passphrase, keychain, keyring, unlock, login or sudo, and holds a
 *   password-shaped word ({@link passwordShaped}: eight characters or more,
 *   upper and lower case, and a digit or a symbol). Nothing in secretlint's
 *   preset catches "my sudo password is …", which is how a person types one
 *   to an agent.
 * - **A credential set to a value**: `password=…`, `token: …`, `secret`,
 *   `passwd`, `api_key` or `apikey` followed by `:` or `=` and a value of six
 *   characters or more, and `Bearer <token>`: the shapes core's
 *   `CREDENTIAL_PATTERNS` caught in notes before this filter, which neither
 *   rule above does when the value is all lower case. The value is cut, the
 *   key kept.
 * - **A private mark**: `<private>…</private>` (core private-mark.ts), tags
 *   and all, where words that carry one are read back (a transcript the
 *   harness keeps); where the hub stores words it strips them before.
 * - **A forgotten fact**: words the person forgot (forget-fact.ts), as the
 *   hub holds them: each fact's word count and a salted hash of its words
 *   ({@link ForgottenFact}), never the words. A run of that many words
 *   whose hash matches is cut, so a machine whose index still holds the
 *   fact (not connected at the forget, or its transcripts read again) never
 *   answers with it.
 */
import { createHash } from "node:crypto";
import { privateRanges } from "@cawco/core/private-mark";
import { lintSource } from "@secretlint/core";
import { creator as recommended } from "@secretlint/secretlint-rule-preset-recommend";

export const REDACTED_SECRET = "[redacted]";

const RULES = { rules: [{ id: recommended.meta.id, rule: recommended }] };

/** A word that says the sentence is about a credential. */
const CREDENTIAL_TALK =
  /\b(?:pass(?:word|phrase|wd)s?|key(?:chain|ring)s?|unlock(?:s|ed|ing)?|log-?ins?|sudo)\b/iu;
/** A sentence: up to an end mark and its space, or a line break. */
const SENTENCE = /[^\n]*?(?:[.!?](?=\s|$)|\n|$)/gu;
const WORD = /\S+/gu;
/** Wrapping a word may carry that is not part of it: quotes, brackets, a trailing comma or stop. */
const WRAP_START = /^["'`([{<]+/u;
const WRAP_END = /["'`)\]}>]*[.,;:]?["'`)\]}>]*$/u;
const PASSWORD_MIN = 8;
const LOWER = /[a-z]/u;
const UPPER = /[A-Z]/u;
const DIGIT_OR_SYMBOL = /[^A-Za-z]/u;

/** Eight characters or more, upper and lower case, and a digit or a symbol. */
const passwordShaped = (word: string): boolean =>
  word.length >= PASSWORD_MIN &&
  LOWER.test(word) &&
  UPPER.test(word) &&
  DIGIT_OR_SYMBOL.test(word) &&
  word !== REDACTED_SECRET;

type Range = readonly [start: number, end: number];

/** A credential's key and its value; the value (group 1) is what is cut. */
const SET_TO_VALUE = [
  /\b(?:password|passwd|secret|token|api[-_]?key)\s*[:=]\s*(\S{6,})/dgiu,
  /\bbearer\s+([A-Za-z0-9._~+/-]{16,}=*)/dgiu,
];

/** Every value a credential's key is set to ({@link SET_TO_VALUE}). */
const setCredentials = (text: string): Range[] =>
  SET_TO_VALUE.flatMap((pattern) =>
    [...text.matchAll(pattern)].flatMap((match): Range[] => {
      const value = match.indices?.[1];
      return value ? [[value[0], value[1]]] : [];
    })
  );

/** Every password-shaped word of a sentence that talks about a credential. */
const typedCredentials = (text: string): Range[] =>
  [...text.matchAll(SENTENCE)]
    .filter(([sentence]) => CREDENTIAL_TALK.test(sentence))
    .flatMap((sentence) =>
      [...sentence[0].matchAll(WORD)].flatMap((match): Range[] => {
        const [raw] = match;
        const lead = WRAP_START.exec(raw)?.[0].length ?? 0;
        const word = raw.slice(lead).replace(WRAP_END, "");
        const start = sentence.index + match.index + lead;
        return passwordShaped(word) ? [[start, start + word.length]] : [];
      })
    );

/** secretlint's recommended preset's reports over `text`. */
const shapedCredentials = async (text: string): Promise<Range[]> => {
  const { messages } = await lintSource({
    source: {
      content: text,
      filePath: "/said.txt",
      ext: ".txt",
      contentType: "text",
    },
    options: { config: RULES, noPhysicFilePath: true },
  });
  return messages.map(({ range }) => range);
};

/** `ranges` in order, those that overlap or touch as one. */
const mergedRanges = (
  ranges: readonly Range[]
): [start: number, end: number][] => {
  const merged: [number, number][] = [];
  for (const [start, end] of ranges.toSorted((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
};

/** A fact the person forgot, as the hub keeps it: never its words (db `forgotten_facts`). */
export interface ForgottenFact {
  /** sha256 of `salt` and the fact's words ({@link factWords}), hex. */
  hash: string;
  salt: string;
  /** How many words it is. */
  words: number;
}

/** The facts forgotten so far, as the hub reads them (forget-fact.ts sets the reader at its start). */
let forgottenFacts: () => readonly ForgottenFact[] = () => [];

/** Where the filter reads the forgotten facts from: the hub's table, once it is open. */
export const readForgottenFrom = (
  read: () => readonly ForgottenFact[]
): void => {
  forgottenFacts = read;
};

/** A word as a forgotten fact is matched: its wrapping off, in lower case. */
const factWord = (raw: string): string =>
  raw.replace(WRAP_START, "").replace(WRAP_END, "").toLowerCase();

/** The words of `text` as a forgotten fact is matched, each with where it stands. */
const wordsWithPlaces = (text: string) =>
  [...text.matchAll(WORD)].map((match) => ({
    word: factWord(match[0]),
    start: match.index,
    end: match.index + match[0].length,
  }));

/** A fact's words, as {@link ForgottenFact.hash} hashes them: one space apart. */
export const factWords = (text: string): string[] =>
  wordsWithPlaces(text)
    .map((each) => each.word)
    .filter(Boolean);

/** {@link ForgottenFact.hash} of `words` under `salt` (hex: no space in it). */
export const factHash = (salt: string, words: readonly string[]): string =>
  createHash("sha256")
    .update(`${salt} ${words.join(" ")}`)
    .digest("hex");

/** Every run of words in `text` that is a forgotten fact. */
const forgottenRanges = (text: string): Range[] => {
  const facts = forgottenFacts();
  if (facts.length === 0) {
    return [];
  }
  const words = wordsWithPlaces(text);
  return facts.flatMap((fact) => {
    const found: Range[] = [];
    for (let at = 0; at + fact.words <= words.length; at += 1) {
      const run = words.slice(at, at + fact.words);
      if (
        factHash(
          fact.salt,
          run.map((each) => each.word)
        ) === fact.hash
      ) {
        found.push([run[0]?.start ?? 0, run.at(-1)?.end ?? 0]);
      }
    }
    return found;
  });
};

/**
 * Where every secret found (module header) stands in `text`, in order,
 * overlapping finds as one: the one recognizer both the agent's redaction
 * and the person's masked Find read.
 */
export const secretRanges = async (
  text: string
): Promise<[start: number, end: number][]> => {
  if (!text.trim()) {
    return [];
  }
  return mergedRanges(
    [
      ...(await shapedCredentials(text)),
      ...typedCredentials(text),
      ...setCredentials(text),
      ...privateRanges(text),
      ...forgottenRanges(text),
    ].filter(([start, end]) => end > start)
  );
};

/**
 * Where the secrets stand in each of `texts`, read in one pass of the
 * recognizer: the texts joined a blank line apart (a sentence never runs
 * across one), each find cut back to the text it is in.
 */
export const secretRangesOf = async (
  texts: readonly string[]
): Promise<[start: number, end: number][][]> => {
  const starts: number[] = [];
  let joined = "";
  for (const text of texts) {
    if (joined) {
      joined += "\n\n";
    }
    starts.push(joined.length);
    joined += text;
  }
  const found = await secretRanges(joined);
  return texts.map((text, index) => {
    const from = starts[index] as number;
    const to = from + text.length;
    return found.flatMap(([start, end]): [number, number][] =>
      end > from && start < to
        ? [[Math.max(start, from) - from, Math.min(end, to) - from]]
        : []
    );
  });
};

/** `text` with every secret found (module header) replaced by {@link REDACTED_SECRET}, overlapping finds as one. */
export const redactSecrets = async (text: string): Promise<string> => {
  let out = "";
  let at = 0;
  for (const [start, end] of await secretRanges(text)) {
    out += `${text.slice(at, start)}${REDACTED_SECRET}`;
    at = end;
  }
  return `${out}${text.slice(at)}`;
};

/**
 * Where the secrets stand in `text` ({@link secretRanges}), and every
 * password-shaped word in it too ({@link passwordShaped}), whatever its
 * sentence says: for words read without the sentence they stand in (an
 * index's snippet, when the words around it could not be had), whose
 * telling word ("password", "sudo") may stand outside them. Masked, never
 * withheld whole.
 */
export const outOfSentenceRanges = async (
  text: string
): Promise<[start: number, end: number][]> => {
  const shaped = [...text.matchAll(WORD)].flatMap(
    (match): [number, number][] => {
      const [raw] = match;
      const lead = WRAP_START.exec(raw)?.[0].length ?? 0;
      const word = raw.slice(lead).replace(WRAP_END, "");
      const start = match.index + lead;
      return passwordShaped(word) ? [[start, start + word.length]] : [];
    }
  );
  return mergedRanges([...(await secretRanges(text)), ...shaped]);
};
