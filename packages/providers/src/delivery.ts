/**
 * A webhook delivery's body read, for every provider's `webhook.read`
 * (provider.ts `Webhook`): as text, and as JSON once its signature held.
 */
import { Effect, Schema } from "effect";
import type { RawDelivery } from "./provider";
import { DeliveryUnread } from "./read-stop";

/** The body as UTF-8 text, as a service signs it. */
export const deliveryText = (delivery: RawDelivery): string =>
  Buffer.from(delivery.body).toString("utf8");

const Json = Schema.fromJsonString(Schema.Unknown);

/** The body as JSON; one that is not JSON is its failure, in words. */
export const deliveryJson = (
  delivery: RawDelivery
): Effect.Effect<unknown, DeliveryUnread> =>
  Schema.decodeUnknownEffect(Json)(deliveryText(delivery)).pipe(
    Effect.mapError(() => new DeliveryUnread({ words: "its body is not JSON" }))
  );
