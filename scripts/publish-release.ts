/**
 * Puts a release on GitHub Releases through the GitHub CLI the publisher is
 * already signed in with, so no token passes through this code, in the steps
 * release.ts runs it in: a draft as soon as the build's version is known,
 * each archive uploaded to it as soon as it is made (while the proofs still
 * run), and at promotion the signed manifest uploaded and the draft
 * published. A draft is no release to a machine (the installer reads
 * published releases alone; core binary-distribution.ts the same), so none
 * sees one before every asset and the manifest are up. Called only behind
 * `release.ts --publish` and by republish.ts; nothing else reaches it.
 *
 * Each call is one REST request through `gh api --include`, which prints
 * GitHub's status line before the body whenever GitHub answered (cli/cli
 * pkg/cmd/api/api.go `processResponse`: `fmt.Fprintln(headersWriter,
 * resp.Proto, resp.Status)`), so a call that printed none got no answer and
 * is asked again (lib/outside-call.ts), while an answer of 4xx is GitHub
 * refusing and ends it. Requests that make something look first for what an
 * unanswered earlier attempt may have made: a draft is looked up by its tag
 * before it is created again, and an asset of the same name is removed
 * before each upload (what `--clobber` did). One refusal is asked again: an
 * upload's 404 while the draft still stands ({@link uploadAssets}).
 */
import { basename, join } from "node:path";
import type { Subprocess } from "bun";
import {
  NIGHTLY_TAG_PREFIX,
  RELEASE_REPOSITORY,
} from "../packages/core/src/binary-distribution";
import type { ReleaseManifest } from "../packages/core/src/release-manifest";
import {
  type Answer,
  NoAnswer,
  persist,
  printedAnswer,
  Refused,
  sorted,
} from "./lib/outside-call";

/** How many nightly pre-releases are kept; older ones are deleted with their tags. */
const NIGHTLIES_KEPT = 5;
const REPO = `repos/${RELEASE_REPOSITORY}`;
/** One request's time; an archive's upload gets more. */
const CALL_TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 15 * 60_000;
/** gh's exit for "not signed in" (cli/cli cmd/gh/main.go `exitAuth`): a refusal, not a dropped call. */
const GH_EXIT_AUTH = 4;
/** The `{?name,label}` a release's upload_url ends in. */
const URI_TEMPLATE = /\{.*$/u;

/** The gh calls running now, so a stop can end them before it removes the draft they write to. */
const calls = new Set<Subprocess>();
/** Stops so far: a call begun before one is not asked again after it. */
let stops = 0;

/** One `gh api` request: GitHub's answer, sorted (outside-call.ts `sorted`). */
async function request(
  what: string,
  method: string,
  path: string,
  options: {
    body?: object;
    file?: string;
    headers?: string[];
    timeoutMs?: number;
  } = {}
): Promise<Answer> {
  const child = Bun.spawn(
    [
      "gh",
      "api",
      "--include",
      "--method",
      method,
      ...(options.headers ?? []).flatMap((header) => ["-H", header]),
      ...(options.body || options.file ? ["--input", options.file ?? "-"] : []),
      path,
    ],
    {
      env: process.env,
      stdin: options.body
        ? Buffer.from(JSON.stringify(options.body))
        : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  calls.add(child);
  const timer = setTimeout(
    () => child.kill("SIGTERM"),
    options.timeoutMs ?? CALL_TIMEOUT_MS
  );
  try {
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const answer = printedAnswer(out);
    if (answer) {
      return sorted(what, answer);
    }
    if (code === 0) {
      throw new Error(`${what}: gh printed no HTTP answer: ${out.trim()}`);
    }
    if (code === GH_EXIT_AUTH) {
      throw new Refused(what, 401, err);
    }
    throw new NoAnswer(
      `${what}: gh api exited ${child.signalCode ?? code}: ${err.trim()}`
    );
  } finally {
    clearTimeout(timer);
    calls.delete(child);
  }
}

/** A request asked again while it gets no answer, until a stop. */
function call<T>(what: string, attempt: (n: number) => Promise<T>): Promise<T> {
  const begun = stops;
  return persist(what, (n) => {
    if (stops !== begun) {
      throw new Error(`${what} ended: the release was stopped`);
    }
    return attempt(n);
  });
}

/** Every gh call running now ended (SIGTERM), once each has; none of them is asked again. */
export async function endCalls(): Promise<void> {
  stops += 1;
  const ending = [...calls];
  for (const child of ending) {
    child.kill("SIGTERM");
  }
  await Promise.all(ending.map((child) => child.exited));
}

interface Release {
  assets: { id: number; name: string }[];
  created_at: string;
  draft: boolean;
  id: number;
  prerelease: boolean;
  tag_name: string;
  upload_url: string;
}

/** The newest 100 releases, drafts included (the signed-in publisher sees them). */
const listReleases = async (): Promise<Release[]> =>
  JSON.parse(
    (
      await call("list releases", () =>
        request("list releases", "GET", `${REPO}/releases?per_page=100`)
      )
    ).text
  ) as Release[];

/** The release under `tag`, draft or published, if there is one. */
const releaseOf = async (tag: string): Promise<Release | undefined> =>
  (await listReleases()).find((release) => release.tag_name === tag);

/** Whether a published release (not a draft) stands under `tag`. */
export const isPublished = async (tag: string): Promise<boolean> =>
  (await releaseOf(tag))?.draft === false;

/** A DELETE whose 404 means an earlier, unanswered attempt already did it. */
const remove = (what: string, path: string): Promise<unknown> =>
  call(what, () =>
    request(what, "DELETE", path).catch((error: unknown) => {
      if (error instanceof Refused && error.status === 404) {
        return;
      }
      throw error;
    })
  );

/** What a draft is made from: the build's version, commit, channel and notes, and its tag. */
export type DraftOf = Pick<
  ReleaseManifest,
  "channel" | "commit" | "notes" | "version"
> & { tag: string };

/**
 * The release's draft, with no asset yet. A draft an earlier run of the same
 * build left (it was killed before it could remove it) is removed first; a
 * published release under the tag refuses the publish.
 */
export async function createDraft(release: DraftOf): Promise<void> {
  await deleteDraft(release.tag);
  const what = `create draft ${release.tag}`;
  await call(what, async (n) => {
    if (n > 1) {
      const made = await releaseOf(release.tag);
      if (made?.draft) {
        console.log(
          `${what}: the unanswered attempt made draft ${made.id}; it is the draft`
        );
        return {
          status: 200,
          headers: new Headers(),
          bytes: new Uint8Array(),
          text: "",
        };
      }
    }
    return request(what, "POST", `${REPO}/releases`, {
      body: {
        tag_name: release.tag,
        target_commitish: release.commit,
        name: release.version,
        body: release.notes,
        draft: true,
        prerelease: release.channel === "nightly",
      },
    });
  });
}

/** The release `id` as GitHub has it now, read by its id (drafts too, for a publisher with push access). */
const releaseById = async (id: number): Promise<Release> =>
  JSON.parse(
    (await request(`read release ${id}`, "GET", `${REPO}/releases/${id}`)).text
  ) as Release;

/**
 * What an upload's failure on attempt `n` to draft `id` of `tag` is: a 404
 * while the draft, read again, stands, or a 422 after an earlier attempt,
 * becomes {@link NoAnswer}; every other failure is itself.
 */
const sortUpload = async (
  what: string,
  n: number,
  error: unknown,
  id: number,
  tag: string
): Promise<unknown> => {
  if (!(error instanceof Refused)) {
    return error;
  }
  if (error.status === 422 && n > 1) {
    return new NoAnswer(
      `${what} answered 422 after an attempt that may have left it: ${error.said.trim()}`,
      { cause: error }
    );
  }
  if (error.status !== 404) {
    return error;
  }
  const now = await releaseById(id).catch((read: unknown) => {
    if (read instanceof Refused && read.status === 404) {
      throw new Refused(
        what,
        404,
        `${error.said.trim()} (and draft ${id} answers 404 itself: it is gone or out of reach)`
      );
    }
    throw read;
  });
  if (!(now.draft && now.tag_name === tag)) {
    return error;
  }
  return new NoAnswer(
    `${what} answered 404 while draft ${now.id} stands: ${error.said.trim()}`,
    { cause: error }
  );
};

/**
 * Files uploaded to the draft `tag`, each replacing an asset of its name.
 *
 * An upload GitHub answers 404 while the draft, read again by its id, still
 * stands is taken for no answer and asked again (dc19ebb1a's nightly: one
 * `release.json.sig` upload answered 404, the draft was there to delete two
 * seconds later, and the release was thrown away). The upload endpoint
 * documents only 201 and 422 (docs.github.com/rest/releases/assets
 * #upload-a-release-asset), and GitHub answers 404 for what the caller may
 * not reach as well as for what is not there; the re-read tells them apart:
 * a draft that answers 404 too is gone or out of reach, and the upload's
 * refusal stands. Every other 4xx stays final, but for a 422 on an attempt
 * after the first: that is the earlier attempt's half-arrived asset, removed
 * before the next one ("If you upload an asset with the same filename as
 * another uploaded asset, you'll receive an error and must delete the old
 * file before you can re-upload the new asset").
 */
export async function uploadAssets(
  tag: string,
  files: string[]
): Promise<void> {
  const found = await releaseOf(tag);
  if (!found) {
    throw new Error(`upload to ${tag}: there is no release under the tag`);
  }
  await Promise.all(
    files.map((file) => {
      const name = basename(file);
      const what = `upload ${name}`;
      let draft = found;
      return call(what, async (n) => {
        // What --clobber did, and what an earlier attempt may have left.
        if (n > 1) {
          draft = await releaseById(draft.id);
        }
        await Promise.all(
          draft.assets
            .filter((row) => row.name === name)
            .map((asset) =>
              remove(
                `remove asset ${name}`,
                `${REPO}/releases/assets/${asset.id}`
              )
            )
        );
        const uploads = draft.upload_url.replace(URI_TEMPLATE, "");
        try {
          return await request(
            what,
            "POST",
            `${uploads}?name=${encodeURIComponent(name)}`,
            {
              file,
              headers: ["Content-Type: application/octet-stream"],
              timeoutMs: UPLOAD_TIMEOUT_MS,
            }
          );
        } catch (error) {
          throw await sortUpload(what, n, error, draft.id, tag);
        }
      });
    })
  );
}

/**
 * The draft `tag` removed, when there is one; a published release is left
 * alone. Answers whether a draft was removed. A failure to read the releases
 * is thrown, never taken for "no draft" (nightly 5186's stop read it with no
 * cwd and left its draft). A draft has no git tag (GitHub makes the tag when
 * a release is published), so there is no tag to remove with it.
 */
export async function deleteDraft(tag: string): Promise<boolean> {
  const release = await releaseOf(tag);
  if (!release?.draft) {
    return false;
  }
  await remove(`delete draft ${tag}`, `${REPO}/releases/${release.id}`);
  return true;
}

/**
 * The draft `tag` promoted: the signed manifest and the checksums from
 * `directory` uploaded, then published, the newest stable or a nightly
 * pre-release; past {@link NIGHTLIES_KEPT} nightlies the oldest go.
 */
export async function promoteRelease(
  tag: string,
  directory: string,
  manifest: ReleaseManifest
): Promise<void> {
  if (manifest.testSigned) {
    throw new Error("A test-signed release cannot be published");
  }
  await uploadAssets(
    tag,
    ["SHA256SUMS", "release.json", "release.json.sig"].map((name) =>
      join(directory, name)
    )
  );
  const release = await releaseOf(tag);
  if (!release) {
    throw new Error(`publish ${tag}: there is no release under the tag`);
  }
  await call(`publish ${tag}`, () =>
    request(`publish ${tag}`, "PATCH", `${REPO}/releases/${release.id}`, {
      body: {
        draft: false,
        make_latest: manifest.channel === "stable" ? "true" : "false",
      },
    })
  );
  if (manifest.channel === "nightly") {
    const old = (await listReleases())
      .filter(
        (row) =>
          !row.draft &&
          row.prerelease &&
          row.tag_name.startsWith(NIGHTLY_TAG_PREFIX)
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(NIGHTLIES_KEPT);
    await Promise.all(
      old.map(async (row) => {
        await remove(
          `delete release ${row.tag_name}`,
          `${REPO}/releases/${row.id}`
        );
        await remove(
          `delete tag ${row.tag_name}`,
          `${REPO}/git/refs/tags/${row.tag_name}`
        );
      })
    );
  }
}
