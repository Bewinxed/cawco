/**
 * Part of `bun run lint`: no scoped style rule is pruned by Svelte without
 * anyone knowing. Svelte drops a rule whose selector matches no element it
 * can see in the component, and writes it into the compiled stylesheet as
 * `/* (unused) … *\/`. A rule on an attribute only script sets (tab-drag's
 * `data-lifted`), or on a class the cutover moved off the markup, is such a
 * rule, and the product then never draws it. svelte-check passes on warnings
 * and the style compare only sees the states its tape reaches, so neither
 * proves no declaration was lost; this reads the compiler's own output.
 *
 * Every `src/**\/*.svelte` goes through the project's preprocess and
 * compiler options as vite.config.ts gives them to sveltekit()
 * (`vitePreprocess()`, `experimental.async`), then `compile` with
 * `dev: true` and `css: "external"`. Each `(unused)` rule is listed with its
 * file and line; any one fails the check. A directory argument checks that
 * tree's `.svelte` files instead (an older checkout's `src`).
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { compile, preprocess } from "svelte/compiler";

const DASHBOARD = join(dirname(new URL(import.meta.url).pathname), "..");
const SRC = process.argv[2] ? resolve(process.argv[2]) : join(DASHBOARD, "src");
const UNUSED = "/* (unused) ";
const STYLE_OPEN = /<style[\s>]/;

const preprocessors = vitePreprocess();
const pruned: string[] = [];
const broken: string[] = [];
let files = 0;

/** The source line of each pruned rule, found in order in the `<style>`. */
function prunedRules(source: string, css: string, file: string): string[] {
  const out: string[] = [];
  const styleAt = source.search(STYLE_OPEN);
  let from = styleAt;
  let at = css.indexOf(UNUSED);
  while (at !== -1) {
    const rule = css.slice(at + UNUSED.length);
    const selector = rule.slice(0, rule.indexOf("{")).trim();
    const found = source.indexOf(selector, from);
    if (found === -1) {
      throw new Error(
        `${file}: pruned rule "${selector}" not found in its <style>`
      );
    }
    from = found + selector.length;
    const line = source.slice(0, found).split("\n").length;
    out.push(`  ${file}:${line}: ${selector.replace(/\s+/g, " ")}`);
    at = css.indexOf(UNUSED, at + UNUSED.length);
  }
  return out;
}

/** Compiles one component and records what Svelte pruned from it. */
async function check(name: string): Promise<void> {
  const path = join(SRC, name);
  const file = relative(process.cwd(), path);
  const source = readFileSync(path, "utf8");
  try {
    const { code } = await preprocess(source, preprocessors, {
      filename: path,
    });
    const { css } = compile(code, {
      filename: path,
      dev: true,
      css: "external",
      experimental: { async: true },
    });
    if (css?.code.includes(UNUSED)) {
      pruned.push(...prunedRules(source, css.code, file));
    }
  } catch (error) {
    broken.push(`  ${file}: ${(error as Error).message.split("\n")[0]}`);
  }
}

const names = [...new Bun.Glob("**/*.svelte").scanSync(SRC)].sort();
files = names.length;
await Promise.all(names.map(check));
pruned.sort();
broken.sort();

for (const [title, list] of [
  ["Components that did not compile:", broken],
  [
    "Scoped style rules Svelte pruned (no element it can see matches them, so they never apply):",
    pruned,
  ],
] as const) {
  if (list.length > 0) {
    console.error(title);
    for (const one of list) {
      console.error(one);
    }
  }
}
if (pruned.length > 0 || broken.length > 0) {
  console.error(
    `svelte-unused-css: ${files} file(s), ${pruned.length} pruned rule(s), ${broken.length} not compiled`
  );
  process.exit(1);
}
console.log(`svelte-unused-css: ${files} file(s), no style rule pruned`);
