# Biome plugin fixtures

One folder per GritQL plugin that biome.jsonc loads (scripts/lint/*.grit),
named for it. Each holds planted mistakes the plugin must report and, beside
them, the shapes it must leave alone: an allowed form, its own owner file
(the path its `$filename` exempts), a suppression. A file's path inside its
folder is what the plugin's `$filename` reads (`packages/`, `apps/dashboard/src/`).

scripts/lint/biome-plugins.ts runs Biome over each folder with that plugin
alone and holds the findings to expected.txt; `bun run check` runs it. The
repository's own Biome check skips this folder (biome.jsonc).
