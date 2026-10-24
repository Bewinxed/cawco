/**
 * The browser's image, built on the machine through the Engine API from the
 * files under `packages/agent/browser/` (embedded in the binary as the
 * boundary's scripts are, scripts/build-binary.ts). Its tag is the hash of
 * those files, so a CawCo update that changes one builds anew and one that
 * changes none reuses what is there. The base image is pulled first, so the
 * pull and the build each report how far they are.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { Readable } from "node:stream";
import { embeddedFile, standalone } from "@cawco/core/runtime";
import type Docker from "dockerode";

/** The image's inputs, by their name in the build context. */
export const BROWSER_IMAGE_FILES = [
  "Dockerfile",
  "chromium.conf",
  "policies.json",
  "preferences.json",
  "xorg.conf",
] as const;

/** One file of `packages/agent/browser/`: as the binary embedded it, or the checkout's. */
const imageFile = (name: string): Promise<string> =>
  Bun.file(
    standalone
      ? embeddedFile(`browser/${name}`)
      : join(import.meta.dir, "..", "..", "browser", name)
  ).text();

/** How far a pull or a build is. */
export interface ImageProgress {
  done: number;
  stage: "pulling" | "building";
  total: number;
}

/** One line of the Engine API's JSON progress stream. */
interface ProgressEvent {
  error?: string;
  errorDetail?: { message?: string };
  id?: string;
  status?: string;
  stream?: string;
}

/** Follows a pull's or build's stream to its end; its events as they come, its error as a throw. */
const follow = (
  docker: Docker,
  stream: NodeJS.ReadableStream,
  onEvent: (event: ProgressEvent) => void
): Promise<void> =>
  new Promise((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (error: Error | null, events: ProgressEvent[]) => {
        const failed = events.find((event) => event.error);
        if (error || failed) {
          reject(
            error ??
              new Error(
                failed?.errorDetail?.message ?? failed?.error ?? "failed"
              )
          );
          return;
        }
        resolve();
      },
      onEvent
    );
  });

/** Whether the runtime holds `tag`. */
const hasImage = (docker: Docker, tag: string): Promise<boolean> =>
  docker
    .getImage(tag)
    .inspect()
    .then(
      () => true,
      () => false
    );

/**
 * `ref` pulled when the runtime lacks it, its layers counted as they land.
 * The browser's base and the stream relay's images (coturn, certbot) come
 * this way.
 */
export const pullImage = async (
  docker: Docker,
  ref: string,
  onProgress: (progress: { done: number; total: number }) => void
): Promise<void> => {
  if (await hasImage(docker, ref)) {
    return;
  }
  const layers = new Map<string, boolean>();
  await follow(docker, await docker.pull(ref), (event) => {
    if (!event.id || event.id === ref) {
      return;
    }
    const finished =
      event.status === "Pull complete" || event.status === "Already exists";
    layers.set(event.id, (layers.get(event.id) ?? false) || finished);
    onProgress({
      done: [...layers.values()].filter(Boolean).length,
      total: layers.size,
    });
  });
  if (!(await hasImage(docker, ref))) {
    throw new Error(`The pull of ${ref} ended without the image.`);
  }
};

/** A build's step line: Docker's `Step 2/5 :`, Podman's `STEP 2/5:`. */
const STEP = /step (\d+)\/(\d+)/i;

/** The base image the Dockerfile names. */
const FROM = /^FROM\s+(\S+)/m;

/**
 * The browser image's tag, pulled and built when the runtime lacks it.
 * `prefix` is the repository (`cawco-browser`).
 */
export const ensureImage = async (
  docker: Docker,
  prefix: string,
  onProgress: (progress: ImageProgress) => void
): Promise<string> => {
  const files = Object.fromEntries(
    await Promise.all(
      BROWSER_IMAGE_FILES.map(
        async (name) => [name, await imageFile(name)] as const
      )
    )
  );
  const hash = createHash("sha256");
  for (const name of BROWSER_IMAGE_FILES) {
    hash
      .update(name)
      .update("\0")
      .update(files[name] ?? "")
      .update("\0");
  }
  const tag = `${prefix}:${hash.digest("hex").slice(0, 12)}`;
  if (await hasImage(docker, tag)) {
    return tag;
  }
  const base = FROM.exec(files.Dockerfile ?? "")?.[1];
  if (base) {
    await pullImage(docker, base, (step) =>
      onProgress({ stage: "pulling", ...step })
    );
  }
  const context = await new Bun.Archive(files).bytes();
  onProgress({ stage: "building", done: 0, total: 1 });
  await follow(
    docker,
    await docker.buildImage(Readable.from(Buffer.from(context)), {
      t: tag,
      labels: { "dev.cawco.browser.image": "1" },
    }),
    (event) => {
      const step = event.stream ? STEP.exec(event.stream) : null;
      if (step) {
        onProgress({
          stage: "building",
          done: Number(step[1]) - 1,
          total: Number(step[2]),
        });
      }
    }
  );
  if (!(await hasImage(docker, tag))) {
    throw new Error(`The build of ${tag} ended without the image.`);
  }
  return tag;
};
