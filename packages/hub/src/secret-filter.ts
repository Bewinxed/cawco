/**
 * THE ONE CREDENTIAL SCANNER. Every text the hub cuts credentials out of goes
 * through {@link credentialRanges}: what an agent's `find` answers with
 * (find-tool.ts), a `memory_note` before it is written (memory.ts), every
 * string of every frame, ask, problem and push that leaves for a client, an
 * app or another session (redactor.ts), and the failure words a machine sends
 * the hub, where they enter it (redactor.ts `admittedFromMachine`). Each
 * match is said as {@link REDACTED_SECRET}. The person's own Find is not
 * filtered: while "Hide secrets in Find" is on, its answer names where each
 * secret stands ({@link secretRangesOf}, find-secrets.ts), and their screen
 * draws it as dots until they show it.
 *
 * It runs at once (no promise): a frame leaves in order with the frames
 * around it, and a problem is written when Elysia writes it. The kinds of
 * match, each cutting the credential alone and leaving the words, paths,
 * hosts and commands around it (`exit 128: GITHUB_TOKEN=[redacted] git push:
 * remote rejected`):
 *
 * - **Credentials by shape**: secretlint's recommended preset
 *   (@secretlint/secretlint-rule-preset-recommend: AWS, GCP, private keys,
 *   npm, basic auth in URLs, Slack, SendGrid, Shopify, Stripe, GitHub,
 *   GitLab, Grafana, OpenAI, Anthropic, Groq, Hugging Face, Linear, Notion,
 *   1Password, database connection strings, Vault, Vercel, Databricks,
 *   Docker, Figma, Cloudflare, Tailscale), run by its own core
 *   (`lintSource`) through a preset of its rules whose reports are taken as
 *   each is made ({@link shapedCredentials}). A report that covers a whole
 *   URL is cut to its password (`postgres://app:[redacted]@db:5432/app`).
 *   Its comment filter is left out: a `secretlint-disable` in an agent's
 *   words would otherwise hide what follows it.
 * - **A word core reads as a credential by its shape** (`looksSecret`: a
 *   `sk-`, `ghp_`, `xox…`, AWS or JWT token), read in each part of a word
 *   split at `=` and `:`, so `OPENAI_API_KEY=sk-…` cuts the key's value.
 * - **A credential set to a value**: a name that ends in `password`,
 *   `passwd`, `secret`, `token`, `api_key`, `apikey`, `access_key` or
 *   `private_key` (`GITHUB_TOKEN`, `_authToken`, `x-api-key`), then `:` or
 *   `=` and a value that reads as a credential ({@link credentialValue}: six
 *   characters or more with a digit, a symbol or both cases, and not a
 *   reference such as `$TOKEN` or `process.env.KEY`); and `Bearer <token>`.
 *   An environment variable in capitals named for a key (`DEPLOY_KEY`,
 *   `GH_PAT`, `DB_PASS`) is read the same way. The value is cut, the name
 *   kept. A plain word after the name is left: `Invalid token: expired`
 *   stays as it is. A basic sign-in's header (`Authorization: Basic …`)
 *   loses its value.
 * - **A URL's password** (`scheme://user:password@host`), the user and host
 *   kept.
 * - **A private key block** (`-----BEGIN … PRIVATE KEY-----` to its end),
 *   whole.
 * - **A credential typed in prose** ({@link secretRanges} alone, for what an
 *   agent reads back and the person's Find): a sentence that mentions a
 *   password, passphrase, keychain, keyring, unlock, login or sudo, and
 *   holds a password-shaped word ({@link passwordShaped}). The hub's own
 *   sentences name machines and accounts beside "sign-in" and "login", and a
 *   name such as "MacBook-Pro2" is password-shaped, so text that leaves for
 *   a client is not read for it.
 */

import { looksSecret } from "@cawco/core/secret-shapes";
import { lintSource } from "@secretlint/core";
import { creator as recommended } from "@secretlint/secretlint-rule-preset-recommend";
import type {
  SecretLintRuleCreator,
  SecretLintRulePresetContext,
  SecretLintRulePresetCreator,
} from "@secretlint/types";

export const REDACTED_SECRET = "[redacted]";

type Range = readonly [start: number, end: number];

type ShapeRule = SecretLintRuleCreator<unknown>;

/** The preset's rule that only lifts reports a `secretlint-disable` comment names. */
const COMMENT_FILTER = "@secretlint/secretlint-rule-filter-comments";

/** Where the scan in progress puts each report; undefined between scans. */
let reports: Range[] | undefined;
/** How many of the preset's scanners have read the scan in progress. */
let scannersRan = 0;
/** What a scanner threw, or a scanner that answered later than at once. */
let scannerFault: unknown;

/**
 * Each of the preset's scanners, as published, its reports taken where it
 * makes them: secretlint's core calls every rule's `file` in the same turn
 * as `lintSource` (its event emitter calls each listener at once), and every
 * rule of the preset reads a text file at once. A rule that answers with a
 * promise is a fault ({@link shapedCredentials} throws), never a scan that
 * missed what it found later.
 */
const presetRules: readonly ShapeRule[] = recommended.rules;
const scanners: ShapeRule[] = presetRules
  .filter((rule) => rule.meta.id !== COMMENT_FILTER)
  .map((rule): ShapeRule => ({
    ...rule,
    create: (context, options) => {
      const handler = rule.create(
        {
          ...context,
          report: (descriptor) => {
            reports?.push([descriptor.range[0], descriptor.range[1]]);
          },
          ignore: () => undefined,
        },
        options
      );
      return {
        file: (source) => {
          scannersRan += 1;
          try {
            const later = handler.file?.(source);
            if (later) {
              scannerFault = new Error(
                `secretlint's ${rule.meta.id} answered a text later than at once: the scanner cannot wait for it`
              );
              later.catch(() => undefined);
            }
          } catch (error) {
            scannerFault = error;
          }
        },
      };
    },
  }));

/** How many scanners read a text: those that read text, or any content. */
const TEXT_SCANNERS = scanners.filter((rule) =>
  rule.meta.supportedContentTypes.some(
    (type) => type === "text" || type === "all"
  )
).length;

/** The preset, its scanners those above. */
const atOnce: SecretLintRulePresetCreator = {
  meta: { ...recommended.meta, id: "@cawco/credentials-at-once" },
  rules: scanners,
  create: (context: SecretLintRulePresetContext) => {
    for (const rule of scanners) {
      context.registerRule(rule);
    }
  },
};
const CONFIG = { rules: [{ id: atOnce.meta.id, rule: atOnce }] };

/** A URL's `user:password@`, the password its group 1. */
const URL_PASSWORD = /\b[a-z][a-z\d+.-]*:\/\/[^\s:/@]*:([^\s/@]+)@/dgiu;

/**
 * secretlint's recommended preset's reports over `text`, at once (module
 * header). A report that covers a URL with a password is cut to the
 * password, so the host and path stay readable.
 */
const shapedCredentials = (text: string): Range[] => {
  const found: Range[] = [];
  reports = found;
  scannersRan = 0;
  scannerFault = undefined;
  lintSource({
    source: {
      content: text,
      filePath: "/said.txt",
      ext: ".txt",
      contentType: "text",
    },
    options: { config: CONFIG, noPhysicFilePath: true },
  }).catch((error: unknown) => {
    console.error("[hub] secretlint's run failed after its scan:", error);
  });
  reports = undefined;
  if (scannerFault !== undefined) {
    throw scannerFault;
  }
  if (scannersRan !== TEXT_SCANNERS) {
    throw new Error(
      `secretlint read ${scannersRan} of its ${TEXT_SCANNERS} scanners at once: its core no longer runs them in the call, and the credential scanner cannot wait for it`
    );
  }
  return found.flatMap(([start, end]): Range[] => {
    const passwords = [...text.slice(start, end).matchAll(URL_PASSWORD)];
    return passwords.length > 0
      ? passwords.flatMap((match): Range[] => {
          const at = match.indices?.[1];
          return at ? [[start + at[0], start + at[1]]] : [];
        })
      : [[start, end]];
  });
};

/** Wrapping a word may carry that is not part of it: quotes, brackets, a trailing comma or stop. */
const WRAP_START = /^["'`([{<]+/u;
const WRAP_END = /["'`)\]}>]*[.,;:]?["'`)\]}>]*$/u;
const WORD = /\S+/gu;
const PASSWORD_MIN = 8;
const LOWER = /[a-z]/u;
const UPPER = /[A-Z]/u;
const DIGIT = /\d/u;
const DIGIT_OR_SYMBOL = /[^A-Za-z]/u;

/** Eight characters or more, upper and lower case, and a digit or a symbol. */
const passwordShaped = (word: string): boolean =>
  word.length >= PASSWORD_MIN &&
  LOWER.test(word) &&
  UPPER.test(word) &&
  DIGIT_OR_SYMBOL.test(word) &&
  word !== REDACTED_SECRET;

const VALUE_MIN = 6;
/** A value only of letters reads as a credential from this length on, with both cases. */
const LETTERS_MIN = 16;
/** A value that names where a credential is, not the credential: `$TOKEN`, `${KEY}`, `%KEY%`, `<token>`, `process.env.KEY`, `***`. */
const REFERENCE =
  /^(?:\$|%|<|\*{3}|\[redacted\]|\(hidden\)|process\.env\.|env\.)/iu;
/** A name read through its object, as code writes it: `config.token`, `ctx.secret`. */
const MEMBER_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/u;
const LETTERS = /^[A-Za-z]+$/u;
const SYMBOL = /[^A-Za-z\d]/u;

/**
 * Whether `value`, set to a credential's name, reads as the credential:
 * six characters or more with a digit or a symbol, or sixteen letters or
 * more in both cases; never a reference to one (`$TOKEN`, `config.token`).
 * A plain word (`expired`, `string`, `Password`) is words.
 */
const credentialValue = (value: string): boolean => {
  if (value.length < VALUE_MIN || REFERENCE.test(value)) {
    return false;
  }
  if (LETTERS.test(value)) {
    return (
      value.length >= LETTERS_MIN && LOWER.test(value) && UPPER.test(value)
    );
  }
  return DIGIT.test(value) || (SYMBOL.test(value) && !MEMBER_PATH.test(value));
};

/**
 * A credential's name (ending the identifier it stands in), its separator,
 * and its value (group 1), a sentence's stop after it left out.
 */
const SET_TO_VALUE =
  /\b[\w.-]*?(?:password|passwd|secret|token|api[-_]?key|access[-_]?key|private[-_]?key)["']?\s*[:=]\s*["']?([^\s"'`&,;)]*[^\s"'`&,;).:!?\]}>])/dgiu;
/** An environment variable named for a key, in capitals (`DEPLOY_KEY=…`, `GH_PAT=…`), and its value (group 1). */
const NAMED_KEY =
  /\b[A-Z][A-Z0-9_]*_(?:KEY|PAT|PASS|PWD|CREDENTIALS?)\s*=\s*["']?([^\s"'`&,;)]*[^\s"'`&,;).:!?\]}>])/dgu;
const BEARER = /\bbearer\s+([A-Za-z0-9._~+/-]{16,}=*)/dgiu;
/** A basic sign-in's header (`Authorization: Basic <base64>`): its value (group 1). */
const BASIC = /\bauthorization:\s*basic\s+([A-Za-z0-9+/]{8,}={0,2})/dgiu;
const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/gu;

/** Group 1 of each of `pattern`'s matches in `text` that `keep` reads as a credential. */
const groupsOf = (
  text: string,
  pattern: RegExp,
  keep: (value: string) => boolean = () => true
): Range[] =>
  [...text.matchAll(pattern)].flatMap((match): Range[] => {
    const at = match.indices?.[1];
    const [, value] = match;
    return at && value !== undefined && keep(value) ? [[at[0], at[1]]] : [];
  });

/** Every value a credential's name is set to, every URL's password and every private key block. */
const setCredentials = (text: string): Range[] => [
  ...groupsOf(text, SET_TO_VALUE, credentialValue),
  ...groupsOf(text, NAMED_KEY, credentialValue),
  ...groupsOf(text, BEARER),
  ...groupsOf(text, BASIC),
  ...groupsOf(text, URL_PASSWORD),
  ...[...text.matchAll(PRIVATE_KEY_BLOCK)].map((match): Range => [
    match.index,
    match.index + match[0].length,
  ]),
];

/** A word's parts between `=` and `:`: `OPENAI_API_KEY=sk-…` is read as its name and its value. */
const PART = /[^=:]+/gu;

/** Every part of a word of `text` that `test` reads as a credential, its wrapping (quotes, brackets, a trailing stop) left out. */
const partsWhere = (text: string, test: (part: string) => boolean): Range[] =>
  [...text.matchAll(WORD)].flatMap((word) =>
    [...word[0].matchAll(PART)].flatMap((match): Range[] => {
      const [raw] = match;
      const lead = WRAP_START.exec(raw)?.[0].length ?? 0;
      const part = raw.slice(lead).replace(WRAP_END, "");
      const start = word.index + match.index + lead;
      return part && test(part) ? [[start, start + part.length]] : [];
    })
  );

/** Every word of `text` that `test` reads as a credential, its wrapping left out. */
const wordsWhere = (text: string, test: (word: string) => boolean): Range[] =>
  [...text.matchAll(WORD)].flatMap((match): Range[] => {
    const [raw] = match;
    const lead = WRAP_START.exec(raw)?.[0].length ?? 0;
    const word = raw.slice(lead).replace(WRAP_END, "");
    const start = match.index + lead;
    return test(word) ? [[start, start + word.length]] : [];
  });

/** A word that says the sentence is about a credential. */
const CREDENTIAL_TALK =
  /\b(?:pass(?:word|phrase|wd)s?|key(?:chain|ring)s?|unlock(?:s|ed|ing)?|log-?ins?|sudo)\b/iu;
/** A sentence: up to an end mark and its space, or a line break. */
const SENTENCE = /[^\n]*?(?:[.!?](?=\s|$)|\n|$)/gu;

/** Every password-shaped word of a sentence that talks about a credential. */
const typedCredentials = (text: string): Range[] =>
  [...text.matchAll(SENTENCE)]
    .filter(([sentence]) => CREDENTIAL_TALK.test(sentence))
    .flatMap((sentence) =>
      wordsWhere(sentence[0], passwordShaped).map(([start, end]): Range => [
        start + sentence.index,
        end + sentence.index,
      ])
    );

/** `ranges` in order, those that overlap or touch as one. */
const mergedRanges = (
  ranges: readonly Range[]
): [start: number, end: number][] => {
  const merged: [number, number][] = [];
  for (const [start, end] of ranges
    .filter(([from, to]) => to > from)
    .toSorted((a, b) => a[0] - b[0])) {
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
 * Where every credential stands in `text` (module header, all but a
 * credential typed in prose), in order, overlapping finds as one: what
 * leaves the hub for a client, an app or another session, and what a
 * machine's failure words keep (redactor.ts).
 */
export const credentialRanges = (
  text: string
): [start: number, end: number][] =>
  text.trim()
    ? mergedRanges([
        ...shapedCredentials(text),
        ...setCredentials(text),
        ...partsWhere(text, looksSecret),
      ])
    : [];

/**
 * Where every secret found (module header, a credential typed in prose
 * included) stands in `text`, in order, overlapping finds as one: what an
 * agent's `find` and the person's masked Find read.
 */
export const secretRanges = (text: string): [start: number, end: number][] =>
  text.trim()
    ? mergedRanges([...credentialRanges(text), ...typedCredentials(text)])
    : [];

/**
 * Where `find` stands in each of `texts`, read in one pass: the texts
 * joined a blank line apart (a sentence never runs across one), each find
 * cut back to the text it is in.
 */
export const rangesOfEach = (
  texts: readonly string[],
  find: (text: string) => [start: number, end: number][]
): [start: number, end: number][][] => {
  const starts: number[] = [];
  let joined = "";
  for (const text of texts) {
    if (joined) {
      joined += "\n\n";
    }
    starts.push(joined.length);
    joined += text;
  }
  const found = find(joined);
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

/** Where the secrets stand in each of `texts` ({@link secretRanges}), read in one pass. */
export const secretRangesOf = (
  texts: readonly string[]
): [start: number, end: number][][] => rangesOfEach(texts, secretRanges);

/** `text` with each of `ranges` (in order, none overlapping) replaced by {@link REDACTED_SECRET}. */
export const cutOut = (text: string, ranges: readonly Range[]): string => {
  let out = "";
  let at = 0;
  for (const [start, end] of ranges) {
    out += `${text.slice(at, start)}${REDACTED_SECRET}`;
    at = end;
  }
  return `${out}${text.slice(at)}`;
};

/** `text` with every secret found ({@link secretRanges}) replaced by {@link REDACTED_SECRET}. */
export const redactSecrets = (text: string): string =>
  cutOut(text, secretRanges(text));

/** `text` with every credential found ({@link credentialRanges}) replaced by {@link REDACTED_SECRET}. */
export const redactCredentials = (text: string): string =>
  cutOut(text, credentialRanges(text));

/**
 * Where the secrets stand in `text` ({@link secretRanges}), and every
 * password-shaped word in it too ({@link passwordShaped}), whatever its
 * sentence says: for words read without the sentence they stand in (an
 * index's snippet, when the words around it could not be had), whose
 * telling word ("password", "sudo") may stand outside them. Masked, never
 * withheld whole.
 */
export const outOfSentenceRanges = (
  text: string
): [start: number, end: number][] =>
  mergedRanges([...secretRanges(text), ...wordsWhere(text, passwordShaped)]);
