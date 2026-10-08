/** The Worker's bindings, as wrangler.jsonc declares them. */
interface Env {
  // Secrets, set by hand with `wrangler secret put`; absent until then.
  readonly APNS_KEY_ID?: string;
  readonly APNS_P8?: string;
  readonly APNS_TEAM_ID?: string;
  readonly APNS_TOPIC: string;
  /** The App Store app record; Apple's verifier requires it for Production. */
  readonly APP_APPLE_ID: string;
  readonly ENROLL_LIMIT: RateLimit;
  readonly PAIRING: DurableObjectNamespace<import("./pairing").Pairing>;
  /** Comma-separated product ids that grant Pro. */
  readonly PRO_PRODUCT_IDS: string;
  readonly SEATS: DurableObjectNamespace<import("./seats").Seats>;
  /** Days the free week's purchase grants from its purchase date. */
  readonly TRIAL_DAYS: string;
  /** The product id of the free week. */
  readonly TRIAL_PRODUCT_ID: string;
}
