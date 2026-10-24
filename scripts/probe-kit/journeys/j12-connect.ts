/**
 * J12, an agent asks the person to sign in to a service it needs (a connect
 * ask, hub connect-asks.ts), and the person signs in from that ask. On a
 * scratch fleet, against a local OAuth provider (mcp-oauth-mock.ts: a
 * consent page, a token endpoint naming the person by an ID token, and an
 * MCP server behind it), on Claude Code, OpenCode and pi in turn, each
 * with a fleet MCP server of its own on that provider:
 *
 *  1. The agent calls `connect_ask`; the ask stands on the session's message
 *     box with its reason, the provider's address and the access as a
 *     choice, read-only pressed.
 *  2. Not now, with the person's words on Other: the agent's call returns
 *     them, and the transcript's record line says not connected with them.
 *  3. Asked again: the provider's tab closed early, the hub refusing to
 *     start (the server switched off), and, on one harness a leg (each in
 *     turn), the session's machine offline (its agent frozen until the hub
 *     loses it) each show their fault on the ask, and each recovers.
 *  4. Connect runs the provider's sign-in in a tab of its own (Allow on its
 *     consent page): the card holds "Connected as …", folds, and the
 *     agent's call returns "Connected … as …, read-only"; the hub asked the
 *     provider for the read scope alone; the record line stands.
 *  5. The agent calls the service's tool through the connection.
 *  6. The provider ends the kept sign-in: the agent's next call meets it, the
 *     hub's renewal is refused, and the record line turns to sign-in
 *     expired; the agent asks again, the ask is a reconnect with the access
 *     held ("Read-only, as before."), and the reconnect asks for the read
 *     scope again.
 *
 * Run it narrowed as the connect ask's proof is: Chromium and WebKit, the
 * phone and the desk.
 *
 *   bun scripts/probe-kit/run.ts journeys j12-connect --engine chromium,webkit --size phone,desk
 */
import type { Locator, Page } from "playwright-core";
import { connectAnsweredWords } from "../../../packages/core/src/connect-ask";
import { askWords } from "../../../packages/core/src/words/asks";
import { configureWords } from "../../../packages/core/src/words/configure";
import { mcpWords } from "../../../packages/core/src/words/mcp";
import { shellWords } from "../../../packages/core/src/words/shell";
import type { Harness, Reply, Seen } from "../../scratch-fleet";
import type { KitFleet } from "../kit";
import { type McpOauthMock, mcpOauthMock } from "../mcp-oauth-mock";
import { routeOAuthHop } from "../oauth-hop";
import { say } from "./mock";
import {
  eventually,
  expect,
  gone,
  type Journey,
  type Leg,
  shows,
  unmet,
} from "./suite";

const HARNESSES: Harness[] = ["claude", "opencode", "pi"];
const IDENTITY = "probe@example.test";
const REASON = "Import the release notes from Tray Docs.";
const WORDS = "use the PDF I attached";
const DOC_TOOL = {
  name: "read_doc",
  description: "Read a document.",
  inputSchema: { type: "object", properties: {} },
};
/** What the provider's MCP server answers every call with (mcp-oauth-mock.ts). */
const DOC_SAYS = "Posted.";
/** The hub renews no access token issued this recently (fleet-mcp.ts `FRESH_TOKEN_MS`). */
const FRESH_TOKEN_MS = 10_000;
/** Long enough for the hub to lose a frozen machine: its socket's idle timeout, and some. */
const LOST_MS = 240_000;

/** The provider, started with the first data set, for every leg. */
let provider: McpOauthMock | null = null;
/** Each leg's number: its servers' names are its own. */
let legs = 0;

/**
 * One message to the mock: `PROBE-CONNECT <key> ask|use <server>`. `ask`
 * calls `connect_ask` for the server; `use`, the server's own tool. `key`
 * is the message's own, so each is called once.
 */
const TAG = /PROBE-CONNECT (\S+) (ask|use) (\S+)/g;
/** OpenCode's Code Mode tool, which runs MCP tools from a script. */
const CODE_MODE = "execute";
/** What the agent heard: a connect ask's answer, as connect-ask.ts words it. */
const ANSWERED =
  /(\S+ not connected\.(?: They said: [^"\\\n]*| They said not now\.)|Connected \S+(?: as \S+)?(?:, read-only|, read and write)?\.)/;

const steps = new Map<string, { called?: boolean; searched?: boolean }>();

/** A word as a pattern's own text. */
const literal = (words: string) => words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The ask's card, by its name: first asked, or asked again. */
const ASK_NAME = new RegExp(
  `^(${literal(askWords.connectAskFrom(""))}|${literal(askWords.reconnectAskFrom(""))})`
);
const RECONNECT_NAME = new RegExp(`^${literal(askWords.reconnectAskFrom(""))}`);
const READ_ONLY = new RegExp(literal(askWords.readOnly));
const READ_WRITE = new RegExp(literal(askWords.readWrite));

/** A message part's words: a string, or the text of its blocks. */
const wordsOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  return Array.isArray(content)
    ? (content as { text?: string; content?: unknown }[])
        .map((part) => part.text ?? wordsOf(part.content))
        .join("\n")
    : "";
};

/**
 * The words of the request's last tool result: an Anthropic message's last
 * `tool_result` block, or a chat completion's last `tool` message.
 */
const lastToolResult = (body: string): string => {
  const messages =
    (JSON.parse(body) as { messages?: { content?: unknown; role?: string }[] })
      .messages ?? [];
  for (const message of [...messages].reverse()) {
    if (message.role === "tool") {
      return wordsOf(message.content);
    }
    const block = Array.isArray(message.content)
      ? (message.content as { type?: string; content?: unknown }[]).findLast(
          (part) => part.type === "tool_result"
        )
      : undefined;
    if (block) {
      return wordsOf(block.content);
    }
  }
  return "";
};

const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The call as the harness offers `tool` of `server`: by its name, in Code Mode, or behind a search. */
function offered(
  seen: Seen,
  step: { called?: boolean; searched?: boolean },
  server: string,
  tool: string,
  input: object
): Reply {
  const named = [`mcp__${server}__${tool}`, `${server}_${tool}`, tool].find(
    (name) => seen.toolNames.includes(name)
  );
  if (named) {
    step.called = true;
    return call(named, input);
  }
  if (seen.toolNames.includes(CODE_MODE)) {
    step.called = true;
    return call(CODE_MODE, {
      code: `return await tools[${JSON.stringify(server)}].${tool}(${JSON.stringify(input)});`,
    });
  }
  if (!step.searched && seen.toolNames.includes("ToolSearch")) {
    step.searched = true;
    return call("ToolSearch", {
      query: `select:mcp__${server}__${tool}`,
      max_results: 1,
    });
  }
  if (!step.searched && seen.toolNames.includes("tool_search")) {
    step.searched = true;
    return call("tool_search", { query: `${server} ${tool}` });
  }
  step.called = true;
  return say(`No ${tool} is offered.`);
}

const respond = (seen: Seen): Reply => {
  if (!seen.tools) {
    return say("Probe title");
  }
  const found = [...seen.all.matchAll(TAG)].at(-1);
  if (!found) {
    return say("Ready.");
  }
  const [, key = "", verb, server = ""] = found;
  const step = steps.get(key) ?? {};
  steps.set(key, step);
  if (step.called) {
    if (!seen.afterTool) {
      return say("Done.");
    }
    const result = lastToolResult(seen.body);
    if (verb === "use") {
      return say(
        result.includes(DOC_SAYS)
          ? `The doc says: ${DOC_SAYS}`
          : `The doc call failed: ${result.slice(0, 200)}`
      );
    }
    return say(`Heard: ${ANSWERED.exec(result)?.[1] ?? result.slice(0, 200)}`);
  }
  return verb === "ask"
    ? offered(seen, step, "cawco", "connect_ask", { server, reason: REASON })
    : offered(seen, step, server, "read_doc", {});
};

/** The session's message box, grown into the connect ask. */
const card = (page: Page): Locator =>
  page.getByRole("region", { name: ASK_NAME }).filter({ visible: true });

/** The machine's word on `server` for `harness`: applied, needs-auth, … */
function appliedOn(
  fleet: KitFleet,
  harness: Harness,
  server: string
): string | undefined {
  const [row] = fleet.query<{ fleet: string | null }>(
    "SELECT fleet FROM agents"
  );
  const read = row?.fleet
    ? (JSON.parse(row.fleet) as {
        mcpByHarness?: Record<string, Record<string, { state?: string }>>;
      })
    : undefined;
  return read?.mcpByHarness?.[harness]?.[server]?.state;
}

/** The fleet's MCP server `server` on the provider, switched on or off: what the hub says of it. */
async function putServer(
  fleet: KitFleet,
  server: string,
  enabled: boolean
): Promise<{ auth?: { mode?: string; state?: string } }> {
  const put = await fetch(
    `${fleet.base}/api/fleet/mcp/${encodeURIComponent(server)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        config: { type: "http", url: provider?.url },
        enabled,
      }),
    }
  );
  if (!put.ok) {
    unmet(`the hub refused ${server}: ${put.status} ${await put.text()}`);
  }
  return (await put.json()) as { auth?: { mode?: string; state?: string } };
}

/** Every server a leg made, put away after it. */
const made: string[] = [];

/**
 * Allow on the provider's consent page, in the tab Connect opened: the tab
 * goes back through CawCo's hand-off to the dashboard's return page, which
 * finishes the sign-in on the hub and closes it. A tab that stays says
 * where it stopped and what it said.
 */
async function allow(tab: Page): Promise<void> {
  const said: string[] = [];
  tab.on("console", (line) => said.push(line.text().slice(0, 200)));
  const closed = tab.waitForEvent("close", { timeout: 30_000 }).then(
    () => true,
    () => false
  );
  await tab.getByRole("button", { name: "Allow" }).click();
  if (!(await closed)) {
    const text = await tab
      .locator("body")
      .innerText({ timeout: 5000 })
      .catch(() => "");
    unmet(
      `the provider's tab never closed: it stands at ${tab.url()} saying “${text.slice(0, 300)}” (console: ${said.join(" | ")})`
    );
  }
}

/** Connect, and the provider's tab it opens: the page that opened. */
async function pressOpening(page: Page, button: Locator): Promise<Page> {
  const opened = page.context().waitForEvent("page", { timeout: 30_000 });
  await button.click();
  const tab = await opened;
  await tab.waitForLoadState("domcontentloaded").catch(() => undefined);
  return tab;
}

/** One harness's walk through the ask, on its own session and server. */
async function walkOne(
  leg: Leg,
  harness: Harness,
  server: string,
  offline: boolean
): Promise<void> {
  const { fleet, page, base } = leg;
  const mock = provider as McpOauthMock;
  let n = 0;
  const message = (verb: "ask" | "use") => {
    n += 1;
    return `PROBE-CONNECT ${leg.id}-${server}-${n} ${verb} ${server} Carry on with the release.`;
  };
  const connectButton = () =>
    card(page).getByRole("button", { name: askWords.connect, exact: true });
  const notNow = () =>
    card(page).getByRole("button", { name: askWords.notNow, exact: true });

  let id = "";
  await leg.step(
    `${harness}: the fleet gets ${server}, which signs in with OAuth, and a session starts`,
    async () => {
      made.push(server);
      const saved = await putServer(fleet, server, true);
      expect(
        `${server} reads as an OAuth server waiting on a sign-in`,
        saved.auth?.mode === "oauth" && saved.auth.state === "needs-auth",
        saved.auth
      );
      id = await fleet.spawn(harness, leg.title(`Release notes on ${harness}`));
      await page.goto(`${base}/session/${id}`, {
        waitUntil: "domcontentloaded",
      });
    },
    () =>
      eventually(
        "the session's page is open",
        () => new URL(page.url()).pathname,
        (path) => path === `/session/${id}`
      )
  );

  // 1 and 2: the ask, then Not now with his words.
  await leg.step(
    `${harness}: the agent asks to connect ${server}`,
    () => fleet.send(id, message("ask")),
    async () => {
      await shows(card(page), "the connect ask on the message box", 120_000);
      await shows(card(page).getByText(REASON), "the agent's reason");
      const text = (await card(page).textContent()) ?? "";
      const address = new URL("/authorize", mock.url).href;
      expect(
        `the provider's address (${address}) stands whole on the ask`,
        text.includes(address),
        text.slice(0, 400)
      );
      const readOnly = card(page).getByRole("radio", {
        name: READ_ONLY,
      });
      const readWrite = card(page).getByRole("radio", {
        name: READ_WRITE,
      });
      await shows(readOnly, "Read-only, a choice of access");
      await shows(readWrite, "Read & write, a choice of access");
      expect(
        "read-only is pressed",
        (await readOnly.getAttribute("aria-checked")) === "true" &&
          (await readWrite.getAttribute("aria-checked")) === "false",
        "read & write pressed"
      );
      await shows(
        card(page).getByText(askWords.connectReach(server)),
        "what the grant reaches and for how long"
      );
    }
  );
  await leg.step(
    `${harness}: Not now, with words on Other`,
    async () => {
      await card(page).getByRole("radio", { name: "Other" }).click();
      await card(page)
        .getByRole("textbox", { name: askWords.yourAnswerTo(REASON) })
        .fill(WORDS);
      await notNow().click();
    },
    async () => {
      await gone(card(page), "the connect ask");
      const heard = `Heard: ${connectAnsweredWords({ outcome: "declined", server, words: WORDS })}`;
      await shows(
        page.getByText(heard),
        `the agent hearing “${heard}”`,
        60_000
      );
      await shows(
        page.getByText(askWords.recordNotConnected(server), { exact: true }),
        "the record line, not connected"
      );
      await shows(
        page.getByText(`· “${WORDS}”`, { exact: true }),
        "his words on the record line"
      );
    }
  );

  // 3: each fault, and its way back.
  await leg.step(
    `${harness}: the agent asks again`,
    () => fleet.send(id, message("ask")),
    () => shows(card(page), "the connect ask again", 120_000)
  );
  await leg.step(
    `${harness}: the provider's tab is closed before it finishes`,
    async () => {
      const tab = await pressOpening(page, connectButton());
      await tab.close();
    },
    async () => {
      await shows(
        card(page).getByText(askWords.connectTabClosed(server)),
        "the tab closed, said on the ask",
        15_000
      );
      await shows(
        card(page).getByRole("button", { name: configureWords.tryAgain }),
        configureWords.tryAgain
      );
      expect(
        "Connect is free again",
        await connectButton().isEnabled(),
        "disabled"
      );
    }
  );
  await leg.step(
    `${harness}: the hub refuses to start it (the server switched off)`,
    async () => {
      await putServer(fleet, server, false);
      await card(page)
        .getByRole("button", { name: configureWords.tryAgain })
        .click();
    },
    async () => {
      await shows(
        card(page).getByText(askWords.connectRefused(server)),
        "the refusal, said on the ask"
      );
      await card(page)
        .getByRole("button", { name: shellWords.showDetails })
        .click();
      await shows(
        card(page).getByText(mcpWords.enableBeforeSignIn),
        "the hub's own words under Show details"
      );
    },
    { refused: true }
  );
  if (offline) {
    await leg.step(
      `${harness}: the session's machine goes offline`,
      () => {
        fleet.freeze("agent", true);
        return Promise.resolve();
      },
      async () => {
        await shows(
          card(page).getByText(askWords.connectOffline),
          "the machine offline, said on the ask",
          LOST_MS
        );
        expect(
          "Connect and Not now wait while it is offline",
          (await connectButton().isDisabled()) && (await notNow().isDisabled()),
          "a peer is live"
        );
      },
      { hubDown: true }
    );
    await leg.step(
      `${harness}: the machine comes back`,
      () => {
        fleet.freeze("agent", false);
        return Promise.resolve();
      },
      async () => {
        await gone(
          card(page).getByText(askWords.connectOffline),
          "the offline line",
          LOST_MS
        );
        await eventually(
          "Connect live again",
          () => connectButton().isEnabled(),
          Boolean,
          60_000
        );
      },
      { hubDown: true }
    );
  }

  // 4: Connect, read-only.
  let signedInAt = 0;
  await leg.step(
    `${harness}: the server is switched on again, and Connect signs in on the provider's page`,
    async () => {
      await putServer(fleet, server, true);
      const tab = await pressOpening(page, connectButton());
      await allow(tab);
    },
    async () => {
      await shows(
        card(page).getByText(askWords.connectedAs(IDENTITY)),
        "the card's beat, connected as whom",
        30_000
      );
      signedInAt = Date.now();
      await gone(card(page), "the connect ask, folded");
      expect(
        "the hub asked the provider for the read scope alone",
        mock.asked.at(-1) === "docs.read",
        mock.asked
      );
      const heard = `Heard: Connected ${server} as ${IDENTITY}, read-only.`;
      await shows(
        page.getByText(heard),
        `the agent hearing “${heard}”`,
        60_000
      );
      await shows(
        page.getByText(askWords.recordConnectedAs(server, IDENTITY), {
          exact: true,
        }),
        "the record line, connected as whom"
      );
      await shows(
        page.getByText(`· ${askWords.recordReadOnly}`, { exact: true }),
        "the record line's access"
      );
    }
  );

  // 5: the service, through the connection.
  await leg.step(
    `${harness}: the agent calls ${server}'s tool`,
    async () => {
      await eventually(
        `${server} applied for ${harness} on the machine`,
        () => appliedOn(fleet, harness, server),
        (state) => state === "applied",
        120_000
      );
      // A session takes a server the hub signed in to within seconds of
      // its machine (hub `sendMcpChanges`): a model that looked before its
      // tools arrived asks again, as a person's agent would.
      for (let tries = 1; ; tries += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: each try after the last one's answer
        await fleet.send(id, message("use"));
        const heard = await eventually(
          "the agent's answer",
          async () => ({
            read: await page
              .getByText(`The doc says: ${DOC_SAYS}`)
              .filter({ visible: true })
              .count(),
            missing: await page
              .getByText("No read_doc is offered.")
              .filter({ visible: true })
              .count(),
          }),
          (now) => now.read > 0 || now.missing >= tries,
          120_000
        );
        if (heard.read > 0 || tries === 3) {
          return;
        }
        await Bun.sleep(5000);
      }
    },
    () =>
      shows(
        page.getByText(`The doc says: ${DOC_SAYS}`),
        "the agent reading the doc through the connection",
        120_000
      )
  );

  // 6: the kept sign-in ends; the agent asks again, its access held.
  await leg.step(
    `${harness}: the provider ends the sign-in, and the agent's next call meets it`,
    async () => {
      await Bun.sleep(Math.max(0, signedInAt + FRESH_TOKEN_MS - Date.now()));
      mock.expire();
      await fleet.send(id, message("use"));
    },
    () =>
      shows(
        page.getByText(askWords.recordExpired, { exact: false }).first(),
        "the record line, sign-in expired",
        120_000
      )
  );
  await leg.step(
    `${harness}: the agent asks to reconnect`,
    () => fleet.send(id, message("ask")),
    async () => {
      await shows(
        page.getByRole("region", { name: RECONNECT_NAME }),
        "a reconnect ask",
        120_000
      );
      await shows(
        card(page).getByText(askWords.asBefore(askWords.readOnly)),
        "the access held from before"
      );
    }
  );
  await leg.step(
    `${harness}: Reconnect`,
    async () => {
      const tab = await pressOpening(
        page,
        card(page).getByRole("button", {
          name: askWords.reconnect,
          exact: true,
        })
      );
      await allow(tab);
    },
    async () => {
      await gone(card(page), "the reconnect ask, folded", 60_000);
      expect(
        "the reconnect asked the provider for the read scope again",
        mock.asked.at(-1) === "docs.read",
        mock.asked
      );
      await eventually(
        "the agent hearing it connected again",
        () =>
          page
            .getByText(`Heard: Connected ${server} as ${IDENTITY}, read-only.`)
            .count(),
        (count) => count >= 2,
        60_000
      );
      await gone(
        page.getByText(askWords.recordExpired, { exact: false }),
        "sign-in expired, once signed in again"
      );
    }
  );
}

async function walk(leg: Leg): Promise<void> {
  legs += 1;
  await routeOAuthHop(leg.page.context());
  for (const [at, harness] of HARNESSES.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: one harness at a time, on one page
    await walkOne(
      leg,
      harness,
      `tray${harness}${legs}`,
      // The machine offline once a leg, each harness in turn.
      at === (legs - 1) % HARNESSES.length
    );
  }
}

const journey: Journey = {
  name: "j12-connect",
  flow: "a connect ask: an agent asks to sign in to a service, the person signs in from the ask",
  respond,
  seed: () => {
    provider ??= mcpOauthMock([DOC_TOOL], {
      identity: IDENTITY,
      scopes: ["docs.read", "docs.write"],
    });
    return Promise.resolve(null);
  },
  clean: async (fleet) => {
    // A leg that failed with the machine frozen leaves it running again.
    try {
      fleet.freeze("agent", false);
    } catch {
      // Not running: restore() has relaunched what the next leg needs.
    }
    for (const server of made.splice(0)) {
      // biome-ignore lint/performance/noAwaitInLoops: one removal at a time, as the MCP page sends them
      await fetch(`${fleet.base}/api/fleet/mcp/${encodeURIComponent(server)}`, {
        method: "DELETE",
      });
    }
  },
  leg: walk,
};

export default journey;
