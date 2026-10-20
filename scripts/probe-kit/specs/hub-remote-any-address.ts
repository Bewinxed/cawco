/**
 * A repository whose origin is the hub's git remote, as one machine reached
 * the hub, is the hub's to every machine, whatever address each reaches the
 * hub by (core `RegisterAckPayload.gitOrigins`, agent git-credential.ts
 * `hubOriginOf`). On a scratch fleet (real hub, two machines' agents and
 * sessiond; no session runs): the second machine reaches the hub through
 * the kit's relay (relay.ts), on another port than the first.
 *
 * - A delegate onto the first machine gives the repository the hub's remote
 *   as its origin, as that machine reaches the hub.
 * - A delegate onto the second machine reads that origin as the hub's: its
 *   workspace's clone is cut from the hub with the machine's credential, and
 *   never refused as a remote that takes a CawCo credential.
 *
 * Each workspace stops at its boundary where this runs inside a workspace,
 * which cannot start one (kit.ts `BOUNDARY_INSIDE`), after its clone; on
 * the host each delegate starts. Either way the refusal it ends on is read.
 *
 *   bun scripts/probe-kit/run.ts hub-remote-any-address
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { relay } from "../relay";

const OTHER = "hub-remote-other";
/** The hub's git remote refusing a request with no credential (hub git-remote.ts). */
const NO_CREDENTIAL = "This remote takes a CawCo machine or session credential";

const spec: Spec = {
  name: "hub-remote-any-address",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    const home = fleet.env.HOME as string;
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const between = relay(fleet.base);
    await fleet.launchMachine(OTHER, {
      CAWCO_HUB_URL: `${between.url.replace("http", "ws")}/ws`,
    });
    const src = join(fleet.sandbox, "src");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`sh -c ${"git init -q -b main && echo remote > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Hub remote at any address",
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
    const delegate = (machineId?: string) =>
      fleet
        .api("/api/work-items", {
          parentInstanceId: parent,
          title: "Hub remote probe",
          prompt: "Say ok.",
          harness: "claude",
          model: "claude-haiku-4-5",
          cwd: src,
          lands: "none",
          ...(machineId ? { machineId } : {}),
        })
        .then(
          () => "started",
          (error: unknown) => String(error)
        );

    const first = await delegate();
    const origin = (
      await Bun.$`git -C ${src} remote get-url origin`.quiet().nothrow()
    )
      .text()
      .trim();
    check(
      "a delegate onto the first machine gives the repository the hub's remote, as that machine reaches the hub",
      origin.startsWith(`${fleet.base}/git/`),
      `origin ${origin || "none"}; the delegate: ${first.slice(0, 300)}`
    );
    const second = await delegate(OTHER);
    check(
      "a delegate onto the second machine, which reaches the hub at another address, reads that origin as the hub's and is not refused a credential",
      !(second.includes(NO_CREDENTIAL) || second.includes("ls-remote failed")),
      second.slice(0, 500)
    );
    between.stop();
  },
};

export default spec;
