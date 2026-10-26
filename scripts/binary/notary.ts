/**
 * Apple's Notary API, called by the release itself rather than through
 * rcodesign's `notary-submit`, so each request is one {@link exchange} whose
 * failure has a kind (outside-call.ts): a request that got no answer is asked
 * again, a refusal ends the notarization with Apple's words. rcodesign 0.29.0
 * has no retry setting for a submit, and its failures reach us as text alone
 * (nightly 5514: "Error: error sending request for url
 * (https://appstoreconnect.apple.com/notary/v2/submissions)").
 *
 * The flow is Apple's (developer.apple.com/documentation/notaryapi/submit-software):
 * POST a submission (its name and the upload's sha256), which answers with
 * temporary S3 credentials and the submission's id; PUT the zip to that S3
 * object; poll the submission's status until it is no longer "In Progress";
 * fetch its log. The S3 region is us-west-2: Apple names none, rcodesign
 * notarization.rs found it by trying ("From manually testing all available
 * regions, it appears to be us-west-2").
 *
 * A SUBMIT IS NOT REPEATED BLINDLY. Apple offers no idempotent submit, and its
 * list of submissions carries each one's name, date and status, no hash
 * (get-previous-submissions: "the unique identifier for the submission, the
 * date you initiated the submission, the name of the associated software,
 * and the status"). So each submission's name is unique to its upload (the
 * caller puts the sha256 in it; Apple: "making it so might help you to
 * distinguish among submissions"), and before a submit is sent again the
 * list is read for that name. One found is a submission the unanswered POST
 * made; its upload credentials were in the answer that never came, so it
 * can never receive the file: it is named in the log, counted in the
 * ledger, and the new submission goes up beside it.
 *
 * The S3 PUT, the status polls and the log reads are safe to repeat and are
 * asked again as they are.
 */
import { createPrivateKey, type KeyObject, sign } from "node:crypto";
import { type Answer, ask, exchange, persist } from "../lib/outside-call";

const SUBMISSIONS = "https://appstoreconnect.apple.com/notary/v2/submissions";
const S3_REGION = "us-west-2";
/** Between status polls: rcodesign polls every 3s; a release has no hurry within Apple's minutes. */
const POLL_MS = 10_000;
/** One upload attempt of a bundle of some hundred MB. */
const UPLOAD_TIMEOUT_MS = 15 * 60_000;

/** rcodesign's `encode-app-store-connect-api-key` JSON: the key's DER, base64. */
interface ApiKeyJson {
  issuer_id: string;
  key_id: string;
  private_key: string;
}

interface Submission {
  attributes: { createdDate: string; name: string; status: string };
  id: string;
}

/** What Apple said of a submission once it ended. */
export interface Notarized {
  id: string;
  /** The submission's log, as Apple's developer log URL serves it. */
  log: string;
  /** "Accepted", "Invalid" or "Rejected"; "In Progress" when the wait ran out. */
  status: string;
}

/** A JWT for the App Store Connect API, minted per request (Apple caps one at 20 minutes). */
const tokenOf = (key: ApiKeyJson, privateKey: KeyObject) => (): string => {
  const now = Math.floor(Date.now() / 1000);
  const part = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${part({ alg: "ES256", kid: key.key_id, typ: "JWT" })}.${part({
    iss: key.issuer_id,
    iat: now,
    exp: now + 15 * 60,
    aud: "appstoreconnect-v1",
  })}`;
  const signature = sign("sha256", Buffer.from(body), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${body}.${signature.toString("base64url")}`;
};

const json = <T>(answer: Answer): T => JSON.parse(answer.text) as T;

/**
 * `zip` (whose sha256 is `sha256`) notarized under `name`: submitted (each submit counted by `record`
 * first), uploaded, waited on for up to `waitS` seconds, its log read.
 * Throws when Apple refused a request or never answered one; answers Apple's
 * verdict otherwise, whatever it is.
 */
export async function notarize(options: {
  apiKeyFile: string;
  name: string;
  record: () => Promise<void>;
  /** The zip's sha256, hex. */
  sha256: string;
  waitS: number;
  zip: string;
}): Promise<Notarized> {
  const key = JSON.parse(
    await Bun.file(options.apiKeyFile).text()
  ) as ApiKeyJson;
  const token = tokenOf(
    key,
    createPrivateKey({
      key: Buffer.from(key.private_key, "base64"),
      format: "der",
      type: "pkcs8",
    })
  );
  const authorized = (): Record<string, string> => ({
    Accept: "application/json",
    Authorization: `Bearer ${token()}`,
  });
  const { sha256 } = options;
  console.log(
    `creating Notary API submission ${options.name} (sha256: ${sha256})`
  );
  const created = await persist(`notary submit ${options.name}`, async (n) => {
    if (n > 1) {
      const listed = json<{ data: Submission[] }>(
        await exchange(`notary list (before submit ${n})`, SUBMISSIONS, {
          headers: authorized(),
        })
      );
      for (const made of listed.data.filter(
        (row) => row.attributes.name === options.name
      )) {
        console.log(
          `notary: the unanswered submit reached Apple as ${made.id} (${made.attributes.status}, ${made.attributes.createdDate}); its upload credentials never arrived, so submit ${n} goes up beside it`
        );
      }
    }
    await options.record();
    return json<{
      data: {
        attributes: {
          awsAccessKeyId: string;
          awsSecretAccessKey: string;
          awsSessionToken: string;
          bucket: string;
          object: string;
        };
        id: string;
      };
    }>(
      await exchange(`notary submit ${options.name}`, SUBMISSIONS, {
        method: "POST",
        headers: { ...authorized(), "Content-Type": "application/json" },
        body: JSON.stringify({ sha256, submissionName: options.name }),
      })
    ).data;
  });
  const { id } = created;
  console.log(`created submission ID: ${id}`);
  const s3 = created.attributes;
  const put = new Bun.S3Client({
    accessKeyId: s3.awsAccessKeyId,
    secretAccessKey: s3.awsSecretAccessKey,
    sessionToken: s3.awsSessionToken,
    bucket: s3.bucket,
    region: S3_REGION,
  }).presign(s3.object, { method: "PUT", expiresIn: 6 * 60 * 60 });
  await ask(
    `notary upload ${id}`,
    put,
    { method: "PUT", body: Bun.file(options.zip) },
    UPLOAD_TIMEOUT_MS
  );
  console.log(`uploaded ${options.name} to s3://${s3.bucket}/${s3.object}`);
  const deadline = performance.now() + options.waitS * 1000;
  let status = "In Progress";
  while (status === "In Progress" && performance.now() < deadline) {
    await Bun.sleep(POLL_MS);
    ({ status } = json<{ data: Submission }>(
      await ask(`notary status ${id}`, `${SUBMISSIONS}/${id}`, {
        headers: authorized(),
      })
    ).data.attributes);
    console.log(`notary: ${id} is ${status}`);
  }
  if (status === "In Progress") {
    return { id, status, log: "" };
  }
  const { developerLogUrl } = json<{
    data: { attributes: { developerLogUrl: string } };
  }>(
    await ask(`notary log ${id}`, `${SUBMISSIONS}/${id}/logs`, {
      headers: authorized(),
    })
  ).data.attributes;
  const log = (await ask(`notary log file ${id}`, developerLogUrl)).text;
  return { id, status, log };
}
