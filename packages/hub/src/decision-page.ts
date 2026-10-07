/**
 * Builds a decision page (the `decision-page` skill, Projects spec §5.8): a
 * session's `page.html`, started from the skill's `kit/page.html`, becomes
 * one self-contained `index.html` the hub commits to the project's folder at
 * `decisions/<page>/`. The hub is the one builder, so a session with a shell
 * (its work folder on its machine, `show_preview` with `dir`) and Caw, who
 * has none (`decisions/<page>/page.html` written into the project folder,
 * `show_preview` with the page alone), publish the same way.
 *
 * - `{{KIT_CSS}}`: the kit's tokens.css and page.css.
 * - `{{KIT_JS}}`: the kit's page.js.
 * - `{{DIALS}}`: DialKit (vendored, MIT) and dials.js.
 * - `{{MK:<id>}}`: `mockups/<id>.html` beside page.html, one mockup fragment.
 * - `src="caw/…"`: a Caw still from the kit; any other relative `src`, an
 *   image beside page.html; both as data: URIs.
 *
 * A built page stops at {@link PAGE_LIMIT}.
 */
import { bundledSkills } from "./bundled-skills";

/** The largest page the hub publishes. */
export const PAGE_LIMIT = 512 * 1024;

const PLACEHOLDER = /\{\{([^}]+)\}\}/g;
const MOCKUP = /\{\{MK:([a-z0-9-]+)\}\}/g;
const MOCKUP_NAME = /^MK:[a-z0-9-]+$/;
const SOURCE = /(\bsrc=)"([^"]+)"/g;
const KEPT_SOURCE = /^(data:|https?:|\/\/|#)/;
const KNOWN = new Set(["KIT_CSS", "KIT_JS", "DIALS"]);

const MEDIA: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
};

/** The kit's files, by path under `kit/`, read once per process. */
let kitFiles: Map<string, Buffer> | undefined;

const kit = (): Map<string, Buffer> => {
  if (!kitFiles) {
    const skill = bundledSkills().find((each) => each.name === "decision-page");
    if (!skill) {
      throw new Error("The decision-page skill is not bundled with this hub.");
    }
    kitFiles = new Map(
      (skill.files ?? [])
        .filter((file) => file.path.startsWith("kit/"))
        .map((file) => [
          file.path.slice("kit/".length),
          Buffer.from(file.contentBase64, "base64"),
        ])
    );
  }
  return kitFiles;
};

const kitText = (path: string): string => {
  const file = kit().get(path);
  if (!file) {
    throw new Error(`The decision-page kit has no ${path}.`);
  }
  return file.toString("utf8");
};

/** Where the build reads what page.html names: its mockups and images, beside it. */
export interface PageSources {
  /** An image beside page.html, by its relative path; undefined when it is not there. */
  image: (
    path: string
  ) => Promise<{ bytes: Uint8Array; mediaType: string } | undefined>;
  /** `mockups/<id>.html` beside page.html; undefined when it is not there. */
  mockup: (id: string) => Promise<string | undefined>;
}

/** The built page, or why it could not be built, in a sentence the session reads. */
export type BuiltPage = { html: string } | { problem: string };

const dataUri = (bytes: Uint8Array, mediaType: string): string =>
  `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;

/** page.html, with the kit, its mockups and its images inlined. */
export const buildDecisionPage = async (
  source: string,
  sources: PageSources
): Promise<BuiltPage> => {
  const unknown = [...source.matchAll(PLACEHOLDER)]
    .map((match) => match[1])
    .filter((name) => !(KNOWN.has(name) || MOCKUP_NAME.test(name)));
  if (unknown.length > 0) {
    return {
      problem: `page.html names placeholders the kit does not have: ${unknown.map((name) => `{{${name}}}`).join(", ")}. It takes {{KIT_CSS}}, {{KIT_JS}}, {{DIALS}} and {{MK:<id>}}.`,
    };
  }
  let page = source
    .replaceAll(
      "{{KIT_CSS}}",
      () => kitText("tokens.css") + kitText("page.css")
    )
    .replaceAll("{{KIT_JS}}", () => kitText("page.js"))
    .replaceAll(
      "{{DIALS}}",
      () =>
        `<style>${kitText("vendor/dialkit/styles.css")}</style><script>${kitText("vendor/dialkit/browser.global.js")}</script><script>${kitText("dials.js")}</script>`
    );

  const ids = [...new Set([...page.matchAll(MOCKUP)].map((match) => match[1]))];
  const mockups = new Map(
    await Promise.all(
      ids.map(async (id) => [id, await sources.mockup(id)] as const)
    )
  );
  const missing = ids.filter((id) => mockups.get(id) === undefined);
  if (missing.length > 0) {
    return {
      problem: `page.html places mockups that are not beside it: ${missing.map((id) => `mockups/${id}.html`).join(", ")}.`,
    };
  }
  page = page.replace(MOCKUP, (_, id: string) => mockups.get(id) ?? "");

  const paths = [
    ...new Set(
      [...page.matchAll(SOURCE)]
        .map((match) => match[2])
        .filter((src) => !KEPT_SOURCE.test(src))
    ),
  ];
  /** Each image as a data: URI: a Caw still from the kit, else one beside page.html; undefined when it is neither. */
  const imageOf = async (path: string): Promise<string | undefined> => {
    if (path.startsWith("caw/")) {
      const still = kit().get(path);
      const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
      return still && dataUri(still, MEDIA[extension] ?? "image/webp");
    }
    const image = await sources.image(path);
    return image && dataUri(image.bytes, image.mediaType);
  };
  const read = await Promise.all(paths.map(imageOf));
  const missingImage = paths.find((_, index) => read[index] === undefined);
  if (missingImage) {
    return {
      problem: `page.html shows ${missingImage}, which is ${missingImage.startsWith("caw/") ? "not one of the kit's Caw stills" : "not beside it"}.`,
    };
  }
  const images = new Map(paths.map((path, index) => [path, read[index]]));
  page = page.replace(SOURCE, (whole, attribute: string, src: string) =>
    images.has(src) ? `${attribute}"${images.get(src)}"` : whole
  );

  const size = Buffer.byteLength(page);
  if (size > PAGE_LIMIT) {
    return {
      problem: `The built page would be ${Math.round(size / 1024)} KiB; a decision page stops at ${PAGE_LIMIT / 1024} KiB. Drop dials it does not need, shrink mockups, or split the page.`,
    };
  }
  return { html: page };
};
