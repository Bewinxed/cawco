/**
 * Runs `biome lint` as the checks that read its findings do: its JSON report
 * parsed, whatever stops a report named by the caller. Used to hold each
 * plugin's fixtures (lint/biome-plugins.ts) and to count a ratcheted plugin's
 * findings across the tree (escape-hatch-ratchet.ts).
 */
import { join } from "node:path";
import { ROOT } from "./repo-files";

const BIOME = join(ROOT, "node_modules/.bin/biome");
/** Biome's words when a plugin did not load, whichever reporter prints them. */
const NOT_LOADED =
  /Failed to compile the Grit plugin|during loading of plugins/u;

export interface Diagnostic {
  category: string;
  location: {
    end: { column: number; line: number };
    path: string;
    start: { column: number; line: number };
  };
  message: string;
}

/** Biome's report and everything it printed, or its words when it printed no report. */
export const biomeLint = async (
  args: string[],
  cwd: string
): Promise<
  { diagnostics: Diagnostic[]; said: string } | { failed: string }
> => {
  const biome = Bun.spawn(
    [BIOME, "lint", "--reporter=json", "--max-diagnostics=none", ...args],
    { env: process.env, cwd, stdout: "pipe", stderr: "pipe" }
  );
  const [out, err] = await Promise.all([
    new Response(biome.stdout).text(),
    new Response(biome.stderr).text(),
    biome.exited,
  ]);
  const said = `${out}\n${err}`;
  const report = out.split("\n").find((line) => line.startsWith("{"));
  if (NOT_LOADED.test(said) || !report) {
    return { failed: said.trim() };
  }
  return {
    said,
    diagnostics: (JSON.parse(report) as { diagnostics: Diagnostic[] })
      .diagnostics,
  };
};
