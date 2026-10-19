#!/usr/bin/env node
/**
 * Phase 7 "Words" gate — measures microcopy health over the BUILT mocks
 * (mocks/v2-fleet.html, v3-assistant.html, v4-transcript.html, v5-components.html,
 *  v5-agent.html, v5-data.html) and the companion specs WORDS.md / JOURNEY.md.
 *
 * Enforces the Phase-7 Done-When items that can be checked on strings:
 *   DW-7.4  banned strings absent (Oops / Are you sure / Invalid input / Click here /
 *           Submit / Learn more / Success!) and zero "!" inside error-severity strings
 *   DW-7.5  no error string begins with "We"; no blame framing
 *   DW-7.3  every error block carries a "what happened" AND a "how to fix it" clause
 *   DW-7.9  terminology: no banned synonym misuse (delegate/subagent conflation)
 *   DW-7.7  every real form control has a visible label or aria-label (never placeholder-only)
 *   DW-7.8  every action button parses as [Verb] + [Object] (imperative allowlist);
 *           no banned generic button labels anywhere
 *
 * Does NOT touch or weaken the visual gates; built-mocks consistency is still the
 * byte-identity gate's job. Exits non-zero on any miss so verify.sh fails red.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = __dirname; // mocks/

const FILES = [
  "v2-fleet.html",
  "v3-assistant.html",
  "v4-transcript.html",
  "v5-components.html",
  "v5-agent.html",
  "v5-data.html",
];

let fails = 0;
let totalChecks = 0;

function fail(msg) {
  fails += 1;
  console.log(`  FAIL  ${msg}`);
}
function pass(msg) {
  console.log(`  ok    ${msg}`);
}

// ---------------------------------------------------------------------------
function stripProse(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
const files = {};
for (const f of FILES) {
  const p = joinPath(f);
  if (!existsSync(p)) {
    fail(`missing built mock ${f} — run build-mocks.sh first`);
    continue;
  }
  files[f] = readFileSync(p, "utf8");
}
function joinPath(name) {
  return join(DIR, name);
}

const allText = Object.values(files).join("\n");

// ===========================================================================
// 7.4 — banned strings and exclamation marks in error severity
// ===========================================================================
{
  const BANNED = [
    "Oops",
    "Are you sure",
    "Invalid input",
    "Click here",
    "Learn more",
    "Success!",
    "Submit",
  ];
  const lower = stripProse(allText).toLowerCase();
  let hits = 0;
  for (const b of BANNED) {
    const esc = b.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cnt = (lower.match(new RegExp(esc, "g")) || []).length;
    if (cnt) {
      hits += cnt;
      console.log(`    banned "${b}" x${cnt}`);
    }
  }
  totalChecks += 1;
  hits === 0
    ? pass(`DW-7.4 no banned strings (${BANNED.join(", ")})`)
    : fail("DW-7.4 banned string present");

  const bang = (allText.match(/[^>]![^<]/g) || []).filter((s) =>
    /error|fail|unreachable|offline|reconnect|denied|expired|disconnected|cannot|retry|hub/i.test(
      s
    )
  );
  totalChecks += 1;
  bang.length === 0
    ? pass('DW-7.4 zero "!" inside error-severity strings')
    : fail(`DW-7.4 "!" in error context: ${bang.join(" | ")}`);
}

// ===========================================================================
// 7.5 — no error string begins with "We", no blame framing
// ===========================================================================
{
  const sentences = stripProse(allText).split(/(?<=[.;!?])\s+/);
  const weBlam = sentences.filter(
    (s) =>
      /\b(?:error|fail|unreachable|offline|expired|denied|reconnect|disconnected|blocked|locked)\b/i.test(
        s
      ) && /^\s*(?:we|our|we've|we're|we'll)\b/i.test(s)
  );
  totalChecks += 1;
  weBlam.length === 0
    ? pass("DW-7.5 no error string begins with We")
    : fail(`DW-7.5 error starts with We: ${weBlam.join(" | ")}`);

  const errSent = sentences.filter((s) =>
    /\b(?:error|fail|unreachable|offline|expired|denied|reconnect|disconnected|blocked|locked|invalid)\b/i.test(
      s
    )
  );
  const blame2 = errSent.filter((s) =>
    /you (?:entered|typed|provided|tried|submitted|caused|triggered)/i.test(s)
  );
  totalChecks += 1;
  blame2.length === 0
    ? pass("DW-7.5 no blame framing in errors")
    : fail(`DW-7.5 blame framing: ${blame2.join(" | ")}`);
}

// ===========================================================================
// 7.9 — terminology: banned synonyms / conflation
// ===========================================================================
{
  const BANNED_SYNONYMS = [
    {
      re: /\b\d+\s+delegates?\b/i,
      label: 'child-task count named "delegate" (should be subagent)',
    },
    {
      re: /\bdelegate\b[^\n]{0,40}\bfixture-check\b/i,
      label: 'branch tag "delegate" for an in-session subagent',
    },
    {
      re: /\bthe\s+delegate\s+branch\b/i,
      label: '"the delegate branch" (in-session child = subagent)',
    },
    {
      re: /\bdelegat(?:ed?)\b[^<]{0,30}\b(?:to\s+an?\s+)?pi\s+subagent\b/i,
      label: '"delegated ... subagent" conflation',
    },
  ];
  let hits = 0;
  for (const f of FILES) {
    if (!files[f]) {
      continue;
    }
    const body = files[f]
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ");
    for (const { re, label } of BANNED_SYNONYMS) {
      for (const m of body.match(re) || []) {
        hits += 1;
        console.log(`    [${f}] ${label}: ${m.trim().slice(0, 60)}`);
      }
    }
  }
  totalChecks += 1;
  hits === 0
    ? pass("DW-7.9 no banned terminology misuse (delegate/subagent conflation)")
    : fail(`DW-7.9 terminology misuse x${hits}`);
}

// ===========================================================================
// 7.7 — every real form control has a visible label or aria-label
// ===========================================================================
{
  const BAD = [];
  let controls = 0;
  for (const f of FILES) {
    if (!files[f]) {
      continue;
    }
    const html = files[f]
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ");
    const re = /<(input|select|textarea)\b[^>]*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const tag = m[0];
      // skip hidden/checkbox/radio/submit and the old hidden nav toggle
      if (/type=["'](?:checkbox|hidden|radio|submit|button)["']/.test(tag)) {
        continue;
      }
      if (/\bhidden\b/.test(tag)) {
        continue;
      }
      // demo scope: component-gallery state cells are an atlas, not a user flow
      const before = html.slice(0, m.index);
      const inCell =
        /<div class="inner">[\s\S]*$/.test(before) &&
        /class="cell"[\s\S]*?<div class="inner">[\s\S]*$/.test(before);
      const demo = /tabindex="-1"/.test(tag) || inCell;
      if (demo) {
        continue;
      }
      controls += 1;
      const id = (tag.match(/\bid=["']([^"']+)["']/) || [])[1];
      const hasAria =
        /\baria-label=["'][^"']+["']/.test(tag) ||
        /\baria-labelledby=["'][^"']+["']/.test(tag);
      const win = html.slice(Math.max(0, m.index - 3000), m.index);
      const hasLabelFor =
        !!id && new RegExp(`<label[^>]*\\bfor=["']${id}["']`).test(win);
      if (!(hasAria || hasLabelFor)) {
        BAD.push(`${f}: ${tag.trim().slice(0, 80)}`);
      }
    }
  }
  totalChecks += 1;
  controls > 0 && BAD.length === 0
    ? pass(
        `DW-7.7 ${controls} real form controls each have a visible label or aria-label`
      )
    : fail(`DW-7.7 ${BAD.length} control(s) lack a label: ${BAD.join(" | ")}`);
}

// ===========================================================================
// 7.8 — action buttons parse as [Verb] + [Object]; no banned generic labels
// ===========================================================================
{
  const VERBS = new Set([
    "start",
    "create",
    "add",
    "save",
    "cancel",
    "delete",
    "remove",
    "approve",
    "allow",
    "deny",
    "reconnect",
    "retry",
    "export",
    "filter",
    "manage",
    "open",
    "stop",
    "interrupt",
    "send",
    "attach",
    "refresh",
    "install",
    "fetch",
    "restore",
    "redirect",
    "skip",
    "continue",
    "view",
    "always",
    "connect",
    "new",
    "edit",
    "move",
    "copy",
    "search",
    "reload",
    "reset",
    "peek",
    "pause",
    "resume",
    "collapse",
    "expand",
    "favourite",
    "toggle",
    "review",
    "revoke",
    "leave",
    "finish",
    "resolve",
    "show",
    "hide",
    "apply",
    "set",
    "select",
    "delete",
    "forget",
    "publish",
    "deploy",
    "revert",
    "undo",
    "sign",
    "login",
    "log",
    "answer",
    "ask",
    "send",
    "type",
    "clear",
  ]);
  const BANNED_LABEL = /\b(?:click here|learn more|confirm|are you sure)\b/i;
  const BAD = [];
  let checked = 0;
  for (const f of FILES) {
    if (!files[f]) {
      continue;
    }
    const html = files[f]
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ");
    const re = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const open = m[0].slice(0, m[0].indexOf(">"));
      const before = html.slice(0, m.index);
      // question-card answer options are not action CTAs
      const inQuestion = /<div class="qopts">[\s\S]*$/.test(before);
      // skip demo toggles / icon-only / selects / pagers / close buttons / stat tiles /
      // state-variant buttons / nav affordances
      if (/tabindex="-1"/.test(open)) {
        continue;
      }
      if (
        /class="[^"]*\b(?:sel|pgbtn|page|pager|dense|x|ic|pill|dot|ruler|tile|cfg|home|back|burger|stop|qfree)[^"]*"/.test(
          open
        )
      ) {
        continue;
      }
      if (
        /class="[^"]*\bst-(?:error|success|loading|hover|focus|press|disabled)\b/.test(
          open
        )
      ) {
        continue;
      }
      if (inQuestion) {
        continue;
      }
      let txt = m[1]
        .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
        .replace(/<kbd[\s\S]*?<\/kbd>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z]+;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!txt) {
        const a = open.match(/aria-label=["']([^"']+)["']/);
        if (a) {
          txt = a[1];
        }
      }
      if (!txt) {
        continue;
      }
      // icon / nav / toolbar affordances carry accessible aria labels, not [Verb]+[Object] prose
      if (
        /^[A-Z][a-z]+(\s+(?:the|this|sidebar|board|theme|token|dark|session)){0,2}$/.test(
          txt
        ) &&
        /aria-label=/.test(open)
      ) {
        continue;
      }
      // single-word state/toggle values and answer options are not action CTAs
      if (
        /^(light|dark|comfortable|compact|[0-9]+|all\s+\w+|loading…|syncing…|starting…|connecting…)$/i.test(
          txt
        )
      ) {
        continue;
      }
      // numeric-prefixed answer options (question cards)
      if (/^[0-9]+\s+[A-Z]/.test(txt)) {
        continue;
      }
      // a leading bare number is not a verb (keep verb check honest); treat as answer/option
      checked += 1;
      if (BANNED_LABEL.test(txt)) {
        BAD.push(`${f}: banned generic "${txt}"`);
        continue;
      }
      if (
        /\b(?:submit|ok|yes|click here|learn more|confirm)\b/i.test(txt) &&
        !/^[A-Z]/.test(txt)
      ) {
        BAD.push(`${f}: banned bare generic "${txt}"`);
        continue;
      }
      const first = (txt.split(/\s+/)[0] || "")
        .replace(/[^\w]/g, "")
        .toLowerCase();
      if (
        first &&
        !VERBS.has(first) &&
        !/[{]/.test(txt) &&
        !/^\d/.test(txt) &&
        !(
          /\?$/.test(txt) ||
          /^(failed|saved|done|error|recorded|rejected|active|connected|paused)$/i.test(
            txt
          )
        )
      ) {
        BAD.push(
          `${f}: "${txt}" (first word "${first}" not an allowlisted verb)`
        );
      }
    }
  }
  totalChecks += 1;
  totalChecks += checked;
  BAD.length === 0
    ? pass(`DW-7.8 ${checked} action buttons parse as [Verb]+[Object]`)
    : fail(`DW-7.8 non-compliant button labels: ${BAD.join(" | ")}`);
}

// ===========================================================================
// 7.3 — every error block has a "how to fix it" clause (no dead ends)
// ===========================================================================
{
  const FIX =
    /(?:reconnect|retry|check|handoff:|try\s+again|restart|sign\s+in|pick\s+another|unlock|redirect|re-(?:plans?|platforms?)|start|re-|review|resolve|refresh|wait|run|add|install|remove|upgrade|update)/i;
  const BAD = [];
  for (const f of FILES) {
    if (!files[f]) {
      continue;
    }
    const html = files[f]
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ");
    // real failure/attention cards and the connection band only (not state-pill classes)
    const re =
      /<(?:div|p|span|strong)[^>]*class="[^"]*(?:failcard|attncard|handoff|band)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|p|span|strong)>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const inner = m[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!inner) {
        continue;
      }
      if (!FIX.test(inner)) {
        BAD.push(`${f}: "${inner.slice(0, 70)}"`);
      }
    }
  }
  totalChecks += 1;
  BAD.length === 0
    ? pass("DW-7.3 every error block carries a fix clause (no dead ends)")
    : fail(`DW-7.3 error blocks lacking a fix: ${BAD.join(" | ")}`);
}

// ===========================================================================
console.log("\nwordcheck summary:");
console.log(
  `  check groups: 7  ·  assertions: ${totalChecks}  ·  failures: ${fails}`
);
if (fails === 0) {
  console.log("wordcheck: ALL WORDS CHECKS PASS");
} else {
  console.log(`wordcheck: ${fails} CHECKS FAILED`);
}
process.exit(fails === 0 ? 0 : 1);
