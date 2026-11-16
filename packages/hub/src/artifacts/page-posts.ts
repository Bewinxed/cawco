/**
 * What a page posts beside its doc (routes.ts, and the page's listener,
 * preview.ts): the pictures of the marks the person just made, and his Send.
 * Each body is read (its size, its shape) before the artifact service takes
 * it (service.ts `pictures`, `send`), whose answers each handler passes on.
 */
import { CHOICE_LIMITS } from "@cawco/core/choices";
import {
  COMMENT_LIMITS,
  isSendControl,
  type MarkPictures,
  SEND_BODY_MAX,
  SEND_CONTROLS,
  SEND_WRITES_MAX,
  type SendBody,
} from "@cawco/core/comments/model";
import { picturesBodyTooLong } from "@cawco/core/words/comment-lines";
import { problem } from "elysia";
import { problemResponse } from "elysia/error";
import type { AnyProblem } from "../refusal";
import type { ArtifactDocs } from "./docs";
import type { Artifacts } from "./service";
import { takeSentWrites } from "./sync";

/** The longest pictures body read: its pictures and its address at their bounds, as JSON. */
const PICTURES_BODY_MAX =
  COMMENT_LIMITS.pictures * (COMMENT_LIMITS.pictureChars + 100) + 4096;

/** The longest page address a post names. Our call. */
const URL_MAX = 2048;
/** The longest mark id a picture names: a pin's. Our call. */
const MARK_ID_MAX = 100;

const PNG_BASE64 = /^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/u;

const SEND_SHAPE = "Send takes JSON: { text?, pins?, control?, writes? }.";

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/u;

const PICTURES_SHAPE = "Pictures take JSON: { pictures, url? }.";

const isRecord = (body: unknown): body is Record<string, unknown> =>
  !!body && typeof body === "object" && !Array.isArray(body);

/** Why a send's body is not one, or its fields; null when it is. */
const sendBodyProblem = (body: unknown): string | null => {
  if (!isRecord(body)) {
    return SEND_SHAPE;
  }
  const { text } = body;
  if (
    text !== undefined &&
    !(typeof text === "string" && text.length <= CHOICE_LIMITS.note)
  ) {
    return `text is a string of at most ${CHOICE_LIMITS.note} characters.`;
  }
  const { control } = body;
  if (control !== undefined && !isSendControl(control)) {
    return `control is one of ${Object.keys(SEND_CONTROLS).join(", ")}.`;
  }
  const ids = (value: unknown) =>
    value === undefined ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.length <= COMMENT_LIMITS.pins &&
      value.every(
        (pin) =>
          typeof pin === "string" && pin.length > 0 && pin.length <= MARK_ID_MAX
      ));
  if (!ids(body.pins)) {
    return `pins is a list of 1 to ${COMMENT_LIMITS.pins} pin ids.`;
  }
  if (!ids(body.again)) {
    return `again is a list of 1 to ${COMMENT_LIMITS.pins} pin ids.`;
  }
  return sentWritesProblem(body.writes);
};

/** Why a pictures post's body is not one, or its fields; null when it is. */
const picturesBodyProblem = (body: unknown): string | null => {
  if (!isRecord(body)) {
    return PICTURES_SHAPE;
  }
  const { url, pictures } = body;
  if (
    url !== undefined &&
    !(typeof url === "string" && url.length <= URL_MAX)
  ) {
    return `url is a string of at most ${URL_MAX} characters.`;
  }
  if (!(
    Array.isArray(pictures) && pictures.length <= COMMENT_LIMITS.pictures
  )) {
    return `pictures is a list of at most ${COMMENT_LIMITS.pictures}.`;
  }
  for (const picture of pictures as (Record<string, unknown> | null)[]) {
    if (!(
      picture &&
      typeof picture.mark === "string" &&
      picture.mark.length <= MARK_ID_MAX &&
      typeof picture.png === "string" &&
      picture.png.length <= COMMENT_LIMITS.pictureChars &&
      PNG_BASE64.test(picture.png)
    )) {
      return `A picture is { mark, png }: a mark's id and a base64 PNG of at most ${COMMENT_LIMITS.pictureChars.toLocaleString()} characters.`;
    }
  }
  return null;
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
    if (raw.length > PICTURES_BODY_MAX) {
      return problemResponse({
        status: 413,
        code: "post-carries-most-pictures",
        detail: picturesBodyTooLong(PICTURES_BODY_MAX),
      });
    }
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
    const why = picturesBodyProblem(body);
    if (why) {
      return problemResponse({ status: 400, code: "refused", detail: why });
    }
    const kept = keep(instanceId, artifactId, body as MarkPictures);
    return "response" in kept ? problemOf(kept) : Response.json(kept);
  };

/** A checked send's body as the service takes it: its text trimmed, and only the fields it holds. */
const sentBody = ({ text, pins, again, control }: SendBody): SendBody => ({
  ...(text?.trim() ? { text: text.trim() } : {}),
  ...(pins ? { pins } : {}),
  ...(again ? { again } : {}),
  ...(control ? { control } : {}),
});

/** Why `writes` is not a Send's carried writes (core `SendBody.writes`), or null. */
const sentWritesProblem = (writes: unknown): string | null =>
  writes === undefined ||
  (typeof writes === "string" &&
    writes.length <= SEND_WRITES_MAX &&
    BASE64.test(writes))
    ? null
    : `writes is a base64 Yjs update of at most ${SEND_WRITES_MAX.toLocaleString()} characters.`;

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
    if (raw.length > SEND_BODY_MAX) {
      return problem(413, {
        code: "send-carries-most-pictures",
        detail: `A send carries at most ${COMMENT_LIMITS.pictures} pictures and ${CHOICE_LIMITS.note} characters of text.`,
      });
    }
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return problem(400, { code: "refused", detail: SEND_SHAPE });
    }
    const bodyProblem = sendBodyProblem(body);
    if (bodyProblem) {
      return problem(400, { code: "refused", detail: bodyProblem });
    }
    const { writes } = body as SendBody;
    if (writes) {
      const refused = takeSentWrites(docs, artifactId, writes);
      if (refused) {
        return problem(422, { code: "refused", detail: refused });
      }
    }
    const sent = await send(
      instanceId,
      artifactId,
      sentBody(body as SendBody),
      route
    );
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
