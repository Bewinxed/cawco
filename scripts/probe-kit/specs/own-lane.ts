/**
 * CawCo does its own job and not the project's, the harness's or the
 * person's: it decides nothing by a file's name, writes nothing it does not
 * own, and installs no runtime.
 *
 * - (place) A plain folder's first commit takes what git reads as the
 *   folder's own: `Sessions.swift`, `Tokens.swift`, `Keychain.swift`,
 *   `tokens/` and `key-bold-duotone.svg` are committed; a `.env` whose text
 *   holds a key is left out and named in `.gitignore`; what the folder's own
 *   `.gitignore` ignores gets no line of CawCo's; a repository of its own is
 *   left out.
 * - (publish) A repository whose files are a project's own publishes; one
 *   whose history once held a key, taken out by a later commit, is refused
 *   naming that file.
 * - (exclude) A clone's `info/exclude` keeps the person's own `.idea` and
 *   `.vscode` lines through a boundary's launch: CawCo rewrites its block
 *   alone.
 * - (node) A machine with no Node, asked for OpenCode, installs nothing: the
 *   install says what it needs, and the `node` capability reports it missing
 *   with its install command. Run in a child with a scratch HOME and a PATH
 *   holding only `tar`, `xz` and `ln`, so an install would land in that
 *   HOME.
 *
 *   bun scripts/probe-kit/run.ts own-lane
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { excludeStandIns } from "../../../packages/agent/src/checkout-exclude";
import { placePush } from "../../../packages/agent/src/place-push";
import { placeRepo } from "../../../packages/agent/src/place-repo";
import { readWithin } from "../../../packages/core/src/bounded";
import type { Kit, Spec } from "../kit";

const ROOT = join(import.meta.dir, "..", "..", "..");

/** How long the Node leg's child may run: an install that should not happen may take a while to fail. */
const NODE_LEG_MS = 240_000;

const git = async (cwd: string, ...args: string[]): Promise<string> =>
  (
    await Bun.$`git -c user.name=probe -c user.email=probe@cawco.invalid -c init.defaultBranch=main -c commit.gpgSign=false ${args}`
      .cwd(cwd)
      .quiet()
  ).text();

const write = async (path: string, text: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, text);
};

/** A key's shape the credential scan reads (core secret-text.ts): not a real one. */
const FAKE_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz012345";

const placeLeg = async (kit: Kit, root: string): Promise<void> => {
  const place = join(root, "place");
  const own = [
    "Sessions.swift",
    "Tokens.swift",
    "Keychain.swift",
    "tokens/colors.json",
    "icons/key-bold-duotone.svg",
  ];
  for (const path of own) {
    await write(join(place, path), `// ${path}\n`);
  }
  await write(join(place, ".env"), `OPENAI_API_KEY=${FAKE_KEY}\n`);
  await write(join(place, ".gitignore"), "build/\n");
  await write(join(place, "build", "out.txt"), "built\n");
  await write(join(place, "vendored", "lib.c"), "int lib;\n");
  await git(join(place, "vendored"), "init", "-q");

  const made = await placeRepo(place);
  const committed = new Set(
    (await git(place, "ls-files")).split("\n").filter(Boolean)
  );
  const leftOut = made.state === "made" ? made.leftOut : [];
  kit.note(
    `(place) committed: ${[...committed].join(", ")}; left out: ${leftOut.map((one) => `${one.path} (${one.why})`).join("; ")}`
  );
  const missing = own.filter((path) => !committed.has(path));
  kit.check(
    "(place) a folder's own files are committed whatever their names: Sessions.swift, Tokens.swift, Keychain.swift, tokens/, key-bold-duotone.svg",
    made.state === "made" && missing.length === 0,
    `not committed: ${missing.join(", ")}`
  );
  const env = leftOut.find((one) => one.path === ".env");
  kit.check(
    "(place) a .env whose text holds a key is left out, for its text",
    !committed.has(".env") && env?.why.startsWith("its text holds") === true,
    JSON.stringify(env)
  );
  const ignore = await readFile(join(place, ".gitignore"), "utf8");
  const block = ignore.slice(ignore.indexOf("# CawCo"));
  kit.check(
    "(place) CawCo's .gitignore lines name only what it left out: the .env and the repository of its own, never the folder's own files or what its own rules ignore",
    ignore.startsWith("build/\n") &&
      block
        .split("\n")
        .filter((line) => line.startsWith("/"))
        .sort()
        .join(" ") === "/.env /vendored/" &&
      !committed.has("build/out.txt"),
    ignore
  );
};

const publishLeg = async (kit: Kit, root: string): Promise<void> => {
  const clean = join(root, "clean");
  await write(join(clean, "Sessions.swift"), "struct Sessions {}\n");
  await write(join(clean, "tokens", "colors.json"), "{}\n");
  await git(clean, "init", "-q");
  await git(clean, "add", "-A");
  await git(clean, "commit", "-q", "-m", "first");
  const read = await placePush(clean, "probe", true).then(
    (pushed) => ({ pushed }),
    (error: Error) => ({ refused: error.message })
  );
  kit.check(
    "(publish) a repository of a project's own files (Sessions.swift, tokens/) publishes",
    "pushed" in read && read.pushed.files === 2,
    JSON.stringify(read)
  );

  const leaked = join(root, "leaked");
  await write(join(leaked, "README.md"), "# leaked\n");
  await write(join(leaked, "notes.txt"), `the key is ${FAKE_KEY}\n`);
  await git(leaked, "init", "-q");
  await git(leaked, "add", "-A");
  await git(leaked, "commit", "-q", "-m", "first");
  await git(leaked, "rm", "-q", "notes.txt");
  await git(leaked, "commit", "-q", "-m", "take the key out");
  const refused = await placePush(leaked, "probe", true).then(
    () => "",
    (error: Error) => error.message
  );
  kit.check(
    "(publish) a history that once held a key, in a file of any name, is refused naming it",
    refused.includes("notes.txt") && refused.includes("earlier commit"),
    refused || "published"
  );
};

const excludeLeg = async (kit: Kit, root: string): Promise<void> => {
  const clone = join(root, "clone");
  await mkdir(clone, { recursive: true });
  await git(clone, "init", "-q");
  const exclude = join(clone, ".git", "info", "exclude");
  await write(exclude, "# mine\n.idea\n.vscode\n");
  await excludeStandIns(clone, [".mcp.json"]);
  const launched = await readFile(exclude, "utf8");
  await excludeStandIns(clone, []);
  const closed = await readFile(exclude, "utf8");
  kit.check(
    "(exclude) the person's own .idea and .vscode lines survive a boundary's launch and close; CawCo's block holds its stand-in, then goes",
    launched.startsWith("# mine\n.idea\n.vscode\n") &&
      launched.includes("/.mcp.json") &&
      closed === "# mine\n.idea\n.vscode\n",
    JSON.stringify({ launched, closed })
  );
};

const nodeLeg = async (kit: Kit, root: string): Promise<void> => {
  const home = join(root, "home");
  const bin = join(root, "bin");
  const scratch = join(root, "tmp");
  await Promise.all(
    [home, bin, scratch].map((dir) => mkdir(dir, { recursive: true }))
  );
  for (const tool of ["tar", "xz", "ln"]) {
    const at = Bun.which(tool);
    if (at) {
      await symlink(at, join(bin, tool));
    }
  }
  const script = `
    import { installTool } from ${JSON.stringify(join(ROOT, "packages/agent/src/tools.ts"))};
    import { probeCapabilities } from ${JSON.stringify(join(ROOT, "packages/agent/src/capabilities.ts"))};
    const status = await installTool("opencode");
    const node = (await probeCapabilities()).items.find((item) => item.id === "node");
    console.log(JSON.stringify({ status, node }));
  `;
  const ran = await readWithin(NODE_LEG_MS, async (signal) => {
    const child = Bun.spawn([process.execPath, "-e", script], {
      cwd: ROOT,
      env: {
        HOME: home,
        PATH: bin,
        TMPDIR: scratch,
        BUN_INSTALL: join(home, ".bun"),
      },
      stdout: "pipe",
      stderr: "pipe",
      signal,
      killSignal: "SIGKILL",
    });
    const [out, err] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { out, err };
  });
  const { out: stdout, err: stderr } =
    ran.kind === "answered"
      ? ran.value
      : {
          out: "",
          err: `the child did not finish within ${NODE_LEG_MS / 1000}s`,
        };
  const said = JSON.parse(stdout.trim().split("\n").at(-1) || "{}") as {
    node?: { available: boolean; installCommand: string };
    status?: { detail?: string; state: string };
  };
  kit.note(`(node) ${stdout.trim().slice(-600)} ${stderr.trim().slice(-400)}`);
  const put = [
    join(home, ".local", "node"),
    join(home, ".local", "bin", "node"),
    join(home, ".local", "bin", "npm"),
  ].filter((path) => existsSync(path));
  kit.check(
    "(node) a machine with no Node gets none: nothing in ~/.local/node or ~/.local/bin",
    put.length === 0,
    `installed: ${put.join(", ")}`
  );
  kit.check(
    "(node) OpenCode's install installs nothing and says what it needs",
    said.status !== undefined &&
      said.status.state !== "installed" &&
      said.status.detail?.includes("npm") === true,
    JSON.stringify(said.status)
  );
  kit.check(
    "(node) the node capability reports it missing, with its install command",
    said.node?.available === false && (said.node?.installCommand ?? "") !== "",
    JSON.stringify(said.node)
  );
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "own-lane",
  run: async (kit: Kit) => {
    const root = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "own-lane-")
    );
    try {
      await placeLeg(kit, root);
      await publishLeg(kit, root);
      await excludeLeg(kit, root);
      await nodeLeg(kit, root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
};

export default spec;
