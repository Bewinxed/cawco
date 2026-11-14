/**
 * Adding a machine: the install script every new machine runs, the addresses
 * it could reach this hub on, and their routes. The commands and checks an
 * SSH add runs for the operator are ssh-add.ts's; installs.ts runs the add
 * itself and keeps every install.
 *
 * A machine joins by running `/install.sh`, which installs the signed binary
 * release of this hub's channel and ends in `cawco binary-install agent`.
 * Run by hand, the person picks a hub address the machine can reach. An SSH
 * add needs none: the hub first opens its own connection to the machine
 * (ssh-tunnels.ts), which carries a port on the machine's loopback to the
 * hub, and the install downloads the script and joins through that port. So
 * a machine the hub can SSH into joins whether or not it can reach any
 * address of the hub's. Nothing the operator types reaches a shell: the
 * target is one argv entry for `ssh`, the remote command holds only the
 * port OpenSSH allocated, and a password goes only to `ssh`'s askpass, on
 * its stdin.
 *
 * A machine that does not trust the hub's key yet is added with its
 * password: one connection signs in with it and appends the hub's key to
 * `~/.ssh/authorized_keys` as `ssh-copy-id` does; the connection the hub
 * holds and the install sign in with that key. The password is never in an
 * argv, a file, a job's lines or the database.
 */

import { hostname, networkInterfaces } from "node:os";
import { RELEASE_REPOSITORY } from "@cawco/core/binary-distribution";
import { readInstallation } from "@cawco/core/binary-installation";
import { DRAFT_LIMITS, type InstallSignIn } from "@cawco/core/install";
import {
  generateInstallScript,
  type InstallJoin,
} from "@cawco/core/install-script";
import {
  type JoinAddress,
  type JoinInfo,
  SSH_ADD_RUNNING_HEADER,
} from "@cawco/core/join";
import { reachableLinks } from "@cawco/core/reachable-links";
import { RELEASE_PUBLIC_KEY } from "@cawco/core/release-key";
import { shellQuote } from "@cawco/core/shell-quote";
import { connectWords } from "@cawco/core/words/connect";
import { systemProgram } from "@cawco/core/workspace-needs";
import { Elysia, problem, t } from "elysia";
import { problemResponse } from "elysia/error";
import { z } from "zod";
import { HUB_PORT } from "./config";
import { INSTALL_CODE, type Installs } from "./installs";
import { localHubName } from "./mdns";
import { output, sshPublicKey } from "./ssh-add";

const TRAILING_DOT = /\.$/u;

/**
 * Every address a machine could reach this hub on: Tailscale first, because a
 * tailnet address works from anywhere the machine is, then every non-internal
 * IPv4 labelled with its interface, then the `.local` name the hub holds on
 * its networks (mdns.ts), which keeps working when the hub's address changes
 * but reaches only machines on the same network. The Tailscale IP also shows
 * up as an interface (`tailscale0`, `utun…`); it is listed once, under
 * Tailscale. A container's or VM's bridge, a veth and a bridge's port are
 * never listed (core reachable-links.ts). A machine without the `tailscale` binary simply has no Tailscale
 * rows, and a hub with mDNS off has no `.local` row.
 */
const joinAddresses = async (): Promise<JoinAddress[]> => {
  const url = (host: string): string => `http://${host}:${HUB_PORT}`;
  const [ip, status] = await Promise.all([
    Bun.which("tailscale") ? output(["tailscale", "ip", "-4"]) : undefined,
    Bun.which("tailscale")
      ? output(["tailscale", "status", "--json"])
      : undefined,
  ]);
  const found: JoinAddress[] = [];
  const tailscaleIp = ip?.split("\n")[0]?.trim();
  if (tailscaleIp) {
    found.push({ label: "Tailscale", url: url(tailscaleIp) });
  }
  const dnsName = status
    ? z
        .object({
          Self: z.object({ DNSName: z.string().optional() }).nullish(),
        })
        .parse(JSON.parse(status)).Self?.DNSName
    : undefined;
  if (dnsName) {
    found.push({
      label: "Tailscale DNS",
      url: url(dnsName.replace(TRAILING_DOT, "")),
    });
  }
  // Only links another machine reaches this one on: a container bridge's
  // address answers nobody but the containers behind it.
  const reachable = new Set((await reachableLinks()).map((link) => link.name));
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    if (!reachable.has(name)) {
      continue;
    }
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }
      const candidate = url(entry.address);
      if (!found.some((address) => address.url === candidate)) {
        found.push({ label: name, url: candidate });
      }
    }
  }
  const local = localHubName();
  if (local) {
    found.push({ label: connectWords.onThisNetwork, url: url(local) });
  }
  return found;
};

/**
 * A `Host` header that can be pasted into the script as-is: a name or an
 * address and a port. Anything else is refused before a script is written.
 */
const HOST_HEADER = /^[A-Za-z0-9.\-[\]:]+$/u;

/**
 * The hub and the public site render the same installer body. Every way a
 * machine joins this hub (the dashboard's command, an SSH add, the line a
 * first install prints for a hub it found) fetches this one script, which
 * leaves the machine on the build the hub offers its fleet, joined to this
 * hub, whatever it ran before (core install-script.ts).
 */
const installScript = (joining: InstallJoin, releaseHost?: string): string =>
  generateInstallScript({
    origin: `https://github.com/${RELEASE_REPOSITORY}`,
    releaseHost,
    join: joining,
  });

/**
 * What a join runs when the hub cannot say which build it offers: the
 * hub's words why, and an exit that leaves the machine as it was.
 */
const refusalScript = (said: string): string => {
  const line = `cawco: ${said} Nothing on this machine was changed.`;
  return `#!${systemProgram("sh")}\nprintf '%s\\n' ${shellQuote(line)} >&2\nexit 1\n`;
};

/**
 * What a command whose code no longer works runs on the machine: one line
 * saying so, and an exit that leaves the machine as it was.
 */
const VOID_SCRIPT = `#!${systemProgram("sh")}
printf '%s\\n' "cawco: this command was stopped from the dashboard, so it installs nothing. Nothing on this machine was changed. Copy a new command there." >&2
exit 1
`;

/** A sign-in way, as the routes take it. */
const SIGN_IN = t.Union([
  t.Literal("key"),
  t.Literal("password"),
  t.Literal("by-hand"),
]);

/** The draft's fields an edit may carry (core InstallDraftEdit), each as long as the window's field takes. */
const DRAFT_FIELDS = t.Partial(
  t.Object({
    route: t.Union([t.Literal("ssh"), t.Literal("command"), t.Null()]),
    target: t.String({ maxLength: DRAFT_LIMITS.target }),
    port: t.String({ maxLength: DRAFT_LIMITS.port }),
    signIn: SIGN_IN,
    address: t.Union([t.String({ maxLength: DRAFT_LIMITS.address }), t.Null()]),
  })
);

/** Which page made a draft edit, and its place in that page's order (core DraftStamp). */
const STAMP = t.Object({
  page: t.String({ minLength: 1, maxLength: 100 }),
  seq: t.Integer({ minimum: 1 }),
});

/**
 * The install routes: the installer itself, the hub's addresses and key,
 * the installs (installs.ts) and the draft, the command route's code's end,
 * and the SSH add's routes as the shipped apps call them, projected from the
 * same installs.
 */
export const joinRoutes = ({
  installs,
  offered,
}: {
  installs: Installs;
  /** The build the fleet is offered (binary-updates.ts), which every join's script installs; the words why there is none. */
  offered: () => Promise<
    { channel: "stable" | "nightly"; version: string } | { refused: string }
  >;
}) =>
  new Elysia()
    .get("/install.sh", async ({ request, set }) => {
      const host = request.headers.get("host");
      if (!(host && HOST_HEADER.test(host))) {
        return problem(400, {
          code: "request-has-no-usable",
          detail: "The request has no usable Host header.",
        });
      }
      if (!RELEASE_PUBLIC_KEY) {
        return problem(503, {
          code: "hubs-build-cannot-install",
          detail:
            "This hub's build cannot install machines yet: it carries no release key to check a download against, so it would hand out an installer that verifies nothing. Install a released build of CawCo on this hub to enable it.",
        });
      }
      const code = new URL(request.url).searchParams.get("code");
      set.headers["content-type"] = "text/x-shellscript; charset=utf-8";
      // The command route's line, with a code that no longer works.
      if (code !== null && !(INSTALL_CODE.test(code) && installs.live(code))) {
        return VOID_SCRIPT;
      }
      // Every join installs the build the fleet is offered; with none to
      // name, it installs nothing, and a command route's install ends there.
      const offer = await offered();
      if ("refused" in offer) {
        if (code !== null) {
          installs.offerRefused(code, offer.refused);
        }
        return refusalScript(offer.refused);
      }
      // The command route's step one: its installer fetched.
      if (code !== null) {
        installs.fetched(code);
      }
      const installation = await readInstallation();
      return installScript(
        { hub: `http://${host}`, offer, ...(code === null ? {} : { code }) },
        installation?.releaseHost
      );
    })
    .get("/api/join", async (): Promise<JoinInfo> => ({
      addresses: await joinAddresses(),
      sshPublicKey: sshPublicKey(),
      hubHostname: hostname(),
    }))
    .get("/api/installs", () => installs.read())
    .patch(
      "/api/installs/draft",
      { body: t.Object({ stamp: STAMP, draft: DRAFT_FIELDS }) },
      ({ body }) => {
        installs.editDraft(body);
        return installs.read();
      }
    )
    .post(
      "/api/installs",
      {
        body: t.Union([
          t.Object({
            route: t.Literal("ssh"),
            target: t.String({ maxLength: DRAFT_LIMITS.target }),
            port: t.Optional(t.Integer({ minimum: 1, maximum: 65_535 })),
            signIn: SIGN_IN,
            password: t.Optional(t.String({ maxLength: 4096 })),
            stamp: t.Optional(STAMP),
          }),
          t.Object({
            route: t.Literal("command"),
            address: t.String({ maxLength: DRAFT_LIMITS.address }),
            stamp: t.Optional(STAMP),
          }),
        ]),
      },
      ({ body }) => {
        const started =
          body.route === "ssh"
            ? installs.startSsh({
                target: body.target,
                port: body.port,
                signIn: body.signIn as InstallSignIn,
                password: body.password,
                stamp: body.stamp,
              })
            : installs.startCommand(body.address, body.stamp);
        return "status" in started
          ? problem(started.status, {
              code: "ssh-add-refused",
              detail: started.message,
            })
          : started;
      }
    )
    .get(
      "/api/installs/:id/output",
      ({ params }) =>
        installs.output(params.id) ??
        problem(404, {
          code: "no-install",
          detail: "No install with that id on this hub.",
        })
    )
    .post("/api/installs/:id/stop", async ({ params }) => {
      const stopped = await installs.stop(params.id);
      if (!stopped) {
        return problem(404, {
          code: "no-install",
          detail: "No install with that id on this hub.",
        });
      }
      return "status" in stopped && typeof stopped.status === "number"
        ? problem(stopped.status, {
            code: "ssh-stop-refused",
            detail: (stopped as { message: string }).message,
          })
        : installs.read();
    })
    .post(
      "/api/installs/:id/retry",
      {
        body: t.Object({
          password: t.Optional(t.String({ maxLength: 4096 })),
        }),
      },
      ({ params, body }) => {
        const again = installs.retry(params.id, body.password);
        if (!again) {
          return problem(404, {
            code: "no-install",
            detail: "No install with that id on this hub.",
          });
        }
        return "status" in again
          ? problem(again.status, {
              code: "ssh-add-refused",
              detail: again.message,
            })
          : again;
      }
    )
    .delete("/api/installs/:id", ({ params }) => {
      const gone = installs.remove(params.id);
      if (gone === false) {
        return problem(404, {
          code: "no-install",
          detail: "No install with that id on this hub.",
        });
      }
      return gone === true
        ? installs.read()
        : problem(gone.status, {
            code: "ssh-remove-refused",
            detail: gone.message,
          });
    })
    .post(
      "/api/installs/code/:code/ended",
      {
        body: t.Object({
          status: t.Numeric(),
          said: t.Optional(t.String({ maxLength: 2000 })),
          host: t.Optional(t.String({ maxLength: 255 })),
        }),
      },
      ({ params, body }) =>
        installs.ended(
          params.code,
          body.status,
          body.said ?? "",
          body.host ?? ""
        )
          ? { ok: true }
          : problem(410, {
              code: "code-no-longer-names",
              detail: "That code no longer names a running install.",
            })
    )
    .post(
      "/api/machines/ssh",
      {
        body: t.Object({
          target: t.String(),
          port: t.Optional(t.Integer({ minimum: 1, maximum: 65_535 })),
          // Unread: the machine reaches the hub through the hub's own
          // connection. Shipped apps still send the address they picked.
          hubUrl: t.Optional(t.String()),
          password: t.Optional(t.String()),
        }),
      },
      ({ body }) => {
        const password = body.password ?? "";
        const started = installs.startSsh({
          target: body.target,
          port: body.port,
          signIn: password === "" ? "key" : "password",
          password,
        });
        if ("status" in started) {
          return problem(started.status, {
            code: "ssh-add-refused",
            detail: started.message,
          });
        }
        if (started.existing) {
          // A plain answer, not a declared status: the route's typed answers
          // are what the frozen iOS app's generated client switches over.
          return problemResponse(
            {
              status: 409,
              code: "ssh-add-already-running",
              detail: `An SSH add of ${started.install.target} is already running (${started.install.id}): it goes on, and a new one can start once it has ended.`,
            },
            {
              [SSH_ADD_RUNNING_HEADER]: started.install.id,
            }
          );
        }
        // The add just started is one of the hub's installs: its answer is the
        // job, as it always was, and no status the shipped apps don't know.
        const job = installs.job(started.install.id);
        if (!job) {
          throw new Error(
            `The SSH add of ${started.install.target} that just started is missing from the hub's installs.`
          );
        }
        return job;
      }
    )
    .get("/api/machines/ssh/:id", ({ params }) => {
      const job = installs.job(params.id);
      return (
        job ??
        problem(404, {
          code: "no-ssh-add-id",
          detail: "No SSH add with that id on this hub.",
        })
      );
    })
    .post("/api/machines/ssh/:id/stop", async ({ params }) => {
      const job = installs.job(params.id);
      if (!job) {
        return problem(404, {
          code: "no-ssh-add-id",
          detail: "No SSH add with that id on this hub.",
        });
      }
      const stopped = await installs.stop(params.id);
      if (stopped && "message" in stopped) {
        return problem(409, {
          code: "ssh-add-has-already",
          detail: `That SSH add to ${job.target} has already ended, so there is nothing to stop.`,
        });
      }
      return installs.job(params.id) ?? job;
    });
