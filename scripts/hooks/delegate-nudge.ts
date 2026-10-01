#!/usr/bin/env bun
/**
 * Claude Code PreToolUse hook for Bash.
 *
 * Counts consecutive read-only exploration commands and nudges the model
 * toward mcp__cawco__delegate after sustained inline searching. Never
 * blocks a command — exits 0 in every path, including parse failures.
 *
 * Hook contract (command type, PreToolUse event, matcher "Bash"):
 *   stdin  — JSON: { session_id, tool_name, tool_input: { command } }
 *   stdout — JSON: { additionalContext?: string }  (or empty for no nudge)
 *   exit 0 — always; a hook that crashes a session is worse than one that
 *            misses a nudge.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CD_PREFIX = /^\s*cd\s+\S+\s*&&\s*(.*)/s;
const TWO_WORD = /^(\S+)\s+(\S+)/;
const FIRST_WORD = /^(\S+)/;
const SED_N = /\bsed\s+(-[^ ]*\s+)*-n\b/;

/**
 * Returns true when the command's effective first word is a read-only
 * exploration tool. Strips leading `cd <dir> &&` prefixes first.
 */
function classifyReadOnly(command: string): boolean {
  // Strip leading `cd ... &&` chains.
  let cmd = command;
  for (;;) {
    const match = CD_PREFIX.exec(cmd);
    if (match) {
      const [, rest] = match;
      cmd = rest;
    } else {
      break;
    }
  }

  cmd = cmd.trimStart();

  // Two-word commands: "git log", "git grep", "git show".
  const twoWord = TWO_WORD.exec(cmd);
  if (twoWord && twoWord[1] === "git") {
    const [, , sub] = twoWord;
    if (sub === "log" || sub === "grep" || sub === "show") {
      return true;
    }
  }

  // "sed" only when followed by -n.
  const firstWord = FIRST_WORD.exec(cmd)?.[1];
  if (!firstWord) {
    return false;
  }

  if (firstWord === "sed") {
    return SED_N.test(cmd);
  }

  const READ_ONLY = new Set([
    "grep",
    "rg",
    "find",
    "cat",
    "head",
    "tail",
    "ls",
    "jq",
    "awk",
    "wc",
    "sqlite3",
  ]);

  return READ_ONLY.has(firstWord);
}

function main(): void {
  let raw: string;
  try {
    raw = readFileSync("/dev/stdin", "utf-8");
  } catch {
    return;
  }

  let payload: {
    session_id?: string;
    tool_name?: string;
    tool_input?: { command?: string };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  if (payload.tool_name !== "Bash") {
    return;
  }

  const sessionId = payload.session_id;
  if (!sessionId) {
    return;
  }

  const command = (payload.tool_input?.command ?? "").trim();
  if (command === "") {
    return;
  }

  const isReadOnly = classifyReadOnly(command);

  const stateDir = join("/tmp", "cawco-delegate-nudge");
  // Safe file name: strip anything that isn't alphanumeric, dash, or underscore.
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const stateFile = join(stateDir, `${safeId}.count`);

  let count = 0;
  if (isReadOnly) {
    try {
      const prev = readFileSync(stateFile, "utf-8").trim();
      count = Number.parseInt(prev, 10) || 0;
    } catch {
      // First command or unreadable file — start at 0.
    }
    count += 1;
  }
  // Non-read-only resets to 0 (written below).

  // Persist the counter.
  try {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile, String(count), "utf-8");
  } catch {
    // Unwritable — carry on without state.
    return;
  }

  if (count === 5) {
    const nudge =
      "You have run 5 consecutive read-only exploration commands inline. " +
      "This is the pattern delegate exists to absorb — hand the remaining " +
      "exploration to mcp__cawco__delegate with a bounded brief describing " +
      "what you are looking for and what conclusions to bring back. Keep the " +
      "decisions and edits here; send the searching there.";
    console.log(JSON.stringify({ additionalContext: nudge }));
  } else if (count === 10) {
    const nudge =
      "You have now run 10 consecutive read-only exploration commands inline " +
      "without delegating. Every one of these re-reads your full conversation " +
      "context. Stop exploring inline and delegate the remainder to " +
      "mcp__cawco__delegate immediately — describe the question, the files " +
      "or patterns left to check, and the format you need the answer in.";
    console.log(JSON.stringify({ additionalContext: nudge }));
  }
  // Any other count: no output, exit 0.
}

try {
  main();
} catch {
  // Never throw, never block.
}
