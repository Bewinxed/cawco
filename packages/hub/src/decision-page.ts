/**
 * Builds a decision page (the `decision-page` skill, Projects spec §5.8): a
 * session's `page.html`, started from the skill's `kit/page.html`, becomes
 * one self-contained page artifact (§5.10), which in a project the hub also
 * commits to the project's folder at `decisions/<page>/`. The hub is the one
 * builder, so a session with a shell (its work folder on its machine,
 * `artifact_create` with `dir`), Caw, who has none
 * (`decisions/<page>/page.html` written into the project folder,
 * `artifact_create` with the name alone), and inline `html` publish the same
 * way.
 *
 * - `{{KIT_CSS}}`: the house faces (an `@import` of the sheet the hub serves
 *   on every preview origin, core decision-host.ts), then the kit's
 *   tokens.css and page.css.
 * - `{{KIT_JS}}`: the kit's page.js.
 * - `{{DIALS}}`: DialKit (vendored, MIT) and dials.js.
 * - `{{MK:<id>}}`: `mockups/<id>.html` beside page.html, one mockup fragment.
 * - `src="caw/…"`: a Caw still from the kit; any other relative `src`, an
 *   image beside page.html; both as data: URIs, each distinct one once per
 *   page however many `<img>` show it.
 *
 * A built page stops at {@link PAGE_LIMIT}.
 */
import { bundledSkills } from "./bundled-skills";
import { FACES_SHEET, PAGE_ICON } from "./decision-program";

/** The largest page the hub publishes. */
export const PAGE_LIMIT = 512 * 1024;

const PLACEHOLDER = /\{\{([^}]+)\}\}/gu;
/** A page's own icon, named in its head. */
const NAMES_ICON = /<link\b[^>]*\brel=["']?(?:shortcut )?icon\b/iu;
const MOCKUP = /\{\{MK:([a-z0-9-]+)\}\}/gu;
const MOCKUP_NAME = /^MK:[a-z0-9-]+$/u;
const SOURCE = /(\bsrc=)"([^"]+)"/gu;
const KEPT_SOURCE = /^(data:|https?:|\/\/|#)/u;
const IMAGE_TAG = /<img\b[^>]*>/giu;
/** The attribute an inlined `<img>` names its image by, in place of `src`. */
const DRAWN = "data-dp-img";
/**
 * A 1×1 transparent GIF, an inlined `<img>`'s own source: an `<img>` with
 * no source and an `alt` is laid out as its alt text in Chromium, which
 * drops its `width` and `height` and draws the image at its natural size.
 */
const BLANK =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
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
      () =>
        `@import url("${FACES_SHEET}");\n${kitText("tokens.css")}${kitText("page.css")}`
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
  if (paths.length > 0 && !page.includes("</head>")) {
    return {
      problem:
        "page.html shows images but has no </head>, where the build places them once each. Start it from the kit's page.html.",
    };
  }
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
  // Each distinct image is inlined once: an `<img>` names it by its index,
  // keeps {@link BLANK} as its source, and one rule in the head draws it (`content: url()` replaces an
  // `<img>`'s own source in every engine), so eleven uses of one Caw still
  // cost one data: URI. Any other `src` (a `<source>`, a `<video>`) takes
  // its data: URI in place.
  const used = new Set<string>();
  page = page.replace(IMAGE_TAG, (tag) =>
    tag.replace(SOURCE, (whole, _attribute: string, src: string) => {
      if (!images.has(src)) {
        return whole;
      }
      used.add(src);
      return `${DRAWN}="${paths.indexOf(src)}" src="${BLANK}"`;
    })
  );
  page = page.replace(SOURCE, (whole, attribute: string, src: string) =>
    images.has(src) ? `${attribute}"${images.get(src)}"` : whole
  );
  if (used.size > 0) {
    const rules = [...used]
      .map(
        (src) =>
          `img[${DRAWN}="${paths.indexOf(src)}"]{content:url("${images.get(src)}")}`
      )
      .join("\n");
    page = page.replace("</head>", () => `<style>${rules}</style>\n</head>`);
  }

  // The house icon where the page names none: in a tab of its own it asks
  // its origin for no `/favicon.ico`, which the origin doesn't serve.
  if (!NAMES_ICON.test(page)) {
    page = page.replace(
      "</head>",
      () => `<link rel="icon" type="image/png" href="${PAGE_ICON}">\n</head>`
    );
  }
  const size = Buffer.byteLength(page);
  if (size > PAGE_LIMIT) {
    return {
      problem: `The built page would be ${Math.round(size / 1024)} KiB; a decision page stops at ${PAGE_LIMIT / 1024} KiB. Drop dials it does not need, shrink mockups, or split the page.`,
    };
  }
  return { html: page };
};
