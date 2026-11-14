import type { Bounded } from "@cawco/core/bounded";
import { HARNESS_TOOL } from "@cawco/core/harness";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { HARNESSES } from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import type { ControlPayload, Envelope } from "@cawco/core/protocol";
import type { ToolSpec, ToolStatus, ToolWants } from "@cawco/core/tools";
import { isToolStatus, TOOL_CATALOG, toolSpec } from "@cawco/core/tools";
import { configurePage } from "@cawco/core/words/configure";
import type { HubContext } from "./hub-context";
import type { ControlResult } from "./machine-answers";
import { peekToolStatus } from "./machine-answers";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";
import { releaseTarget, updatesOwed } from "./tool-releases";
import type { HubSocket } from "./wire-socket";

/**
 * How long a tool install the hub runs itself (a joined machine's harness
 * CLIs, `readyHarnesses`) may take to answer: the dashboard's own install wait
 * (dashboard config.ts `INSTALL_TIMEOUT_MS`), so the two never disagree.
 */
const TOOL_INSTALL_MS = 300_000;

export type ToolInstallsContext = Pick<
  HubContext,
  | "awaitReply"
  | "callAgent"
  | "db"
  | "machineName"
  | "machinePause"
  | "pendingInstalls"
  | "publishInstances"
  | "registry"
  | "sendFrame"
  | "silentWords"
  | "toolReleases"
>;

export const createToolInstalls = (ctx: ToolInstallsContext) => {
  const awaitingInstall = (machineId: string, toolId: string): boolean => {
    for (const install of ctx.pendingInstalls.values()) {
      if (install.machineId === machineId && install.toolId === toolId) {
        return true;
      }
    }
    return false;
  };

  /**
   * Sends the machine an install for every tool the policy requires and its
   * last report says is missing (NEW.md §10). The one click: a machine that
   * joins the fleet, or a tool that becomes required, needs nobody to go
   * looking for what is out of date.
   *
   * A machine that has reported nothing is left alone — an empty map is a
   * machine whose probe has not asked yet, not one missing everything. So is
   * one whose cell says `failed` or `unsupported`: the daemon remembers its own
   * failures for the rest of its boot, so an install that will not work waits
   * for a click instead of going out on every reconnect.
   */
  const autoInstall = (machineId: string, agent: HubSocket): void => {
    const cells = ctx.db.agentTools(machineId);
    if (Object.keys(cells).length === 0) {
      return;
    }

    let sent = false;
    for (const policy of ctx.db.listToolPolicies()) {
      const cell = cells[policy.id];
      if (!policy.required || (cell && cell.state !== "missing")) {
        continue;
      }
      if (awaitingInstall(machineId, policy.id)) {
        continue;
      }
      sendInstall(
        machineId,
        agent,
        { toolId: policy.id, ...installAsk(policy.id) },
        true
      );
      sent = true;
    }
    if (keepRunnable(machineId, agent, cells)) {
      sent = true;
    }
    if (keepCurrent(machineId, agent, cells)) {
      sent = true;
    }
    if (sent) {
      ctx.publishInstances(machineId);
    }
  };

  /**
   * What every install of `toolId` carries, the hub's own and a press alike
   * (`installArgs`): the fleet's pin, which the machine installs exactly
   * and never with an updater; else, for a tool CawCo keeps current, the
   * release it is sent to reach (tool-releases.ts `releaseTarget`), a copy
   * left older than it answering why (agent tools.ts `install`).
   */
  const installAsk = (toolId: string): { newest?: string; pin?: string } => {
    const pin = ctx.db
      .listToolPolicies()
      .find((policy) => policy.id === toolId)?.pinnedVersion;
    if (pin) {
      return { pin };
    }
    const spec = toolSpec(toolId);
    const newest = spec
      ? releaseTarget(spec, ctx.toolReleases.newest(toolId))
      : undefined;
    return newest ? { newest } : {};
  };

  /**
   * An install control's arguments (agent session.ts `installTool`): the
   * tool, its pin, the release to reach, and whether the hub sends it to
   * keep the tool current rather than a press (a machine whose owner turned
   * the tool's automatic updates off declines that one).
   */
  const installArgs = (
    toolId: string,
    ask: { newest?: string; pin?: string },
    automatic: boolean
  ): unknown[] => [toolId, ask.pin, ask.newest, automatic];

  /**
   * Sends the machine one install: the hub's own (a required tool it is
   * missing, an update it is owed; `automatic`, which a machine whose owner
   * turned the tool's automatic updates off declines), or a person's
   * (Update all). Its cell reads `installing`, with the version of the copy
   * being updated and the one being put on (`to`) when known, until the
   * machine answers, and the answer is the cell (the `pendingInstalls`
   * path). The caller publishes.
   */
  const sendInstall = (
    machineId: string,
    agent: HubSocket,
    install: {
      newest?: string;
      pin?: string;
      to?: string;
      toolId: string;
      version?: string;
    },
    automatic: boolean
  ): void => {
    const requestId = crypto.randomUUID();
    ctx.pendingInstalls.set(requestId, {
      machineId,
      toolId: install.toolId,
      ...(install.newest ? { newest: install.newest } : {}),
    });
    ctx.sendFrame(agent, {
      verb: "control",
      machineId,
      payload: {
        requestId,
        method: "installTool",
        args: installArgs(install.toolId, install, automatic),
      },
    } satisfies Envelope<ControlPayload>);
    ctx.db.setAgentToolCell(machineId, {
      id: install.toolId,
      state: "installing",
      ...(install.version ? { version: install.version } : {}),
      ...(install.to ? { to: install.to } : {}),
      at: Date.now(),
    });
  };

  /**
   * The version an update of a copy behind `wants` puts on, when the hub can
   * say it: the one version, else, for a tool CawCo keeps current, the
   * release it is sent to reach. A floor's updater says its own.
   */
  const targetOf = (
    wants: ToolWants,
    ask: { newest?: string }
  ): { to?: string } => {
    if (!wants.orNewer) {
      return { to: wants.version };
    }
    return ask.newest ? { to: ask.newest } : {};
  };

  /**
   * A COPY CAWCO DOES NOT RUN IS UPDATED, OR THE PERSON IS TOLD (the owner,
   * 2026-11-14; core `ToolUpdates`). With the fleet set to update, each tool
   * whose cell says the machine's copy is one its CawCo does not run
   * (`wants`, the machine's own judgement by its own build's catalog), that
   * CawCo put there (`copy`), with no attempt standing since (`triedAt`: an
   * install that failed is not sent again on this boot of the machine's
   * agent, and its row says why) and none in flight, is sent the install its
   * Update button sends, as an automatic one. Anything else stands behind on
   * its row and in Needs you (core tool-updates.ts) until a press. A paused
   * machine is sent none until its pause ends. Answers whether any was sent.
   */
  const keepRunnable = (
    machineId: string,
    agent: HubSocket,
    cells: Record<string, ToolStatus>
  ): boolean => {
    if (
      ctx.db.toolUpdates() !== "update" ||
      ctx.machinePause.until(machineId) !== undefined
    ) {
      return false;
    }
    let sent = false;
    for (const [toolId, cell] of Object.entries(cells)) {
      const spec = toolSpec(toolId);
      if (
        !(spec && cell.wants) ||
        cell.state !== "failed" ||
        cell.copy?.by !== "cawco" ||
        cell.triedAt !== undefined ||
        awaitingInstall(machineId, toolId)
      ) {
        continue;
      }
      const ask = installAsk(toolId);
      const target = targetOf(cell.wants, ask);
      console.info(
        `[hub] updating ${spec.name} ${cell.version ?? "(no version said)"} on ${ctx.machineName(machineId)}${target.to ? ` to ${target.to}` : ""}: CawCo put that copy there, and the fleet updates a copy it doesn't run`
      );
      sendInstall(
        machineId,
        agent,
        {
          toolId,
          ...ask,
          ...target,
          ...(cell.version ? { version: cell.version } : {}),
        },
        true
      );
      sent = true;
    }
    return sent;
  };

  /**
   * UPDATE ALL: a person's Update of `toolId` on every machine whose copy is
   * one its CawCo does not run (`wants`), the same install each machine's own
   * Update sends (a press: a copy that is the person's own is updated too,
   * and one whose last attempt failed is tried again), sent to each machine
   * connected now with none of it in flight. Answers the machines it was
   * sent to, and those behind that are not connected, which nothing reaches
   * until they are.
   */
  const updateAll = (toolId: string): { away: string[]; sent: string[] } => {
    const sent: string[] = [];
    const away: string[] = [];
    for (const { machineId } of ctx.db.namedMachines()) {
      const cell = ctx.db.agentTools(machineId)[toolId];
      if (!cell?.wants || cell.state === "installing") {
        continue;
      }
      const agent = ctx.registry.agent(machineId);
      if (!agent) {
        away.push(machineId);
      } else if (!awaitingInstall(machineId, toolId)) {
        pressUpdate(machineId, agent, toolId, { ...cell, wants: cell.wants });
        sent.push(machineId);
      }
    }
    if (sent.length > 0) {
      const names = (ids: string[]) =>
        ids.map((one) => ctx.machineName(one)).join(", ");
      console.info(
        `[hub] Update all ${toolSpec(toolId)?.name ?? toolId}: sent to ${names(sent)}${away.length > 0 ? `; ${names(away)} not connected` : ""}`
      );
    }
    return { sent, away };
  };

  /** One machine's part of {@link updateAll}: its Update, as a press sends it, published. */
  const pressUpdate = (
    machineId: string,
    agent: HubSocket,
    toolId: string,
    cell: ToolStatus & { wants: ToolWants }
  ): void => {
    const ask = installAsk(toolId);
    sendInstall(
      machineId,
      agent,
      {
        toolId,
        ...ask,
        ...targetOf(cell.wants, ask),
        ...(cell.version ? { version: cell.version } : {}),
      },
      false
    );
    ctx.publishInstances(machineId);
  };

  /**
   * Sends the machine an update of each CLI CawCo keeps current whose copy
   * there CawCo put there and says a version older than its newest release,
   * while the fleet is set to update (tool-releases.ts `updatesOwed`): the
   * catalog's install, which runs the copy's own updater there, with no
   * press. A machine the owner paused is sent none: nothing
   * CawCo starts runs there until the pause ends, and the first read or
   * report after it sends it. Answers whether any was sent.
   */
  const keepCurrent = (
    machineId: string,
    agent: HubSocket,
    cells: Record<string, ToolStatus>
  ): boolean => {
    if (ctx.machinePause.until(machineId) !== undefined) {
      return false;
    }
    const owed = updatesOwed(
      {
        cells,
        inFlight: (toolId) => awaitingInstall(machineId, toolId),
        tried: (toolId) => ctx.toolReleases.tried(machineId, toolId),
      },
      {
        catalog: TOOL_CATALOG,
        newest: (toolId) => ctx.toolReleases.newest(toolId),
        policies: ctx.db.listToolPolicies(),
        updates: ctx.db.toolUpdates(),
      }
    );
    for (const update of owed) {
      console.info(
        `[hub] updating ${toolSpec(update.toolId)?.name ?? update.toolId} ${update.version} on ${ctx.machineName(machineId)} to ${update.newest}`
      );
      sendInstall(machineId, agent, { ...update, to: update.newest }, true);
    }
    return owed.length > 0;
  };

  /**
   * Puts a catalog tool on a machine and waits for its answer, as a press
   * on the dashboard does: the machine's cell reads `installing` for every
   * dashboard until the machine answers, and its answer is the cell (the
   * `pendingInstalls` path). Unanswered past {@link TOOL_INSTALL_MS}.
   */
  const installAwaited = (
    machineId: string,
    toolId: string
  ): Promise<Bounded<ControlResult>> => {
    const agent = ctx.registry.agent(machineId);
    if (!agent) {
      return Promise.resolve({ kind: "unanswered", reason: "dead", after: 0 });
    }
    const requestId = crypto.randomUUID();
    const ask = installAsk(toolId);
    ctx.pendingInstalls.set(requestId, {
      machineId,
      toolId,
      ...(ask.newest ? { newest: ask.newest } : {}),
    });
    ctx.db.setAgentToolCell(machineId, {
      id: toolId,
      state: "installing",
      at: Date.now(),
    });
    ctx.publishInstances(machineId);
    return ctx.awaitReply(machineId, requestId, TOOL_INSTALL_MS, () => {
      const frame = {
        verb: "control",
        machineId,
        payload: {
          requestId,
          method: "installTool",
          args: installArgs(toolId, ask, false),
        },
      } satisfies Envelope<ControlPayload>;
      ctx.sendFrame(agent, frame);
      return frame;
    });
  };

  /**
   * ADDING A MACHINE LEAVES IT READY (installs.ts `ready`): a machine that
   * just joined is asked what tools it has, then each harness CLI is brought
   * to a version CawCo runs, one at a time, through the catalog's install
   * (`installAwaited`): Claude Code installed when missing or updated when
   * older than core's `CLAUDE_VERSION_FLOOR`; OpenCode and pi, which a
   * machine runs only when its person put them there, updated when they are
   * there at a version CawCo doesn't run. So it joins able to start sessions
   * and sign accounts in. Answers what runs there now, and what could not be
   * brought up and why, in words; `say` takes each step's line.
   */
  const readyHarnesses = async (
    machineId: string,
    say: (line: string) => void
  ): Promise<string> => {
    const name = ctx.machineName(machineId);
    // The machine is in the fleet whatever this meets (installs.ts `ready`):
    // what could not be brought up stands on it with its press.
    const fix = `${name} is in the fleet: each stands on its row in ${configurePage("cli-tools")}, with Retry.`;
    say(`asking ${name} which Claude Code, OpenCode and pi it has`);
    const tools = await toolsOn(machineId);
    if ("said" in tools) {
      return `${tools.said} ${fix}`;
    }
    const runs: string[] = [];
    const failed: string[] = [];
    for (const harness of HARNESSES) {
      const brought = await readyHarness(machineId, harness, tools, say);
      if ("runs" in brought) {
        runs.push(brought.runs);
      } else if ("failed" in brought) {
        failed.push(brought.failed);
      }
    }
    const ran = runs.length > 0 ? `${runs.join(", ")} on ${name}.` : "";
    if (failed.length > 0) {
      return [ran, ...failed, fix].filter(Boolean).join(" ");
    }
    return ran || `Nothing to bring up on ${name}.`;
  };

  /**
   * One harness on a joined machine (`readyHarnesses`): what runs, brought
   * up when it needs it, or why not, in words; nothing to say for an
   * OpenCode or pi the machine doesn't have (only Claude Code is put on
   * unasked) or whose build's catalog lacks it.
   */
  const readyHarness = (
    machineId: string,
    harness: HarnessKind,
    tools: ToolStatus[],
    say: (line: string) => void
  ): Promise<{ runs: string } | { failed: string } | { skipped: true }> => {
    const spec = toolSpec(HARNESS_TOOL[harness]);
    const has = tools.find((tool) => tool.id === HARNESS_TOOL[harness]);
    if (!(spec && has)) {
      // A build whose catalog lacks it: Claude Code is what every machine
      // runs, so its absence fails the step; the others are not asked.
      return Promise.resolve(
        traitsOf(harness).requiredOnEveryMachine
          ? {
              failed: `${ctx.machineName(machineId)} runs a CawCo build that doesn't manage Claude Code, so it wasn't checked. Update CawCo there from ${configurePage("updates")}.`,
            }
          : { skipped: true }
      );
    }
    if (has.state === "installed") {
      return Promise.resolve({
        runs: `${spec.name}${has.version ? ` ${has.version}` : ""}`,
      });
    }
    if (has.state === "missing" && !traitsOf(harness).requiredOnEveryMachine) {
      return Promise.resolve({ skipped: true });
    }
    return bringTool(machineId, spec, has, say);
  };

  /**
   * One harness CLI put on a machine (`readyHarnesses`): installed when
   * missing, else updated. What runs now, or why not, in words.
   */
  const bringTool = async (
    machineId: string,
    spec: ToolSpec,
    has: ToolStatus,
    say: (line: string) => void
  ): Promise<{ runs: string } | { failed: string }> => {
    const name = ctx.machineName(machineId);
    const verb = has.state === "missing" ? "install" : "update";
    say(
      verb === "install"
        ? `installing ${spec.name} on ${name}`
        : `updating ${spec.name}${has.version ? ` ${has.version}` : ""} on ${name}`
    );
    const answer = await installAwaited(machineId, spec.id);
    if (answer.kind === "unanswered") {
      return {
        failed: `${name} didn't answer while ${spec.name} was being put on (${ctx.silentWords(machineId, answer)}), so whether it finished isn't known.`,
      };
    }
    const status = peekToolStatus({ result: answer.value.result });
    if (status?.state === "installed") {
      say(
        `${spec.name}${status.version ? ` ${status.version}` : ""} runs on ${name}`
      );
      return {
        runs: `${spec.name}${status.version ? ` ${status.version}` : ""}`,
      };
    }
    const why =
      status?.detail ?? answer.value.error ?? "the machine didn't say why";
    return { failed: `${spec.name} didn't ${verb} on ${name}: ${why}` };
  };

  /**
   * The machine's tools, as its tool probe finds them (`listTools`), or why
   * they could not be read, in words.
   */
  const toolsOn = async (
    machineId: string
  ): Promise<ToolStatus[] | { said: string }> => {
    const name = ctx.machineName(machineId);
    const listed = await ctx.callAgent(
      machineId,
      "listTools",
      [],
      READ_TIMEOUT_MS
    );
    if (listed.kind === "unanswered") {
      return {
        said: `${name} didn't say which tools it has (${ctx.silentWords(machineId, listed)}).`,
      };
    }
    if (!listed.value.ok) {
      return {
        said: `${name} didn't say which tools it has (${listed.value.error ?? "its agent refused the ask"}).`,
      };
    }
    return Array.isArray(listed.value.result)
      ? listed.value.result.filter(isToolStatus)
      : [];
  };

  return {
    autoInstall,
    installAsk,
    installArgs,
    readyHarnesses,
    updateAll,
  };
};
