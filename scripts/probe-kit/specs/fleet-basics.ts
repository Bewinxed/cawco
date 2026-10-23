/**
 * What a machine's first minutes on a hub show, read per commit on a scratch
 * fleet (real hub, agent and sessiond from this checkout; no binary install is
 * needed for either, so neither waits for the release's container proof).
 *
 * (a) Until a CawCo account is signed in on a machine, a Claude session start
 *     there is refused in the hub's sentence (hub placement.ts
 *     `noAccountRefusal`): "No Claude account is signed in on <machine>. Add
 *     one in Configure › Accounts and sign it in there. Nothing was started."
 *     The hub keeps no row
 *     for it and the machine's keeper holds nothing under it.
 * (b) The capability report (core capabilities.ts, reported as the agent
 *     registers) lists each tool by id with whether it is there: git, found on
 *     this host, with the version `git --version` says, and the service
 *     manager with a yes or a no.
 * (c) The fleet holds an npx row (`pkg@latest`, npm pointed at a dead port)
 *     before the machine joins: the machine is online once its welcome is
 *     acknowledged (hub fleet-sync.ts), while that row's item is still in
 *     npm, and its row reads "setting up n/m" (dashboard convergence.ts);
 *     npm is bounded (agent mcp-install.ts), so the item then fails in npm's
 *     words and the row says it did not set up.
 * (d) In the dashboard, the machine's row names that item, in npm's words,
 *     with a Retry that converges it again. A policy change the machine
 *     cannot write (its Claude dir read-only) is refused in the agent's
 *     words (NACK): the hub's row keeps them, the dashboard's row says "sync
 *     refused" with them under Show details, and once writable the change
 *     goes again on a heartbeat and is acknowledged.
 *
 *   bun scripts/probe-kit/run.ts fleet-basics
 */
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import {
  machineSync,
  syncNotice,
} from "../../../apps/dashboard/src/lib/cawco/convergence";
import { readWithin } from "../../../packages/core/src/bounded";
import type {
  FleetItemStatus,
  FleetSyncOutcome,
  FleetSyncReport,
} from "../../../packages/core/src/index";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { shellWords } from "../../../packages/core/src/words/shell";
import { noAccountRefusal } from "../../../packages/hub/src/placement";
import { MACHINE, until } from "../../scratch-fleet";
import { open, type Spec } from "../kit";
import { literal } from "../words";

/** The npx row whose npm never reaches its registry. */
const HELD_ROW = "probe-held-npm";

/** The hub's refusal around the machine it names (placement.ts noAccountRefusal), the machine caught. */
const [BEFORE, AFTER] = noAccountRefusal("\n").split("\n");
const REFUSAL = new RegExp(
  `^${literal(BEFORE ?? "")}(.+?)${literal(AFTER ?? "")}`
);

interface AgentRow {
  fleet?: FleetSyncReport;
  fleetItems?: Record<string, FleetItemStatus>;
  fleetSync?: FleetSyncOutcome;
  hostname: string;
  machineCapabilities?: {
    items: { available: boolean; id: string; version?: string }[];
  };
  machineId: string;
  status: string;
}

const spec: Spec = {
  name: "fleet-basics",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    // (c) A port nothing listens on, for the row's npm registry.
    const gone = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response(),
    });
    const deadPort = gone.port;
    await gone.stop(true);
    const put = await fetch(`${fleet.base}/api/fleet/mcp/${HELD_ROW}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        config: {
          command: "npx",
          args: ["-y", `${HELD_ROW}@latest`],
          env: { npm_config_registry: `http://127.0.0.1:${deadPort}/` },
        },
        enabled: true,
      }),
    });
    check(
      `(c) the fleet holds ${HELD_ROW} before the machine joins`,
      put.ok,
      `${put.status} ${await put.text()}`
    );
    fleet.launch("agent");
    await fleet.agentUp();
    const joinedAt = Date.now();
    const machineRow = async () =>
      (await fleet.api<AgentRow[]>("/api/agents")).find(
        (agent) => agent.machineId === MACHINE
      );
    const npxItem = `mcp:${HELD_ROW}`;
    const settingUp = await until(
      "the machine online, its npx row setting up",
      machineRow,
      (agent) =>
        agent.status === "online" &&
        ["pending", "running"].includes(
          agent.fleetItems?.[npxItem]?.state ?? ""
        ),
      60_000
    ).catch(() => undefined);
    const settingNotice = settingUp
      ? syncNotice(machineSync(settingUp), () => "1m")
      : undefined;
    check(
      `(c) online once its welcome is acknowledged, while the npx row is still in npm: the row reads "${settingNotice}"`,
      settingUp?.fleetSync?.state === "acked" &&
        (settingNotice ?? "").startsWith("setting up "),
      JSON.stringify({
        status: settingUp?.status,
        fleetSync: settingUp?.fleetSync,
        item: settingUp?.fleetItems?.[npxItem],
      })
    );
    const settled = await until(
      "the npx row's item settled",
      machineRow,
      (agent) => agent.fleetItems?.[npxItem]?.state === "failed",
      120_000
    ).catch(() => undefined);
    const item = settled?.fleetItems?.[npxItem];
    const failedNotice = settled
      ? syncNotice(machineSync(settled), () => "1m")
      : undefined;
    check(
      `(c) ${Math.round((Date.now() - joinedAt) / 1000)} s after it joined (within 120 s) the item says npm's words, and the row "${failedNotice}": ${item?.error?.split("\n")[0]}`,
      item?.state === "failed" &&
        (item.error ?? "").includes("timed out after") &&
        (failedNotice ?? "").includes("not set up") &&
        settled?.status === "online",
      JSON.stringify({ item, status: settled?.status })
    );
    const row = (await fleet.api<AgentRow[]>("/api/agents")).find(
      (agent) => agent.machineId === MACHINE
    );

    // (a) A start with no account filed or signed in: the hub's answer on the
    // dashboard socket is an error frame for that instance.
    const instanceId = crypto.randomUUID();
    const socket = new WebSocket(
      `${fleet.base.replace("http", "ws")}/ws/dashboard`
    );
    const refused = new Promise<string>((done) => {
      socket.onmessage = (event) => {
        const frame = JSON.parse(String(event.data)) as {
          instanceId?: string;
          payload?: { kind?: string; message?: string };
        };
        if (
          frame.instanceId === instanceId &&
          frame.payload?.kind === "error"
        ) {
          done(frame.payload.message ?? "");
        }
      };
    });
    await new Promise<void>((done, fail) => {
      socket.onopen = () => done();
      socket.onerror = () =>
        fail(new Error("the dashboard socket did not open"));
    });
    socket.send(
      JSON.stringify({
        verb: "spawn",
        machineId: MACHINE,
        instanceId,
        payload: {
          instanceId,
          cwd: fleet.workdir,
          harness: "claude",
          model: "claude-haiku-4-5",
          // A mode chosen, as every start must name one (server.ts): the account is what refuses it.
          permissionMode: "bypassPermissions",
        },
      })
    );
    const said = await readWithin(30_000, () => refused);
    socket.close();
    const refusedLabel =
      "(a) a Claude start on a machine with no CawCo account is refused in the hub's sentence, naming the machine";
    switch (said.kind) {
      case "answered": {
        const named = REFUSAL.exec(said.value)?.[1];
        check(
          refusedLabel,
          named !== undefined && row?.hostname.startsWith(named) === true,
          `said: ${said.value}; the machine's hostname: ${row?.hostname}`
        );
        break;
      }
      case "unanswered":
        check(
          refusedLabel,
          false,
          `the hub did not answer the start within ${said.after} ms`
        );
        break;
      default: {
        const unhandled: never = said;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    const held = (await fleet.heldProcs()).filter(({ procId }) =>
      procId.includes(instanceId)
    );
    check(
      "(a) the refused start has no row on the hub and nothing on the machine's keeper",
      fleet.instance(instanceId) === undefined && held.length === 0,
      `row: ${JSON.stringify(fleet.instance(instanceId))}; held: ${JSON.stringify(held)}`
    );

    // (b) The capability report, as the agent registered it.
    const items = row?.machineCapabilities?.items ?? [];
    const git = items.find((tool) => tool.id === "git");
    const hostGit = (await Bun.$`git --version`.quiet().nothrow()).stdout
      .toString()
      .trim();
    check(
      "(b) the capability report names git as found, with the version `git --version` says",
      git?.available === true &&
        typeof git.version === "string" &&
        git.version !== "" &&
        hostGit.includes(git.version),
      `git: ${JSON.stringify(git)}; host: ${hostGit}`
    );
    const manager = items.find((tool) => tool.id === "service-manager");
    check(
      "(b) the capability report says whether the machine has a service manager",
      typeof manager?.available === "boolean",
      JSON.stringify(items)
    );

    // (d) The dashboard's row for the machine: the npx row's item that did
    // not set up, in npm's words, with its own Retry; pressed, the item
    // converges again.
    const page = await kit.page("desk");
    await open(page, await fleet.dashboard(), "[data-machines]");
    await page.locator("[data-machines]").click();
    const machineLi = page.locator(`li[data-machine="${MACHINE}"]`);
    const itemFault = machineLi.locator(`[data-item-fault="${npxItem}"]`);
    const itemShown = await itemFault
      .getByText(`MCP server ${HELD_ROW} did not set up.`)
      .waitFor({ timeout: 30_000 })
      .then(
        () => true,
        () => false
      );
    const meta = (await machineLi.locator('[data-slot="meta"]').innerText())
      .replaceAll("\n", " ")
      .trim();
    check(
      `(d) the machine's row in the dashboard: "${meta}", and "MCP server ${HELD_ROW} did not set up." with a Retry`,
      itemShown &&
        meta.includes("not set up") &&
        (await itemFault.getByRole("button", { name: "Retry" }).count()) === 1,
      meta
    );
    if (itemShown) {
      await itemFault.getByRole("button", { name: "Retry" }).click();
    }
    const retrying = await until(
      "the retried item converging again",
      machineRow,
      (agent) =>
        ["pending", "running"].includes(
          agent.fleetItems?.[npxItem]?.state ?? ""
        ),
      20_000
    ).catch(() => undefined);
    check(
      "(d) Retry sends the item again and the machine converges it again",
      retrying !== undefined,
      JSON.stringify((await machineRow())?.fleetItems?.[npxItem])
    );

    // (d) A policy change the machine cannot write (its Claude dir made
    // read-only): it refuses the delta in its words (NACK), and the row says so.
    const choices = await fleet.api<{ delegates?: boolean }>(
      "/api/fleet/choices"
    );
    const claudeDir = projectClaudeDir(fleet.home);
    await chmod(claudeDir, 0o500);
    let nacked: AgentRow | undefined;
    try {
      await fetch(`${fleet.base}/api/fleet/choices`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ delegates: !choices.delegates }),
      });
      nacked = await until(
        "the policy delta refused on the machine's row",
        machineRow,
        (agent) => agent.fleetSync?.state === "nacked",
        60_000
      ).catch(() => undefined);
    } finally {
      await chmod(claudeDir, 0o700);
    }
    const words =
      nacked?.fleetSync?.state === "nacked" ? nacked.fleetSync.error : "";
    check(
      "(d) the hub's row says the machine refused the change, in the agent's words, naming the sidecar",
      words.startsWith(
        `could not write ${join(claudeDir, "cawco-fleet.json")}`
      ),
      JSON.stringify(nacked?.fleetSync)
    );
    const fault = machineLi.locator("[data-sync-fault]");
    const faultShown = await fault
      .getByText("It refused the fleet's last change", { exact: false })
      .waitFor({ timeout: 30_000 })
      .then(
        () => true,
        () => false
      );
    if (faultShown) {
      await fault.getByRole("button", { name: shellWords.showDetails }).click();
    }
    const shown = await page.evaluate((machineId) => {
      const li = document.querySelector(`li[data-machine="${machineId}"]`);
      return {
        meta:
          li?.querySelector('[data-slot="meta"]')?.textContent?.trim() ?? "",
        details:
          li
            ?.querySelector('[data-sync-fault] [data-slot="details"]')
            ?.textContent?.trim() ?? "",
      };
    }, MACHINE);
    check(
      `(d) a NACK shows on the machine's row: "${shown.meta}", the agent's words under Show details`,
      shown.meta.includes("sync refused") &&
        shown.details === words &&
        words !== "",
      JSON.stringify(shown)
    );
    // Writable again, the delta goes again on a heartbeat and is acknowledged.
    const acked = await until(
      "the refused delta acknowledged once sent again",
      machineRow,
      (agent) => agent.fleetSync?.state === "acked",
      120_000
    ).catch(() => undefined);
    const cleared = await machineLi
      .getByText("sync refused", { exact: false })
      .waitFor({ state: "detached", timeout: 15_000 })
      .then(
        () => true,
        () => false
      );
    check(
      "(d) with the dir writable again, the change goes again on its own, is acknowledged, and the row stops saying it was refused",
      acked !== undefined && cleared,
      JSON.stringify(acked?.fleetSync)
    );
    await page.close();
  },
};

export default spec;
