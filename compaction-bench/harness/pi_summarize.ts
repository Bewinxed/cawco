/**
 * Arm A7g: one summary written by pi on an openai-codex (ChatGPT) account,
 * the way the agent runs a pi session on an account (agent
 * harnesses/pi-runtime.ts `startPiHost`):
 *
 * - the runtime is the agent's own `accountRuntime(<account>)`
 *   (harnesses/pi-accounts.ts): the account's provider read from its
 *   `credential.json`, read-only; when pi wants it refreshed, the store asks
 *   the agent (`POST /accounts/<id>/fresh` on its local gateway) and reads it
 *   again. The bench never holds a second copy of the grant: refresh tokens
 *   rotate, and a copy would sign the account out (provider-accounts.ts);
 * - the model is `runtime.getModel("openai-codex", <--gpt-model>)`;
 * - the session has no tools (`noTools: "all"`), no extensions, skills,
 *   prompt templates or context files, an in-memory session manager, an empty
 *   working folder, and pi's own default system prompt (the hub's summariser
 *   is an ordinary session of its harness);
 * - `PI_CODING_AGENT_DIR` points at a scratch dir (set by the caller), so the
 *   machine's own pi store, settings and extensions are not read.
 *
 * `--dry` makes the runtime over an empty scratch store instead: no account is
 * read, and the prompt stops at pi's missing credential, the plumbing proven
 * without a model call.
 *
 * Usage: PI_CODING_AGENT_DIR=<scratch>/agent bun run pi_summarize.ts
 *        --cockpit-root R --account-dir D --gpt-model M --prompt-file F --scratch S [--dry]
 * Prints one JSON object: { ok, text, requests, error, commands }.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const args = new Map<string, string>();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--dry") {
    args.set("dry", "1");
  } else {
    args.set(argv[i].replace(/^--/, ""), argv[i + 1]);
    i += 1;
  }
}
const need = (name: string): string => {
  const value = args.get(name);
  if (!value) {
    throw new Error(`--${name} is required`);
  }
  return value;
};
const root = resolve(need("cockpit-root"));
const accountDir = resolve(need("account-dir"));
const gptModel = need("gpt-model");
const prompt = readFileSync(need("prompt-file"), "utf8");
const scratch = resolve(need("scratch"));
const dry = args.has("dry");
const PROVIDER = "openai-codex";

const out = (result: Record<string, unknown>): never => {
  console.log(JSON.stringify(result));
  process.exit(0);
};
const commands = [
  `PI_CODING_AGENT_DIR=${process.env.PI_CODING_AGENT_DIR ?? "<unset>"} bun run pi_summarize.ts --cockpit-root ${root} --account-dir $PI_ACCOUNT_DIR --gpt-model ${gptModel} --prompt-file ${need("prompt-file")} --scratch ${scratch}${dry ? " --dry" : ""}`,
  dry
    ? "# --dry: ModelRuntime.create({ authPath: <scratch>/auth.json }) — an empty store, no account read"
    : "accountRuntime(basename($PI_ACCOUNT_DIR))   # agent pi-accounts.ts: reads $PI_ACCOUNT_DIR/credential.json, refreshes through the agent's gateway",
  `createAgentSession({ model: runtime.getModel("${PROVIDER}", "${gptModel}"), noTools: "all", sessionManager: SessionManager.inMemory(<scratch>/cwd), resourceLoader: no extensions/skills/templates/context files }).prompt(<prompt-file>)`,
];

if (!process.env.PI_CODING_AGENT_DIR?.startsWith(scratch)) {
  out({ ok: false, commands, error: "PI_CODING_AGENT_DIR must be a dir inside --scratch, so the machine's own pi store is never read" });
}
const cwd = join(scratch, "cwd");
mkdirSync(cwd, { recursive: true });
mkdirSync(process.env.PI_CODING_AGENT_DIR as string, { recursive: true });

const agentEntry = Bun.resolveSync("@earendil-works/pi-coding-agent", `${root}/packages/agent/src/`);
const pi = await import(agentEntry);
const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, getAgentDir } = pi;

let runtime;
if (dry) {
  runtime = await ModelRuntime.create({
    refreshOnCreate: false,
    authPath: join(process.env.PI_CODING_AGENT_DIR as string, "auth.json"),
  });
} else {
  const { accountsRoot } = await import(`${root}/packages/core/src/paths.ts`);
  if (dirname(accountDir) !== accountsRoot()) {
    out({
      ok: false,
      commands,
      error: `--account-dir ${accountDir} is not in the agent's accounts root ${accountsRoot()}: accountRuntime reads only there`,
    });
  }
  const { accountRuntime } = await import(`${root}/packages/agent/src/harnesses/pi-accounts.ts`);
  runtime = await accountRuntime(basename(accountDir));
}
await runtime.getAvailable();
const model = runtime.getModel(PROVIDER, gptModel);
if (!model) {
  out({ ok: false, commands, error: `pi has no model ${PROVIDER}/${gptModel}` });
}
const agentDir = getAgentDir();
const settingsManager = SettingsManager.create(cwd, agentDir);
const resourceLoader = new DefaultResourceLoader({
  cwd,
  agentDir,
  settingsManager,
  noExtensions: true,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
});
await resourceLoader.reload();
const { session } = await createAgentSession({
  cwd,
  agentDir,
  modelRuntime: runtime,
  model,
  noTools: "all",
  sessionManager: SessionManager.inMemory(cwd),
  settingsManager,
  resourceLoader,
});
let thrown: string | null = null;
try {
  await session.prompt(prompt);
} catch (error) {
  thrown = error instanceof Error ? error.message : String(error);
}
const assistant = (session.messages as Record<string, any>[]).filter((m) => m.role === "assistant");
const requests = assistant.map((m) => ({
  model: `${m.provider ?? PROVIDER}/${m.model ?? gptModel}`,
  at: m.timestamp ?? Date.now(),
  input: m.usage?.input ?? 0,
  output: m.usage?.output ?? 0,
  reasoning: m.usage?.reasoning ?? 0,
  cacheRead: m.usage?.cacheRead ?? 0,
  cacheCreation: m.usage?.cacheWrite ?? 0,
  cacheWrite1h: m.usage?.cacheWrite1h ?? 0,
  reportedUsd: m.usage?.cost?.total ?? null,
  finish: m.stopReason ?? null,
  error: m.errorMessage ?? null,
}));
const text = assistant
  .flatMap((m) => (Array.isArray(m.content) ? m.content : []).filter((c: any) => c.type === "text").map((c: any) => c.text))
  .join("\n\n")
  .trim();
// Outside srt only because it has no tools (`noTools: "all"`, no extensions): asserted on the session and its messages.
const toolCalls = assistant.flatMap((m) =>
  (Array.isArray(m.content) ? m.content : []).filter((c: any) => c.type === "toolCall").map((c: any) => c.name)
);
const active = typeof session.getActiveToolNames === "function" ? session.getActiveToolNames() : [];
const errors = [
  ...(active.length ? [`the session had tools: ${active.join(", ")}`] : []),
  ...(toolCalls.length ? [`a tool-less summariser called tools: ${toolCalls.join(", ")}`] : []),
  thrown,
  ...requests.map((r) => r.error),
].filter(Boolean);
out({
  ok: errors.length === 0 && text.length > 0 && requests.every((r) => r.finish !== "error"),
  text,
  requests,
  commands,
  error: errors.length ? errors.join("; ") : text ? null : "empty answer",
});
