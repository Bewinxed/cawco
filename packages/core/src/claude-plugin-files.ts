/**
 * CLAUDE CODE'S OWN JSON FILES THE FLEET READS, AS IT READS THEM: its
 * registry of the marketplaces it has linked
 * (`~/.claude/plugins/known_marketplaces.json`), its registry of the plugins
 * it has installed (`~/.claude/plugins/installed_plugins.json`), and a
 * project's servers (`<folder>/.mcp.json`). Claude Code writes them and
 * CawCo only reads them, so each is checked by its schema and kept whole, as
 * the fleet reads Claude Code's settings (agent fleet.ts `isSettingsJson`):
 * a reader answers the very value it was given once the value is in its
 * shape (reader-of.ts `wholeReaderOf`). Each schema is Claude Code's own shape as far as the fleet reads
 * it; every other field is Claude Code's and stays as it is.
 */

import {
  array,
  type InferInput,
  looseObject,
  optional,
  record,
  string,
  unknown,
} from "valibot";
import { wholeReaderOf } from "./reader-of";

/**
 * One marketplace in Claude Code's registry, by the name its own
 * `marketplace.json` calls it: where it came from, and the folder its
 * catalog is in (https://code.claude.com/docs/en/plugin-marketplaces).
 */
const KNOWN_MARKETPLACE = looseObject({
  installLocation: optional(string()),
  source: optional(
    looseObject({
      source: optional(string()),
      repo: optional(string()),
      url: optional(string()),
      path: optional(string()),
    })
  ),
});

/** `known_marketplaces.json`: each marketplace Claude Code linked, by its name. */
const KNOWN_MARKETPLACES = record(string(), KNOWN_MARKETPLACE);

/**
 * `installed_plugins.json`: each plugin Claude Code installed, by its id
 * (`plugin@marketplace`), one entry per scope it is installed at, with its
 * unpacked copy and the version it computed at install.
 */
const INSTALLED_PLUGINS = looseObject({
  plugins: optional(
    record(
      string(),
      array(
        looseObject({
          scope: optional(string()),
          installPath: optional(string()),
          version: optional(string()),
        })
      )
    )
  ),
});

/** A project's `.mcp.json`: its servers by name, each Claude Code's to read. */
const PROJECT_MCP = looseObject({
  mcpServers: optional(record(string(), unknown())),
});

/** A marketplace in Claude Code's registry ({@link KNOWN_MARKETPLACE}). */
export type KnownMarketplace = InferInput<typeof KNOWN_MARKETPLACE>;

/** Claude Code's registry of linked marketplaces ({@link KNOWN_MARKETPLACES}). */
export type KnownMarketplaces = InferInput<typeof KNOWN_MARKETPLACES>;

/** `known_marketplaces.json`, whole, or undefined when it is not in its shape. */
export const knownMarketplacesOf = wholeReaderOf(KNOWN_MARKETPLACES);

/** `installed_plugins.json`, whole, or undefined when it is not in its shape. */
export const installedPluginsOf = wholeReaderOf(INSTALLED_PLUGINS);

/** A project's `.mcp.json`, whole, or undefined when it is not in its shape. */
export const projectMcpOf = wholeReaderOf(PROJECT_MCP);
