/**
 * HTTPS on the tailnet: its onboarding row in Caw's Needs you, for the
 * dashboard and the native app alike (core tailnet-https.ts). One step at a
 * time, the first that needs the person, in one line, with one button; the
 * hub checks again on its own and the row ticks once HTTPS is on.
 *
 * The dashboard imports this module; `bun run words` writes it into the app
 * as `Words.Tailnet` (CawCoCore/Words.generated.swift).
 */
export const tailnetWords = {
  title: "HTTPS on your tailnet",
  /** Where the row comes from: onboarding, on the hub's machine's Tailscale. */
  meta: (host: string) => `Onboarding · Tailscale on ${host}`,
  /** MagicDNS is off, and HTTPS Certificates need it (tailscale.com/kb/1153/enabling-https: "Enable MagicDNS if not already enabled"). */
  enableMagicDns:
    "Turn on MagicDNS, then HTTPS Certificates, on Tailscale's DNS page, and every device on your tailnet opens CawCo over HTTPS. Tailscale lists your machine names in the public certificate log.",
  /** The tailnet has no certificates ("Under HTTPS Certificates, select Enable HTTPS"; "your machine names … will be published on a public ledger"). */
  enableHttps:
    "Turn on HTTPS Certificates on Tailscale's DNS page, and every device on your tailnet opens CawCo over HTTPS. Tailscale lists your machine names in the public certificate log.",
  /** Tailscale gives its certificate only to root and its operator. */
  operator: (host: string, command: string) =>
    `Tailscale on ${host} gives its certificate only to root and its operator. Run ${command} there once.`,
  /** tailscaled runs with `--tun=userspace-networking`: no tailnet address to listen on. */
  userspace: (host: string) =>
    `Tailscale on ${host} runs in userspace networking, so CawCo can't listen on its tailnet address. Run tailscaled as root there, without --tun=userspace-networking.`,
  /** A listener the hub can't share holds a port on the tailnet address. */
  port: (host: string, port: number, command: string) =>
    `Port ${port} on ${host}'s tailnet address is held by a listener CawCo can't share. Run ${command} there once.`,
  /** HTTPS came on while the row stood: its tick. */
  done: (dashboard: string) =>
    `HTTPS is on. Every device on your tailnet opens CawCo at ${dashboard}.`,
  openDnsPage: "Open Tailscale's DNS page",
  /** The admin console's DNS page, where MagicDNS and HTTPS Certificates are switched on (tailscale.com/kb/1153/enabling-https). */
  dnsPage: "https://console.tailscale.com/admin/dns",
  openDocs: "Open Tailscale's docs",
  /** Tailscale's page on kernel and userspace networking. */
  userspacePage: "https://tailscale.com/kb/1177/kernel-vs-userspace-routers",
  copyCommand: "Copy command",
  openDashboard: "Open the HTTPS dashboard",
};
