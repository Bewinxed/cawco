// What preview.mjs and record.mjs share: the kit, a mockup's HTML and the
// kit's CSS to draw it in, and playwright-core from where they run.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const kit = join(dirname(fileURLToPath(import.meta.url)), "..", "kit");

// playwright-core as installed where the script runs (npm i -D playwright-core).
export const playwright = () =>
  createRequire(join(process.cwd(), "/"))("playwright-core");

// The kit's CSS, and mockup `name`'s HTML from <work>/mockups/ with its Caw
// images pointed at the kit's.
export const mockup = (work, name) => ({
  css:
    readFileSync(join(kit, "tokens.css"), "utf8") +
    readFileSync(join(kit, "page.css"), "utf8"),
  body: readFileSync(join(work, "mockups", `${name}.html`), "utf8").replaceAll(
    'src="caw/',
    `src="${pathToFileURL(join(kit, "caw"))}/`
  ),
});
