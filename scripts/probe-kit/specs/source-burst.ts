/**
 * The two legs of link-under-load that need no workspace to start, on a
 * scratch fleet (real hub, two machines' agents and sessionds on this
 * computer, the second reaching the hub through the kit's relay; Claude
 * Code against the mock model). Where this runs inside a workspace, each
 * delegate's create stops at its boundary (kit.ts `BOUNDARY_INSIDE`), after
 * the source repository was readied, which is what leg 1 reads.
 *
 * 1. Many workspaces at once from one repository, on both machines, whose
 *    places are the same checkout (agent workspace.ts `inSource`,
 *    `holdingSource`; git-credential.ts `useHubCredentialHelper`). No create
 *    is refused for the source's readying: on 2026-10-20 link-under-load
 *    lane 2 was, "git config in …/src failed: error: could not lock config
 *    file .git/config: File exists", the two agents rewriting the source's
 *    config side by side. The source then names the hub's credential helper
 *    once.
 * 2. A session on the second machine calls a CawCo tool while that
 *    machine's link to the hub is cut (agent mcp-oauth.ts `relayMcp`,
 *    hub-away.ts `throughHubAway`): the call is answered by the hub once the
 *    link is back, not refused at once. On 2026-10-20 link-under-load lane 1's
 *    `finish_item` came back "The CawCo hub could not be reached." 0.34 s
 *    into the cut, and its item failed three quiet turns later.
 *
 *   bun scripts/probe-kit/run.ts source-burst
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { relay } from "../relay";

/** The second machine, which reaches the hub through the relay. */
const OTHER = "source-burst-other";
/** Delegates at once, half on each machine. Ours: link-under-load's burst. */
const DELEGATES = 16;
/** What a create refused for its source's readying says (git's lock, a second `remote add`, a push raced). */
const READYING = ["could not lock config file", "already exists", "git config"];
/** How the leg-2 session's prompt names it, and nothing else does. */
const AWAY_TAG = "PROBE-SOURCE-BURST-AWAY";
const SET_TITLE = "mcp__cawco__set_title";
const TITLE = "Titled through the cut";
/** How long the second machine's link stays cut: link-under-load's. */
const CUT_MS = 3000;
/** What set_title answers once the hub has the title. */
const NAMED = `Named this session "${TITLE}"`;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** The relay, once up: the mock cuts it as it hands the leg-2 session its call. */
let between: ReturnType<typeof relay> | undefined;
/** When the cut began and ended, and what the call came back with. */
const leg2: { cutAt?: number; releasedAt?: number; answer?: Seen } = {};

const respond = (request: Seen): Reply => {
  if (!(request.tools && request.all.includes(AWAY_TAG))) {
    return text("ok");
  }
  if (request.afterTool) {
    leg2.answer ??= request;
    return text("ok");
  }
  if (leg2.cutAt !== undefined) {
    return text("ok");
  }
  if (!request.toolNames.includes(SET_TITLE)) {
    return text(`${SET_TITLE} is not offered`);
  }
  leg2.cutAt = Date.now();
  between?.cut();
  setTimeout(() => {
    between?.release();
    leg2.releasedAt = Date.now();
  }, CUT_MS);
  return {
    everyMs: 5,
    words: [],
    tool: { name: SET_TITLE, input: { title: TITLE } },
  };
};

const spec: Spec = {
  name: "source-burst",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    const home = fleet.env.HOME as string;
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    between = relay(fleet.base);
    await fleet.launchMachine(OTHER, {
      CAWCO_HUB_URL: `${between.url.replace("http", "ws")}/ws`,
    });
    const src = join(fleet.sandbox, "src");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`sh -c ${"git init -q -b main && echo burst > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Source burst",
      machineId: MACHINE,
      cwd: src,
    });
    await fleet.api(`/api/projects/${project.id}/places`, {
      machineId: OTHER,
      path: src,
    });
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });

    // 1. Every create at once, half on each machine.
    const calls = await Promise.allSettled(
      Array.from({ length: DELEGATES }, (_, lane) =>
        fleet.api("/api/work-items", {
          parentInstanceId: parent,
          title: `Source burst ${lane}`,
          prompt: "Say ok.",
          harness: "claude",
          model: "claude-haiku-4-5",
          cwd: src,
          lands: "none",
          ...(lane % 2 === 1 ? { machineId: OTHER } : {}),
        })
      )
    );
    const refusals = calls.flatMap((call, lane) =>
      call.status === "rejected" ? [`lane ${lane}: ${String(call.reason)}`] : []
    );
    const readying = refusals.filter((one) =>
      READYING.some((words) => one.includes(words))
    );
    check(
      `none of ${DELEGATES} creates at once from one checkout, on two machines, is refused for the source's readying`,
      readying.length === 0,
      `${DELEGATES - refusals.length} started, ${refusals.length} refused, ${readying.length} for the source's readying; ${(readying.length > 0 ? readying : refusals).join(" | ").slice(0, 1500)}`
    );
    const origin = (
      await Bun.$`git -C ${src} remote get-url origin`.quiet().nothrow()
    )
      .text()
      .trim();
    const helpers = (
      await Bun.$`git -C ${src} config --local --get-regexp ${"^credential\\..*\\.helper$"}`
        .quiet()
        .nothrow()
    )
      .text()
      .trim()
      .split("\n")
      .filter(Boolean);
    check(
      "the source's origin is the hub's remote, as one of the machines reaches it, and its config names the hub's credential helper once (the reset, then the helper)",
      [fleet.base, between.url].some((hub) =>
        origin.startsWith(`${hub}/git/`)
      ) && helpers.length === 2,
      `origin ${origin || "none"}; ${helpers.length} helper line(s): ${helpers.join(" | ").slice(0, 600)}`
    );

    // 2. A CawCo tool call while the second machine's link is cut.
    const away = await fleet.spawn(
      "claude",
      "Away call",
      src,
      { projectId: project.id },
      OTHER
    );
    await fleet.send(away, `${AWAY_TAG}: set your title.`, OTHER);
    const answered = await until(
      "the call made through the cut is answered",
      () => leg2.answer,
      Boolean,
      120_000
    ).catch(() => undefined);
    const named = fleet.query<{ title: string | null }>(
      "SELECT title FROM instances WHERE id = ?",
      away
    )[0]?.title;
    check(
      "a session's CawCo tool call made while its machine's link is cut is answered by the hub once the link is back",
      !!answered &&
        leg2.cutAt !== undefined &&
        answered.last.includes(NAMED) &&
        answered.at >= leg2.cutAt + CUT_MS &&
        named === TITLE,
      `cut ${leg2.cutAt === undefined ? "never" : `for ${CUT_MS} ms`}; answer ${answered ? `${answered.at - (leg2.cutAt ?? answered.at)} ms after the cut began: ${answered.last.slice(0, 300)}` : "none"}; the session's title: ${named ?? "none"}`
    );
    between.stop();
  },
};

export default spec;
