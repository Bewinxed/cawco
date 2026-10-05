import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Spike-only substitutions. Product sources and the live release builder stay untouched.
const root = resolve(import.meta.dir, "../..");
const out = import.meta.dir;
const files: [string, string][] = [];
async function walk(dir: string, prefix: string) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await walk(path, key);
    else files.push([key, path]);
  }
}
await walk(join(root, "packages/hub/drizzle"), "drizzle");
await walk(join(root, "apps/dashboard/build/client"), "client");
await writeFile(join(out, "assets.ts"), files.map(([key, path], i) =>
  `import a${i} from ${JSON.stringify(path)} with { type: "file" };`
).join("\n") + `\nexport const assets = new Map(${JSON.stringify(files.map(([key], i) => [key, `a${i}`])).replace(/"a(\d+)"/g, "a$1")});\n`);
await mkdir(join(out, "output"), { recursive: true });
const result = await Bun.build({
  entrypoints: [join(out, "entry.ts")],
  compile: { target: "bun-linux-x64", outfile: join(out, "output/cawco"), autoloadDotenv: false, autoloadBunfig: false },
  minify: true,
  define: { __CAWCO_RELEASE__: "true", __CAWCO_VERSION__: '"0.1.0-spike"', "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "spike-only-seams", setup(build) {
    build.onLoad({ filter: /packages\/cli\/src\/service\.ts$/ }, async ({ path }) => ({
      contents: (await Bun.file(path).text()).replace('const HERE = here();', 'const HERE = checkoutLayout(process.env.HOME!);'), loader: "ts"
    }));
    build.onLoad({ filter: /packages\/agent\/src\/harnesses\/index\.ts$/ }, async () => ({
      contents: await Bun.file(join(out, "stub-harnesses.ts")).text(), loader: "ts"
    }));
    build.onLoad({ filter: /packages\/agent\/src\/auth\.ts$/ }, () => ({
      contents: 'export const probeAuth = async () => "unauthenticated"; export const resolveClaudeExecutable = () => undefined;', loader: "ts"
    }));
    build.onLoad({ filter: /packages\/(agent|hub)\/src\/build\.ts$/ }, () => ({
      contents: 'export const REPO_ROOT = process.env.HOME; export const buildInfo = async () => ({version:"0.1.0-spike",startedAt:Date.now()});', loader: "ts"
    }));
    build.onLoad({ filter: /packages\/hub\/src\/db\/index\.ts$/ }, async ({ path }) => ({
      contents: (await Bun.file(path).text()).replace(/const MIGRATIONS_DIR = Bun.fileURLToPath\([\s\S]*?\n\);/, 'const MIGRATIONS_DIR = process.env.CAWCO_SPIKE_MIGRATIONS!;'), loader: "ts"
    }));
    build.onLoad({ filter: /packages\/agent\/src\/mcp-oauth\.ts$/ }, async ({ path }) => ({
      contents: (await Bun.file(path).text()).replace('port: CAWCO_MCP_CALLBACK_PORT,', 'port: Number(process.env.CAWCO_SPIKE_GATEWAY_PORT),'), loader: "ts"
    }));
    // Browser installation/use is deliberately unavailable in this credential-free proof.
    build.onResolve({ filter: /^playwright-core$/ }, () => ({ path: "playwright-stub", namespace: "spike" }));
    build.onLoad({ filter: /.*/, namespace: "spike" }, () => ({
      contents: 'export const chromium = { executablePath() { throw new Error("Browser harness excluded from binary spike"); } };', loader: "js"
    }));
  }}],
});
if (!result.success) throw new AggregateError(result.logs, "Binary compile failed");
console.log(`compiled ${result.outputs[0].path}: ${result.outputs[0].size} bytes; ${files.length} embedded assets`);
