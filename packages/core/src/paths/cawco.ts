/** CawCo's own config and data on this machine, outside any one feature. */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { sessiondEndpoint } from "../sessiond";
import { cawcoConfigDir, cawcoDataDir } from "./roots";

/** The agent's index of its stored transcripts, each file's mtime and size and what a listing read of it (agent catalog-index.ts). */
export const catalogIndexPath = (): string =>
  join(cawcoDataDir(), "catalog-index.json");

/** The agent's transcript search index. */
export const transcriptIndexPath = (): string =>
  join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "cawco",
    "transcript-index.db"
  );

/** Private host-side material, beneath the directory Linux boundaries already mask. */
export const sessionIdentityDir = (): string =>
  join(
    dirname(process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()),
    "session-identity"
  );

/**
 * The agent's redaction store's dir: every session credential that may still
 * grant something, one file per hub ({@link redactionStoreFile}), kept until
 * the hub says each is revoked (agent redaction.ts). On disk, so a reboot
 * keeps it, never in {@link sessionIdentityDir}, a tmpfs every reboot
 * empties. Owner-only, as every folder in the data dir is (core folders.ts),
 * and hidden from every workspace boundary in its own right (host-policy.ts
 * `credentialStores`).
 */
export const redactionStoreDir = (): string =>
  join(cawcoDataDir(), "redaction");

/** A redaction store's file name: the hub's host, its port's colon a `_`. */
const REDACTION_STORE = /^redact-[^/]+\.json$/u;

/** Whether `name` is a redaction store's file name ({@link redactionStoreFile}). */
export const isRedactionStoreName = (name: string): boolean =>
  REDACTION_STORE.test(name);

/** The redaction store of the hub at `hubHost` (`host[:port]`). */
export const redactionStoreFile = (hubHost: string): string =>
  join(redactionStoreDir(), `redact-${hubHost.replaceAll(":", "_")}.json`);

/**
 * Each live Claude session's scheduled wake-ups as its last turn ended, one
 * file per session named by its instance id, kept for as long as its
 * process runs (agent `wakeups.ts`).
 */
export const sessionWakeupsDir = (): string =>
  join(cawcoDataDir(), "session-wakeups");

/**
 * The sends each session has taken, one file per session named by its
 * instance id, kept until the session is stopped (agent `taken-sends.ts`).
 */
export const sessionTakenDir = (): string =>
  join(cawcoDataDir(), "session-taken");

/**
 * This machine's Claude Code version as its last `claude --version` answered,
 * with the binary it was read from (agent `claude-version.ts`), so an agent's
 * restart, which every update is, starts knowing it.
 */
export const claudeVersionPath = (): string =>
  join(cawcoDataDir(), "claude-version.json");

/**
 * Each folder CawCo made on this machine for a project, by its path, with
 * its identity on disk as it was made (agent made-folders.ts): what a delete
 * with its files holds a folder to before it removes it.
 */
export const madeFoldersPath = (): string =>
  join(cawcoDataDir(), "made-folders.json");

/**
 * Each project checkout's folder as this machine last saw it standing, by
 * its path, with its identity on disk (agent seen-folders.ts): what tells a
 * folder moved or renamed by hand from another one (Locate folder).
 */
export const seenFoldersPath = (): string =>
  join(cawcoDataDir(), "seen-folders.json");

/**
 * Each tool CawCo installed on this machine, by tool id: where the copy it
 * put on is, with which method, which version and when (agent tools.ts
 * `recordInstall`). What says a copy is CawCo's own (core `ToolCopy`), so
 * the fleet updates it unasked and never a person's own.
 */
export const toolInstallsPath = (): string =>
  join(cawcoDataDir(), "tool-installs.json");

/**
 * The env file `scripts/release.ts` loads the release signing key from
 * (`CAWCO_RELEASE_SIGNING_KEY`), with Bun's `--env-file`: inside the config
 * dir, so no workspace reads it.
 */
export const releaseEnvPath = (): string =>
  join(cawcoConfigDir(), "release.env");
