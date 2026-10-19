/**
 * The runtime bundles Bun builds for a browser (the canvas host, the
 * decision host, the preview overlay, the stage host) refuse any
 * `light-dark()` Bun's CSS bundler lowered.
 *
 * Bun lowers `light-dark(a, b)` for its default browser targets to
 * `var(--buncss-light, a) var(--buncss-dark, b)`, and sets those two switch
 * variables only beside a `color-scheme` declaration in the same stylesheet
 * (https://bun.com/docs/bundler/css, "light-dark() color function"). Our
 * hosts take their scheme from the dashboard's theme, set inline or by
 * attribute, never by a sheet Bun sees, so a lowered colour is invalid at
 * computed-value time and draws nothing: a chosen canvas tool once drew
 * `rgba(0, 0, 0, 0)` this way.
 *
 * Bun 1.4.3 has no setting to keep it as written. oven-sh/bun#40361
 * (open): "Bun.build has no way to set CSS browser targets … there is no
 * way to opt out". Bun's src/css/targets.zig `forBundlerTarget` picks the
 * targets from the bundle's runtime alone: `.node, .bun => runtimeDefault(),
 * .browser, .bun_macro, .bake_server_components_ssr => browserDefault()`.
 * Once oven-sh/bun#40368 ships (`Bun.build({ cssTarget })`, "An override
 * with no browser entries (for example only "esnext") disables
 * downleveling entirely"), set it on these builds from the dashboard's
 * `CSS_TARGET` (apps/dashboard/vite.config.ts) and keep this guard. Until
 * then the build stops instead, naming each rule. A colour that changes
 * with the scheme is a token (design/tokens, DESIGN.md), used as
 * `var(--token)`.
 */

/** A bundle's emitted file: a `Bun.BuildArtifact`, or anything with its path and text. */
interface Emitted {
  path: string;
  text: () => Promise<string>;
}

/** One rule (its selector and block, innermost) whose block reads a switch variable. */
const LOWERED = /[^{}]*\{[^{}]*var\(--buncss-(?:light|dark)[^{}]*\}/g;

/** The rules in `css` that read Bun's scheme switch variables. */
export const loweredRules = (css: string): string[] =>
  (css.match(LOWERED) ?? []).map((rule) => rule.trim());

/** Throws, naming every rule, when any of `outputs`' stylesheets carries a lowered `light-dark()`. */
export async function refuseSchemeLowering(
  bundle: string,
  outputs: readonly Emitted[]
): Promise<void> {
  const found: string[] = [];
  for (const output of outputs) {
    if (!output.path.endsWith(".css")) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: a bundle has one or two stylesheets
    for (const rule of loweredRules(await output.text())) {
      found.push(`${output.path}: ${rule}`);
    }
  }
  if (found.length > 0) {
    throw new Error(
      `${bundle}: Bun lowered light-dark() to --buncss-light/--buncss-dark, which it sets only beside a color-scheme declaration in the same stylesheet; this bundle's scheme is set elsewhere, so these rules draw nothing. Put the colour in a token (design/tokens) and use var(--token):\n${found.join("\n")}`
    );
  }
}
