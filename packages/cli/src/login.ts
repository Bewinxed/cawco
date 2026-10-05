import { readConfig, writeConfig } from "@cawco/agent";
import { ask, closeAsking } from "./ask";

/**
 * `claude setup-token` is a full-screen TUI, not a line-oriented command: with
 * its stdio piped it prints nothing at all and waits forever, and under a pty it
 * draws a spinner, an OSC-8 hyperlink and a "Paste code here if prompted"
 * prompt. So it is handed the real terminal and driven by the user — which also
 * means the token it prints goes to that terminal and not to us, and has to be
 * pasted back. Anything that cannot sit at a terminal uses `--token` instead.
 */
const SETUP_TOKEN = ["claude", "setup-token"];

/** What the minted token looks like, so a paste of the wrong thing is caught here. */
const TOKEN_PREFIX = "sk-ant-oat";

export class LoginError extends Error {}

/** Runs the interactive flow, then keeps what it printed. */
export const login = async (): Promise<void> => {
  if (!Bun.which("claude")) {
    throw new LoginError(
      "the `claude` command is not on this PATH, and signing in needs it.\n" +
        "Install Claude Code first: https://claude.com/claude-code"
    );
  }

  const flow = Bun.spawn(SETUP_TOKEN, {
    stdio: ["inherit", "inherit", "inherit"],
  });
  if ((await flow.exited) !== 0) {
    throw new LoginError(
      "`claude setup-token` did not finish; nothing was saved."
    );
  }

  const pasted = await ask("\nPaste the token it printed: ");
  closeAsking();
  if (!pasted?.trim()) {
    throw new LoginError("nothing pasted; nothing was saved.");
  }
  await saveToken(pasted);
};

export const saveToken = async (token: string): Promise<void> => {
  const trimmed = token.trim();
  if (!trimmed.startsWith(TOKEN_PREFIX)) {
    throw new LoginError(
      `that does not look like a Claude Code token (expected ${TOKEN_PREFIX}…).`
    );
  }
  await writeConfig({ claudeToken: trimmed });
};

export const clearToken = async (): Promise<boolean> => {
  const config = await readConfig();
  if (!config?.claudeToken) {
    return false;
  }
  await writeConfig({ claudeToken: undefined });
  return true;
};
