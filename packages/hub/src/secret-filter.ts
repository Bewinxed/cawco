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
 */
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
export const passwordShaped = (word: string): boolean =>
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
  const ranges = [
    ...(await shapedCredentials(text)),
    ...typedCredentials(text),
    ...setCredentials(text),
  ]
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const last = merged.at(-1);
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
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
  const found = [...(await secretRanges(text)), ...shaped].sort(
    (a, b) => a[0] - b[0]
  );
  const merged: [number, number][] = [];
  for (const [start, end] of found) {
    const last = merged.at(-1);
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
};
