import { commonWords } from "./common";

/**
 * HTTPS on the tailnet: its onboarding row in Caw's Needs you, for the
 * dashboard and the native app alike (core tailnet-https.ts). The dashboard
 * lists every step on the path (`lead`, then each step's label, note and
 * control), each ticking as the hub finds it taken; the app says the first
 * that stands in one line, with one button. The row ticks once HTTPS is on.
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
  /** The row's line over its steps, while one stands. */
  lead: "Every device on your tailnet opens CawCo over HTTPS once these are done. Each ticks by itself.",
  /** The admin console's two switches, MagicDNS first (tailscale.com/kb/1153/enabling-https: "Enable MagicDNS if not already enabled"). */
  stepMagicDns: "Turn on MagicDNS, then HTTPS Certificates",
  /** "Under HTTPS Certificates, select Enable HTTPS." */
  stepHttps: "Turn on HTTPS Certificates",
  /** "your machine names and your tailnet DNS name will be published on a public ledger." */
  adminNote:
    "On Tailscale's DNS page. Tailscale lists your machine names in the public certificate log.",
  /** `tailscale cert` answers only root, tailscaled's own user and its operator. */
  stepOperator: "Let CawCo take Tailscale's certificate",
  /** Where the command runs: sudo asks for the person's password there. */
  runOnce: (host: string) => `Run it once in a terminal on ${host}.`,
  stepUserspace: "Run tailscaled with its network interface",
  userspaceNote: (host: string) =>
    `Tailscale on ${host} runs in userspace networking, so CawCo has no tailnet address to listen on. Run tailscaled as root, without --tun=userspace-networking.`,
  stepPort: (port: number) => `Free port ${port} on the tailnet address`,
  portNote: (host: string) =>
    `A listener CawCo can't share holds it. Run this once in a terminal on ${host}.`,
  /** What a screen reader hears before a step that is taken (its tick says it to the eye). */
  stepDone: "Done:",
  /** A step's command box, for a screen reader. */
  command: "Command",
  /** HTTPS came on while the row stood: its tick. */
  done: (dashboard: string) =>
    `HTTPS is on. Every device on your tailnet opens CawCo at ${dashboard}.`,
  openDnsPage: "Open Tailscale's DNS page",
  /** The admin console's DNS page, where MagicDNS and HTTPS Certificates are switched on (tailscale.com/kb/1153/enabling-https). */
  dnsPage: "https://console.tailscale.com/admin/dns",
  openDocs: "Open Tailscale's docs",
  /** Tailscale's page on kernel and userspace networking. */
  userspacePage: "https://tailscale.com/kb/1177/kernel-vs-userspace-routers",
  copyCommand: commonWords.copyCommand,
  openDashboard: "Open the HTTPS dashboard",
};
