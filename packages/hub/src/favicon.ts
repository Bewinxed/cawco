/**
 * Site icons for the hosts a transcript names (a web fetch, an MCP server),
 * served by the hub itself: `GET /api/favicon?host=<host>`. No reader's
 * browser or phone asks a third party for them, so the hostnames an agent
 * touched never leave the user's own hub (App Review 5.1.2(i)).
 *
 * The hub reads the site's own icon: the home page's `<link rel=icon>`, else
 * `/favicon.ico`, over https on the default port only, with a short timeout
 * and a size cap. It keeps what it found on disk beside the database — an
 * icon for a week, a miss for a day — so each host is fetched once.
 *
 * It can't be pointed inside the network: a host must be a public name (the
 * zones `faviconReachable` excludes are refused), every address it resolves
 * to must be public unicast and the socket connects to the very addresses
 * checked, and each redirect hop is held to the same rules.
 * Only raster images it recognises by their bytes are served (never SVG, which
 * could carry script), under a sandboxing CSP.
 */
import { createHash } from "node:crypto";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { get as httpsGet } from "node:https";
import type { LookupFunction } from "node:net";
import { dirname, join } from "node:path";
import { faviconReachable } from "@cawco/core/tool-presentation";
import { Elysia, t } from "elysia";
import { DB_PATH } from "./config";

const DIR = join(dirname(DB_PATH), "favicons");

const DAY_MS = 24 * 60 * 60 * 1000;
const ICON_KEPT_MS = 7 * DAY_MS;
const MISS_KEPT_MS = DAY_MS;
const TIMEOUT_MS = 5000;
const PAGE_CAP = 256 * 1024;
const ICON_CAP = 128 * 1024;
const MAX_HOPS = 3;

/** A DNS name: dot-separated labels, no port, no address literal. */
const HOST =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;

const HEXTET = /^[0-9a-f]{1,4}$/i;
const LINK_TAG = /<link\b[^>]*>/gi;
const SPACES = /\s+/;
const TRAILING_DOT = /\.$/;

/** Whether `host` names a public site this hub may ask for its icon. */
const publicName = (host: string): boolean =>
  HOST.test(host) && faviconReachable(host);

const v4Number = (ip: string): number | undefined => {
  const parts = ip.split(".").map(Number);
  return parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts.reduce((sum, part) => sum * 256 + part, 0)
    : undefined;
};

/** IPv4 ranges that are not the public internet (RFC 6890 and kin). */
const V4_RESERVED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const publicV4 = (ip: string): boolean => {
  const n = v4Number(ip);
  if (n === undefined) {
    return false;
  }
  return !V4_RESERVED.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    const start = v4Number(base) ?? 0;
    return n >= start && n < start + size;
  });
};

/** The eight 16-bit groups of an IPv6 address; undefined when it is not one. */
const v6Groups = (raw: string): number[] | undefined => {
  const ip = raw.split("%")[0] ?? "";
  const [head = "", tail, extra] = ip.split("::");
  if (extra !== undefined) {
    return undefined;
  }
  const side = (part: string): number[] | undefined => {
    if (part === "") {
      return [];
    }
    const groups: number[] = [];
    for (const piece of part.split(":")) {
      const v4 = piece.includes(".") ? v4Number(piece) : undefined;
      if (v4 !== undefined) {
        groups.push(Math.floor(v4 / 65_536), v4 % 65_536);
      } else if (HEXTET.test(piece)) {
        groups.push(Number.parseInt(piece, 16));
      } else {
        return undefined;
      }
    }
    return groups;
  };
  const left = side(head);
  const right = tail === undefined ? [] : side(tail);
  if (!(left && right)) {
    return undefined;
  }
  const fill = 8 - left.length - right.length;
  if (tail === undefined ? fill !== 0 : fill < 1) {
    return undefined;
  }
  return [...left, ...new Array<number>(fill).fill(0), ...right];
};

/** Public IPv6 is global unicast (2000::/3), less documentation, Teredo and 6to4, which tunnel to anywhere. */
const publicV6 = (ip: string): boolean => {
  const g = v6Groups(ip);
  if (!g) {
    return false;
  }
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, h = 0, i = 0] = g;
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xff_ff) {
    const octets = [h / 256, h % 256, i / 256, i % 256].map(Math.floor);
    return publicV4(octets.join("."));
  }
  return (
    a >= 0x20_00 &&
    a < 0x40_00 &&
    !(a === 0x20_01 && b === 0x0d_b8) &&
    !(a === 0x20_01 && b === 0) &&
    a !== 0x20_02
  );
};

const publicAddress = (address: string, family: number): boolean =>
  family === 6 ? publicV6(address) : publicV4(address);

/**
 * The resolver every connection uses: it answers only when every address the
 * name has is public, and the socket connects to exactly the addresses it
 * checked — a name can't pass the check and then resolve inside the network.
 */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) {
      callback(error, "", 0);
      return;
    }
    const list = addresses as LookupAddress[];
    if (
      list.length === 0 ||
      !list.every(({ address, family }) => publicAddress(address, family))
    ) {
      const refused = Object.assign(
        new Error(`${hostname} resolves inside the network`),
        { code: "ENOTFOUND" }
      );
      callback(refused, "", 0);
      return;
    }
    if (options.all) {
      callback(null, list);
      return;
    }
    const [first] = list;
    callback(null, first?.address ?? "", first?.family ?? 4);
  });
};

/** A URL this hub may fetch: https on the default port, no credentials, a public name. */
const fetchable = (url: URL): boolean =>
  url.protocol === "https:" &&
  url.port === "" &&
  url.username === "" &&
  url.password === "" &&
  publicName(url.hostname);

type Answer =
  | { kind: "body"; bytes: Buffer; type: string }
  | { kind: "redirect"; location: string };

/** One GET through {@link publicLookup}; the body is read up to `cap` bytes. */
const getOnce = (
  url: URL,
  cap: number,
  accept: string
): Promise<Answer | undefined> =>
  new Promise((resolve) => {
    const request = httpsGet(
      url,
      {
        lookup: publicLookup,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept, "user-agent": "CawCo hub (site icon)" },
      },
      (response) => {
        const code = response.statusCode ?? 0;
        const { location } = response.headers;
        if (code >= 300 && code < 400 && location) {
          response.destroy();
          resolve({ kind: "redirect", location });
          return;
        }
        if (
          code !== 200 ||
          Number(response.headers["content-length"] ?? 0) > cap
        ) {
          response.destroy();
          resolve(undefined);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > cap) {
            response.destroy();
            resolve(undefined);
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            kind: "body",
            bytes: Buffer.concat(chunks),
            type: response.headers["content-type"] ?? "",
          })
        );
        response.on("error", () => resolve(undefined));
      }
    );
    request.on("error", () => resolve(undefined));
  });

/**
 * One GET, following at most `hops` redirects, each held to
 * {@link fetchable}. Undefined for anything but a 200 within `cap`.
 */
const fetchCapped = async (
  url: URL,
  cap: number,
  accept: string,
  hops = MAX_HOPS
): Promise<{ bytes: Buffer; type: string; url: URL } | undefined> => {
  if (!fetchable(url)) {
    return undefined;
  }
  const answer = await getOnce(url, cap, accept);
  if (answer?.kind === "body") {
    return { bytes: answer.bytes, type: answer.type, url };
  }
  if (answer?.kind !== "redirect" || hops === 0) {
    return undefined;
  }
  const next = URL.parse(answer.location, url);
  return next ? await fetchCapped(next, cap, accept, hops - 1) : undefined;
};

/** The raster type `bytes` begin with; never SVG or anything a browser could run. */
const sniff = (bytes: Uint8Array): string | undefined => {
  const at = (offset: number, ...values: number[]) =>
    values.every((value, index) => bytes[offset + index] === value);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return "image/png";
  }
  if (at(0, 0x00, 0x00, 0x01, 0x00)) {
    return "image/x-icon";
  }
  if (at(0, 0x47, 0x49, 0x46, 0x38)) {
    return "image/gif";
  }
  if (at(0, 0xff, 0xd8, 0xff)) {
    return "image/jpeg";
  }
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) {
    return "image/webp";
  }
  return undefined;
};

const attribute = (tag: string, name: string): string | undefined => {
  const match = tag.match(
    new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value?.replaceAll("&amp;", "&").trim();
};

/** The icon links a page declares, plain icons before touch icons, SVG left out. */
const iconLinks = (html: string, page: URL): URL[] => {
  const found: { url: URL; touch: boolean }[] = [];
  for (const [tag] of html.matchAll(LINK_TAG)) {
    const rel = (attribute(tag, "rel") ?? "").toLowerCase().split(SPACES);
    const href = attribute(tag, "href");
    const type = (attribute(tag, "type") ?? "").toLowerCase();
    const touch = rel.includes("apple-touch-icon");
    if (!(href && (rel.includes("icon") || touch)) || type.includes("svg")) {
      continue;
    }
    try {
      const url = new URL(href, page);
      if (url.protocol === "https:" && !url.pathname.endsWith(".svg")) {
        found.push({ url, touch });
      }
    } catch {
      // A malformed href is no icon.
    }
  }
  return found
    .sort((a, b) => Number(a.touch) - Number(b.touch))
    .map(({ url }) => url);
};

interface Icon {
  bytes: Uint8Array;
  type: string;
}

/** Reads the site's icon: its declared links in order, then `/favicon.ico`. */
const fetchIcon = async (host: string): Promise<Icon | undefined> => {
  const home = new URL(`https://${host}/`);
  const page = await fetchCapped(home, PAGE_CAP, "text/html");
  const candidates = page?.type.includes("html")
    ? iconLinks(new TextDecoder().decode(page.bytes), page.url)
    : [];
  candidates.push(new URL("/favicon.ico", page?.url ?? home));
  const tried = new Set<string>();
  for (const candidate of candidates.slice(0, 4)) {
    if (tried.has(candidate.href)) {
      continue;
    }
    tried.add(candidate.href);
    // biome-ignore lint/performance/noAwaitInLoops: the first icon that answers is the one
    const icon = await fetchCapped(candidate, ICON_CAP, "image/*");
    const type = icon ? sniff(icon.bytes) : undefined;
    if (icon && type) {
      return { bytes: icon.bytes, type };
    }
  }
  return undefined;
};

interface Meta {
  at: number;
  type: string | null;
}

const paths = (host: string) => {
  const key = createHash("sha256").update(host).digest("hex");
  return { meta: join(DIR, `${key}.json`), image: join(DIR, `${key}.img`) };
};

/** The cached answer for `host` while it is fresh. */
const cached = async (host: string): Promise<Icon | null | undefined> => {
  const { meta, image } = paths(host);
  try {
    const stored = JSON.parse(await readFile(meta, "utf8")) as Meta;
    const kept = stored.type ? ICON_KEPT_MS : MISS_KEPT_MS;
    if (Date.now() - stored.at > kept) {
      return undefined;
    }
    return stored.type
      ? { bytes: await readFile(image), type: stored.type }
      : null;
  } catch {
    return undefined;
  }
};

const remember = async (host: string, icon: Icon | undefined) => {
  const { meta, image } = paths(host);
  await mkdir(DIR, { recursive: true });
  if (icon) {
    await writeFile(image, icon.bytes);
  }
  const stored: Meta = { at: Date.now(), type: icon?.type ?? null };
  await writeFile(meta, JSON.stringify(stored));
};

/** Reads in flight, by host: a board of chips for one site is one fetch. */
const inFlight = new Map<string, Promise<Icon | null>>();

const iconFor = (host: string): Promise<Icon | null> => {
  const running = inFlight.get(host);
  if (running !== undefined) {
    return running;
  }
  const read = (async () => {
    const hit = await cached(host);
    if (hit !== undefined) {
      return hit;
    }
    const icon = await fetchIcon(host).catch(() => undefined);
    await remember(host, icon).catch((error: unknown) =>
      console.warn(
        `[favicon] ${host}: not kept — ${error instanceof Error ? error.message : String(error)}`
      )
    );
    return icon ?? null;
  })().finally(() => inFlight.delete(host));
  inFlight.set(host, read);
  return read;
};

export const faviconRoutes = () =>
  new Elysia().get(
    "/api/favicon",
    { query: t.Object({ host: t.String({ minLength: 1, maxLength: 253 }) }) },
    async ({ query, status }) => {
      const host = query.host.trim().toLowerCase().replace(TRAILING_DOT, "");
      if (!publicName(host)) {
        return status(400, "That host is not a public site name.");
      }
      const icon = await iconFor(host);
      if (!icon) {
        return status(404, "That site has no icon this hub could read.");
      }
      return new Response(new Uint8Array(icon.bytes), {
        headers: {
          "content-type": icon.type,
          "cache-control": "public, max-age=86400",
          "content-security-policy": "default-src 'none'; sandbox",
          "x-content-type-options": "nosniff",
        },
      });
    }
  );
