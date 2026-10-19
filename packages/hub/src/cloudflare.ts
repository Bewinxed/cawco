/**
 * What the stream relay's journey asks of Cloudflare (relay-journey.ts), with
 * the person's API token (Zone · DNS · Edit, kept sealed): the token checked
 * (`GET /user/tokens/verify`, which answers `"status": "active"`), the zone
 * of the relay's name found (`GET /zones?name=<zone>`), and its record made
 * DNS only (`POST /zones/{zone_id}/dns_records` with `"proxied": false`,
 * developers.cloudflare.com/dns/manage-dns-records/reference/dns-record-types/).
 * And the IPv4 ranges Cloudflare's proxy answers from
 * (https://www.cloudflare.com/ips-v4/), read at most once a day, by which a
 * name that answers with one of them is proxied.
 *
 * A scratch fleet names its stand-ins (`CAWCO_CLOUDFLARE_API`,
 * `CAWCO_CLOUDFLARE_IPS`): no request then leaves the machine.
 */
import { BlockList, isIPv4 } from "node:net";
import { CAWCO_ENV, readEnv } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";

const API = "https://api.cloudflare.com/client/v4";
const IPS = "https://www.cloudflare.com/ips-v4/";
/** How long Cloudflare has to answer one request. */
const CALL_MS = 15_000;
/** How long a read of Cloudflare's ranges serves before it is read again. */
const RANGES_MS = 24 * 60 * 60_000;

/** Cloudflare's v4 envelope. */
interface Envelope<T> {
  errors?: { code?: number; message?: string }[];
  result?: T;
  success?: boolean;
}

/** One answer: what Cloudflare gave, or its words for why not. */
export type CloudflareRead<T> =
  { ok: true; value: T } | { ok: false; said: string };

const apiOrigin = (): string => readEnv(CAWCO_ENV.cloudflareApi) ?? API;

/** `read` given `ms` to answer (core bounded.ts `readWithin`); unanswered, it throws saying what went unanswered. */
const within = async <T>(
  ms: number,
  what: string,
  read: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const answer = await readWithin(ms, read);
  if (answer.kind === "unanswered") {
    throw new Error(`${what}: no answer within ${ms} ms`);
  }
  return answer.value;
};

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** One call to Cloudflare's API with `token`: its result, or its first error's words. */
const call = async <T>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<CloudflareRead<T>> => {
  try {
    const response = await within(
      CALL_MS,
      `Cloudflare's ${path}`,
      async (signal) => {
        const sent = await fetch(`${apiOrigin()}${path}`, {
          method: init.method ?? "GET",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          ...(init.body === undefined
            ? {}
            : { body: JSON.stringify(init.body) }),
          signal,
        });
        return {
          ok: sent.ok,
          status: sent.status,
          envelope: (await sent.json().catch(() => ({}))) as Envelope<T>,
        };
      }
    );
    const { envelope } = response;
    if (
      response.ok &&
      envelope.success !== false &&
      envelope.result !== undefined
    ) {
      return { ok: true, value: envelope.result };
    }
    const first = envelope.errors?.[0];
    return {
      ok: false,
      said: first?.message
        ? `${first.message}${first.code ? `, code ${first.code}` : ""}`
        : `HTTP ${response.status}`,
    };
  } catch (error) {
    return { ok: false, said: said(error) };
  }
};

/** The token is live: Cloudflare's verify answers `active`. */
export const verifyToken = async (
  token: string
): Promise<CloudflareRead<true>> => {
  const read = await call<{ status?: string }>(token, "/user/tokens/verify");
  if (!read.ok) {
    return read;
  }
  return read.value.status === "active"
    ? { ok: true, value: true }
    : { ok: false, said: `the token is ${read.value.status ?? "not active"}` };
};

/** The id of the zone named `zone` the token reaches; undefined when it reaches none. */
export const zoneId = async (
  token: string,
  zone: string
): Promise<CloudflareRead<string | undefined>> => {
  const read = await call<{ id: string; name: string }[]>(
    token,
    `/zones?name=${encodeURIComponent(zone)}`
  );
  return read.ok
    ? { ok: true, value: read.value.find((one) => one.name === zone)?.id }
    : read;
};

/** `name`'s A record pointing at `address`, DNS only, made in the zone. */
export const addRecord = (
  token: string,
  zone: string,
  name: string,
  address: string
): Promise<CloudflareRead<unknown>> =>
  call(token, `/zones/${encodeURIComponent(zone)}/dns_records`, {
    method: "POST",
    body: { type: "A", name, content: address, ttl: 1, proxied: false },
  });

let ranges: { at: number; list: BlockList } | undefined;

/** Cloudflare's proxy ranges, read when the last read is a day old; the read before stands when a new one fails. */
const cloudflareRanges = async (): Promise<BlockList | undefined> => {
  if (ranges && Date.now() - ranges.at < RANGES_MS) {
    return ranges.list;
  }
  try {
    const url = readEnv(CAWCO_ENV.cloudflareIps) ?? IPS;
    const text = await within(CALL_MS, url, async (signal) => {
      const sent = await fetch(url, { signal });
      if (!sent.ok) {
        throw new Error(`HTTP ${sent.status}`);
      }
      return sent.text();
    });
    const list = new BlockList();
    for (const line of text.split("\n")) {
      const [net, prefix] = line.trim().split("/");
      if (net && prefix && isIPv4(net)) {
        list.addSubnet(net, Number(prefix), "ipv4");
      }
    }
    ranges = { at: Date.now(), list };
    return list;
  } catch (error) {
    console.warn(
      `[relay-journey] Cloudflare's ranges were not read: ${said(error)}`
    );
    return ranges?.list;
  }
};

/** Whether `address` is one Cloudflare's proxy answers from. */
export const isCloudflareAddress = async (address: string): Promise<boolean> =>
  isIPv4(address) &&
  ((await cloudflareRanges())?.check(address, "ipv4") ?? false);
