/**
 * What the container tests are made of: the product's packages, the
 * dashboard the binary embeds, the binary's build and test scripts and the
 * dependencies. A test verdict (release.ts) and a kept end-to-end test build
 * (build-e2e.ts) stand on the tree of exactly these at a commit (`git
 * ls-tree`), so a commit that changes none of them (the Apple app, docs, the
 * probe kit, the release script) stands on the verdicts and builds of the
 * last that did. No version string is in it: every test build is named by
 * the test itself.
 */
const TEST_INPUTS = [
  "packages",
  "apps/dashboard",
  "scripts/binary",
  "scripts/build-binary.ts",
  "scripts/lib",
  "bun.lock",
  "package.json",
];

/** The key of {@link TEST_INPUTS} at `rev` in `checkout`: 24 hex digits of the sha256 of their `git ls-tree -r`. */
export const testInputsKey = async (
  checkout: string,
  rev: string
): Promise<string> => {
  const listed = Bun.spawn(
    ["git", "ls-tree", "-r", rev, "--", ...TEST_INPUTS],
    { env: process.env, cwd: checkout, stdout: "pipe", stderr: "inherit" }
  );
  const text = await new Response(listed.stdout).text();
  if ((await listed.exited) !== 0 || !text) {
    throw new Error(`git ls-tree of the test inputs at ${rev} failed`);
  }
  return new Bun.CryptoHasher("sha256").update(text).digest("hex").slice(0, 24);
};

/** Whether `checkout` has uncommitted changes under {@link TEST_INPUTS}: then nothing is kept by their key. */
export const testInputsChanged = async (checkout: string): Promise<boolean> => {
  const status = Bun.spawn(
    ["git", "status", "--porcelain", "--", ...TEST_INPUTS],
    { env: process.env, cwd: checkout, stdout: "pipe", stderr: "inherit" }
  );
  const text = await new Response(status.stdout).text();
  if ((await status.exited) !== 0) {
    throw new Error(`git status of the test inputs in ${checkout} failed`);
  }
  return text.trim() !== "";
};
