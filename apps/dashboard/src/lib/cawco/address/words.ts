/**
 * The address tray's words, per state, from the advisor's wireframes
 * (design 6ddc57c4) in the house's voice (WORDS.md: impersonal second
 * person, buttons as a verb and its object, the error formula for a
 * failure). One place for every direction, so the three differ in shape and
 * never in what they say.
 */
import {
  type AddressTray,
  type Cause,
  dateOf,
  EXPIRES,
  EXPIRY_DAYS,
  type Fact,
} from "./tray.svelte";

/**
 * The Headscale user the admin's command registers cawco to: the one the
 * hub's computer is itself signed in as, which its own client reports:
 * `tailscale status --json` carries `Self.UserID` and a `User` map of
 * profiles by that id, each with its `LoginName` (tailscale ipn/ipnstate
 * ipnstate.go: "User map[tailcfg.UserID]tailcfg.UserProfile", read as
 * `st.User[ps.UserID].LoginName`), so the command is whole and needs no
 * placeholder.
 */
export const HEADSCALE_USER = "bewinxed";

/** A press the tray offers: its words, what it does, whether it opens another page. */
export interface Press {
  act: () => void;
  /** It opens a page of the network's own in a new tab. */
  away?: boolean;
  /** It waits on something first (the key not yet pasted). */
  disabled?: boolean;
  label: string;
}

/** What one state says and offers, in the order a tray stands it. */
export interface StateWords {
  /** The one line, or two short paragraphs. */
  lines: string[];
  /** The live line under the state's object: what it waits on. */
  meta?: { text: string; live: boolean; action?: Press };
  primary?: Press;
  secondary?: Press;
  title: string;
}

/** Where the person is: a phone opens the address itself, a desk shows the QR. */
export type Form = "desk" | "phone";

/** The failed state's words for each cause: what happened, the way out, its button. */
export function failureWords(
  tray: AddressTray,
  cause: Cause
): { title: string; line: string; button: string } {
  const { domain } = tray.facts;
  switch (cause) {
    case "stale-link":
      return {
        title: "The sign-in link expired",
        line: `Nobody approved ${tray.name} in time. Get a new link and approve it where you're signed in to ${domain}.`,
        button: "Get a new link",
      };
    case "wrong-tailnet":
      return {
        title: `${tray.name} joined a different tailnet`,
        line: `The link was approved on another account's tailnet, not ${domain}. Sign in again, signed in to ${domain}.`,
        button: "Sign in again",
      };
    case "refused":
      return {
        title: `Your admin didn't approve ${tray.name}`,
        line: `${tray.facts.control} turned the request down. Send your admin the command again, or ask why.`,
        button: "Show the command",
      };
    case "key-refused":
      return {
        title: "NetBird refused the key",
        line: "The key was used up, expired, or the name was refused. Make a new one-off key and paste it again.",
        button: "Paste a new key",
      };
    case "no-answer":
      return {
        title: `${tray.name} is on the network but doesn't answer`,
        line: "CawCo keeps trying by itself. If it stays this way, Details says what came back.",
        button: "Check now",
      };
    case "expired":
      return {
        title: `${tray.name} signed out`,
        line: `Its key lapsed on ${dateOf(EXPIRES)}. Sign in again to bring the address back; nothing else changed.`,
        button: "Sign in again",
      };
    case "certs-off":
      return {
        title: "The https address stopped",
        line: `${domain} stopped issuing certificates. ${tray.short} still works; turn HTTPS Certificates back on to get the secure one back.`,
        button: "Open DNS settings",
      };
  }
}

/** What a state says and offers, on a desk or a phone. */
export function stateWords(tray: AddressTray, form: Form): StateWords {
  const { name: net, domain, control } = tray.facts;
  const title = "Open CawCo by one word";
  switch (tray.step) {
    case "finding":
      return {
        title,
        lines: [],
        meta: { text: "Looking at this computer's networks…", live: true },
      };
    case "found":
      return {
        title,
        lines: [
          tray.network === "headscale"
            ? `This computer is on Headscale at ${control}. CawCo adds one small device of its own, named cawco, to it.`
            : `This computer is on ${net} (${domain}). CawCo adds one small device of its own, named cawco, to it.`,
          "Nothing here changes: no port, no root, and this machine keeps its name.",
        ],
        primary:
          tray.network === "netbird"
            ? { label: "Continue", act: () => tray.begin() }
            : {
                label: `Sign in to ${net}`,
                act: () => tray.begin(),
                away: true,
              },
      };
    case "signin":
      return {
        title: "Waiting for your sign-in",
        lines: [
          tray.network === "headscale"
            ? `The sign-in opened in a new tab, at ${control}. Sign in there; Headscale then asks its admin to approve ${tray.name}.`
            : `The sign-in opened in a new tab. Approve the device ${tray.name} there, signed in to ${domain}.`,
          "This keeps going if you close it.",
        ],
        meta: {
          text: "Waiting",
          live: true,
          action: { label: "Open the sign-in again", act: () => undefined },
        },
      };
    case "admin":
      return {
        title: "Waiting for your admin",
        lines: [
          `${tray.name} signed in to ${control} and needs an admin's approval. Send them this: it registers ${tray.name} to ${HEADSCALE_USER}, the Headscale user this computer is signed in as.`,
        ],
        meta: { text: "Waiting · CawCo checks every few seconds", live: true },
      };
    case "key":
      return {
        title: "Paste a setup key",
        lines: [
          "NetBird admits a device by a setup key. Make a one-off key under Setup Keys and paste it here. It's used once and never kept.",
        ],
        secondary: {
          label: "Open Setup Keys",
          act: () => undefined,
          away: true,
        },
        primary: {
          label: "Use this key",
          act: () => tray.useKey(),
          disabled: tray.key.trim() === "",
        },
      };
    case "checking":
      return {
        title: "Checking the address",
        lines: [
          tray.nameTaken
            ? `${tray.name} joined ${domain} as ${tray.name}: cawco was taken. That's the word to type.`
            : `cawco joined ${domain} as cawco.`,
        ],
        meta: {
          text: `Making sure ${tray.bareWordWorks ? tray.short : `http://${tray.long}`} answers from here…`,
          live: true,
        },
      };
    case "secure":
      return secureWords(tray);
    case "keep":
      return keepWords(tray);
    case "phone":
      return phoneWords(tray, form);
    case "live":
      return {
        title: `${tray.name} is live`,
        lines: [`On any device signed in to ${domain}.`],
        primary: { label: "Done", act: () => tray.finish() },
      };
    case "failed": {
      const said = failureWords(tray, tray.cause);
      return {
        title: said.title,
        lines: [said.line],
        primary: { label: said.button, act: () => tray.wayOut() },
        meta: tray.watching
          ? { text: "Watching for certificates…", live: true }
          : undefined,
      };
    }
    case "unsupported":
      return {
        title: "No word address on this network",
        lines: [
          "Tailscale, Headscale and NetBird can carry one: CawCo joins as a device and your phone and laptop reach it by name.",
          "ZeroTier, WireGuard alone and this LAN can't, short of a port or root, which CawCo never takes.",
        ],
        primary: { label: "Close", act: () => tray.park() },
      };
  }
}

function secureWords(tray: AddressTray): StateWords {
  if (!tray.issuesCerts) {
    const net = tray.facts.name;
    return {
      title: `No secure address on ${net}`,
      lines: [
        tray.network === "netbird"
          ? `NetBird issues no certificates for peer names, so ${tray.long} stays http. Copy won't work there; everything else does.`
          : `Headscale doesn't issue certificates for its names yet, so ${tray.long} stays http. Copy won't work there; everything else does.`,
      ],
      primary: { label: "Continue", act: () => tray.next() },
    };
  }
  if (tray.certs) {
    return {
      title: "Secure address is on",
      lines: [
        `https://${tray.long} has its certificate, and CawCo renews it itself. The short word stays http: no authority certifies a bare word.`,
      ],
      primary: { label: "Continue", act: () => tray.next() },
    };
  }
  return {
    title: "Make it secure (optional)",
    lines: [
      `Your tailnet isn't issuing certificates yet. An admin turns on HTTPS Certificates in DNS settings, which puts machine names in a public log.`,
      "Once it's on, CawCo picks up the certificate itself, and Copy works at the https address.",
    ],
    meta: tray.watching
      ? { text: "Watching for certificates…", live: true }
      : undefined,
    secondary: { label: "Skip", act: () => tray.next() },
    primary: {
      label: "Open DNS settings",
      act: () => tray.watch("certs"),
      away: true,
    },
  };
}

function keepWords(tray: AddressTray): StateWords {
  if (tray.network === "headscale") {
    // Only on a server that sets `node.expiry` (headscale.net, OpenID
    // Connect: "Use 0 to disable node expiration"); the flow skips it on
    // the default, and Headscale has no switch per device.
    return {
      title: "Keep it signed in",
      lines: [
        `Your Headscale server signs ${tray.name} out on ${dateOf(EXPIRES)}, as its node.expiry setting says.`,
        "Only its admin can change that, for every device at once. CawCo asks you to sign in again before then, here and on your phone.",
      ],
      primary: { label: "Continue", act: () => tray.next() },
    };
  }
  if (tray.expiryOff) {
    return {
      title: "Keep it signed in",
      lines: [`Expiry is off. ${tray.name} stays signed in.`],
      primary: { label: "Continue", act: () => tray.next() },
    };
  }
  return {
    title: "Keep it signed in",
    lines: [
      `Tailscale signs ${tray.name} out after ${EXPIRY_DAYS} days.`,
      `Switch expiry off for ${tray.name} in the machines list and it stays. Leave it on and CawCo asks you to sign in again before then, here and on your phone.`,
    ],
    meta: tray.watching
      ? { text: "Watching for expiry to go off…", live: true }
      : undefined,
    secondary: { label: "Leave it on", act: () => tray.next() },
    primary: {
      label: "Open machines list",
      act: () => tray.watch("expiry"),
      away: true,
    },
  };
}

function phoneWords(tray: AddressTray, form: Form): StateWords {
  if (form === "phone") {
    return {
      title: "Open it here, once",
      lines: [
        tray.bareWordWorks
          ? `Tap this once, slash and all. After that, ${tray.name} alone works in this browser.`
          : `NetBird names it ${tray.long}. Tap this once and this browser remembers it.`,
      ],
      secondary: { label: "Skip for now", act: () => tray.next() },
      primary: {
        label: `Open ${tray.phoneTyped}`,
        act: () => tray.openedHere(),
        away: true,
      },
    };
  }
  return {
    title: "Open it on your phone, once",
    lines: [
      tray.bareWordWorks
        ? `A browser treats a bare word as a search until that device has opened ${tray.typed} once, slash and all. From then on ${tray.name} alone works.`
        : `NetBird names it ${tray.long}. The bare word needs your admin to add ${tray.facts.domain} as a search domain.`,
      ...(tray.seesPhone || tray.phoneOpened
        ? []
        : ["Press Done once it has opened there."]),
    ],
    meta: phoneMeta(tray),
    secondary: tray.phoneOpened
      ? undefined
      : { label: "Skip for now", act: () => tray.next() },
    primary: { label: "Done", act: () => tray.next() },
  };
}

/** The phone step's live line: what the hub sees, or nothing where it can't see a phone. */
function phoneMeta(tray: AddressTray): StateWords["meta"] {
  if (tray.phoneOpened) {
    return { text: "Your phone opened it", live: false };
  }
  return tray.seesPhone
    ? { text: "Waiting for a phone to open it", live: true }
    : undefined;
}

/** The live state's stations as marks: each one done, or a text action that reopens it. */
export function stationMarks(
  tray: AddressTray
): { label: string; done: boolean; reopen?: () => void }[] {
  const marks: { label: string; done: boolean; reopen?: () => void }[] = [];
  if (tray.expires) {
    marks.push(
      tray.expiryOff
        ? { label: "Expiry off", done: true }
        : {
            label: `Expires ${dateOf(EXPIRES)}`,
            done: false,
            reopen: () => tray.reopen("keep"),
          }
    );
  }
  if (tray.issuesCerts) {
    marks.push(
      tray.certs
        ? { label: "Secure on", done: true }
        : {
            label: "Secure: not yet",
            done: false,
            reopen: () => tray.reopen("secure"),
          }
    );
  }
  marks.push(
    tray.phoneOpened
      ? { label: "Phone opened it", done: true }
      : {
          label: "Phone: not yet",
          done: false,
          reopen: () => tray.reopen("phone"),
        }
  );
  return marks;
}

/** The row's want line while the tray is closed: where the set-up stands now. */
export function rowLine(tray: AddressTray): { text: string; live: boolean } {
  switch (tray.step) {
    case "finding":
      return { text: "Looking at this computer's networks…", live: true };
    case "found":
      return {
        text: `Type ${tray.name} on any of your devices to open CawCo. One sign-in sets it up.`,
        live: false,
      };
    case "signin":
      return { text: "Waiting for your sign-in…", live: true };
    case "admin":
      return { text: "Waiting for your admin…", live: true };
    case "key":
      return { text: "Waiting for a setup key", live: false };
    case "checking":
      return { text: "Checking the address…", live: true };
    case "secure":
    case "keep":
    case "phone":
      return {
        text: `${tray.short} answers. A few optional steps are left.`,
        live: false,
      };
    case "live":
      return { text: `Live at ${tray.short}`, live: false };
    case "failed":
      return { text: failureWords(tray, tray.cause).title, live: false };
    case "unsupported":
      return { text: "No word address on this network", live: false };
  }
}

/** What CawCo never does, said wherever the set-up starts. */
const NEVER: Fact[] = [
  { mark: "no", text: "No port taken on this computer" },
  { mark: "no", text: "No root, no sudo" },
  { mark: "no", text: "No rename: this machine keeps its name" },
  { mark: "no", text: "No traffic relayed through anything CawCo runs" },
];

/** Where the network stands, before CawCo joins it. */
function startFacts(tray: AddressTray, finding: boolean): Fact[] {
  const { name: net, domain, control } = tray.facts;
  const at = tray.network === "headscale" ? `, at ${control}` : "";
  return [
    finding
      ? { mark: "wait", text: "Reading the network clients on this computer" }
      : { mark: "yes", text: `${net} is running here${at}` },
    { mark: "info", text: `Names end in ${domain}` },
    { mark: "yes", text: "CawCo adds one device: cawco" },
    ...NEVER,
  ];
}

function secureFacts(tray: AddressTray): Fact[] {
  if (tray.network === "netbird") {
    return [
      { mark: "no", text: "NetBird issues no certificates for peer names" },
      { mark: "info", text: "Tracked upstream: netbirdio/netbird#5479" },
    ];
  }
  if (tray.network === "headscale") {
    return [
      {
        mark: "no",
        text: "Headscale issues no certificates for node names yet",
      },
      { mark: "info", text: "Tracked upstream: juanfont/headscale#2527" },
    ];
  }
  if (tray.certs) {
    return [
      { mark: "yes", text: `Certificate for ${tray.long}` },
      { mark: "info", text: "Issued 23 Oct 2026, renews 21 Jan 2027" },
      { mark: "info", text: "Its name is in the public certificate log" },
    ];
  }
  return [
    { mark: "no", text: "HTTPS Certificates: off in DNS settings" },
    { mark: "info", text: "Only an admin of the network can switch it" },
    { mark: "info", text: "MagicDNS must be on first: it is" },
  ];
}

/** How long the device stays signed in, as its network has it. */
function expiryFact(tray: AddressTray): Fact {
  if (tray.network === "netbird") {
    return { mark: "yes", text: "A setup key's peer never expires" };
  }
  if (tray.network === "headscale") {
    return { mark: "yes", text: "No expiry: the server sets no node.expiry" };
  }
  return tray.expiryOff
    ? { mark: "yes", text: "Expiry off" }
    : {
        mark: "info",
        text: `Expires ${dateOf(EXPIRES)}; CawCo asks before then`,
      };
}

function liveFacts(tray: AddressTray): Fact[] {
  const secure = tray.certs && tray.issuesCerts;
  return [
    { mark: "yes", text: `${tray.facts.name}, ${tray.facts.domain}` },
    { mark: "info", text: `Device ${tray.name}, signed in as you` },
    expiryFact(tray),
    secure
      ? { mark: "yes", text: "Certificate held and renewed" }
      : { mark: "no", text: "No certificate" },
  ];
}

/** Each state's Facts. */
const FACTS: Record<AddressTray["step"], (tray: AddressTray) => Fact[]> = {
  finding: (tray) => startFacts(tray, true),
  found: (tray) => startFacts(tray, false),
  signin: (tray) => [
    { mark: "info", text: `Approve it as an account on ${tray.facts.domain}` },
    { mark: "info", text: "The link was issued 2 min ago" },
    { mark: "info", text: "It goes stale if nobody approves it in 1 hour" },
    { mark: "wait", text: "Nothing to run here: CawCo watches for it" },
  ],
  admin: (tray) => [
    { mark: "info", text: `Control server: ${tray.facts.control}` },
    { mark: "info", text: "Auth ID: hskey-auth-7f3a9c2e" },
    {
      mark: "info",
      text: `User ${HEADSCALE_USER}: read from this computer's own Headscale login`,
    },
    {
      mark: "info",
      text: "An admin can also approve by an OIDC login or the API",
    },
    { mark: "wait", text: "CawCo checks every 5 seconds" },
  ],
  key: (tray) => [
    { mark: "info", text: `Management: ${tray.facts.control}` },
    { mark: "info", text: `It asks to be named cawco on ${tray.facts.domain}` },
    { mark: "no", text: "The key is used once and never kept" },
  ],
  checking: (tray) => [
    { mark: "info", text: `Asked for cawco, given ${tray.name}` },
    { mark: "info", text: "Its address on the network: 100.94.12.7" },
    { mark: "wait", text: "Dialled by name from the hub's own device" },
  ],
  secure: secureFacts,
  keep: (tray) => [
    { mark: "info", text: "Signed in 23 Oct 2026" },
    tray.expiryOff
      ? { mark: "yes", text: "Expiry: off" }
      : { mark: "info", text: `Expiry: on, ${dateOf(EXPIRES)}` },
    { mark: "info", text: "Who can change it: an admin of the network" },
  ],
  phone: (tray) => [
    { mark: "info", text: `The QR opens ${tray.phoneAddress}` },
    { mark: "info", text: `First time, type ${tray.phoneTyped}` },
    { mark: "info", text: `The phone must be on ${tray.facts.domain}` },
  ],
  live: liveFacts,
  failed: (tray) => [
    { mark: "no", text: failureWords(tray, tray.cause).title },
    { mark: "info", text: "Last tried 40 s ago" },
    { mark: "wait", text: "CawCo tries again by itself every minute" },
  ],
  unsupported: () => [
    { mark: "no", text: "ZeroTier is running here: it has no names to give" },
    { mark: "no", text: "WireGuard alone has no names at all" },
    {
      mark: "info",
      text: "Install Tailscale, Headscale or NetBird here and on your phone",
    },
  ],
};

/** The Details fold's Facts: a few drawn facts for the state (or a station's step), never a wall of label rows. */
export function factsFor(
  tray: AddressTray,
  step: AddressTray["step"] = tray.step
): Fact[] {
  return FACTS[step](tray);
}

/** The error each cause came back with, word for word. */
const ERRORS: Record<Cause, string> = {
  "stale-link": "auth URL expired: no login within 1h0m0s",
  "wrong-tailnet":
    "logged in to tailnet other-team.ts.net, expected heron-pike.ts.net",
  refused: "node registration rejected by an admin",
  "key-refused":
    "rpc error: code = PermissionDenied desc = setup key is expired or used up",
  "no-answer": "dial tcp 100.94.12.7:80: i/o timeout",
  expired: "node key expired",
  "certs-off": "cert: HTTPS certificates are not enabled for this tailnet",
};

const json = (value: unknown): string => JSON.stringify(value, null, 2);

/** The Details fold's Raw: what the hub holds for this state, as it holds it. */
export function rawFor(tray: AddressTray): string {
  const base = {
    network: tray.network,
    control: tray.facts.control,
    domain: tray.facts.domain,
  };
  const at = "2026-10-23T21:14:08Z";
  const dialled = tray.bareWordWorks ? tray.short : `http://${tray.long}/`;
  switch (tray.step) {
    case "unsupported":
      return json({
        detected: [
          { client: "zerotier-one", version: "1.14.2", names: false },
          { client: "wg", interfaces: ["wg0"], names: false },
        ],
        at,
      });
    case "finding":
    case "found":
      return json({
        detected: [
          {
            client: tray.network,
            running: true,
            magicDNS: tray.network !== "netbird",
            suffix: tray.facts.domain,
          },
        ],
        at,
      });
    case "signin":
    case "admin":
      return json({
        ...base,
        backendState: "NeedsLogin",
        authURL:
          tray.network === "headscale"
            ? "https://hs.northwind.dev/register/hskey-auth-7f3a9c2e"
            : "https://login.tailscale.com/a/7f3a9c2e41b0",
        issued: at,
        hostname: "cawco",
      });
    case "key":
      return `${at} netbird: management ${tray.facts.control}:443 reachable\n${at} netbird: waiting for a setup key\n${at} netbird: peer name requested: cawco`;
    case "checking":
      return `GET ${dialled} HTTP/1.1\nHost: ${tray.bareWordWorks ? tray.name : tray.long}\n\nHTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\nX-Cawco-Hub: obelisk`;
    case "failed":
      return json({
        ...base,
        cause: tray.cause,
        error: ERRORS[tray.cause],
        lastTried: at,
        next: "in 60 s",
      });
    case "secure":
    case "keep":
    case "phone":
    case "live":
      return json({
        ...base,
        hostname: tray.name,
        ips: ["100.94.12.7"],
        keyExpiry:
          tray.expires && !tray.expiryOff
            ? new Date(EXPIRES).toISOString()
            : null,
        certDomains: tray.certs && tray.issuesCerts ? [tray.long] : [],
        online: true,
      });
  }
}
