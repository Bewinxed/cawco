<script lang="ts">
  /**
   * TOOL SIGN-IN — Configure › Command-line tools with every state of the
   * Antigravity CLI's Sign-in column, from fixtures, no hub: the whole
   * catalog's ledgers over a fleet of eight machines, in Configure's rail
   * and section frame at their widths. The two sign-in routes are answered
   * here (`fetch` for their paths only), as the hub answers them:
   *
   * - Sign in: `{ url, expiresAt }`, ten minutes ahead (`?lapse=<s>`:
   *   that many seconds, to watch a link lapse).
   * - Done: the code `4/0AVG7fiQ` signs the CLI in (the machine's cell
   *   turns Signed in, as the hub's publish does); `wrong` is the machine
   *   reading it still signed out (a 200, the link spent); anything else
   *   is agy's own refusal (a 422 in its words and screen, the link spent).
   *
   * At rest: not installed, signed out, signed in, unknown with agy's
   * words, signed out offline, and three sign-ins parked on their cells:
   * one waiting for its code, one refused, one whose link lapsed.
   */
  import {
    TOOL_CATALOG,
    TOOL_UPDATES_DEFAULT,
    toolSpec,
  } from "@cawco/core/tools";
  import { toolWords } from "@cawco/core/words/tools";
  import { z } from "zod";
  import ConfigRail from "#lib/cawco/config/ConfigRail.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import {
    ConfigStore,
    provideConfig,
  } from "#lib/cawco/config/store.svelte.js";
  import ToolMatrix from "#lib/cawco/ToolMatrix.svelte";
  import { toolSigninFlow } from "#lib/cawco/tool-signin.svelte.js";
  import {
    AGY,
    AGY_REFUSED_SCREEN,
    agyStatus,
    signinFleet,
  } from "#lib/cawco/tool-signin-fixtures.js";
  import { page } from "$app/state";

  const NAME = toolSpec(AGY)?.name ?? AGY;
  const LINK_MS = 10 * 60_000;
  const lapse = Number(page.url.searchParams.get("lapse") ?? "0");
  const linkMs = lapse > 0 ? lapse * 1000 : LINK_MS;

  let machines = $state(signinFleet());

  // The sign-ins under way as the page opens, each parked on its cell; a
  // reload that kept its own leaves those as they are.
  const waiting = toolSigninFlow("m-roost", AGY);
  if (!waiting.live && waiting.problem === null) {
    waiting.url = "https://accounts.google.com/o/oauth2/v2/auth?bench=roost";
    waiting.expiresAt = Date.now() + 7 * 60_000;
    waiting.phase = "ready";
  }
  const refused = toolSigninFlow("m-crow", AGY);
  if (!refused.live && refused.problem === null) {
    refused.problem = toolWords.signinFailed(NAME, 1, AGY_REFUSED_SCREEN);
  }
  const lapsed = toolSigninFlow("m-ledger", AGY);
  if (!lapsed.live && lapsed.problem === null) {
    lapsed.problem = toolWords.signinExpired(NAME);
  }

  const GOOD = "4/0AVG7fiQ";
  const CodeBody = z.object({ code: z.string() });
  /** The hub's two sign-in routes, for this page alone. */
  const SIGNIN =
    /\/api\/machines\/([^/]+)\/tools\/([^/]+)\/signin(\/complete)?$/u;
  const answer = (body: unknown, status = 200): Response =>
    typeof body === "string"
      ? new Response(body, { status })
      : Response.json(body, { status });
  const real = window.fetch.bind(window);
  const answered = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const match = SIGNIN.exec(new URL(url, location.href).pathname);
    if (!match) {
      return real(input, init);
    }
    const [, machineId = "", , complete] = match;
    // The machine's own pace: its CLI starts, or reads its code.
    await new Promise((done) => setTimeout(done, 700));
    if (!complete) {
      return answer({
        url: `https://accounts.google.com/o/oauth2/v2/auth?bench=${machineId}`,
        expiresAt: Date.now() + linkMs,
      });
    }
    const { code } = CodeBody.parse(JSON.parse(String(init?.body ?? "{}")));
    if (code !== GOOD && code !== "wrong") {
      return answer(toolWords.signinFailed(NAME, 1, AGY_REFUSED_SCREEN), 422);
    }
    const status = agyStatus(code === GOOD ? "signed-in" : "signed-out");
    const one = machines.find((each) => each.machineId === machineId);
    if (one?.tools) {
      one.tools[AGY] = status;
    }
    return answer(status);
  };
  window.fetch = new Proxy(window.fetch, {
    apply: (_fetch, _this, [input, init]: Parameters<typeof fetch>) =>
      answered(input, init),
  });

  const section = sectionOf("cli-tools");
  // Configure's store, never read: the rail as it stands before its counts.
  provideConfig(new ConfigStore());
</script>

<div
  class="flex min-h-0 min-w-0 flex-auto bg-surface-recess"
  data-bench="tool-signin"
>
  <div class="flex min-h-0 py-space-2 pl-space-5 max-desk:hidden">
    <ConfigRail current="cli-tools" />
  </div>
  <SectionFrame {section}>
    <ToolMatrix
      catalog={TOOL_CATALOG}
      {machines}
      policies={[]}
      releases={{}}
      updates={TOOL_UPDATES_DEFAULT}
    />
  </SectionFrame>
</div>
