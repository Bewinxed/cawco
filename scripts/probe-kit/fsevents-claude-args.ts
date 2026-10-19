/**
 * fsevents-scope's Claude CLI as one launched before CawCo asked it for its
 * hook events: the arguments a session's `claude` is started with, without
 * `--include-hook-events` and with a boundary hook in its `--settings` (the
 * form boundary.ts `launchedHook` reads off a CLI's command line). The
 * fleet's `claude` on PATH is a zsh script that `exec`s the real CLI with
 * these, so the process sessiond holds is the CLI itself, under this command
 * line; an agent that adopts it follows its transcript for the hook's
 * failures (claude.ts `boundedBy`). Any other run (`--version`) passes as it
 * came. Prints the arguments NUL-separated.
 *
 *   bun scripts/probe-kit/fsevents-claude-args.ts <hook> <args…>
 */
export {};

const [hook = "", ...args] = process.argv.slice(2);
const entry = {
  matcher: "*",
  hooks: [{ type: "command", command: `'${hook}' || exit 2` }],
};
interface Settings {
  hooks?: { PreToolUse?: unknown[] } & Record<string, unknown>;
}
const hooked = (settings: Settings): string =>
  JSON.stringify({
    ...settings,
    hooks: {
      ...settings.hooks,
      PreToolUse: [...(settings.hooks?.PreToolUse ?? []), entry],
    },
  });

const session = args.includes("--output-format");
const out = session
  ? args.filter((arg) => arg !== "--include-hook-events")
  : [...args];
if (session) {
  const at = out.indexOf("--settings");
  const given = at >= 0 ? out[at + 1] : undefined;
  if (given?.startsWith("{")) {
    out[at + 1] = hooked(JSON.parse(given) as Settings);
  } else {
    out.push("--settings", hooked({}));
  }
}
process.stdout.write(out.join("\0"));
