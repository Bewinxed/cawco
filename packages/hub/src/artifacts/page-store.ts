import { join } from "node:path";

/** Where a canvas's latest picture is kept: its folder under the artifacts' root. */
export const picturePath = (root: string, artifactId: string): string =>
  join(root, artifactId, "picture.png");

/** Where a page's or preview's latest thumbnail is kept: a PNG per scheme and `thumbnail.json` naming them. */
export const thumbnailPath = (
  root: string,
  artifactId: string,
  part: "light" | "dark" | "json"
): string =>
  join(
    root,
    artifactId,
    part === "json" ? "thumbnail.json" : `thumbnail-${part}.png`
  );
