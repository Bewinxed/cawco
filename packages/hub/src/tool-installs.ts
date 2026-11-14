import type { Bounded } from "@cawco/core/bounded";
import { HARNESS_TOOL } from "@cawco/core/harness";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { HARNESSES } from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import type { ControlPayload, Envelope } from "@cawco/core/protocol";
import { toolUpdateOf } from "@cawco/core/tool-updates";
import type { ToolSpec, ToolStatus, ToolWants } from "@cawco/core/tools";
import { isToolStatus, TOOL_CATALOG, toolSpec } from "@cawco/core/tools";
import { configurePage } from "@cawco/core/words/configure";
import type { HubContext } from "./hub-context";
import type { ControlResult } from "./machine-answers";
import { peekToolStatus } from "./machine-answers";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";
import { keptReleases, releaseTarget } from "./tool-releases";
import type { HubSocket } from "./wire-socket";

/**
 * How long a tool install the hub runs itself (a joined machine's harness
 * CLIs, `readyHarnesses`) may take to answer: the dashboard's own install wait
 * (dashboard config.ts `INSTALL_TIMEOUT_MS`), so the two never disagree.
 */
const TOOL_INSTALL_MS = 300_000;

/** A machine Update all left, and why (`updateAll`). */
interface UpdateAllLeft {
  machineId: string;
  why: "away" | "own" | "paused";
}

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
    if (keepCopies(machineId, agent, cells)) {
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
   * tool, its pin, the release to reach, whether the hub sends it to keep
   * the tool current rather than a press (a machine whose owner turned the
   * tool's automatic updates off declines that one), and who started it
   * (core `ToolStatus.startedBy`), which the machine says on the tool's row
   * while it runs.
   */
  const installArgs = (
    toolId: string,
    ask: { newest?: string; pin?: string },
    automatic: boolean,
    startedBy: "cawco" | "person"
  ): unknown[] => [toolId, ask.pin, ask.newest, automatic, startedBy];

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
    automatic: boolean,
    startedBy: "cawco" | "person" = automatic ? "cawco" : "person"
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
        args: installArgs(install.toolId, install, automatic, startedBy),
      },
    } satisfies Envelope<ControlPayload>);
    ctx.db.setAgentToolCell(machineId, {
      id: install.toolId,
      state: "installing",
      ...(install.version ? { version: install.version } : {}),
      ...(install.to ? { to: install.to } : {}),
      startedBy,
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
   * The newest release of each CLI CawCo keeps current that the fleet pins
   * no version of (tool-releases.ts `keptReleases`): what a copy CawCo put
   * there is kept at, by tool id, for the pass and for `/api/tool-updates`
   * alike, so the screens judge a copy by the releases the hub acts on.
   */
  const releases = (): Record<string, string> =>
    keptReleases({
      catalog: TOOL_CATALOG,
      newest: (toolId) => ctx.toolReleases.newest(toolId),
      policies: ctx.db.listToolPolicies(),
    });

  /**
   * THE ONE RULE for whether CawCo updates a copy unasked, whatever asks it
   * (the hub's own pass, {@link keepCopies}; adding a machine,
   * {@link readyHarness}): the state core `toolUpdateOf` calls `due`, by the
   * fleet's choice and the releases the hub acts on ({@link releases}). So
   * a copy the screens call due is one this pass sends, and the pass sends
   * nothing they call anything else: CawCo's own copy (`copy`), with the
   * fleet set to update, that its CawCo can't run (`wants`) or that is
   * behind the newest release of a CLI CawCo keeps current, with no attempt
   * standing on it (`triedAt`, or an update's words on a copy it left
   * behind, `detail`).
   */
  const dueOf = (
    cell: ToolStatus
  ): Extract<ReturnType<typeof toolUpdateOf>, { kind: "due" }> | undefined => {
    const state = toolUpdateOf(cell, ctx.db.toolUpdates(), releases());
    return state?.kind === "due" ? state : undefined;
  };

  /**
   * A COPY CAWCO DOES NOT RUN IS UPDATED, OR THE PERSON IS TOLD; CAWCO'S
   * OWN COPY OF A CLI IT KEEPS CURRENT RUNS ITS NEWEST RELEASE (the owner,
   * 2026-11-04 and 2026-11-14; core `ToolUpdates`). Each copy on the
   * machine that is due ({@link dueOf}) and has no install in flight is
   * sent the install its Update button sends, as an automatic one, with the
   * version it is to reach (`to`) when the hub can say it. A paused machine
   * is sent none until its pause ends; a machine not connected, none until
   * it is. Answers whether any was sent.
   *
   * Every event that can move whether a copy is due runs it for the
   * machines it touches ({@link keepCopiesOn}), so no copy is called due
   * with nothing on its way: a machine's tools report (its first one on a
   * connection is the register's: the cells it holds from before are a
   * past connection's facts), a fleet choice or a tool policy set, a
   * release read, a pause ending, and an install's answer.
   */
  const keepCopies = (
    machineId: string,
    agent: HubSocket,
    cells: Record<string, ToolStatus>
  ): boolean => {
    if (ctx.machinePause.until(machineId) !== undefined) {
      return false;
    }
    let sent = false;
    for (const [toolId, cell] of Object.entries(cells)) {
      const due = dueOf(cell);
      if (!due || awaitingInstall(machineId, toolId)) {
        continue;
      }
      const ask = installAsk(toolId);
      const target = targetOf(due.wants, ask);
      console.info(
        `[hub] updating ${toolSpec(toolId)?.name ?? toolId} ${cell.version ?? "(no version said)"} on ${ctx.machineName(machineId)}${target.to ? ` to ${target.to}` : ""}: CawCo put that copy there, and the fleet updates its own copies`
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
   * UPDATE ALL: the Update of `toolId` on every machine whose copy is one
   * CawCo put there and its CawCo does not run (`wants`), the same install
   * each machine's own Update sends (one whose last attempt failed is tried
   * again), sent to each machine connected now, not paused, with none of it
   * in flight. A copy the person installed is never in it (the owner,
   * 2026-11-14: "Never touched; notice and button only"): only its own
   * row's press updates it. Answers the machines it was sent to, and each
   * behind that it left, with why: not connected, paused, or the person's
   * own copy. The dashboard counts its press by the same rule
   * (`updateAllTakes`).
   */
  const updateAll = (
    toolId: string
  ): { left: UpdateAllLeft[]; sent: string[] } => {
    const sent: string[] = [];
    const left: UpdateAllLeft[] = [];
    for (const { machineId } of ctx.db.namedMachines()) {
      const cell = ctx.db.agentTools(machineId)[toolId];
      if (!cell?.wants || cell.state === "installing") {
        continue;
      }
      const agent = ctx.registry.agent(machineId);
      const why = leftBy(machineId, cell, agent);
      if (why) {
        left.push({ machineId, why });
      } else if (agent && !awaitingInstall(machineId, toolId)) {
        pressUpdate(machineId, agent, toolId, { ...cell, wants: cell.wants });
        sent.push(machineId);
      }
    }
    sayUpdateAll(toolId, sent, left);
    return { sent, left };
  };

  /** Why {@link updateAll} leaves a machine's copy: the person's own, not connected, or paused; none when it goes. */
  const leftBy = (
    machineId: string,
    cell: ToolStatus,
    agent: HubSocket | undefined
  ): UpdateAllLeft["why"] | undefined => {
    if (cell.copy?.by !== "cawco") {
      return "own";
    }
    if (!agent) {
      return "away";
    }
    return ctx.machinePause.until(machineId) === undefined
      ? undefined
      : "paused";
  };

  /** {@link updateAll}'s line in the hub's log: where it went, and what it left with why. */
  const sayUpdateAll = (
    toolId: string,
    sent: string[],
    left: UpdateAllLeft[]
  ): void => {
    if (sent.length === 0 && left.length === 0) {
      return;
    }
    const names = sent.map((one) => ctx.machineName(one)).join(", ");
    const leftWords = left
      .map((one) => `${ctx.machineName(one.machineId)} (${one.why})`)
      .join(", ");
    console.info(
      `[hub] Update all ${toolSpec(toolId)?.name ?? toolId}: sent to ${names || "none"}${leftWords ? `; left ${leftWords}` : ""}`
    );
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
    // Adding a machine is the person's act, but what it puts on is CawCo's
    // choice under the fleet's rule, so the row says CawCo put it on.
    const cell = ctx.db.agentTools(machineId)[toolId];
    ctx.db.setAgentToolCell(machineId, {
      id: toolId,
      state: "installing",
      ...(cell?.version ? { version: cell.version } : {}),
      ...(cell?.wants ? targetOf(cell.wants, ask) : {}),
      startedBy: "cawco",
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
          args: installArgs(toolId, ask, false, "cawco"),
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
   * (`installAwaited`): Claude Code installed when missing (what adding a
   * machine is for); a copy of any of them there at a version CawCo doesn't
   * run updated by the rule every update unasked follows
   * ({@link dueOf}: CawCo's own copy, while the fleet is set to update), and otherwise left, said, and listed as waiting on the person
   * (core tool-updates.ts). So it joins able to start sessions and sign
   * accounts in, or says what waits on the person. Answers what runs there
   * now, what was left and why, and what could not be brought up and why,
   * in words; `say` takes each step's line.
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
    const left: string[] = [];
    for (const harness of HARNESSES) {
      const brought = await readyHarness(machineId, harness, tools, say);
      if ("runs" in brought) {
        runs.push(brought.runs);
      } else if ("failed" in brought) {
        failed.push(brought.failed);
      } else if ("left" in brought) {
        say(brought.left);
        left.push(brought.left);
      }
    }
    const ran = runs.length > 0 ? `${runs.join(", ")} on ${name}.` : "";
    if (failed.length > 0) {
      return [ran, ...left, ...failed, fix].filter(Boolean).join(" ");
    }
    if (left.length > 0) {
      return [ran, ...left].filter(Boolean).join(" ");
    }
    return ran || `Nothing to bring up on ${name}.`;
  };

  /**
   * Why adding a machine left its copy of `spec` at a version CawCo doesn't
   * run ({@link dueOf} said no), and where the person updates it.
   */
  const leftWords = (
    machineId: string,
    spec: ToolSpec,
    has: ToolStatus
  ): string => {
    const copy = `${spec.name} ${has.version ?? "(no version said)"} on ${ctx.machineName(machineId)}`;
    const update = `Update it from Needs you or ${configurePage("cli-tools")}.`;
    if (!has.wants) {
      return `${copy} isn't one CawCo runs, and that machine's CawCo didn't say whose copy it is, so CawCo left it. ${update}`;
    }
    const runs = has.wants.orNewer
      ? `${has.wants.version} or newer`
      : has.wants.version;
    if (has.copy?.by !== "cawco") {
      return `${copy} is a copy you installed, and CawCo runs ${runs}. CawCo leaves your own copies alone. ${update}`;
    }
    if (has.triedAt !== undefined) {
      return `${copy} didn't update when CawCo tried earlier, and CawCo runs ${runs}: ${has.detail ?? "the machine didn't say why"} ${update}`;
    }
    return `${copy} isn't one CawCo runs (${runs}), and the fleet asks before CawCo updates one. ${update}`;
  };

  /**
   * One harness on a joined machine (`readyHarnesses`): what runs, brought
   * up when it needs it and the rule allows, left and why, or why not, in
   * words; nothing to say for an OpenCode or pi the machine doesn't have
   * (only Claude Code is put on unasked) or whose build's catalog lacks it.
   */
  const readyHarness = (
    machineId: string,
    harness: HarnessKind,
    tools: ToolStatus[],
    say: (line: string) => void
  ): Promise<
    { runs: string } | { failed: string } | { left: string } | { skipped: true }
  > => {
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
    // No copy there (missing, or no installer here): installed only for the
    // harness every machine runs.
    if (has.version === undefined && has.copy === undefined) {
      return traitsOf(harness).requiredOnEveryMachine
        ? bringTool(machineId, spec, has, say)
        : Promise.resolve({ skipped: true });
    }
    return dueOf(has)
      ? bringTool(machineId, spec, has, say)
      : Promise.resolve({ left: leftWords(machineId, spec, has) });
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

  /**
   * THE PASS ON EVERY EVENT THAT CAN MOVE WHETHER A COPY IS DUE: the
   * required installs and {@link keepCopies} for `machineId`, or for every
   * machine with none, each one connected now (one that is not is sent its
   * due as its next connection's first tools report lands). Its callers are
   * the whole list (core `ToolUpdateState`'s `due`): a machine's tools
   * report (server.ts `toolsReported`, its first on a connection standing
   * for the register), the fleet's choice set and a tool's policy set
   * (routes/tools.ts), a tool's sign-in finished (routes/tools.ts, which
   * writes its cell), each release read (server.ts `toolReleases`), a pause
   * ending (server.ts `pauseEnded`), and an install's answer
   * (control-replies.ts `installAnswered`).
   */
  const keepCopiesOn = (machineId?: string): void => {
    const machines =
      machineId === undefined ? ctx.registry.machineIds() : [machineId];
    for (const id of machines) {
      const agent = ctx.registry.agent(id);
      if (agent) {
        autoInstall(id, agent);
      }
    }
  };

  return {
    keepCopiesOn,
    installAsk,
    installArgs,
    readyHarnesses,
    releases,
    updateAll,
  };
};
