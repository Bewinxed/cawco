import { rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENT_BUNDLE_EXECUTABLE } from "../../../packages/core/src/agent-bundle";
import { archiveBundle } from "../../binary/sign-agent-bundle";
import { alone, isDarwin, type StepContext } from "./shared";

/** A target's archive made and checked: its manifest row and its `.sha256` file. */
const recordArchive = async (
  { staging, archiveName, manifest }: StepContext,
  target: string,
  executable: string
): Promise<void> => {
  const archive = archiveName(target);
  const [sha256, binarySha256] = await Promise.all(
    [join(staging, archive), executable].map(async (path) =>
      new Bun.CryptoHasher("sha256")
        .update(await Bun.file(path).bytes())
        .digest("hex")
    )
  );
  manifest().artifacts.push({
    target,
    archive,
    sha256: sha256 as string,
    size: (await stat(join(staging, archive))).size,
    binarySha256: binarySha256 as string,
    binarySize: (await stat(executable)).size,
  });
  await writeFile(
    join(staging, `${archive}.sha256`),
    `${sha256}  ${archive}\n`
  );
};

/** A target's archive: a tarball of the linux binary, or the signed darwin bundle zipped as its build ships it. */
export const archive = async (
  context: StepContext,
  target: string
): Promise<void> => {
  const { run, staging, trees, archiveName, manifest } = context;
  const dir = join(staging, target);
  if (!isDarwin(target)) {
    await run(
      [
        "tar",
        "--owner=0",
        "--group=0",
        "--numeric-owner",
        "-czf",
        join(staging, archiveName(target)),
        "-C",
        dir,
        "cawco",
      ],
      trees.build
    );
    await recordArchive(context, target, join(dir, "cawco"));
    return;
  }
  await archiveBundle(run, dir, manifest().version, archiveName(target));
  await rename(
    join(dir, archiveName(target)),
    join(staging, archiveName(target))
  );
  await recordArchive(context, target, join(dir, AGENT_BUNDLE_EXECUTABLE));
};

await alone(
  import.meta,
  "bun scripts/release/steps/archive.ts --commit SHA --target T [--staging DIR] [--version V]\n  The target's archive and its .sha256 made from the compiled (and, on darwin, signed) folder; its row is added to <staging>/manifest.json.",
  (context, flags) => archive(context, flags.required("--target")),
  { keepsManifest: true }
);
