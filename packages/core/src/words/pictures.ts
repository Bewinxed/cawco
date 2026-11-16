import { IMAGE_MEDIA_TYPES } from "../attachments";

/** The formats a picture a turn carries can be in, as a person reads them. */
const FORMATS = "JPEG, PNG, GIF or WebP";

/**
 * What a picture of a type no session takes is refused with (core
 * `IMAGE_MEDIA_TYPES`): where it is attached in the dashboard, and where
 * the hub takes a send, a continuation or a move that carries one.
 */
export const pictureWords = {
  /** A picture of `type` (its media type; empty when it named none). */
  typeRefused: (type: string) =>
    `${type ? `A ${type} picture` : "This picture"} can't be sent: a session takes ${FORMATS} pictures.`,
  /** The media types a picture can be, for a route's own refusal. */
  taken: IMAGE_MEDIA_TYPES.join(", "),
};
