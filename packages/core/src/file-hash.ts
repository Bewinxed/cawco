import type { SkillFile } from "./index";

/**
 * Sorted `path\0mode\0content` triples, so the same skill or plugin hashes the
 * same everywhere and a file that gains or loses its execute bit re-syncs. The
 * hub hashes what it resolved with this, and a machine hashes what it holds on
 * disk with it, so the two agree on what "the same bytes" means.
 */
export const hashFiles = (files: SkillFile[]): string => {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hasher.update(`${file.path}\0${file.executable ? "x" : "-"}\0`);
    hasher.update(file.contentBase64);
  }
  return hasher.digest("hex");
};
