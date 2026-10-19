/**
 * Claude Code's sign-in (packages/agent/src/login.ts) hands the person only
 * Anthropic's own authorize link, whatever else the CLI's screen says around
 * it, and stops with the screen it saw when that link never comes. Read
 * against a stand-in `claude` on PATH, one leg per screen:
 *
 *   - today's screen, exactly as Claude Code 2.1.302 prints it (an OSC 8
 *     hyperlink, then "Paste code here if prompted >"), for a subscription
 *     and for `--console`;
 *   - the prompt reworded;
 *   - a docs link printed before the authorize link;
 *   - ANSI styling inside the link and the prompt;
 *   - no link at all, the CLI waiting on: stopped at the link timeout;
 *   - the CLI exiting before any link: stopped at once;
 *   - the CLI saying it signed in while `auth status` says it is not.
 *
 * Every screen arrives in two writes, split inside the link's `state`, so a
 * link read before its end would be handed out cut short. A link handed out
 * is then signed in with the page's code: the stand-in's `auth login` stores
 * its login only for that code, and success is its `auth status`.
 *
 * Each leg runs in its own `bun` process with its own HOME (the agent reads
 * its paths from `os.homedir()`, which is fixed at start): this file, run
 * with `PROBE_SIGNIN_SCREEN` set.
 *
 *   bun scripts/probe-kit/run.ts claude-signin
 */
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Spec } from "../kit";

const STATE = "pr0beStateValue";
/** The page's code, whole: `code#state`. */
const CODE = `pr0beCode#${STATE}`;
const EMAIL = "probe@example.com";

/** An authorize link as Claude Code 2.1.302 prints one, on `endpoint`. */
const authorize = (endpoint: string) =>
  `${endpoint}?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Aprofile+user%3Ainference&code_challenge=pr0beChallenge&code_challenge_method=S256&state=${STATE}`;
const SUBSCRIPTION = authorize("https://claude.com/cai/oauth/authorize");
const CONSOLE = authorize("https://platform.claude.com/oauth/authorize");

/** `url` cut inside its `state`: the screen's two writes. */
const halves = (url: string): [string, string] => [
  url.slice(0, -5),
  url.slice(-5),
];

/** Today's screen around `url`, from a capture of 2.1.302's `auth login` in a pty. */
const today = (url: string): string[] => {
  const [head, tail] = halves(url);
  return [
    `Opening browser to sign in…\r\nIf the browser didn't open, visit: \u001b]8;;${url}\u0007${head}`,
    `${tail}\u001b]8;;\u0007\r\nPaste code here if prompted > `,
  ];
};

interface Screen {
  /** After the screen: read the code, wait without reading, or exit 1. */
  after: "code" | "wait" | "exit";
  /** What `auth login` writes, a pause between each. */
  chunks: string[];
  /** Whether the right code stores a login (else it says it did and doesn't). */
  stores: boolean;
}

interface Leg {
  /** The link handed out and signed in with, or a line the stop must show. */
  expect: { url: string } | { stops: string; signedOut?: true };
  kind: "subscription" | "console";
  name: string;
  screen: Screen;
}

const [subHead, subTail] = halves(SUBSCRIPTION);
const LEGS: Leg[] = [
  {
    name: "today's screen",
    kind: "subscription",
    screen: { chunks: today(SUBSCRIPTION), after: "code", stores: true },
    expect: { url: SUBSCRIPTION },
  },
  {
    name: "today's screen, --console",
    kind: "console",
    screen: { chunks: today(CONSOLE), after: "code", stores: true },
    expect: { url: CONSOLE },
  },
  {
    name: "a reworded prompt",
    kind: "subscription",
    screen: {
      chunks: [
        `Opening your browser…\r\nSign in at ${subHead}`,
        `${subTail}\r\nEnter the code from the page: `,
      ],
      after: "code",
      stores: true,
    },
    expect: { url: SUBSCRIPTION },
  },
  {
    name: "a docs link before the authorize link",
    kind: "subscription",
    screen: {
      chunks: [
        "Signing in to Claude Code: https://code.claude.com/docs/en/authentication\r\n",
        ...today(SUBSCRIPTION),
      ],
      after: "code",
      stores: true,
    },
    expect: { url: SUBSCRIPTION },
  },
  {
    name: "ANSI inside the link and the prompt",
    kind: "subscription",
    screen: {
      chunks: [
        `\u001b[2mIf the browser didn't open, visit:\u001b[22m \u001b[4m${SUBSCRIPTION.slice(0, 30)}\u001b[24m\u001b[4m${subHead.slice(30)}`,
        `${subTail}\u001b[24m\r\n\u001b[1mPaste\u001b[22m code here if prompted > `,
      ],
      after: "code",
      stores: true,
    },
    expect: { url: SUBSCRIPTION },
  },
  {
    name: "no link at all",
    kind: "subscription",
    screen: {
      chunks: [
        "Opening browser to sign in…\r\n",
        "Couldn't reach the sign-in service. Try again later.\r\n",
      ],
      after: "wait",
      stores: false,
    },
    expect: { stops: "Couldn't reach the sign-in service. Try again later." },
  },
  {
    name: "the CLI exiting before a link",
    kind: "console",
    screen: {
      chunks: ["error: ", "unknown option '--console'\r\n"],
      after: "exit",
      stores: false,
    },
    expect: { stops: "error: unknown option '--console'" },
  },
  {
    name: "signed in on screen, signed out by auth status",
    kind: "subscription",
    screen: { chunks: today(SUBSCRIPTION), after: "code", stores: false },
    expect: { stops: "Login successful.", signedOut: true },
  },
];

/** The stand-in `claude`: `--version`, `auth login`, `auth status`, `auth logout`, and the SDK's initialize. */
const STAND_IN = `#!/usr/bin/env bun
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const marker = join(process.env.CLAUDE_CONFIG_DIR ?? "", "probe-signed-in");
const EMAIL = ${JSON.stringify(EMAIL)};
if (args[0] === "--version") {
  console.log("2.1.302 (Claude Code)");
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "status") {
  const signedIn = existsSync(marker);
  console.log(JSON.stringify(signedIn ? { loggedIn: true, authMethod: "claude.ai", email: EMAIL } : { loggedIn: false, authMethod: "none" }));
  process.exit(signedIn ? 0 : 1);
}
if (args[0] === "auth" && args[1] === "logout") {
  rmSync(marker, { force: true });
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "login") {
  const screen = JSON.parse(readFileSync(process.env.PROBE_SIGNIN_SCREEN, "utf8"));
  for (const chunk of screen.chunks) {
    process.stdout.write(chunk);
    await Bun.sleep(150);
  }
  if (screen.after === "exit") {
    process.exit(1);
  }
  if (screen.after === "wait") {
    await new Promise(() => {});
  }
  for await (const line of console) {
    if (line.trim() === ${JSON.stringify(CODE)}) {
      if (screen.stores) {
        writeFileSync(marker, "");
      }
      process.stdout.write("\\r\\nLogin successful.\\r\\n");
      process.exit(0);
    }
    process.stdout.write("\\r\\nInvalid code. Please make sure the full code was copied.\\r\\nPaste code here if prompted > ");
  }
}
for await (const line of console) {
  const message = JSON.parse(line);
  if (message.type === "control_request" && message.request?.subtype === "initialize") {
    process.stdout.write(JSON.stringify({ type: "control_response", response: { subtype: "success", request_id: message.request_id, response: { commands: [], agents: [], models: [], output_style: "default", available_output_styles: [], account: existsSync(marker) ? { email: EMAIL } : {}, claude_code_version: "2.1.302" } } }) + "\\n");
  }
}
`;

/** What one leg's process answered. */
interface Answer {
  /** `beginAccountLogin`'s refusal. */
  beginError?: string;
  /** `completeAccountLogin`'s refusal, given the page's code. */
  completeError?: string;
  /** Who `completeAccountLogin` signed in as. */
  email?: string | null;
  /** `completeAccountLogin`'s answer, given the page's code. */
  state?: string;
  /** `beginAccountLogin`'s link. */
  url?: string;
}

const RESULT = "PROBE-SIGNIN-RESULT ";

/** One leg, in its own process: begins the sign-in and, given a link, finishes it with the page's code. */
const runLeg = async (): Promise<void> => {
  const { beginAccountLogin, completeAccountLogin, endSignIns } =
    await import("../../../packages/agent/src/login");
  const kind = process.env.PROBE_SIGNIN_KIND as Leg["kind"];
  const account = crypto.randomUUID();
  const answer: Answer = {};
  try {
    answer.url = (await beginAccountLogin(account, kind)).url;
  } catch (error) {
    answer.beginError = error instanceof Error ? error.message : String(error);
  }
  if (answer.url) {
    try {
      const result = await completeAccountLogin(CODE, account, null);
      answer.state = result.state;
      answer.email = result.probe?.identity?.email ?? null;
    } catch (error) {
      answer.completeError =
        error instanceof Error ? error.message : String(error);
    }
  }
  endSignIns();
  console.log(`${RESULT}${JSON.stringify(answer)}`);
  process.exit(0);
};

if (import.meta.main) {
  await runLeg();
}

const spec: Spec = {
  name: "claude-signin",
  async run(kit) {
    const { check } = kit;
    const root = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "claude-signin-")
    );
    try {
      const bin = join(root, "bin");
      await mkdir(bin);
      await writeFile(join(bin, "claude"), STAND_IN);
      await chmod(join(bin, "claude"), 0o755);
      for (const [at, leg] of LEGS.entries()) {
        const home = join(root, `home-${at}`);
        // biome-ignore lint/performance/noAwaitInLoops: one leg at a time, each its own HOME
        await mkdir(home);
        const screen = join(home, "screen.json");
        await writeFile(screen, JSON.stringify(leg.screen));
        const child = Bun.spawn(["bun", import.meta.path], {
          env: {
            ...process.env,
            HOME: home,
            PATH: `${bin}:${process.env.PATH}`,
            XDG_CONFIG_HOME: join(home, ".config"),
            XDG_DATA_HOME: join(home, ".local", "share"),
            PROBE_SIGNIN_SCREEN: screen,
            PROBE_SIGNIN_KIND: leg.kind,
          },
          stdout: "pipe",
          stderr: "pipe",
        });
        const started = performance.now();
        const [out, err] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        const took = Math.round((performance.now() - started) / 1000);
        const line = out
          .split("\n")
          .find((one) => one.startsWith(RESULT))
          ?.slice(RESULT.length);
        if (!line) {
          check(`${leg.name}: the leg answered`, false, `${out}\n${err}`);
          continue;
        }
        const answer = JSON.parse(line) as Answer;
        kit.note(`${leg.name} (${took} s): ${JSON.stringify(answer)}`);
        if ("url" in leg.expect) {
          check(
            `${leg.name}: hands out exactly the authorize link`,
            answer.url === leg.expect.url,
            `handed out ${answer.url ?? `nothing (${answer.beginError})`}`
          );
          check(
            `${leg.name}: signed in, as auth status says`,
            answer.state === "signed-in" && answer.email === EMAIL,
            `state ${answer.state}, email ${answer.email}, ${answer.completeError ?? ""}`
          );
          continue;
        }
        const stopped = leg.expect.signedOut
          ? answer.completeError
          : answer.beginError;
        check(
          `${leg.name}: stops${leg.expect.signedOut ? " at the code" : " with no link"}, showing the screen`,
          (leg.expect.signedOut || answer.url === undefined) &&
            stopped?.includes(leg.expect.stops) === true,
          `url ${answer.url}, said ${JSON.stringify(stopped)}`
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
};

export default spec;
