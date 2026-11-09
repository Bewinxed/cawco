/**
 * A CawCo service's definition (`ServiceSpec`) and its text as the machine's
 * service manager reads it: a systemd unit and its socket units, or a launchd
 * plist. What is rendered here is installed on machines: a change to the text
 * reaches each one at its next install or update.
 */

import { readdirSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { AGENT_BUNDLE_ID } from "@cawco/core/agent-bundle";
import { SERVICE_IDS, type ServiceId } from "@cawco/core/binary-installation";
import { CAWCO_ENV } from "@cawco/core/cawco-env";
import { withFetchCap } from "@cawco/core/fetch-cap";
import { launchdLog, launchdProgram, xml } from "@cawco/core/launchd";
import { standalone } from "@cawco/core/runtime";
import { label, socketName, unitName } from "./names";

export const isServiceId = (value: string): value is ServiceId =>
  SERVICE_IDS.some((id) => id === value);

/**
 * Which flavour of the stack a machine is running: the built artefacts, or the
 * checkout as you are editing it. Only the hub and the dashboard have a dev
 * flavour — see cli service.ts `DEV`.
 */
export type ServiceMode = "prod" | "dev";

/**
 * Written into a dev unit and read back out of it by `status`, which is the only
 * record of how a service was installed. Never set in prod, so a unit without it
 * is a prod install.
 */
export const MODE_ENV = CAWCO_ENV.serviceMode;

/** One listening socket a service is handed (`ServiceSpec.sockets`). */
export interface SocketSpec {
  /** One descriptor per address. */
  readonly listens: readonly { readonly host: string; readonly port: string }[];
  /** What the service collects it by: systemd's `FileDescriptorName=`, launchd's `Sockets` key. */
  readonly name: string;
  /**
   * Whether the service requires it (`Requires=`): one that does not open
   * keeps the service down. Otherwise wanted (`Sockets=` gives `Wants=`,
   * systemd.service(5): "Services also pull in all .socket units listed in
   * Sockets= via automatic Wants= and After= dependencies"), and one that does
   * not open is said while the service runs on the rest.
   */
  readonly required: boolean;
  /** Its systemd unit: `cawco-<unit>.socket`. */
  readonly unit: string;
}

/** One path element per line, as `/etc/paths` and its `.d` files hold them; none for a file that is not there. */
const pathLines = (file: string): string[] => {
  try {
    return readFileSync(file, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
};

/**
 * The PATH the OS's service manager gives a service, where the OS keeps its
 * own programs. On Linux, systemd's user manager's own environment ("In case
 * of the user manager, a different path may be configured by the
 * distribution", systemd.exec(5) `$PATH`). On macOS what a login shell's is built from: "default PATH …
 * values are obtained from the files /etc/paths", then each file in
 * `/etc/paths.d` is appended (path_helper(8)). Empty when neither answers.
 */
const managerPath = (): string[] => {
  if (platform() === "darwin") {
    const extra = (() => {
      try {
        return readdirSync("/etc/paths.d").sort();
      } catch {
        return [];
      }
    })();
    return [
      ...pathLines("/etc/paths"),
      ...extra.flatMap((name) => pathLines(join("/etc/paths.d", name))),
    ];
  }
  const shown = Bun.spawnSync(["systemctl", "--user", "show-environment"], {
    env: process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });
  const line = shown.stdout
    .toString()
    .split("\n")
    .find((entry) => entry.startsWith("PATH="));
  return line ? line.slice("PATH=".length).split(":").filter(Boolean) : [];
};

/**
 * The PATH the installing shell had, then the service manager's own. A
 * launchd job otherwise inherits a nearly empty one, and the daemon shells
 * out to `git`, `gh` and `tailscale` — found the hard way on a Mac where
 * `node` was missing from the service's PATH and the Claude Code shim would
 * not start. Every system program CawCo runs is found on it (core
 * workspace-needs.ts).
 */
const servicePath = (): string => {
  const inherited = (process.env.PATH ?? "").split(":").filter(Boolean);
  // Installing over SSH inherits a thin PATH with no Homebrew, so a service
  // installed remotely would lose git, gh and node. Union the usual homes and
  // the OS's own with whatever the installing shell had, keeping the shell's
  // order first. `~/.local/bin` is where Claude Code's own installer puts
  // `claude`.
  const usual = [
    `${homedir()}/.local/bin`,
    `${homedir()}/.bun/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    ...managerPath(),
  ];
  return [...new Set([...inherited, ...usual])].join(":");
};

export interface ServiceSpec {
  /** systemd ordering only — launchd has none, see {@link plist}. */
  readonly after: readonly string[];
  /** systemd ordering only: the units this one starts before. */
  readonly before?: readonly string[];
  /**
   * Asked before anything is written. A throw refuses the install outright: a
   * unit that could only crash-loop is never written.
   */
  readonly check?: () => void;
  readonly command: readonly string[];
  /**
   * systemd `CPUWeight=`, for a service whose work yields to the person's
   * own under contention. launchd's counterpart is {@link processType}.
   */
  readonly cpuWeight?: number;
  /**
   * systemd `Delegate=` and `DelegateSubgroup=`: the cgroup controllers the
   * service manages below its own cgroup, and the subgroup its main process
   * starts in. launchd has no cgroups.
   */
  readonly delegate?: {
    readonly controllers: string;
    readonly subgroup: string;
  };
  /** systemd `Description=`. */
  readonly description: string;
  /** On top of PATH, which every service gets. */
  readonly environment: Readonly<Record<string, string>>;
  readonly id: ServiceId;
  /** Printed after a LaunchAgent install, for the one service that has more to say. */
  readonly launchAgentNote?: readonly string[];
  readonly mode: ServiceMode;
  /**
   * What its unit (`cawco-<name>.service`), label (`dev.cawco.<name>`) and
   * log carry: its id, or a build's session keeper's own name.
   */
  readonly name: string;
  /**
   * Writes systemd's `OOMPolicy=continue`, for a service whose processes are
   * not one piece of work. Absent, systemd's default `stop` ends every process
   * of the unit when the kernel kills one of them for memory. launchd has no
   * counterpart.
   */
  readonly oomContinue?: true;
  /** Whether the service is really up, which the init system does not know. */
  readonly probe: () => Promise<string | undefined>;
  /**
   * launchd's `ProcessType`, for a service the person waits on. Absent, launchd
   * throttles it: launchd.plist(5), "If left unspecified, the system will apply
   * light resource limits to the job, throttling its CPU usage and I/O
   * bandwidth"; "Interactive jobs run with the same resource limitations as
   * apps, that is to say, none". systemd has no counterpart.
   */
  readonly processType?: "Interactive";
  /**
   * systemd `RequiredBy=` in `[Install]`: the units that, while this one is
   * enabled, cannot start without it, and are stopped or restarted with it.
   * Disabling it lets them go on without it.
   */
  readonly requiredBy?: readonly string[];
  /**
   * Hard dependencies: systemd `Requires=`. A unit here is one the service
   * genuinely cannot work without, so its failure must take this one down
   * rather than leave it up and broken. Distinct from {@link wants}, which is
   * "start it too, but carry on without it".
   */
  readonly requires?: readonly string[];
  /**
   * Whether a clean exit is still a fault. It is for a server, which has no
   * reason to stop; it is not for the daemon, which exits 0 when it is
   * deliberately drained and must then stay down.
   */
  readonly restartOnSuccess: boolean;
  readonly restartSec: number;
  /**
   * The listening sockets the init system opens and keeps open, handing them
   * to the service at every start (systemd `.socket` units, launchd
   * `Sockets`). A connection that arrives while the service restarts waits in
   * a socket's backlog for the new process rather than being refused. The
   * first is the service's own; any other is a unit of its own the service
   * names in `Sockets=` ({@link SocketSpec}).
   */
  readonly sockets?: readonly SocketSpec[];
  readonly wants: readonly string[];
  readonly workingDirectory: string;
}

/** Every unit's environment: its own settings over the shared ones, the fetch cap among them (core fetch-cap.ts). */
const environment = (spec: ServiceSpec): [string, string][] =>
  Object.entries(
    withFetchCap({
      PATH: servicePath(),
      XDG_CONFIG_HOME:
        process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
      XDG_DATA_HOME:
        process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
      ...spec.environment,
      ...(spec.mode === "dev" ? { [MODE_ENV]: spec.mode } : {}),
    })
  );

/**
 * launchd has no ordering: each service is bootstrapped on its own, and the hub
 * may well not be up when the dashboard or the daemon starts. That costs
 * nothing, because every service already tolerates the others being absent —
 * the daemon reconnects with backoff, the dashboard proxies on demand — which
 * is also why systemd gets `Wants=` rather than `Requires=`.
 *
 * launchd having no ordering primitive does not make the ordering untrue, so a
 * spec that has one records it as an XML comment: launchd ignores it, and the
 * person reading `~/Library/LaunchAgents` to work out why the daemon started
 * before sessiond finds the answer written down where they are already looking.
 * It is documentation in the artefact, never enforcement.
 */
const CAWCO_SIBLING_SERVICE = /^cawco-(.+)\.service$/u;

const orderingComment = (spec: ServiceSpec): string => {
  // Only sibling cawco services mean anything under launchd; systemd targets
  // like `network-online.target` have no launchd counterpart to name.
  const siblings = spec.after
    .map((target) => CAWCO_SIBLING_SERVICE.exec(target)?.[1])
    .filter((id): id is string => id !== undefined && isServiceId(id))
    .map((id) => label(id as ServiceId));
  if (siblings.length === 0) {
    return "";
  }
  return `\n  <!-- ordering: starts after ${siblings.join(", ")} — launchd has no ordering, so this is recorded, not enforced -->`;
};

/**
 * One socket as a plist's `Sockets` entry: its own key, each address a
 * dictionary of it (launchd.plist(5): "Sockets <dictionary of dictionaries...
 * OR dictionary of array of dictionaries...>").
 */
const plistSocket = (
  socket: SocketSpec
): string => `    <key>${xml(socket.name)}</key>
    <array>
${socket.listens
  .map(
    ({ host, port }) => `      <dict>
        <key>SockNodeName</key>
        <string>${xml(host)}</string>
        <key>SockServiceName</key>
        <string>${xml(port)}</string>
      </dict>`
  )
  .join("\n")}
    </array>`;

/**
 * The app a job's work is macOS's to attribute to: a release's every job
 * runs `CawCo Agent.app`'s executable (core agent-bundle.ts) through
 * launchdProgram's shell, so its privacy grants, Local Network among them,
 * are the bundle's. TN3179: "If you ship a launchd agent that's not
 * installed using SMAppService, make macOS aware of the responsible code by
 * setting the AssociatedBundleIdentifiers property in your launchd property
 * list". A checkout's jobs run bun and node, which no bundle holds: none.
 */
const associatedBundles = (): string =>
  standalone
    ? `  <key>AssociatedBundleIdentifiers</key>
  <array>
    <string>${xml(AGENT_BUNDLE_ID)}</string>
  </array>
`
    : "";

export const plist = (
  spec: ServiceSpec
): string => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>${orderingComment(spec)}
  <key>Label</key>
  <string>${xml(label(spec.name))}</string>
${associatedBundles()}  <key>ProgramArguments</key>
  <array>
${launchdProgram(label(spec.name), spec.command)
  .map((argument) => `    <string>${xml(argument)}</string>`)
  .join("\n")}
  </array>
${
  spec.sockets
    ? `  <key>Sockets</key>
  <dict>
${spec.sockets.map(plistSocket).join("\n")}
  </dict>
`
    : ""
}${
  spec.processType
    ? `  <key>ProcessType</key>
  <string>${spec.processType}</string>
`
    : ""
}  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
${
  spec.restartOnSuccess
    ? "  <true/>"
    : `  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>`
}
  <key>EnvironmentVariables</key>
  <dict>
${environment(spec)
  .map(
    ([key, value]) =>
      `    <key>${xml(key)}</key>\n    <string>${xml(value)}</string>`
  )
  .join("\n")}
  </dict>
  <key>WorkingDirectory</key>
  <string>${xml(spec.workingDirectory)}</string>
  <key>StandardOutPath</key>
  <string>${xml(launchdLog(spec.name))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(launchdLog(spec.name))}</string>
</dict>
</plist>
`;

/**
 * `StartLimitIntervalSec=0` because the default gives up after five restarts in
 * ten seconds and leaves the unit wedged until someone runs `reset-failed` — a
 * crash loop should stay a crash loop, visible and still trying, rather than
 * quietly become a stopped service.
 */
export const unit = (spec: ServiceSpec): string => `[Unit]
Description=${spec.description}
${[
  ...(spec.requires ?? []).map((target) => `Requires=${target}`),
  ...spec.wants.map((target) => `Wants=${target}`),
  ...spec.after.map((target) => `After=${target}`),
  ...(spec.before ?? []).map((target) => `Before=${target}`),
  "StartLimitIntervalSec=0",
].join("\n")}

[Service]
ExecStart=${spec.command.join(" ")}
WorkingDirectory=${spec.workingDirectory}
${
  // Every socket it is handed, the units of its own name and the rest
  // (systemd.service(5), Sockets=: "Specifies the name of the socket units
  // this service shall inherit socket file descriptors from").
  spec.sockets && spec.sockets.length > 1
    ? `Sockets=${spec.sockets.map((socket) => socketName(socket.unit)).join(" ")}\n`
    : ""
}${environment(spec)
  .map(([key, value]) => `Environment=${key}=${value}`)
  .join("\n")}
Restart=${spec.restartOnSuccess ? "always" : "on-failure"}
RestartSec=${spec.restartSec}${spec.oomContinue ? "\nOOMPolicy=continue" : ""}${
  spec.cpuWeight === undefined ? "" : `\nCPUWeight=${spec.cpuWeight}`
}${
  spec.delegate
    ? `\nDelegate=${spec.delegate.controllers}\nDelegateSubgroup=${spec.delegate.subgroup}`
    : ""
}

[Install]
${["WantedBy=default.target", ...(spec.requiredBy ?? []).map((target) => `RequiredBy=${target}`)].join("\n")}
`;

/** An address as `ListenStream=` takes it: an IPv6 host in brackets. */
export const listenAddress = ({ host, port }: { host: string; port: string }) =>
  `${host.includes(":") ? `[${host}]` : host}:${port}`;

/**
 * One socket unit systemd holds for a socket-activated service, one
 * descriptor per address it listens on. It starts the service of its own
 * name, or, for a socket unit of another name, the service its `Service=`
 * names; `FileDescriptorName=` is what the service collects them by.
 * `NoDelay=` because every byte on them is an interactive page load.
 * `ReusePort=` so the hub's HTTPS listener on the machine's tailnet address
 * can stand on the network port (hub tailnet-https.ts): Linux binds an
 * address's listener beside the wildcard one only when both sockets set
 * SO_REUSEPORT, and gives that address's connections to it. None of these
 * addresses is a tailnet one, so none shares the HTTPS listener's.
 * `FreeBind=` because they name specific IP addresses, and one missing at a
 * start (the loopback's) would fail the whole socket: systemd.socket(5), "For
 * robustness reasons it is recommended to use this option whenever you bind
 * a socket to a specific IP address"; systemd sets it before `bind()`
 * (src/shared/socket-label.c). It cannot help a host with no IPv6 at all,
 * whose `socket()` fails first: `dashboardSockets` names no `::1` there.
 */
export const socketUnit = (
  spec: ServiceSpec,
  socket: SocketSpec
): string => `[Unit]
Description=${spec.description} ${socket.required ? "" : `${socket.name} `}socket

[Socket]
${socket.listens.map((listen) => `ListenStream=${listenAddress(listen)}`).join("\n")}
FileDescriptorName=${socket.name}${socket.unit === spec.id ? "" : `\nService=${unitName(spec.name)}`}
NoDelay=true
FreeBind=true
ReusePort=true

[Install]
WantedBy=sockets.target
`;

/**
 * A one-shot launchd job's plist: label `job`, running `argv` behind its
 * start record (core launchd.ts `launchdProgram`), with `forwarded` as its
 * environment, started as it loads.
 */
export const transientPlist = (
  job: string,
  argv: readonly string[],
  forwarded: readonly (readonly [string, string])[]
): string => {
  const text = (value: string) => `<string>${xml(value)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key>${text(job)}
<key>ProgramArguments</key><array>${launchdProgram(job, argv).map(text).join("")}</array>
<key>EnvironmentVariables</key><dict>${forwarded.map(([key, value]) => `<key>${key}</key>${text(value)}`).join("")}</dict>
<key>RunAtLoad</key><true/>
</dict></plist>
`;
};
