/**
 * Sign in to GitHub (hub connections.ts, Configure › Connections): the three
 * ways in that ask nothing of a GitHub App's settings page, on a scratch
 * fleet's real hub, agent and built dashboard, against a stand-in of GitHub's
 * API and site (tracker-stubs.ts `githubStub`) and a fake `gh` first on the
 * machine's PATH. No live token: the stand-ins hand out their own.
 *
 * gh on a machine (G):
 *  G1 the machine's gh, signed in to Bewinxed with gist, read:org, repo and
 *     workflow, is listed by the hub with its machine and scopes.
 *  G2 Connections › Sign in to GitHub opens on gh, the account listed with its
 *     scopes; one press makes `github-bewinxed`: auth gh, its machine named,
 *     signed in, GitHub's MCP side sent the gh token; its row says it acts as
 *     Bewinxed and follows gh.
 *  G3 gh signed in again on the machine (a new token): once the last read is
 *     a minute old, the next use carries the new token.
 * A code (D):
 *  D1 a code sign-in through CawCo's OAuth app: GitHub's device code asked
 *     for CawCo's client ID, the user code on the row, polls answered
 *     `authorization_pending` twice, then the token kept and the connection
 *     signed in, its MCP side sent it.
 *  D2 in the form: Sign in with a code shows the code under the row with
 *     Open github.com/login/device; the token is kept once GitHub hands it.
 * A GitHub App from a manifest (A):
 *  A1 the hub's page posts the manifest to GitHub's form (an organization's
 *     when named) with issues, pull requests, discussions and metadata read,
 *     private, no webhook, and redirect and setup URLs on the hub; GitHub's
 *     redirect is exchanged for the app, the installation page follows, the
 *     setup redirect's installation is asked of GitHub with the app's JWT
 *     and kept: the app mints its token and the connection is signed in.
 *  A2 in the form: GitHub App, a press, a tab runs the whole flow through to
 *     "Installed", and the row names the installed app.
 *  A3 no App ID, Installation ID or private key field remains, and the hub
 *     refuses a GitHub App's old registration body in words.
 * Polling (P): a project's GitHub poller takes each of the three.
 * The page (U): Chromium and WebKit at 1440 and 390, the gh list inside the
 *  form with nothing spilling sideways; no console error on any page.
 *
 *   bun scripts/probe-kit/run.ts github-connect
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person makes them.
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the scenario runs in order, one leg after the last.
import { generateKeyPairSync } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  CONNECTION_SERVICES,
  connectionsWords as words,
} from "../../../packages/core/src/words/connections";
import { until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";
import { githubStub } from "../tracker-stubs";

const OWNER = "probe-owner";
const REPO = "probe-app";
const APP_ID = "424242";
const INSTALLATION = "7777";
const SLUG = "cawco-probe";
const CLIENT_ID = "Ov23liProbeClient";
const GH_LOGIN = "Bewinxed";
const GH_SCOPES = ["gist", "read:org", "repo", "workflow"];
const FIRST_TOKEN = `gho_ghfirst${crypto.randomUUID().replaceAll("-", "")}`;
const SECOND_TOKEN = `gho_ghsecond${crypto.randomUUID().replaceAll("-", "")}`;
/** A gh read stands this long before the next use reads its machine again (connections.ts `GH_FRESH_MS`), and a little. */
const GH_FRESH_WAIT_MS = 62_000;
/** Sign in to GitHub's ways, by how each signs in, as the form labels them. */
const wayOf = (auth: string): string =>
  CONNECTION_SERVICES.find((one) => one.service === "github")?.ways.find(
    (way) => way.auth === auth
  )?.label ?? auth;
const GH_WAY = wayOf("gh");
const CODE_WAY = wayOf("device");
const APP_WAY = wayOf("app");
/** The hub's page once the app is installed: the flow's last hop. */
const INSTALLED_PAGE = /\/api\/github-sign-in\/app\/installed/;
const FORM_ACTION = /<form id="manifest" method="post" action="([^"]+)">/;
const FORM_MANIFEST = /name="manifest" value="([^"]+)"/;

/**
 * The probe's gh: `auth status --json hosts` lists one account, signed in
 * with GitHub's scopes as gh prints them; `auth token --hostname github.com
 * --user Bewinxed` answers whatever token the file beside it holds, so the
 * probe signs gh in again by writing it. Anything else, nothing.
 */
const fakeGh = (tokenFile: string) => `#!/bin/sh
if [ "$1 $2" = "auth status" ]; then
  printf '%s' '{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"${GH_LOGIN}","tokenSource":"keyring","scopes":"${GH_SCOPES.join(", ")}","gitProtocol":"https"}]}}'
  exit 0
fi
if [ "$1 $2" = "auth token" ] && [ "$4" = github.com ] && [ "$6" = ${GH_LOGIN} ]; then
  cat ${JSON.stringify(tokenFile)}; exit 0
fi
exit 1
`;

interface Connection {
  app?: {
    appId: string;
    installationId: string;
    service: string;
    slug?: string;
  };
  auth: string;
  device?: { expiresAt: number; userCode: string; verificationUri: string };
  gh?: { host: string; login: string; machine: string; machineId: string };
  hasSecret: boolean;
  name: string;
  reason?: string;
  signIn?: { expiresAt: number; url: string };
  state: string;
}

interface GhSignIns {
  signIns: {
    connection?: string;
    host: string;
    login: string;
    machine: string;
    machineId: string;
    scopes: string[];
  }[];
  unread: string[];
}

const run = async (kit: Kit) => {
  const { check } = kit;
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  const github = githubStub({
    owner: OWNER,
    repo: REPO,
    app: {
      appId: APP_ID,
      installationId: INSTALLATION,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      slug: SLUG,
    },
    device: { clientId: CLIENT_ID, login: "probe-coder", pending: 2 },
    project: { title: "Probe roadmap", status: ["Ready", "Done"] },
    tokens: {
      [FIRST_TOKEN]: { issuesWrite: true, login: GH_LOGIN },
      [SECOND_TOKEN]: { issuesWrite: true, login: GH_LOGIN },
    },
  });
  try {
    await legs(kit, github);
  } finally {
    github.stop();
  }
  check("runs every leg", true);
};

const legs = async (kit: Kit, github: ReturnType<typeof githubStub>) => {
  const { check } = kit;
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.standIns.githubApi = github.url;
  fleet.standIns.githubWeb = github.url;
  fleet.standIns.githubMcp = `${github.url}/mcp`;
  fleet.standIns.githubClientId = CLIENT_ID;
  const fakeBin = join(fleet.sandbox, "fake-bin");
  await mkdir(fakeBin, { recursive: true });
  const tokenFile = join(fakeBin, "gh-token");
  await writeFile(tokenFile, `${FIRST_TOKEN}\n`);
  await writeFile(join(fakeBin, "gh"), fakeGh(tokenFile));
  await chmod(join(fakeBin, "gh"), 0o755);
  fleet.env.PATH = `${fakeBin}:${fleet.env.PATH}`;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  const machineId = fleet.env.CAWCO_MACHINE_ID as string;

  /** A hub request in any method; its status and body, parsed when it is JSON. */
  const hub = async <T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ body: T; status: number }> => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // A refusal is a bare sentence.
    }
    return { status: response.status, body: parsed as T };
  };
  const connectionNamed = async (name: string) =>
    (
      await hub<{ connections: Connection[] }>("GET", "/api/connections")
    ).body.connections.find((each) => each.name === name);
  const bearers = () => github.mcpBearers.join(" ");

  // ── G1: the machine's gh, listed ─────────────────────────────────────
  const listed = await hub<GhSignIns>("GET", "/api/github-sign-in/gh");
  const mine = listed.body.signIns.find((one) => one.login === GH_LOGIN);
  check(
    "G1: the machine's gh account is listed with its machine and scopes",
    listed.status === 200 &&
      mine?.machineId === machineId &&
      mine.host === "github.com" &&
      mine.scopes.join() === GH_SCOPES.join() &&
      mine.connection === undefined,
    JSON.stringify(listed.body)
  );

  // ── The dashboard ────────────────────────────────────────────────────
  const base = await fleet.dashboard();
  const thrown: string[] = [];
  const watch = (page: Page) => {
    page.on("pageerror", (error) => thrown.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        thrown.push(message.text());
      }
    });
  };
  const desk = await kit.page("desk");
  desk.setDefaultTimeout(60_000);
  watch(desk);
  await open(desk, `${base}/config/connections`, '[data-slot="cards"]');
  await desk
    .getByRole("button", { name: words.signInService("GitHub") })
    .click();
  const form = desk.locator(
    `form[aria-label="${words.signInService("GitHub")}"]`
  );
  await form.waitFor();
  const listItem = form.locator(
    `[data-slot="gh-account"][aria-label="${words.ghAccountOn(GH_LOGIN, mine?.machine ?? "")}"]`
  );
  await listItem.waitFor();
  const scopesShown = await listItem
    .locator('[data-slot="gh-scopes"]')
    .innerText();
  const wayChosen = await form
    .locator('[data-slot="toggle-group-item"][data-state="on"]')
    .innerText();

  // ── A3: no manual App fields, before anything is made ────────────────
  await form
    .locator('[data-slot="toggle-group-item"]', { hasText: APP_WAY })
    .click();
  await settle(desk, 200);
  const appFormText = await form.innerText();
  const manualFields = await form
    .locator(
      "#connection-app-id, #connection-installation, #connection-private-key"
    )
    .count();
  const orgField = await form.locator("#connection-organization").count();
  await form
    .locator('[data-slot="toggle-group-item"]', { hasText: GH_WAY })
    .click();
  await listItem.waitFor();

  // ── G2: one press makes the connection ───────────────────────────────
  await listItem.getByRole("button", { name: words.ghConnect }).click();
  const made = await until(
    "G2: github-bewinxed signed in",
    () => connectionNamed("github-bewinxed"),
    (one) => one?.state === "signed-in",
    30_000
  ).catch(() => connectionNamed("github-bewinxed"));
  const rowNote = await desk
    .locator('[data-row-name] [data-tone="done"]')
    .first()
    .innerText()
    .catch(() => "");
  check(
    "G2: Sign in to GitHub opens on gh with the account's scopes; one press makes a gh connection that acts as Bewinxed, its MCP side sent gh's token",
    wayChosen.trim() === GH_WAY &&
      GH_SCOPES.every((scope) => scopesShown.includes(scope)) &&
      made?.auth === "gh" &&
      made.gh?.machineId === machineId &&
      made.gh.login === GH_LOGIN &&
      made.state === "signed-in" &&
      made.hasSecret &&
      bearers().includes(`Bearer ${FIRST_TOKEN}`) &&
      rowNote.includes(words.ghActsAs(GH_LOGIN, made.gh.machine)),
    JSON.stringify({ wayChosen, scopesShown, made, rowNote })
  );

  // ── G3: it follows gh ────────────────────────────────────────────────
  await writeFile(tokenFile, `${SECOND_TOKEN}\n`);
  await Bun.sleep(GH_FRESH_WAIT_MS);
  const tools = await hub<{ tools: { name: string }[] }>(
    "GET",
    "/api/connections/github-bewinxed/tools"
  );
  check(
    "G3: gh signed in again on the machine: the next use after a minute carries the new token",
    tools.status === 200 && bearers().includes(`Bearer ${SECOND_TOKEN}`),
    JSON.stringify({ status: tools.status, last: github.mcpBearers.slice(-2) })
  );

  // ── D1: a code, through the hub ──────────────────────────────────────
  await hub("POST", "/api/connections", {
    name: "github-code",
    service: "github",
    account: "code",
    transport: "http",
    url: `${github.url}/mcp`,
    auth: "device",
  });
  const started = await hub<{ authorizationUrl: string }>(
    "POST",
    "/api/connections/github-code/sign-in",
    {}
  );
  const pending = await connectionNamed("github-code");
  const codeSigned = await until(
    "D1: github-code signed in",
    () => connectionNamed("github-code"),
    (one) => one?.state === "signed-in",
    30_000
  ).catch(() => connectionNamed("github-code"));
  check(
    "D1: a code sign-in shows GitHub's user code, polls through authorization_pending, keeps the token and signs in",
    started.body.authorizationUrl === `${github.url}/login/device` &&
      pending?.device?.userCode === github.device.userCode &&
      codeSigned?.state === "signed-in" &&
      codeSigned.device === undefined &&
      github.device.polls >= 3 &&
      bearers().includes(`Bearer ${github.device.token}`),
    JSON.stringify({
      started: started.body,
      pending,
      codeSigned,
      polls: github.device.polls,
    })
  );

  // ── A1: a GitHub App from a manifest, through the hub ────────────────
  await hub("POST", "/api/connections", {
    name: "github-app",
    service: "github",
    account: "probe app",
    transport: "http",
    url: `${github.url}/mcp`,
    auth: "app",
  });
  const appStart = await hub<{ authorizationUrl: string }>(
    "POST",
    "/api/connections/github-app/sign-in",
    { origin: fleet.base, organization: "probe-org" }
  );
  const manifestPage = await (
    await fetch(appStart.body.authorizationUrl)
  ).text();
  const action = (FORM_ACTION.exec(manifestPage)?.[1] ?? "").replaceAll(
    "&amp;",
    "&"
  );
  const manifestText = (FORM_MANIFEST.exec(manifestPage)?.[1] ?? "{}")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
  const manifest = JSON.parse(manifestText) as {
    default_permissions?: Record<string, string>;
    hook_attributes?: { active?: boolean };
    public?: boolean;
    redirect_url?: string;
    setup_url?: string;
  };
  const state = new URL(appStart.body.authorizationUrl).searchParams.get(
    "state"
  );
  // The browser's three hops, by hand: the form, GitHub's redirect to the
  // hub, the installation page, and its setup redirect back.
  const posted = await fetch(action, {
    method: "POST",
    body: new URLSearchParams({ manifest: manifestText }),
    redirect: "manual",
  });
  const created = await fetch(posted.headers.get("location") ?? "", {
    redirect: "manual",
  });
  const install = created.headers.get("location") ?? "";
  const installPage = await fetch(install, { redirect: "manual" });
  const installed = await fetch(installPage.headers.get("location") ?? "");
  const installedText = await installed.text();
  const appRow = await connectionNamed("github-app");
  const mints = github.calls.filter(
    (one) =>
      one.path === `/app/installations/${INSTALLATION}/access_tokens` &&
      one.status === 201
  ).length;
  check(
    "A1: the manifest goes to the organization's form with issues, pull requests, discussions and metadata read, private, no webhook, back to the hub; the code is exchanged, the installation verified with the app's JWT, and the app signs in with its minted token",
    action.startsWith(
      `${github.url}/organizations/probe-org/settings/apps/new?state=${state}`
    ) &&
      JSON.stringify(manifest.default_permissions) ===
        JSON.stringify({
          issues: "read",
          pull_requests: "read",
          discussions: "read",
          metadata: "read",
        }) &&
      manifest.public === false &&
      manifest.hook_attributes?.active === false &&
      manifest.redirect_url ===
        `${fleet.base}/api/github-sign-in/app/created` &&
      manifest.setup_url === `${fleet.base}/api/github-sign-in/app/installed` &&
      posted.status === 302 &&
      created.status === 302 &&
      install.startsWith(
        `${github.url}/apps/${SLUG}/installations/new?state=`
      ) &&
      installed.status === 200 &&
      installedText.includes(`Installed ${SLUG}`) &&
      appRow?.app?.appId === APP_ID &&
      appRow.app.installationId === INSTALLATION &&
      appRow.app.slug === SLUG &&
      appRow.state === "signed-in" &&
      mints >= 1 &&
      github.calls.some(
        (one) =>
          one.path === `/app/installations/${INSTALLATION}` &&
          one.status === 200
      ) &&
      bearers().includes("Bearer ghs_probe") &&
      !Object.keys(appRow.app ?? {}).includes("privateKey"),
    JSON.stringify({
      action,
      manifest,
      statuses: [posted.status, created.status, installed.status],
      installedText,
      appRow,
      mints,
    })
  );

  // ── A3: the old body is refused in words ─────────────────────────────
  const oldBody = await hub<string>("PUT", "/api/connections/github-app/app", {
    appId: APP_ID,
    installationId: INSTALLATION,
    privateKey: "x",
  });
  check(
    "A3: no App ID, Installation ID or private key field in the GitHub App way; the organization is asked instead; the old registration body is refused in words",
    manualFields === 0 &&
      orgField === 1 &&
      !appFormText.includes("Installation ID") &&
      !appFormText.includes("Private key") &&
      oldBody.status === 400 &&
      oldBody.body === words.githubAppRegisters("github-app"),
    JSON.stringify({ manualFields, orgField, oldBody })
  );

  // ── P: a project's GitHub poller takes each of the three ────────────
  const projectId = (
    await fleet.api<{ id: string }>("/api/projects", {
      name: "Cawco-Dev probe",
    })
  ).id;
  const polled: Record<string, number> = {};
  for (const name of ["github-bewinxed", "github-code", "github-app"]) {
    polled[name] = (
      await hub("PUT", `/api/projects/${projectId}/ingress/github`, {
        connection: name,
      })
    ).status;
  }
  check(
    "P: a project's GitHub poller takes gh, a code and a GitHub App alike",
    Object.values(polled).every((code) => code === 200),
    JSON.stringify(polled)
  );

  // ── D2: a code, in the form ──────────────────────────────────────────
  await open(desk, `${base}/config/connections`, '[aria-label="Connections"]');
  await desk.getByRole("button", { name: words.signInTo }).click();
  await desk.getByRole("menuitem", { name: "GitHub" }).click();
  await form.waitFor();
  await form
    .locator('[data-slot="toggle-group-item"]', {
      hasText: CODE_WAY,
    })
    .click();
  await desk.fill("#connection-account", "ui code");
  await form.getByRole("button", { name: words.signIn }).click();
  const codeLine = desk.locator('[data-slot="device-code"]');
  await codeLine.waitFor();
  const codeText = await codeLine.innerText();
  const openButton = await desk
    .getByRole("button", { name: `${words.deviceOpen} GitHub ui code` })
    .count();
  const uiCode = await until(
    "D2: the form's code sign-in keeps its token",
    () => connectionNamed("github-ui-code"),
    (one) => one?.hasSecret === true && one.device === undefined,
    30_000
  ).catch(() => connectionNamed("github-ui-code"));
  check(
    "D2: Sign in with a code shows the code under the row with Open github.com/login/device; the token is kept once GitHub hands it over",
    codeText.includes(github.device.userCode) &&
      codeText.includes(words.deviceEnter) &&
      openButton === 1 &&
      uiCode?.auth === "device" &&
      uiCode.hasSecret,
    JSON.stringify({ codeText, openButton, uiCode })
  );

  // ── A2: a GitHub App, in the form ────────────────────────────────────
  await open(desk, `${base}/config/connections`, '[aria-label="Connections"]');
  await desk.getByRole("button", { name: words.signInTo }).click();
  await desk.getByRole("menuitem", { name: "GitHub" }).click();
  await form.waitFor();
  await form
    .locator('[data-slot="toggle-group-item"]', { hasText: APP_WAY })
    .click();
  await desk.fill("#connection-account", "ui app");
  const popup = desk.waitForEvent("popup");
  await form.getByRole("button", { name: words.signIn }).click();
  const tab = await popup;
  watch(tab);
  await tab.waitForURL(INSTALLED_PAGE, {
    timeout: 60_000,
  });
  const tabText = await tab.innerText("body");
  const uiApp = await until(
    "A2: the form's GitHub App installed",
    () => connectionNamed("github-ui-app"),
    (one) => one?.app?.installationId === INSTALLATION,
    30_000
  ).catch(() => connectionNamed("github-ui-app"));
  await tab.close();
  check(
    "A2: GitHub App in the form: one press, a tab runs the manifest, the creation and the installation through to Installed; the row names the installed app",
    tabText.includes(`Installed ${SLUG}`) &&
      uiApp?.auth === "app" &&
      uiApp.app?.slug === SLUG &&
      uiApp.app.installationId === INSTALLATION &&
      github.manifests.at(-1)?.org === null,
    JSON.stringify({ tabText, uiApp, org: github.manifests.at(-1)?.org })
  );

  // ── U: Chromium and WebKit, 1440 and 390 ─────────────────────────────
  for (const engine of ["chromium", "webkit"] as const) {
    for (const view of ["desk", "phone"] as const) {
      const at = `${engine} ${view}`;
      const one = await kit.page(view, { engine });
      one.setDefaultTimeout(60_000);
      watch(one);
      await open(
        one,
        `${base}/config/connections`,
        '[aria-label="Connections"]'
      );
      await one.getByRole("button", { name: words.signInTo }).click();
      await one.getByRole("menuitem", { name: "GitHub" }).click();
      const shown = one.locator(
        `form[aria-label="${words.signInService("GitHub")}"]`
      );
      await shown.locator('[data-slot="gh-account"]').first().waitFor();
      await settle(one, 300);
      const read = await one.evaluate(() => {
        const formBox = document
          .querySelector('form[data-slot="add"]')
          ?.getBoundingClientRect();
        const item = document
          .querySelector('[data-slot="gh-account"]')
          ?.getBoundingClientRect();
        const connected = document.querySelector(
          '[data-slot="gh-account"] [data-gh-connected]'
        );
        return {
          sideways:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          inside: Boolean(
            formBox &&
            item &&
            item.left >= formBox.left - 0.5 &&
            item.right <= formBox.right + 0.5
          ),
          connected: connected?.textContent?.trim() ?? null,
        };
      });
      check(
        `U ${at}: the gh account sits inside the form, says Connected, and nothing spills sideways`,
        read.sideways <= 0 &&
          read.inside &&
          read.connected === words.ghConnected,
        JSON.stringify(read)
      );
      await one.close();
    }
  }
  check(
    "U: no page threw or logged an error",
    thrown.length === 0,
    thrown.join(" | ") || "none"
  );
};

export default { name: "github-connect", run } satisfies Spec;
