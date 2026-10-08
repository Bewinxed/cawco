/*
 * The provider JWT and the APNs sender, adapted from flotilla-relay's
 * src/apns.js, src/b64.js and src/x509.js `pemToDer`
 * (https://github.com/Livin21/flotilla-relay). Changed: TypeScript, one
 * environment per call, the answer's status and reason returned, a host for
 * the health probe, no authorization header when the key is not set.
 *
 * MIT License
 *
 * Copyright (c) 2026 Livin Mathew
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { Buffer } from "node:buffer";

export type ApnsEnvironment = "production" | "sandbox";

const HOSTS: Record<ApnsEnvironment, string> = {
  production: "api.push.apple.com",
  sandbox: "api.sandbox.push.apple.com",
};

/** APNs refuses a provider token older than an hour; a new one every 50 minutes stays clear. */
const TOKEN_LIFE_S = 50 * 60;

const PEM_ARMOUR = /-----(BEGIN|END)[^-]+-----/g;
/** A device token inside an error message. */
const DEVICE_TOKEN = /[0-9a-f]{64,}/g;

/** Base64 decoding skips the line breaks. */
const pemToDer = (pem: string): Uint8Array =>
  Buffer.from(pem.replace(PEM_ARMOUR, ""), "base64");

const b64urlEncode = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64url");

/** Module scope: reused across requests while the isolate lives. */
let cached: { at: number; jwt: string; kid: string } | undefined;

interface Key {
  readonly keyId: string;
  readonly p8: string;
  readonly teamId: string;
}

/** The three APNs secrets, when all are set. */
const keyOf = (env: Env): Key | undefined =>
  env.APNS_TEAM_ID && env.APNS_KEY_ID && env.APNS_P8
    ? { teamId: env.APNS_TEAM_ID, keyId: env.APNS_KEY_ID, p8: env.APNS_P8 }
    : undefined;

export const hasKey = (env: Env): boolean => keyOf(env) !== undefined;

const providerJwt = async ({ keyId, p8, teamId }: Key): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.kid === keyId && now - cached.at < TOKEN_LIFE_S) {
    return cached.jwt;
  }
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(p8),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const enc = new TextEncoder();
  const h = b64urlEncode(
    enc.encode(JSON.stringify({ alg: "ES256", kid: keyId }))
  );
  const p = b64urlEncode(enc.encode(JSON.stringify({ iss: teamId, iat: now })));
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(`${h}.${p}`)
  );
  cached = {
    jwt: `${h}.${p}.${b64urlEncode(new Uint8Array(sig))}`,
    at: now,
    kid: keyId,
  };
  return cached.jwt;
};

export interface ApnsAnswer {
  /** APNs' reason, or the error's name when APNs was not reached. */
  readonly reason: string | null;
  /** HTTP status, or 0 when APNs was not reached. */
  readonly status: number;
}

/** One POST to APNs; never throws. */
export const sendApns = async (
  env: Env,
  push: {
    readonly apnsEnvironment: ApnsEnvironment;
    readonly body: string;
    readonly collapseId?: string;
    readonly deviceToken: string;
    readonly expiration?: number;
  }
): Promise<ApnsAnswer> => {
  try {
    const headers: Record<string, string> = {
      "apns-topic": env.APNS_TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    };
    const key = keyOf(env);
    if (key) {
      headers.authorization = `bearer ${await providerJwt(key)}`;
    }
    if (push.collapseId) {
      headers["apns-collapse-id"] = push.collapseId;
    }
    if (push.expiration !== undefined) {
      headers["apns-expiration"] = String(push.expiration);
    }
    const response = await fetch(
      `https://${HOSTS[push.apnsEnvironment]}/3/device/${push.deviceToken}`,
      { method: "POST", headers, body: push.body }
    );
    if (response.ok) {
      return { status: response.status, reason: null };
    }
    const text = await response.text();
    let reason: string | null = null;
    try {
      reason = (JSON.parse(text) as { reason?: string }).reason ?? null;
    } catch {
      reason = text.slice(0, 200) || null;
    }
    if (
      reason === "ExpiredProviderToken" ||
      reason === "InvalidProviderToken"
    ) {
      cached = undefined;
    }
    return { status: response.status, reason };
  } catch (error) {
    // The message can carry the URL, and with it the device token: that part is cut.
    return {
      status: 0,
      reason:
        error instanceof Error
          ? error.message.replace(DEVICE_TOKEN, "…")
          : "APNs not reached",
    };
  }
};
