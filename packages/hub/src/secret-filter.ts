/**
 * No secret reaches an agent through the hub's own words about what was
 * said, nor a project's git. Every text an agent's `find` answers with
 * (find-tool.ts: excerpts, detailed turns, `around`'s turns) and every
 * `memory_note` before it is written (memory.ts) pass {@link redactSecrets}
 * first; each match is said as {@link REDACTED_SECRET}. The dashboard's own
 * Find, the person's, is not filtered. Two kinds of match:
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
 */
import { lintSource } from "@secretlint/core";
import { creator as recommended } from "@secretlint/secretlint-rule-preset-recommend";

export const REDACTED_SECRET = "[redacted]";

const RULES = { rules: [{ id: recommended.meta.id, rule: recommended }] };

/** A word that says the sentence is about a credential. */
const CREDENTIAL_TALK =
  /\b(?:pass(?:word|phrase|wd)s?|key(?:chain|ring)s?|unlock(?:s|ed|ing)?|log-?ins?|sudo)\b/i;
/** A sentence: up to an end mark and its space, or a line break. */
const SENTENCE = /[^\n]*?(?:[.!?](?=\s|$)|\n|$)/g;
const WORD = /\S+/g;
/** Wrapping a word may carry that is not part of it: quotes, brackets, a trailing comma or stop. */
const WRAP_START = /^["'`([{<]+/;
const WRAP_END = /["'`)\]}>]*[.,;:]?["'`)\]}>]*$/;
const PASSWORD_MIN = 8;
const LOWER = /[a-z]/;
const UPPER = /[A-Z]/;
const DIGIT_OR_SYMBOL = /[^A-Za-z]/;

/** Eight characters or more, upper and lower case, and a digit or a symbol. */
export const passwordShaped = (word: string): boolean =>
  word.length >= PASSWORD_MIN &&
  LOWER.test(word) &&
  UPPER.test(word) &&
  DIGIT_OR_SYMBOL.test(word) &&
  word !== REDACTED_SECRET;

type Range = readonly [start: number, end: number];

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

/** `text` with every secret found (module header) replaced by {@link REDACTED_SECRET}, overlapping finds as one. */
export const redactSecrets = async (text: string): Promise<string> => {
  if (!text.trim()) {
    return text;
  }
  const ranges = [...(await shapedCredentials(text)), ...typedCredentials(text)]
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
  let out = "";
  let at = 0;
  for (const [start, end] of merged) {
    out += `${text.slice(at, start)}${REDACTED_SECRET}`;
    at = end;
  }
  return `${out}${text.slice(at)}`;
};
