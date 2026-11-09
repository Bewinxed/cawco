import type { Bounded } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import type {
  FleetAgent,
  FleetPlugin,
  FleetSkillMeta,
  FleetVersioned,
  MachineHookScript,
  MarketplaceLink,
  MarketplaceRead,
} from "@cawco/core/fleet";
import {
  isLoopbackSource,
  machinePlatform,
  mcpRunsOn,
  READ_HOOK_SCRIPT,
  READ_MEMORY_FILE,
} from "@cawco/core/fleet";
import type { FleetItems } from "@cawco/core/fleet-items";
import { fleetItemsOf } from "@cawco/core/fleet-items";
import { traitsOf } from "@cawco/core/harness/traits";
import type { FleetHook } from "@cawco/core/hooks";
import type {
  ControlPayload,
  Envelope,
  FsMedia,
  FsPayload,
} from "@cawco/core/protocol";
import type { FleetMcpTakeAnswer } from "@cawco/core/session/controls";
import { CONTROL_MCP_FLEET_CHANGED } from "@cawco/core/session/controls";
import { HOUR_MS, secondsOf } from "@cawco/core/time";
import type { FleetMcpTook } from "./connect-asks";
import type { SourceNote } from "./db/fleet-catalog";
import type { FetchNews } from "./fleet-fetches";
import { heardFetch } from "./fleet-fetches";
import type { RidingChanges } from "./fleet-mcp-changes";
import { refreshOf, skillVersion } from "./fleet-versions";
import type { HubContext } from "./hub-context";
import { hubHttpUrl } from "./hub-self";
import type { FetchedCopy } from "./hub-shapes";
import type {
  ControlResult,
  MachineMemory,
  MemoryRead,
  ReadRefused,
  RouteSet,
} from "./machine-answers";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";
import type { ResolvedPlugin } from "./plugins";
import {
  isHubDirectory,
  pluginMarketplace,
  readMarketplace,
  resolveMarketplacePlugins,
} from "./plugins";
import { projectRowsFor, unbound } from "./project-placements";
import { resolveSkill } from "./skills";
import { unreachable } from "./unreachable";
import type { HubSocket } from "./wire-socket";

/**
 * How long a session is given to take fleet MCP changes and say what each
 * came to (core `CONTROL_MCP_FLEET_CHANGED`): Claude Code's take waits on
 * the takes before it, connects the servers it lacks and redials the rest,
 * each a connect of up to a minute (agent mcp-status.ts `MCP_CONNECT_MS`).
 * Past it, a connect ask waiting on the take says its machine did not say.
 */
export const FLEET_MCP_TAKE_MS = 150_000;

/** A session's answer to a fleet MCP take or heal, as connect asks read it: its servers, or none. */
export const tookOf = (answer: Bounded<ControlResult>): FleetMcpTook => {
  const servers =
    answer.kind === "answered" && answer.value.ok
      ? (answer.value.result as Partial<FleetMcpTakeAnswer> | undefined)
          ?.servers
      : undefined;
  return servers ? { kind: "taken", servers } : { kind: "unanswered" };
};
/** How often the hub reads every skill's and plugin's source for an update. */
export const UPDATE_CHECK_MS = 6 * HOUR_MS;

/** The answer, read off the wire: a malformed set is no set. */
const peekMemoryFile = (result: unknown): MachineMemory => {
  if (typeof result !== "object" || result === null) {
    return null;
  }
  const { content, hash, docs } = result as {
    content?: unknown;
    hash?: unknown;
    docs?: unknown;
  };
  if (
    typeof content !== "string" ||
    typeof hash !== "string" ||
    !Array.isArray(docs)
  ) {
    return null;
  }
  const read = docs.flatMap((doc: unknown) => {
    if (typeof doc !== "object" || doc === null) {
      return [];
    }
    const { path, content: text, hash: of } = doc as Record<string, unknown>;
    return typeof path === "string" &&
      typeof text === "string" &&
      typeof of === "string"
      ? [{ path, content: text, hash: of }]
      : [];
  });
  return { content, hash, docs: read };
};
/**
 * What a skill fetch came to for the machines: the fleet's copy changed
 * (they were told), stayed as it was, or the fetch failed.
 */
type SkillFetch = "changed" | "same" | "failed";

export type FleetSourcesContext = Pick<
  HubContext,
  | "asRead"
  | "awaitReply"
  | "callAgent"
  | "connectAsks"
  | "db"
  | "fleetMcp"
  | "fleetSyncs"
  | "lifetime"
  | "machineName"
  | "mcpChanges"
  | "ownMachineIdRead"
  | "readAgent"
  | "readSkillFolder"
  | "registry"
  | "sendAnswerable"
  | "sendFrame"
  | "toolsMayHaveChanged"
  | "unansweredStatus"
>;

export const createFleetSources = (ctx: FleetSourcesContext) => {
  /**
   * What the fleet's harnesses on `machineId` are to hold (NEW.md §11), as
   * items (core fleet-items.ts): every MCP server, marketplace, plugin,
   * skill, memory document and hook, the policy (the fleet's denied tools)
   * among them, and the rows of each project the machine holds, once each
   * (project-placements.ts): every project with a checkout there or a work
   * item there, since a workspace can be cut on a machine where its project
   * has no checkout (`targetMachine` takes any `cwd`; a gate workspace
   * falls back to `projectRepository`). The machine places them at the
   * project's places itself, so a workspace opened or archived there moves
   * no item. Built on demand from what the hub holds now, and fast: nothing
   * is read off the machine and nothing waited for (fleet-sync.ts diffs it
   * against what the machine acknowledged, so only what moved is sent).
   */
  const machineFleetItems = (machineId: string): FleetItems => {
    const config = ctx.db.fleetConfig();
    // A project's documents go with its rows alone.
    const { placedMemory: _projectDocs, ...fleetRows } = config;
    // A directory on the hub's disk names nothing on any other machine, so
    // only the hub's own machine links it; every other one is told which
    // marketplaces those are and installs their plugins from the bytes.
    const hubOnly =
      ctx.ownMachineIdRead === machineId
        ? new Set<string>()
        : new Set(
            config.marketplaces
              .filter(({ source }) => isHubDirectory(source))
              .map(({ name }) => name)
          );
    const hubErrors = new Map(
      hubOnly.size
        ? ctx.db
            .listPlugins()
            .flatMap(({ id, error }) => (error ? [[id, error] as const] : []))
        : []
    );
    const listed = ctx.db.listProjects();
    const places = listed.flatMap((project) => project.places);
    const areaOfProject = new Map(
      listed.map((project) => [project.id, project.areaId])
    );
    // A server scoped to platforms reaches only a machine of one of them,
    // by whichever of its reports came first (core `machinePlatform`: its
    // capabilities, else its register's `os`); any other is not sent it, so
    // its agent removes what it had and probes nothing.
    const targetRow = ctx.db
      .listAgents()
      .find((agentRow) => agentRow.machineId === machineId);
    const platform = targetRow ? machinePlatform(targetRow) : undefined;
    const mcpRows = config.mcp.filter((row) => mcpRunsOn(row, platform));
    return fleetItemsOf(
      ctx.fleetMcp.syncConfig(
        {
          ...fleetRows,
          // The fleet's own, for every folder; each project's apart, below.
          skills: unbound(config.skills),
          hubOnlyMarketplaces: [...hubOnly],
          // What the hub could not carry of a hub-only marketplace reaches
          // that machine no other way, so the hub's reason goes with the row.
          plugins: config.plugins.map((plugin) => {
            const error = hubErrors.get(plugin.id);
            return error && hubOnly.has(pluginMarketplace(plugin.id))
              ? { ...plugin, error }
              : plugin;
          }),
          mcp: unbound(mcpRows),
          hooks: unbound(config.hooks),
          // The fleet's Claude Code settings, OpenCode plugins and pi
          // extensions; a project's go with its rows.
          harnessConfig: unbound(config.harnessConfig),
          // Each project's rows, once, for the machine to place at each of
          // its places there.
          projects: projectRowsFor(
            { ...config, mcp: mcpRows },
            new Set([
              ...places
                .filter(
                  (place) =>
                    place.machineId === machineId && place.kind === "checkout"
                )
                .map((place) => place.projectId),
              ...ctx.db.projectsWorkedOn(machineId),
            ]),
            places,
            machineId,
            (projectId) => areaOfProject.get(projectId) ?? null
          ),
        },
        hubHttpUrl()
      )
    );
  };

  /**
   * A machine that just converged wrote new skill files and plugin installs
   * under sessions that are already running. The SDK picks both up without a
   * restart — `reloadSkills`/`reloadPlugins` on the session's Query — so every
   * live session on that machine is told when its reported content hashes move,
   * and a skill adopted from the rail is usable in the session that adopted
   * it seconds later (user, 2026-08-08). Fire-and-forget: a session racing
   * shutdown answers with an error nobody is waiting on.
   *
   * `reloadSkills`/`reloadPlugins` are Claude Code Query methods; a harness
   * with no such verb (opencode, pi) answers with an error that reads as a
   * session failure, so only a claude session — and a legacy row whose
   * `harness` predates the rework and is therefore claude — is told.
   *
   * A changed hook report adds `reinitialize` — the SDK `Query`
   * method that actually re-reads settings, hooks included, rather than only
   * the two narrower things the other verbs cover. It is heavier than a
   * reload, so it is sent only when this sync's report says the hook set on
   * this machine is not the report's own last one; every other sync leaves a
   * running session's hooks exactly as they were, which is correct, because
   * they have not changed.
   */
  const refreshSessions = (
    machineId: string,
    agent: HubSocket,
    methods: readonly string[]
  ): void => {
    if (methods.length === 0) {
      return;
    }
    for (const row of ctx.db.liveInstancesOn(machineId)) {
      if (row.harness && !traitsOf(row.harness).liveSkillReload) {
        continue;
      }
      for (const method of methods) {
        const requestId = crypto.randomUUID();
        const payload: ControlPayload = {
          instanceId: row.id,
          requestId,
          method,
          args: [],
        };
        ctx.sendFrame(agent, {
          verb: "control",
          machineId,
          instanceId: row.id,
          requestId,
          payload,
        } satisfies Envelope<ControlPayload>);
      }
    }
  };

  /**
   * The fleet MCP changes a landed sync carried, to every live session on
   * that machine: each takes them in place, conversation and all, and its
   * harness says on the machine what it did with each. What a session's
   * take came to answers its connect asks waiting on a sign-in among them
   * (connect-asks.ts `taking`): their calls end only once the session holds
   * the server's tools, or says why not.
   */
  const sendMcpChanges = (
    machineId: string,
    riding: RidingChanges | undefined
  ): void => {
    const changes = riding ? ctx.mcpChanges.landed(machineId, riding) : [];
    if (changes.length === 0) {
      return;
    }
    const live = ctx.db.liveInstancesOn(machineId);
    console.info(
      `[fleet-mcp] ${ctx.machineName(machineId)}: ${changes.map(({ name, kind }) => `${name} ${kind}`).join(", ")} → ${live.length} live session${live.length === 1 ? "" : "s"}`
    );
    for (const row of live) {
      const took = ctx.connectAsks.taking(row.id, changes);
      detach(
        ctx
          .callAgent(
            machineId,
            CONTROL_MCP_FLEET_CHANGED,
            [changes],
            FLEET_MCP_TAKE_MS,
            undefined,
            row.id
          )
          .then((answer) => took?.(tookOf(answer))),
        `fleet MCP take in ${row.id}`
      );
    }
  };

  /**
   * One machine's own user CLAUDE.md, whoever wrote it. A peek is this alone,
   * adopting is this and a store, and an overwrite is this so the copy it is
   * about to destroy is kept before it goes. `set`: the asking route's, which
   * names the machine when it is away ({@link awayStatus}).
   */
  /** A file a machine's agent reads for `method`, or why it could not be read. */
  const readOffMachine = async <Copy>(
    machineId: string,
    method: string,
    args: unknown[],
    set: RouteSet,
    copyOf: (result: unknown) => Copy,
    failed: string
  ): Promise<{ ok: true; copy: Copy } | ReadRefused> => {
    const answer = await ctx.readAgent(
      machineId,
      method,
      args,
      READ_TIMEOUT_MS
    );
    switch (answer.kind) {
      case "unanswered":
        return { ok: false, ...ctx.unansweredStatus(set, machineId, answer) };
      case "answered":
        return answer.value.ok
          ? { ok: true, copy: copyOf(answer.value.result) }
          : { ok: false, code: 500, said: answer.value.error ?? failed };
      default:
        throw unreachable(answer);
    }
  };

  const readMachineMemory = (
    machineId: string,
    set: RouteSet
  ): Promise<MemoryRead> =>
    readOffMachine(
      machineId,
      READ_MEMORY_FILE,
      [],
      set,
      peekMemoryFile,
      "the machine could not read its memory"
    );

  /**
   * One fleet hook's script as one machine has it on disk. A compare is this
   * alone; adopting is this and a store. `set` as {@link readMachineMemory}'s.
   */
  const readMachineHookScript = (
    machineId: string,
    id: string,
    set: RouteSet
  ): Promise<{ ok: true; copy: MachineHookScript | null } | ReadRefused> =>
    readOffMachine(
      machineId,
      READ_HOOK_SCRIPT,
      [id],
      set,
      (result) => result as MachineHookScript | null,
      "the machine could not read the hook's script"
    );

  /** The version about to be replaced, kept — a save is not a way to lose one. */
  const keepReplacedMemory = (content: string): void => {
    const current = ctx.db.getFleetMemory();
    if (current && current.content !== content) {
      ctx.db.recordFleetMemory({
        content: current.content,
        hash: current.hash,
        source: "fleet",
      });
    }
  };

  /** The same for one linked document, under its own path in the history. */
  const keepReplacedDoc = (path: string, content: string): void => {
    const current = ctx.db.getFleetMemoryDoc(path);
    if (current && current.content !== content) {
      ctx.db.recordFleetMemory({
        content: current.content,
        hash: current.hash,
        source: "fleet",
        path,
      });
    }
  };

  /**
   * The main file or a document leaving the fleet, kept in its history —
   * nothing else has a copy of it once the trash lets it go.
   */
  const keepRemovedMemory = (row: {
    path?: string;
    content: string;
    hash: string;
  }): void => {
    ctx.db.recordFleetMemory({
      content: row.content,
      hash: row.hash,
      source: "fleet",
      ...(row.path === undefined ? {} : { path: row.path }),
    });
  };

  /**
   * The version of a hook that a save, an edit or a delete is about to
   * replace or destroy — kept before it goes, the same moment a memory
   * document's version is, with `fleet` its source (a forced push keeps a
   * machine's edited script as `machine:<machineId>` itself).
   */
  const keepHookVersion = (hook: FleetHook): void => {
    ctx.db.recordFleetHook({
      hookId: hook.id,
      name: hook.name,
      enabled: hook.enabled,
      event: hook.event,
      matcher: hook.matcher,
      handler: hook.handler,
      script: hook.script,
      hash: hook.hash,
      scope: hook.scope,
      projectId: hook.projectId,
      source: "fleet",
    });
  };

  /**
   * Machines the subagents could not be written to, by machineId → why. Read
   * back in the fleet response, so a definition that is going nowhere says so
   * on the page rather than only in a log.
   */
  const unpushable = new Map<string, string>();

  /**
   * Writes one file on a machine over the `fs` verb. The daemon answers a write
   * with a `control_result` frame, exactly as it answers a control call, so the
   * same `waiting` map routes the reply and no dashboard is broadcast a write
   * it never asked for.
   */
  const callFs = (
    machineId: string,
    agent: HubSocket,
    op: Omit<FsPayload, "requestId">
  ): Promise<Bounded<ControlResult>> => {
    const requestId = crypto.randomUUID();
    const payload: FsPayload = { requestId, ...op };
    return ctx.awaitReply(machineId, requestId, READ_TIMEOUT_MS, () =>
      ctx.sendAnswerable(agent, {
        verb: "fs",
        machineId,
        requestId,
        payload,
      } satisfies Envelope<FsPayload>)
    );
  };

  /**
   * One picture or video off a machine's disk, read the moment someone looks
   * at it: the transcript card points at the path an agent named, and
   * nothing is copied anywhere in between. A file the
   * machine will not hand over (moved, not a picture or video, over the size
   * limit) answers with the machine's own reason.
   */
  const readMachineMedia = async (
    machineId: string,
    path: string
  ): Promise<
    | { bytes: Uint8Array<ArrayBuffer>; mediaType: string }
    | "offline"
    | "timeout"
    | { refused: string }
  > => {
    const agent = ctx.registry.agent(machineId);
    if (!agent) {
      return "offline";
    }
    const answer = ctx.asRead(
      await callFs(machineId, agent, { op: "media", path })
    );
    // Its own words for no answer: "offline", "timeout".
    switch (answer.kind) {
      case "unanswered":
        return answer.reason === "dead" ? "offline" : "timeout";
      case "answered":
        if (!answer.value.ok) {
          return {
            refused: answer.value.error ?? `${path} could not be read`,
          };
        }
        break;
      default:
        throw unreachable(answer);
    }
    const { base64, mediaType } = answer.value.result as FsMedia;
    // Copied into a fresh ArrayBuffer-backed view: a Buffer's `ArrayBufferLike`
    // backing is not what `Response` and `Blob` accept as a body.
    const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
    return { bytes, mediaType };
  };

  /**
   * Writes every fleet subagent into the user layer's `agents/` on one machine
   * (NEW.md §11). Claude Code re-scans that directory within seconds, so a
   * definition saved here is delegatable out there without anything being
   * restarted.
   *
   * Every reconnect resends definitions without an extra read round-trip. The
   * daemon skips identical bytes locally before writing or invalidating cache.
   *
   * Phase B: `syncFleetConfig` gets the agents and the daemon owns convergence
   * — and with it removal, which a verb of list/read/write cannot do.
   */
  const pushAgents = async (machineId: string): Promise<void> => {
    const agent = ctx.registry.agent(machineId);
    const files = ctx.db.listFleetAgents();
    if (!agent || files.length === 0) {
      return;
    }

    for (const file of files) {
      const answer = await callFs(machineId, agent, {
        op: "write",
        root: "claude-home",
        path: `agents/${file.name}.md`,
        content: file.content,
      });
      switch (answer.kind) {
        case "unanswered":
          unpushable.set(
            machineId,
            `the machine did not answer the write within ${secondsOf(answer.after)} s`
          );
          return;
        case "answered":
          if (!answer.value.ok) {
            unpushable.set(
              machineId,
              answer.value.error ?? "the machine refused the write"
            );
            return;
          }
          break;
        default:
          throw unreachable(answer);
      }
    }
    unpushable.delete(machineId);
  };

  /** A definition changed: every machine that is online takes it now. */
  /**
   * Why a write naming `expectedHash` may not land on subagent `name`: the
   * stored file when it moved since that read or when "" asked for a new one
   * under a taken name (409), a sentence when the read file is gone (404).
   * Undefined when it may, or when no hash was named (the dashboard's save).
   */
  const agentMoved = (
    name: string,
    expectedHash: string | undefined
  ):
    | { answer: FleetAgent; status: 409 }
    | { answer: string; status: 404 }
    | undefined => {
    if (expectedHash === undefined) {
      return;
    }
    const current = ctx.db.listFleetAgents().find((row) => row.name === name);
    if (!current) {
      return expectedHash === ""
        ? undefined
        : { status: 404, answer: `the fleet keeps no subagent ${name}` };
    }
    return current.hash === expectedHash
      ? undefined
      : { status: 409, answer: current };
  };

  const fanOutAgents = (): void => {
    for (const machineId of ctx.registry.machineIds()) {
      detach(pushAgents(machineId), "agent push");
    }
  };

  /** The fleet changed: every machine that is online converges now, not on its next reconnect. */
  /**
   * Fetches the plugins the fleet wants, once, here.
   *
   * A plugin used to be a name each machine resolved for itself by running
   * `claude plugin install`, which goes to the network — so an install depended
   * on that machine's credentials, on the upstream repository still being there
   * and still being public, and on the moment it happened to run. None of those
   * are properties of the fleet, and two machines could satisfy the same row
   * with different code and both report `applied`.
   *
   * So the bytes are resolved here and stored, and sync carries them. What
   * cannot be resolved keeps its sentence on the row, and the last files that
   * worked when it had some (`putPluginPayload`); one that never had files is
   * left to the old path, which is the only one that still needs a machine to
   * reach github.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: groups ids by marketplace, resolves each group, and stores every outcome (resolved or errored) in one place; splitting it would scatter the per-marketplace fallback this depends on.
  const resolvePlugins = async (ids: readonly string[]): Promise<void> => {
    if (ids.length === 0) {
      return;
    }
    const sources = new Map(
      ctx.db
        .fleetConfig()
        .marketplaces.map(({ name, source }) => [name, source])
    );

    const byMarketplace = new Map<string, string[]>();
    for (const id of ids) {
      const marketplace = id.split("@")[1] ?? "";
      byMarketplace.set(marketplace, [
        ...(byMarketplace.get(marketplace) ?? []),
        id,
      ]);
    }

    for (const [marketplace, wanted] of byMarketplace) {
      const source = sources.get(marketplace);
      if (!source) {
        for (const id of wanted) {
          ctx.db.putPluginPayload({
            id,
            error: `no marketplace called ${marketplace} in this fleet`,
          });
        }
        continue;
      }
      const resolved = await resolveMarketplacePlugins(
        marketplace,
        source,
        wanted.map((id) => id.split("@")[0] ?? id)
      );
      for (const plugin of resolved) {
        const id = `${plugin.name}@${marketplace}`;
        if ("error" in plugin) {
          ctx.db.putPluginPayload({ id, error: plugin.error });
        } else {
          ctx.db.putPluginPayload({
            id,
            hash: plugin.hash,
            bytes: plugin.bytes,
            files: plugin.files,
            version: plugin.version,
          });
        }
      }
    }
  };

  /**
   * The one way a fleet change reaches the machines: each ready machine is
   * sent the items that moved for it, 250 ms after the last change, and one
   * whose items did not move is sent nothing (fleet-sync.ts).
   */
  const fleetChanged = (why = "the fleet changed"): void => {
    ctx.toolsMayHaveChanged();
    ctx.fleetSyncs.changed(why);
  };

  /**
   * The skill and plugin fetches running at the hub, by `skill:<name>` and
   * `plugin:<id>`. A fetch never runs inside the request that asked for it: a
   * large repo's download outlasts any HTTP idle timeout, so the request
   * answers with the row marked `fetching` and the outcome reaches every
   * dashboard as a `fleet.fetch` frame. A second ask for a row already being
   * fetched joins the fetch under way.
   */
  const fetches = new Map<string, Promise<unknown>>();
  /** What an ambiguous source's last fetch could have meant, by skill name. */
  const skillChoices = new Map<string, string[]>();

  /** A skill row as the dashboard reads it: the stored row, and its fetch. */
  const skillRow = (row: FleetSkillMeta): FleetSkillMeta => {
    const choices = skillChoices.get(row.name);
    return {
      ...row,
      ...(fetches.has(`skill:${row.name}`) ? { fetching: true } : {}),
      ...(choices ? { choices } : {}),
    };
  };
  /** A plugin row as the dashboard reads it: the stored row, and its fetch. */
  const pluginRow = (row: FleetPlugin): FleetPlugin =>
    fetches.has(`plugin:${row.id}`) ? { ...row, fetching: true } : row;

  const announceFetch = (news: FetchNews): void => {
    ctx.registry.broadcast({
      verb: "frames",
      machineId: "hub",
      payload: { kind: "fleet.fetch", ...news },
    });
    heardFetch(news);
  };

  const REMOVED_WHILE_FETCHING = "Removed while it was being fetched.";

  /** Says how a skill's fetch stands now; a row removed meanwhile says so. */
  const announceSkill = (name: string, source: string): void => {
    const row = ctx.db.listSkills().find((skill) => skill.name === name);
    announceFetch(
      row
        ? { skill: skillRow(row) }
        : {
            skill: {
              name,
              source,
              enabled: false,
              error: REMOVED_WHILE_FETCHING,
            },
            removed: true,
          }
    );
  };

  /**
   * Stores what a fetch of a skill or plugin came to: whether its source
   * moved on, held what the fleet has, or failed (`lastRefresh`, only for a
   * row that had files from that same source), and, when it fetched, what
   * the source holds now, so a refresh also answers the update check (a
   * source not read for updates, {@link watched}, records none). Answers
   * whether the fleet's copy changed, the only news for the machines.
   */
  const noteFetch = (
    row: { skill: string } | { plugin: string },
    before: FetchedCopy,
    after: FetchedCopy,
    error: string | undefined
  ): boolean => {
    const at = Date.now();
    const lastRefresh =
      before.source === after.source
        ? refreshOf(before, after, error, at)
        : undefined;
    ctx.db.noteSource(row, {
      lastRefresh: lastRefresh ?? null,
      ...(watched(row) && error === undefined
        ? { checked: { at, hash: after.hash, version: after.version } }
        : {}),
    });
    const what = "skill" in row ? `skill ${row.skill}` : `plugin ${row.plugin}`;
    console.log(
      `[hub] ${what}: ${lastRefresh?.outcome ?? "fetched"}${error === undefined ? "" : ` (${error})`}`
    );
    return after.hash !== before.hash;
  };

  /** A fetch changed the fleet's copy of `what`: every machine is told. */
  const fanOutFetched = (what: string): void => {
    console.log(
      `[hub] ${what}: the fleet's copy changed; telling the machines`
    );
    fleetChanged();
  };

  /**
   * Fetches a skill's source at the hub and stores what came of it, announced
   * as it starts and as it lands. The machines are told only when the fleet's
   * copy changed. Resolves once it has landed with what came of it (absent
   * when the row went meanwhile); never rejects.
   */
  const fetchSkill = (
    name: string,
    source: string
  ): Promise<SkillFetch | undefined> => {
    const key = `skill:${name}`;
    const running = fetches.get(key);
    if (running !== undefined) {
      return running as Promise<SkillFetch | undefined>;
    }
    skillChoices.delete(name);
    const work = (async (): Promise<SkillFetch | undefined> => {
      const resolved = await resolveSkill(
        source,
        ctx.db.heldSkillNames(name),
        ctx.readSkillFolder
      );
      const stored = ctx.db.listSkills().find((skill) => skill.name === name);
      if (!stored) {
        return;
      }
      const after = ctx.db.putSkill({
        name,
        source,
        enabled: stored.enabled,
        ...("error" in resolved
          ? { error: resolved.error }
          : {
              hash: resolved.hash,
              bytes: resolved.bytes,
              files: resolved.files,
            }),
      });
      if ("choices" in resolved && resolved.choices) {
        skillChoices.set(name, resolved.choices);
      } else {
        skillChoices.delete(name);
      }
      const error = "error" in resolved ? resolved.error : undefined;
      const changed = noteFetch({ skill: name }, stored, after, error);
      if (error !== undefined) {
        return "failed";
      }
      // Nothing on any machine changed unless the fleet's copy did.
      if (changed) {
        fanOutFetched(`skill ${name}`);
        return "changed";
      }
      return "same";
    })()
      .catch((error: unknown): undefined => {
        console.warn(
          `[hub] skill ${name}: fetch from ${source} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      })
      .finally(() => {
        fetches.delete(key);
        announceSkill(name, source);
      });
    fetches.set(key, work);
    announceSkill(name, source);
    return work;
  };

  /**
   * Fetches plugins at the hub, as {@link fetchSkill} does a skill; resolves
   * with whether any fleet copy changed, which is news for the machines.
   * Each row that had files records what its fetch came to, and each that
   * came to files what its source holds now.
   */
  const fetchPlugins = async (ids: readonly string[]): Promise<boolean> => {
    const fresh = ids.filter((id) => !fetches.has(`plugin:${id}`));
    const joined = ids
      .filter((id) => fetches.has(`plugin:${id}`))
      .map((id) => fetches.get(`plugin:${id}`));
    const announce = (id: string): void => {
      const row = ctx.db.listPlugins().find((plugin) => plugin.id === id);
      announceFetch(
        row
          ? { plugin: pluginRow(row) }
          : {
              plugin: { id, enabled: false, error: REMOVED_WHILE_FETCHING },
              removed: true,
            }
      );
    };
    const before = new Map(
      ctx.db
        .listPlugins()
        .filter((plugin) => fresh.includes(plugin.id))
        .map((plugin) => [plugin.id, plugin])
    );
    const work = resolvePlugins(fresh)
      .then(() =>
        ctx.db
          .listPlugins()
          .flatMap((after) => {
            const was = before.get(after.id);
            return was
              ? [noteFetch({ plugin: after.id }, was, after, after.error)]
              : [];
          })
          .includes(true)
      )
      .catch((error: unknown) => {
        console.warn(
          `[hub] plugins ${fresh.join(", ")}: fetch failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return false;
      });
    for (const id of fresh) {
      fetches.set(`plugin:${id}`, work);
      announce(id);
    }
    const changed = await work;
    for (const id of fresh) {
      fetches.delete(`plugin:${id}`);
      announce(id);
    }
    await Promise.all(joined);
    return changed;
  };

  /** Marketplace sources being read at the hub, by source. */
  const marketplaceReads = new Map<string, Promise<MarketplaceRead>>();

  /**
   * Reads a marketplace source at the hub — what it calls itself and what it
   * offers — announced as it starts and as it lands, as {@link fetchSkill}
   * is. A second read of a source joins the one under way. Never rejects: a
   * read that failed carries its sentence.
   */
  const readMarketplaceSource = (source: string): Promise<MarketplaceRead> => {
    const running = marketplaceReads.get(source);
    if (running !== undefined) {
      return running;
    }
    const work = readMarketplace(source)
      .then(
        ({ name, plugins }): MarketplaceRead => ({ source, name, plugins }),
        (error: unknown): MarketplaceRead => ({
          source,
          error: error instanceof Error ? error.message : String(error),
        })
      )
      .then((read) => {
        marketplaceReads.delete(source);
        announceFetch({ marketplace: read });
        return read;
      });
    marketplaceReads.set(source, work);
    announceFetch({ marketplace: { source, fetching: true } });
    return work;
  };

  /**
   * Marketplace links that have no row yet, by source: under way
   * (`fetching`), or refused (`error`). A refused one stands, said in the
   * dashboard's marketplace list, until it is tried again or let go
   * (`DELETE /api/fleet/marketplace-links`); a landed one leaves, its row the
   * list's own. Kept in memory: a hub that starts again has dropped the read.
   */
  const marketplaceLinks = new Map<string, MarketplaceLink>();

  /** What a landed read of `source` comes to as a link: the row it linked, or why not. */
  const linkRead = (read: MarketplaceRead): MarketplaceLink => {
    const { source, name } = read;
    if (!name) {
      return { source, error: read.error ?? `${source} could not be read` };
    }
    const existing = ctx.db
      .fleetConfig()
      .marketplaces.find((row) => row.name === name);
    if (existing && existing.source !== source) {
      return {
        source,
        error: `A marketplace called ${name} is already linked, from ${existing.source}. A machine holds one marketplace per name.`,
      };
    }
    const marketplace = ctx.db.putMarketplace({ name, source });
    fleetChanged();
    return { source, marketplace };
  };

  /**
   * Links the marketplace at `source` under the name its manifest gives,
   * once it has been read; the link's outcome is a `fleet.fetch` frame. A
   * second link of a source joins the one under way.
   */
  const linkMarketplace = (source: string): MarketplaceLink => {
    if (!marketplaceLinks.get(source)?.fetching) {
      marketplaceLinks.set(source, { source, fetching: true });
      announceFetch({ link: { source, fetching: true } });
      detach(
        readMarketplaceSource(source).then((read) => {
          let link: MarketplaceLink;
          try {
            link = linkRead(read);
          } catch (error) {
            link = {
              source,
              error: error instanceof Error ? error.message : String(error),
            };
          }
          if (link.error === undefined) {
            marketplaceLinks.delete(source);
          } else {
            marketplaceLinks.set(source, link);
          }
          announceFetch({ link });
        }),
        "marketplace link"
      );
    }
    return { source, fetching: true };
  };

  /** Lets a refused link go: it was read, and nobody will try it again. */
  const dropMarketplaceLink = (source: string): boolean => {
    const held = marketplaceLinks.get(source);
    if (held === undefined || held.fetching) {
      return false;
    }
    marketplaceLinks.delete(source);
    announceFetch({ link: { source }, removed: true });
    return true;
  };

  // Every row the hub holds no bytes for, plugin or skill: never fetched, or
  // fetched and failed, or staged by a fetch a restart cut short. Done once at
  // boot rather than on every sync: a resolved row is bytes the fleet already
  // agrees on, and re-fetching it would be a download per restart for a file
  // nobody asked to change. A failed one is tried again so the sentence on it
  // is this hub's, in this hub's words, and a source that came back heals with
  // nobody pressing refresh. An adopted skill's source is a machine, which is
  // not fetched from here.
  // Boot does not stall on network fetches for rows that were already unresolved.
  // Each step after an await asks whether the hub closed meanwhile: a hub
  // built and closed at once (scripts/openapi.ts, the role budgets) would
  // otherwise have it write to a database already closed ("Cannot use a
  // closed database"), and nothing a hub scheduled runs after its close
  // (lifetime.ts).
  const reresolveFailed = async (): Promise<void> => {
    if (ctx.lifetime.closed()) {
      return;
    }
    const fetched = await fetchPlugins(ctx.db.unresolvedPlugins());
    if (ctx.lifetime.closed()) {
      return;
    }
    if (fetched) {
      fleetChanged();
    }
    const unfetched = ctx.db
      .listSkills()
      .filter(
        (skill) =>
          (skill.error || !skill.hash) && !skill.source.startsWith("machine:")
      );
    for (const stored of unfetched) {
      if (ctx.lifetime.closed()) {
        return;
      }
      await fetchSkill(stored.name, stored.source);
    }
  };
  /**
   * Every marketplace row under the name its manifest gives. A row linked
   * before the hub read that name carries whatever the operator typed
   * ("humanlayer-skills" for humanlayer/skills, which calls itself "skills"),
   * and no machine can find a marketplace under it: Claude Code registers it,
   * clones it and installs its plugins by the manifest's name. Its plugin ids
   * move with it. A source that cannot be read keeps its row as it is, said in
   * the log.
   */
  const nameMarketplacesByManifest = async (): Promise<void> => {
    let moved = false;
    for (const { name, source } of ctx.db.fleetConfig().marketplaces) {
      const read = await readMarketplaceSource(source);
      if (ctx.lifetime.closed()) {
        return;
      }
      const own = read.name;
      if (!own) {
        console.warn(
          `[hub] marketplace ${name}: could not read its name from ${source}: ${read.error}`
        );
        continue;
      }
      if (own === name) {
        continue;
      }
      const ids = ctx.db.renameMarketplace(name, own);
      console.log(
        `[hub] marketplace ${name} renamed to ${own}, the name its marketplace.json gives${ids.length ? `; plugins ${ids.map(([from, to]) => `${from} → ${to}`).join(", ")}` : ""}`
      );
      moved = true;
    }
    if (moved) {
      fleetChanged();
    }
  };
  /**
   * Whether a row's source is read for updates: not an adopted skill's
   * machine, which has no upstream, not a skill folder on a machine
   * (`file://`), which a reinstall or refresh reads again, and not a source
   * on a loopback host (core `isLoopbackSource`), a server stood up once to
   * install from.
   */
  const watched = (row: { skill: string } | { plugin: string }): boolean => {
    const source =
      "skill" in row
        ? ctx.db.skillSource(row.skill)
        : marketplaceSource(row.plugin.split("@")[1] ?? "");
    return (
      source !== undefined &&
      !source.startsWith("machine:") &&
      !source.startsWith("file:") &&
      !isLoopbackSource(source)
    );
  };

  /**
   * A row whose source is not read for updates keeps nothing an earlier read
   * left on it (what it held, why it failed), so it says nothing of updates.
   */
  const unwatch = (
    row: { skill: string } | { plugin: string },
    held: FleetVersioned
  ): void => {
    if (
      held.checkedAt === undefined &&
      held.checkError === undefined &&
      held.latestHash === undefined
    ) {
      return;
    }
    ctx.db.noteSource(row, { checked: null });
    if ("skill" in row) {
      const skill = ctx.db.listSkills().find((one) => one.name === row.skill);
      if (skill) {
        announceSkill(skill.name, skill.source);
      }
      return;
    }
    const plugin = ctx.db.listPlugins().find((one) => one.id === row.plugin);
    if (plugin) {
      announceFetch({ plugin: pluginRow(plugin) });
    }
  };

  /** The update check under way, if one is. */
  let checking: Promise<void> | undefined;

  /** What one read of a source found, as a row's `checked` note keeps it. */
  const checkedOf = (
    read: { error: string } | { hash: string; version?: string }
  ): NonNullable<SourceNote["checked"]> =>
    "error" in read
      ? { at: Date.now(), error: read.error }
      : { at: Date.now(), hash: read.hash, version: read.version };

  /**
   * A turn of the loop between two rows of a source check: each row's note
   * rewrites its row, files and all (megabytes for a plugin), so a pass
   * over the fleet's rows in one go held the hub 630 ms as it started
   * (measured on a copy of the live database, 2026-10-24).
   */
  const sourceTurn = (): Promise<void> =>
    new Promise<void>((resolve) => setImmediate(resolve));

  /** {@link checkSources}' skills: one source at a time. */
  const checkSkillSources = async (): Promise<void> => {
    for (const row of ctx.db.listSkills()) {
      await sourceTurn();
      if (ctx.lifetime.closed()) {
        return;
      }
      if (fetches.has(`skill:${row.name}`)) {
        continue;
      }
      if (!watched({ skill: row.name })) {
        unwatch({ skill: row.name }, row);
        continue;
      }
      // One source at a time, so GitHub is not hit in a burst.
      const resolved = await resolveSkill(
        row.source,
        ctx.db.heldSkillNames(row.name),
        ctx.readSkillFolder
      );
      if (ctx.lifetime.closed()) {
        return;
      }
      ctx.db.noteSource(
        { skill: row.name },
        {
          checked: checkedOf(
            "error" in resolved
              ? resolved
              : { hash: resolved.hash, version: skillVersion(resolved.files) }
          ),
        }
      );
      announceSkill(row.name, row.source);
    }
  };

  /** The fleet's plugins not being fetched now, by the marketplace each comes from. */
  const pluginsByMarketplace = (): Map<string, string[]> => {
    const grouped = new Map<string, string[]>();
    for (const { id } of ctx.db.listPlugins()) {
      if (!fetches.has(`plugin:${id}`)) {
        const marketplace = id.split("@")[1] ?? "";
        grouped.set(marketplace, [...(grouped.get(marketplace) ?? []), id]);
      }
    }
    return grouped;
  };

  /** Where the fleet's marketplace `marketplace` comes from, if it links one. */
  const marketplaceSource = (marketplace: string): string | undefined =>
    ctx.db.marketplaceSource(marketplace);

  /** What `marketplace`'s source holds now for the plugins named `names`. */
  const readPluginSource = (
    marketplace: string,
    names: string[]
  ): Promise<ResolvedPlugin[]> => {
    const source = marketplaceSource(marketplace);
    return source
      ? resolveMarketplacePlugins(marketplace, source, names)
      : Promise.resolve(
          names.map((name) => ({
            name,
            error: `no marketplace called ${marketplace} in this fleet`,
          }))
        );
  };

  /** What a read of `marketplace` found, noted on each plugin's row, one row a turn ({@link sourceTurn}). */
  const notePluginSources = async (
    marketplace: string,
    found: ResolvedPlugin[]
  ): Promise<void> => {
    for (const plugin of found) {
      await sourceTurn();
      if (ctx.lifetime.closed()) {
        return;
      }
      const id = `${plugin.name}@${marketplace}`;
      ctx.db.noteSource({ plugin: id }, { checked: checkedOf(plugin) });
      const row = ctx.db.listPlugins().find((entry) => entry.id === id);
      if (row) {
        announceFetch({ plugin: pluginRow(row) });
      }
    }
  };

  /** {@link checkSources}' plugins: one marketplace, every plugin of it, at a time. */
  const checkPluginSources = async (): Promise<void> => {
    for (const [marketplace, ids] of pluginsByMarketplace()) {
      await sourceTurn();
      if (ctx.lifetime.closed()) {
        return;
      }
      if (!watched({ plugin: ids[0] ?? "" })) {
        for (const row of ctx.db
          .listPlugins()
          .filter((one) => ids.includes(one.id))) {
          unwatch({ plugin: row.id }, row);
        }
        continue;
      }
      const names = ids.map((id) => id.split("@")[0] ?? id);
      // One source at a time, so GitHub is not hit in a burst.
      const found = await readPluginSource(marketplace, names);
      if (ctx.lifetime.closed()) {
        return;
      }
      await notePluginSources(marketplace, found);
    }
  };

  /**
   * Reads every skill's and plugin's source for what it holds now, without
   * storing its files or telling the machines, and records on each row the
   * content hash and version it found, or why it could not read it
   * (FleetVersioned): a row whose source holds other content than the
   * fleet's copy has an update available. One source at a time, so a fleet
   * of GitHub sources is not a burst against its rate limit; a plugin
   * marketplace is one source for every plugin of it. An adopted skill's
   * source is a machine, which has no upstream to be newer. A row being
   * fetched is left to that fetch, which records what its source holds
   * itself. A second ask while one runs joins it.
   */
  const checkSources = (): Promise<void> => {
    if (checking !== undefined) {
      return checking;
    }
    announceFetch({ check: { fetching: true } });
    checking = checkSkillSources()
      .then(checkPluginSources)
      .then(() => {
        const due = [...ctx.db.listSkills(), ...ctx.db.listPlugins()].filter(
          (row) => row.updateAvailable
        ).length;
        console.log(
          `[hub] update check: ${due === 0 ? "every source holds what the fleet has" : `${due} with an update available`}`
        );
      })
      .catch((error: unknown) => {
        console.warn(
          `[hub] update check failed: ${error instanceof Error ? error.message : String(error)}`
        );
      })
      .finally(() => {
        checking = undefined;
        if (!ctx.lifetime.closed()) {
          announceFetch({ check: { fetching: false } });
        }
      });
    return checking;
  };

  /**
   * Whether a row's source has gone a whole check interval unread, so a hub
   * that restarts often still reads each source once per interval, not once
   * per start.
   */
  const checkDue = (): boolean =>
    [
      ...ctx.db.listSkills().filter((row) => watched({ skill: row.name })),
      ...ctx.db.listPlugins().filter((row) => watched({ plugin: row.id })),
    ].some(
      (row) =>
        row.checkedAt === undefined ||
        Date.now() - row.checkedAt >= UPDATE_CHECK_MS
    );

  return {
    machineFleetItems,
    refreshSessions,
    sendMcpChanges,
    readMachineMemory,
    readMachineHookScript,
    keepReplacedMemory,
    keepReplacedDoc,
    keepRemovedMemory,
    keepHookVersion,
    unpushable,
    callFs,
    readMachineMedia,
    pushAgents,
    agentMoved,
    fanOutAgents,
    fleetChanged,
    skillChoices,
    skillRow,
    pluginRow,
    announceSkill,
    noteFetch,
    fanOutFetched,
    fetchSkill,
    fetchPlugins,
    readMarketplaceSource,
    marketplaceLinks,
    linkMarketplace,
    dropMarketplaceLink,
    reresolveFailed,
    nameMarketplacesByManifest,
    checkSources,
    checkDue,
  };
};
