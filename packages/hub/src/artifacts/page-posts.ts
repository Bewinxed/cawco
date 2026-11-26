/**
 * What a page posts beside its doc (routes.ts, and the page's listener,
 * preview.ts): the pictures of the marks the person just made, and his Send.
 * Each body is read (its size, its shape) before the artifact service takes
 * it (service.ts `pictures`, `send`), whose answers each handler passes on.
 */
import {
  isSendControl,
  type MarkPicture,
  type MarkPictures,
  SEND_BODY_MAX,
  SEND_CONTROLS,
  SEND_WRITES_MAX,
  type SendBody,
} from "@cawco/core/comments/model";
import { recordLimitReading } from "@cawco/core/limit-readings";
import { Predicate } from "effect";
import { problem } from "elysia";
import { problemResponse } from "elysia/error";
import type { AnyProblem } from "../refusal";
import type { ArtifactDocs } from "./docs";
import type { Artifacts } from "./service";
import { takeSentWrites } from "./sync";

/** The longest page address a post names. */
// @limit external: RFC 9110 section 4.1 recommends senders and recipients support URIs of at least 8,000 octets (https://www.rfc-editor.org/rfc/rfc9110#section-4.1)
const URL_MAX = 8000;

const PNG_BASE64 = /^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/u;

const SEND_SHAPE = "Send takes JSON: { text?, pins?, control?, writes? }.";

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/u;

const PICTURES_SHAPE = "Pictures take JSON: { pictures, url? }.";

/** Whether a post's pin list is one: absent, or one or more pins, each a pin's id. */
const isPinIds = (value: unknown): value is string[] | undefined =>
  value === undefined ||
  (Array.isArray(value) &&
    value.length > 0 &&
    value.every((pin) => typeof pin === "string" && pin.length > 0));

/** Whether `writes` is a Send's carried writes (core `SendBody.writes`): absent, or a bounded base64 Yjs update. */
const isSentWrites = (writes: unknown): writes is string | undefined =>
  writes === undefined ||
  (typeof writes === "string" &&
    writes.length <= SEND_WRITES_MAX &&
    BASE64.test(writes));

/** A send's body as it reads, only the fields it holds; why it is not one, or its fields. */
const sendBodyRead = (body: unknown): SendBody | string => {
  if (!Predicate.isObject(body)) {
    return SEND_SHAPE;
  }
  const { text, control, pins, again, writes } = body;
  if (text !== undefined && typeof text !== "string") {
    return "text is a string.";
  }
  if (control !== undefined && !isSendControl(control)) {
    return `control is one of ${Object.keys(SEND_CONTROLS).join(", ")}.`;
  }
  if (!isPinIds(pins)) {
    return "pins is a list of pin ids.";
  }
  if (!isPinIds(again)) {
    return "again is a list of pin ids.";
  }
  if (!isSentWrites(writes)) {
    return `writes is a base64 Yjs update of at most ${SEND_WRITES_MAX.toLocaleString()} characters.`;
  }
  return {
    ...(text === undefined ? {} : { text }),
    ...(control === undefined ? {} : { control }),
    ...(pins ? { pins } : {}),
    ...(again ? { again } : {}),
    ...(writes === undefined ? {} : { writes }),
  };
};

/** A picture a pictures post carries, when it is one: a mark's id and a base64 PNG. */
const pictureOf = (picture: unknown): MarkPicture | undefined =>
  Predicate.isObject(picture) &&
  typeof picture.mark === "string" &&
  typeof picture.png === "string" &&
  PNG_BASE64.test(picture.png)
    ? { mark: picture.mark, png: picture.png }
    : undefined;

/** A pictures post's body as it reads, only the fields it holds; why it is not one, or its fields. */
const picturesBodyRead = (body: unknown): MarkPictures | string => {
  if (!Predicate.isObject(body)) {
    return PICTURES_SHAPE;
  }
  const { url, pictures } = body;
  if (
    url !== undefined &&
    !(typeof url === "string" && url.length <= URL_MAX)
  ) {
    return `url is a string of at most ${URL_MAX} characters.`;
  }
  if (!Array.isArray(pictures)) {
    return "pictures is a list.";
  }
  const read: MarkPicture[] = [];
  for (const picture of pictures) {
    const one = pictureOf(picture);
    if (!one) {
      return `A picture is { mark, png }: a mark's id and a base64 PNG.`;
    }
    read.push(one);
  }
  return { pictures: read, ...(url === undefined ? {} : { url }) };
};

/**
 * The page posts its pictures of the marks the person just made on it
 * (`POST …/pictures`, core `MarkPictures`): the hub holds them for the
 * delivery that carries those marks (service.ts `pictures`). `instanceId`
 * already owns `artifactId` (the listener checked).
 */
export const artifactPictures =
  (keep: Artifacts["pictures"]) =>
  async (
    request: Request,
    instanceId: string,
    artifactId: string
  ): Promise<Response> => {
    if (request.method !== "POST") {
      return problemResponse(
        { status: 405, code: "pictures-post", detail: "Pictures are a POST." },
        { allow: "POST" }
      );
    }
    const raw = await request.text();
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return problemResponse({
        status: 400,
        code: "refused",
        detail: PICTURES_SHAPE,
      });
    }
    const read = picturesBodyRead(body);
    if (typeof read === "string") {
      return problemResponse({ status: 400, code: "refused", detail: read });
    }
    const kept = keep(instanceId, artifactId, read);
    return "response" in kept ? problemOf(kept) : Response.json(kept);
  };

/** A checked send's body as the service takes it: its text trimmed, and only the fields it holds. */
const sentBody = ({ text, pins, again, control }: SendBody): SendBody => ({
  ...(text?.trim() ? { text: text.trim() } : {}),
  ...(pins ? { pins } : {}),
  ...(again ? { again } : {}),
  ...(control ? { control } : {}),
});

/**
 * The person sends their picks (`cawco.send`): `raw`, the body as JSON text,
 * is read (its size, its shape), the page's own writes it carries applied
 * first, as its socket's would be (sync.ts `takeSentWrites`), so the picks the
 * page counts are the ones read; then what the send applies (a project's
 * setup page: its name, shape and account), then the session hears it has
 * new responses to read (service.ts `send`). A Send with nothing new reads
 * as sent (`{ sent: "already" }`): what he asked for already holds. The
 * hub's route and the page's listener (preview.ts) both answer it.
 * `instanceId` already owns `artifactId` (the listener checked).
 */
export const artifactSend =
  (send: Artifacts["send"], docs: ArtifactDocs) =>
  async (
    instanceId: string,
    artifactId: string,
    raw: string,
    route: string
  ) => {
    recordLimitReading("hub.send-body-chars", raw.length);
    if (raw.length > SEND_BODY_MAX) {
      return problem(413, {
        code: "send-carries-most-pictures",
        detail: `A send is at most ${SEND_BODY_MAX.toLocaleString()} characters.`,
      });
    }
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return problem(400, { code: "refused", detail: SEND_SHAPE });
    }
    const read = sendBodyRead(body);
    if (typeof read === "string") {
      return problem(400, { code: "refused", detail: read });
    }
    const { writes } = read;
    if (writes) {
      const refused = takeSentWrites(docs, artifactId, writes);
      if (refused) {
        return problem(422, { code: "refused", detail: refused });
      }
    }
    const sent = await send(instanceId, artifactId, sentBody(read), route);
    if (!("response" in sent)) {
      return sent;
    }
    return sent.response.code === "artifact-nothing-new"
      ? { sent: "already" as const }
      : problem(sent.status, {
          code: sent.response.code,
          detail: sent.response.detail,
        });
  };

/** A refusal the service answered, as the page reads it: Elysia's problem, its status, code and words. */
const problemOf = ({ status, response }: AnyProblem): Response =>
  problemResponse({ status, code: response.code, detail: response.detail });
