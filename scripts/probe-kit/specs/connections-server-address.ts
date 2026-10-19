/**
 * Configure › Connections asks a server's address for a service the person
 * runs one of (core CONNECTION_SERVICES `serverExample`): Gitea, whose MCP
 * server is the person's own gitea-mcp, and GitLab, prefilled with its
 * hosted address and editable for a self-managed one. On a scratch fleet's
 * real hub and the built dashboard:
 *
 * - (a) the "Server address" field is in Gitea's and GitLab's sign-in form,
 *   and in no other's (GitHub, Linear, Slack);
 * - (b) GitLab's holds https://gitlab.com/api/v4/mcp as it opens;
 * - (c) an address that is no http(s) URL is refused under the field, in
 *   words, and nothing is sent to the hub;
 * - (d) at 320 px a long address fits: the form, the field and the page
 *   scroll sideways not at all;
 * - (e) Sign in sends the address typed as the connection's `url`.
 *
 *   bun scripts/probe-kit/run.ts connections-server-address
 */
import type { Request as PageRequest } from "playwright-core";
import { open, type Spec } from "../kit";

const LONG =
  "https://gitea.a-very-long-subdomain-for-a-self-hosted-forge.example.internal.company.com/mcp/servers/gitea-mcp-instance-with-a-long-name";
const FIELD = "#connection-server";
const SERVICES = ["Gitea", "GitLab", "GitHub", "Linear", "Slack"] as const;

const spec: Spec = {
  name: "connections-server-address",
  async run(kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    // A fleet with no connection shows its services as cards.
    await open(page, `${base}/config/connections`, 'ul[aria-label="Services"]');
    const pick = async (label: string) => {
      await page
        .getByRole("button", { name: `Sign in to ${label}`, exact: true })
        .click();
      await page.waitForSelector(`form[aria-label="Sign in to ${label}"]`);
    };

    // (a), (b)
    const present: Record<string, boolean> = {};
    let gitlabValue = "";
    for (const label of SERVICES) {
      // biome-ignore lint/performance/noAwaitInLoops: one form open at a time
      await pick(label);
      present[label] = (await page.locator(FIELD).count()) === 1;
      if (label === "GitLab") {
        gitlabValue = await page.locator(FIELD).inputValue();
      }
    }
    kit.check(
      "(a) the Server address field is in Gitea's and GitLab's form and no other's",
      present.Gitea === true &&
        present.GitLab === true &&
        !present.GitHub &&
        !present.Linear &&
        !present.Slack,
      JSON.stringify(present)
    );
    kit.check(
      "(b) GitLab's opens on its hosted address",
      gitlabValue === "https://gitlab.com/api/v4/mcp",
      gitlabValue
    );

    // (c)
    const posts: PageRequest[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/connections"
      ) {
        posts.push(request);
      }
    });
    await pick("Gitea");
    await page.fill(FIELD, "gitea.local/mcp");
    await page.fill("#connection-account", "probe");
    await page.fill("#connection-key", "probe-token");
    const form = page.locator('form[aria-label="Sign in to Gitea"]');
    await form.getByRole("button", { name: "Sign in", exact: true }).click();
    const refusal = await form
      .locator('[data-slot="field-field"]', { has: page.locator(FIELD) })
      .locator(".error")
      .textContent({ timeout: 5000 })
      .catch(() => null);
    kit.check(
      "(c) an address that is no http(s) URL is refused under the field, and nothing is sent",
      refusal ===
        "A server address starts with https:// or http://, like the example." &&
        posts.length === 0,
      `refusal ${JSON.stringify(refusal)}; posts ${posts.length}`
    );

    // (d)
    await page.setViewportSize({ width: 320, height: 800 });
    await page.fill(FIELD, LONG);
    const fit = await page.evaluate((selector) => {
      const input = document.querySelector<HTMLElement>(selector);
      const field = input?.closest<HTMLElement>('[data-slot="field-field"]');
      const box = input?.closest<HTMLElement>("form");
      const over = (one: HTMLElement | null | undefined) =>
        one ? one.scrollWidth - one.clientWidth : null;
      return {
        form: over(box),
        field: over(field),
        page: over(document.documentElement),
        inputWidth: input?.getBoundingClientRect().width ?? null,
        accountWidth:
          document
            .querySelector<HTMLElement>("#connection-account")
            ?.getBoundingClientRect().width ?? null,
      };
    }, FIELD);
    kit.check(
      "(d) at 320 px the long address fits: no form, field or page scrolls sideways; as wide as the account field",
      fit.form === 0 &&
        fit.field === 0 &&
        fit.page !== null &&
        fit.page <= 0 &&
        fit.inputWidth !== null &&
        fit.inputWidth === fit.accountWidth,
      JSON.stringify(fit)
    );

    // (e)
    await form.getByRole("button", { name: "Sign in", exact: true }).click();
    const sent = await page
      .waitForRequest(
        (request) =>
          request.method() === "POST" &&
          new URL(request.url()).pathname === "/api/connections",
        { timeout: 10_000 }
      )
      .catch(() => posts[0]);
    const body = sent
      ? (JSON.parse(sent.postData() ?? "{}") as Record<string, unknown>)
      : {};
    kit.check(
      "(e) Sign in sends the typed address as the connection's url",
      body.url === LONG &&
        body.service === "gitea" &&
        body.transport === "http" &&
        body.auth === "bearer",
      JSON.stringify(body)
    );
  },
};

export default spec;
