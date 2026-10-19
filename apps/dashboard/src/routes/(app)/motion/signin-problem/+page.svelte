<script lang="ts">
  /**
   * The sign-in popover's content with a stopped sign-in, no hub: the
   * daemon's sentence, then the CLI's last screen lines, as
   * packages/agent/src/login.ts words it, one of them 240 characters. It
   * stands on the popover's own surface (ns-theme's `.ns-pop`) at the
   * sign-in popover's width token, `--c-signin-pop-w`, with AccountMachines'
   * panel padding inside, so it is as wide as the real popover at every
   * screen width.
   */
  import SigninPanel from "#lib/cawco/accounts/SigninPanel.svelte";
  import { SigninFlow } from "#lib/cawco/accounts/signin.svelte.js";

  const LONG =
    `${"Error: the OAuth exchange with console.anthropic.com returned 400 invalid_grant for the pasted authorization code; ".repeat(3)}`.slice(
      0,
      240
    );
  const SCREEN = [
    "Welcome to Claude Code v2.4.1",
    "Paste code here if prompted >",
    LONG,
    "Login failed. Try again.",
    "Press Enter to retry or Esc to cancel",
    "https://console.anthropic.com/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code",
  ];

  const flow = new SigninFlow(() => Promise.resolve("bench"), "bench");
  flow.url = "https://claude.ai/oauth/authorize";
  flow.phase = "ready";
  flow.problem = `Claude Code's sign-in on this machine ended without signing in (exit 1). Open the sign-in link again for a new code. Its screen said:\n${SCREEN.join("\n")}`;
</script>

<div
  class="ns-theme ns-pop mx-auto my-(--space-5)"
  data-bench
  style="--ns-pop-width: var(--c-signin-pop-w)"
>
  <div class="p-(--space-2)">
    <SigninPanel expected={null} {flow} machine="bench" online />
  </div>
</div>
