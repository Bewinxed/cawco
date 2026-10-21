// Builds page.html from its parts: the kit's tokens, the house faces, style.css, body.html, then dagre,
// the glyphs and app.js inlined. Run from anywhere: node .mockups/design-graph/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url)), repo = join(here, "../..");
const read = (p) => readFileSync(join(here, p), "utf8");
const tokens = readFileSync(join(repo, "packages/hub/skills/decision-page/kit/tokens.css"), "utf8");
const face = (family, file, weights) => `@font-face { font-family: "${family}"; src: url(data:font/woff2;base64,${readFileSync(join(here, "fonts", file)).toString("base64")}) format("woff2"); font-weight: ${weights}; font-style: normal; font-display: block; }`;
const fonts = [
  "/* The house faces (DESIGN.md Typography), subset to Latin from apps/apple/.../Resources/Fonts; OFL, see fonts/. */",
  face("Figtree Variable", "figtree-latin.woff2", "300 900"),
  face("JetBrains Mono Variable", "jetbrains-mono-latin.woff2", "100 800"),
].join("\n");
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Design graph mockup</title>
<style>
/* CawCo tokens (packages/hub/skills/decision-page/kit/tokens.css, built from design/tokens) */
${tokens}
</style>
<style>
${fonts}
</style>
<style>
${read("style.css")}
</style>
</head>
${read("body.html")}
${read("dagre.js")}
${read("icons.js")}
${read("app.js")}
</script></body></html>
`;
writeFileSync(join(here, "page.html"), html);
console.log("page.html", html.length, "bytes");
