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
 * to must be a public destination (core public-address.ts) and the socket connects to the very addresses
 * checked, and each redirect hop is held to the same rules.
 * Only raster images it recognises by their bytes are served (never SVG, which
 * could carry script), under a sandboxing CSP.
 */
import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns";
import { readFile } from "node:fs/promises";
import { get as httpsGet } from "node:https";
import type { LookupFunction } from "node:net";
import { dirname, join } from "node:path";
import { boundedWhileLive, type Unanswered } from "@cawco/core/effect/bounded";
import { makeJoin } from "@cawco/core/effect/join";
import { isPublicDestination } from "@cawco/core/public-address";
import { parseRecord, writeStateFile } from "@cawco/core/state-file";
import { DAY_MS, secondsOf } from "@cawco/core/time";
import { faviconReachable } from "@cawco/core/tool-presentation";
import { Effect, Result } from "effect";
import { Elysia, problem, t } from "elysia";
import { z } from "zod";
import { DB_PATH } from "./config";
import type { HubLifetimeShape } from "./lifetime";

const DIR = join(dirname(DB_PATH), "favicons");

const ICON_KEPT_MS = 7 * DAY_MS;
const MISS_KEPT_MS = DAY_MS;
const PAGE_CAP = 256 * 1024;
// @limit measured: the largest favicon kept is 16.6 KiB of 27 (obelisk, 2026-11-26)
const ICON_CAP = 128 * 1024;
// @limit external: the Fetch standard follows at most 20 redirects (https://fetch.spec.whatwg.org/#http-redirect-fetch)
const MAX_HOPS = 20;

/** A DNS name: dot-separated labels, no port, no address literal. */
const HOST =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/u;

const LINK_TAG = /<link\b[^>]*>/giu;
const SPACES = /\s+/u;
const TRAILING_DOT = /\.$/u;

/** Whether `host` names a public site this hub may ask for its icon. */
const publicName = (host: string): boolean =>
  HOST.test(host) && faviconReachable(host);

/**
 * The resolver every connection uses: it answers only when every address the
 * name has is public, and the socket connects to exactly the addresses it
 * checked — a name can't pass the check and then resolve inside the network.
 */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (error, list) => {
    if (error) {
      callback(error, "", 0);
      return;
    }
    if (
      list.length === 0 ||
      !list.every(({ address }) => isPublicDestination(address))
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

/** One GET through {@link publicLookup}, waited on while its bytes arrive (its head, then each chunk); the body is read up to `cap` bytes. */
const getOnce = (
  url: URL,
  cap: number,
  accept: string
): Effect.Effect<Answer | undefined, Unanswered> =>
  boundedWhileLive((alive) => fetchOnce(url, cap, accept, alive));

/** One GET, as {@link getOnce} has it read; interrupted, the request is let go. */
const fetchOnce = (
  url: URL,
  cap: number,
  accept: string,
  alive: () => void
): Effect.Effect<Answer | undefined> =>
  Effect.callback<Answer | undefined>((resume, signal) => {
    const done = (answer: Answer | undefined): void => {
      resume(Effect.succeed(answer));
    };
    const request = httpsGet(
      url,
      {
        lookup: publicLookup,
        signal,
        headers: { accept, "user-agent": "CawCo hub (site icon)" },
      },
      (response) => {
        alive();
        const code = response.statusCode ?? 0;
        const { location } = response.headers;
        if (code >= 300 && code < 400 && location) {
          response.destroy();
          done({ kind: "redirect", location });
          return;
        }
        if (
          code !== 200 ||
          Number(response.headers["content-length"] ?? 0) > cap
        ) {
          response.destroy();
          done(undefined);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          alive();
          size += chunk.byteLength;
          if (size > cap) {
            response.destroy();
            done(undefined);
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          done({
            kind: "body",
            bytes: Buffer.concat(chunks),
            type: response.headers["content-type"] ?? "",
          })
        );
        response.on("error", () => done(undefined));
      }
    );
    request.on("error", () => done(undefined));
  });

/**
 * One GET, following at most `hops` redirects, each held to
 * {@link fetchable}. Answered undefined for anything but a 200 within `cap`;
 * unanswered when a hop did not answer in time.
 */
const fetchCapped = Effect.fnUntraced(function* (
  url: URL,
  cap: number,
  accept: string,
  hops = MAX_HOPS
): Effect.fn.Return<
  { bytes: Buffer; type: string; url: URL } | undefined,
  Unanswered
> {
  if (!fetchable(url)) {
    return;
  }
  const answer = yield* getOnce(url, cap, accept);
  if (answer?.kind === "body") {
    return { bytes: answer.bytes, type: answer.type, url };
  }
  if (answer?.kind !== "redirect" || hops === 0) {
    return;
  }
  const next = URL.parse(answer.location, url);
  return next ? yield* fetchCapped(next, cap, accept, hops - 1) : undefined;
});

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
    new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "iu")
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

/**
 * Reads the site's icon: its declared links in order, then `/favicon.ico`.
 * Answered undefined only when every read answered and none was an icon;
 * unanswered when no icon was found and a read did not answer in time, as
 * the site's icon is then not known.
 */
const fetchIcon = Effect.fnUntraced(function* (
  host: string
): Effect.fn.Return<Icon | undefined, Unanswered> {
  const home = new URL(`https://${host}/`);
  /** The first read that went unanswered, if one did. */
  let silent: Unanswered | undefined;
  const pageRead = yield* Effect.result(
    fetchCapped(home, PAGE_CAP, "text/html")
  );
  let page: { bytes: Buffer; type: string; url: URL } | undefined;
  if (Result.isSuccess(pageRead)) {
    page = pageRead.success;
  } else {
    silent = pageRead.failure;
  }
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
    const iconRead = yield* Effect.result(
      fetchCapped(candidate, ICON_CAP, "image/*")
    );
    if (Result.isFailure(iconRead)) {
      silent ??= iconRead.failure;
      continue;
    }
    const icon = iconRead.success;
    const type = icon ? sniff(icon.bytes) : undefined;
    if (icon && type) {
      return { bytes: icon.bytes, type };
    }
  }
  return silent ? yield* silent : undefined;
});

const MetaSchema = z.object({
  at: z.number(),
  type: z.string().nullable(),
});
type Meta = z.infer<typeof MetaSchema>;

const paths = (host: string) => {
  const key = createHash("sha256").update(host).digest("hex");
  return { meta: join(DIR, `${key}.json`), image: join(DIR, `${key}.img`) };
};

/** The cached answer for `host`: while it is fresh, or any age when `stale`. */
const cached = async (
  host: string,
  stale = false
): Promise<Icon | null | undefined> => {
  const { meta, image } = paths(host);
  try {
    const stored = parseRecord(meta, await readFile(meta, "utf8"), MetaSchema);
    const kept = stored.type ? ICON_KEPT_MS : MISS_KEPT_MS;
    if (!stale && Date.now() - stored.at > kept) {
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
  if (icon) {
    await writeStateFile(image, icon.bytes);
  }
  const stored: Meta = { at: Date.now(), type: icon?.type ?? null };
  await writeStateFile(meta, JSON.stringify(stored));
};

/** Reads in flight, by host: a board of chips for one site is one fetch. */
const inFlight = makeJoin<string, Icon | null, Unanswered>();

/**
 * The site's icon, or null when it has none. A site that did not answer in
 * time is kept as it was: nothing is written, and the read is unanswered.
 */
const iconFor = (host: string): Effect.Effect<Icon | null, Unanswered> =>
  inFlight.run(
    host,
    Effect.gen(function* () {
      const hit = yield* Effect.promise(() => cached(host));
      if (hit !== undefined) {
        return hit;
      }
      const icon = yield* fetchIcon(host).pipe(
        Effect.catchDefect(() => Effect.succeed(undefined)),
        Effect.tapError((unanswered) =>
          Effect.sync(() =>
            console.warn(
              `[favicon] ${host}: did not answer within ${secondsOf(unanswered.after)} s; nothing kept`
            )
          )
        )
      );
      // Its two files written together: an interrupted read keeps both or neither.
      yield* Effect.uninterruptible(
        Effect.promise(() =>
          remember(host, icon).catch((error: unknown) =>
            console.warn(
              `[favicon] ${host}: not kept — ${error instanceof Error ? error.message : String(error)}`
            )
          )
        )
      );
      return icon ?? null;
    })
  );

export const faviconRoutes = (lifetime: HubLifetimeShape) =>
  new Elysia().get(
    "/api/favicon",
    // @limit external: a DNS name is 255 octets on the wire (RFC 1035 section 3.1; RFC 2181 section 11), which is 253 characters written with dots
    { query: t.Object({ host: t.String({ minLength: 1, maxLength: 253 }) }) },
    async ({ query, set }) => {
      const host = query.host.trim().toLowerCase().replace(TRAILING_DOT, "");
      if (!publicName(host)) {
        return problem(400, {
          code: "host-not-public-site",
          detail: "That host is not a public site name.",
        });
      }
      const read = await lifetime.run(Effect.result(iconFor(host)));
      let icon: Icon | null | undefined;
      if (Result.isSuccess(read)) {
        icon = read.success;
      } else {
        // The last icon kept for it stands, however old.
        icon = await cached(host, true);
        if (icon === undefined) {
          return problem(504, {
            code: "site-did-not-answer",
            detail: `That site did not answer within ${secondsOf(read.failure.after)} s.`,
          });
        }
      }
      if (!icon) {
        return problem(404, {
          code: "site-has-no-icon",
          detail: "That site has no icon this hub could read.",
        });
      }
      set.headers["content-type"] = icon.type;
      set.headers["cache-control"] = "public, max-age=86400";
      set.headers["content-security-policy"] = "default-src 'none'; sandbox";
      set.headers["x-content-type-options"] = "nosniff";
      return new Blob([new Uint8Array(icon.bytes)]);
    }
  );
