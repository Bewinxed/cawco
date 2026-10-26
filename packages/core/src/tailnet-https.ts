/**
 * HTTPS on the hub machine's tailnet name, as the hub reports it (hub
 * tailnet-https.ts): the dashboard and every preview port answer
 * `https://<machine>.<tailnet>.ts.net:<port>` on the machine's tailnet
 * addresses, with the certificate Tailscale issues for that name. Every device
 * on the tailnet then opens a secure context, which is what lets Chromium run
 * each preview in a process of its own (`Origin-Agent-Cluster`) while the
 * previews stay the dashboard's site.
 *
 * Tailscale is the one VPN whose client issues certificates for its names
 * (headscale tailnets run the same client). Another one that does plugs in
 * where the hub reads Tailscale's state and certificate; everything here is
 * already the VPN's name and certificate, not Tailscale's in particular.
 */

/**
 * Where it stands on the hub's machine:
 * - `absent`: no Tailscale there (no CLI, or its daemon is not running);
 * - `signed-out`: Tailscale is there but not signed in to a tailnet;
 * - `needs`: on a tailnet, and a step of the person's stands between it
 *   and HTTPS ({@link TailnetHttpsTodo});
 * - `serving`: the dashboard and the previews answer over HTTPS on the name.
 */
export type TailnetHttpsState = "absent" | "signed-out" | "needs" | "serving";

/**
 * A step of the person's on the path to HTTPS:
 * - `enable-magicdns`, `enable-https`: the tailnet has no certificates yet;
 *   both are switches on the admin console's DNS page (MagicDNS first,
 *   "Configure HTTPS", tailscale.com/kb/1153/enabling-https);
 * - `operator`: Tailscale gives its certificate only to root and its
 *   operator ("cert access denied", ipn/localapi/cert.go);
 * - `userspace`: tailscaled runs with `--tun=userspace-networking`, so the
 *   machine has no tailnet address to listen on;
 * - `port`: a listener the hub can't share holds a port on the tailnet
 *   address (the dashboard's socket from before it shared its port).
 */
export type TailnetHttpsStep =
  "enable-magicdns" | "enable-https" | "operator" | "userspace" | "port";

/**
 * One step of the path to HTTPS, as the hub last read it: every step that
 * applies to this machine, done or not, so the person sees the whole path at
 * once and each step ticks as the hub finds it taken.
 */
export interface TailnetHttpsTodo {
  /** The command it runs on the hub's machine, for `operator` and `port`. */
  command?: string;
  done: boolean;
  step: TailnetHttpsStep;
}

/** What `GET /api/tailnet-https` answers, and the `tailnet.https` frame carries. */
export interface TailnetHttps {
  /** The command the first step that stands runs on the hub's machine, for `operator` and `port`. */
  command?: string;
  /** The dashboard's https address while `serving`: `https://<name>:<port>`. */
  dashboard?: string;
  /** The hub's machine, by its hostname. */
  host: string;
  /** The machine's tailnet name (`machine.tailnet.ts.net`), once its tailnet names it. */
  name?: string;
  /** The port a `port` step names. */
  port?: number;
  state: TailnetHttpsState;
  /** What the person does next, while `needs`: the first of `steps` not done. */
  step?: TailnetHttpsStep;
  /** Every step on the path, in the order to take them, while `needs`. */
  steps?: TailnetHttpsTodo[];
}

/**
 * The tailnet name the hub serves HTTPS on, and the addresses its doors
 * stand on (hub tailnet-https.ts), as the register's ack and every beat's
 * hand them to each agent while it serves: an agent that reaches the hub at
 * one of `ips` carries its loopback there over https, verifying the
 * certificate against `name` (agent hub-loopback.ts).
 */
export interface TailnetServing {
  ips: string[];
  name: string;
}

/**
 * A session's preview origin on the tailnet name, beside its port
 * ({@link PreviewAddress}): `origin` is `https://<name>:<port>`, and `hosts`
 * every host a client reaches the hub's machine by over the tailnet (its
 * tailnet addresses, its full name and its short one). A client that reached
 * the hub by one of them loads the preview from `origin`: on those
 * addresses the port answers HTTPS alone.
 */
export interface TailnetOrigin {
  hosts: string[];
  origin: string;
}

const BRACKETS = /^\[|\]$/gu;

/** `host` as a URL writes it, without an IPv6 address's brackets, lower case. */
const bare = (host: string): string => host.replace(BRACKETS, "").toLowerCase();

/** Whether a client at `hostname` reached the hub's machine over the tailnet. */
export const onTailnet = (origin: TailnetOrigin, hostname: string): boolean =>
  origin.hosts.includes(bare(hostname));
