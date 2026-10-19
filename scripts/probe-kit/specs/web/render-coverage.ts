/**
 * Which catalogue state renders each component the Tailwind cutover's lanes
 * changed, so the render and functional runs read every one of them.
 *
 *   bun scripts/probe-kit/run.ts web render-coverage [--base=<rev>]
 *
 * A component is found in the DOM by its hooks: each `data-slot="…"` value
 * and each `data-<name>` attribute its own markup writes that no other
 * `.svelte` file under apps/dashboard/src writes (its signature). Every
 * catalogue state is walked on the tapes at desk and phone, light, and the
 * hooks each state's document holds are collected; a component is rendered
 * by the states whose document holds one of its signature hooks.
 *
 * Writes `.cutover/render-coverage.txt`: each changed component with the
 * states that render it, those no state renders (uncovered), and those with
 * no hook of their own to find them by (unsigned), which a state reaches
 * only through a parent and are listed with the files that render them.
 * The changed components are the `.svelte` files that differ from `--base`
 * (the cutover's merge line, 24167b2ef, by default).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, type Spec } from "../../kit";
import { SURFACES } from "../../surfaces/catalogue";
import { PASSES, walkTapes } from "../../surfaces/walk";

const SRC = join(ROOT, "apps/dashboard/src");
const base =
  process.argv.find((arg) => arg.startsWith("--base="))?.slice(7) ??
  "24167b2ef";

/** Hooks a file writes in its markup: `slot:<value>` and `attr:<name>`. */
function hooksOf(text: string): Set<string> {
  const hooks = new Set<string>();
  for (const m of text.matchAll(/\sdata-slot="([\w-]+)"/g)) {
    hooks.add(`slot:${m[1]}`);
  }
  for (const m of text.matchAll(/\s(data-[a-z][\w-]*)(?=[\s=>/])/g)) {
    if (m[1] !== "data-slot") {
      hooks.add(`attr:${m[1]}`);
    }
  }
  return hooks;
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

/** Every `.svelte` file under src, by its path from src, with its hooks. */
function allHooks(): Map<string, Set<string>> {
  const files = git("ls-files", "--", "apps/dashboard/src/**/*.svelte")
    .split("\n")
    .filter(Boolean);
  return new Map(
    files.map((file) => [
      relative(SRC, join(ROOT, file)),
      hooksOf(readFileSync(join(ROOT, file), "utf8")),
    ])
  );
}

const SVELTE_EXT = /\.svelte$/;

/** The files under src that render `file`'s component (`<Name`), by import. */
function hostsOf(file: string, all: Map<string, Set<string>>): string[] {
  const name = file.split("/").pop()?.replace(SVELTE_EXT, "") ?? "";
  const tag = new RegExp(`<${name}[\\s>/]`);
  return [...all.keys()].filter((other) => {
    if (other === file) {
      return false;
    }
    const text = readFileSync(join(SRC, other), "utf8");
    return tag.test(text) && text.includes(`/${name}.svelte`);
  });
}

const spec: Spec = {
  name: "render-coverage",
  async run(kit) {
    const all = allHooks();
    const owners = new Map<string, string[]>();
    for (const [file, hooks] of all) {
      for (const hook of hooks) {
        owners.set(hook, [...(owners.get(hook) ?? []), file]);
      }
    }
    const changed = git(
      "diff",
      "--name-only",
      base,
      "HEAD",
      "--",
      "apps/dashboard/src/**/*.svelte"
    )
      .split("\n")
      .filter(Boolean)
      .map((file) => relative(SRC, join(ROOT, file)))
      .filter((file) => all.has(file));
    const signature = new Map(
      changed.map((file) => [
        file,
        [...(all.get(file) ?? [])].filter(
          (hook) => owners.get(hook)?.length === 1
        ),
      ])
    );

    // Each state's hooks, at desk and phone, light.
    const seen = new Map<string, Set<string>>();
    await walkTapes(
      kit,
      SURFACES,
      PASSES.filter(
        (pass) =>
          !pass.reduced &&
          pass.theme === "light" &&
          (pass.width === "desk" || pass.width === "phone")
      ),
      async ({ page, pass, state, surface }) => {
        const hooks = await page.evaluate(() => {
          const out = new Set<string>();
          for (const el of document.querySelectorAll("*")) {
            for (const attr of el.attributes) {
              if (attr.name === "data-slot") {
                out.add(`slot:${attr.value}`);
              } else if (attr.name.startsWith("data-")) {
                out.add(`attr:${attr.name}`);
              }
            }
          }
          return [...out];
        });
        const at = `${surface.name}/${state.name} (${pass.width})`;
        seen.set(at, new Set(hooks));
      },
      (what, why) => kit.note(`${what}: did not open (${why})`)
    );

    const covered: string[] = [];
    const uncovered: string[] = [];
    const unsigned: string[] = [];
    for (const file of changed.sort()) {
      const hooks = signature.get(file) ?? [];
      if (hooks.length === 0) {
        const hosts = hostsOf(file, all);
        unsigned.push(
          `${file} ← ${hosts.length > 0 ? hosts.join(", ") : "(no host)"}`
        );
        continue;
      }
      const states = [...seen]
        .filter(([, has]) => hooks.some((hook) => has.has(hook)))
        .map(([at]) => at);
      if (states.length > 0) {
        covered.push(
          `${file} → ${states.slice(0, 3).join(", ")}${states.length > 3 ? ` (+${states.length - 3})` : ""}  [${hooks.slice(0, 2).join(" ")}]`
        );
      } else {
        uncovered.push(`${file}  [${hooks.join(" ")}]`);
      }
    }
    const lines = [
      `# Render coverage: the ${changed.length} .svelte files changed since ${base}, each by its own hooks in the DOM of the catalogue's states (desk and phone, light)`,
      `covered ${covered.length}, uncovered ${uncovered.length}, unsigned ${unsigned.length} (no hook of its own: listed with the files that render it)`,
      "",
      "## Uncovered",
      ...uncovered,
      "",
      "## Unsigned",
      ...unsigned,
      "",
      "## Covered",
      ...covered,
      "",
    ];
    writeFileSync(join(ROOT, ".cutover/render-coverage.txt"), lines.join("\n"));
    console.log(lines.slice(0, 2).join("\n"));
    kit.check(
      `every changed component with a hook of its own is rendered by a state (${uncovered.length} uncovered)`,
      uncovered.length === 0,
      uncovered.slice(0, 20).join("\n    ")
    );
  },
};
export default spec;
