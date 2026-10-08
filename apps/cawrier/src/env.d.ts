/** Secrets set by hand with `wrangler secret put`; absent until then (`wrangler types` cannot see them). */
interface Env {
  readonly APNS_KEY_ID?: string;
  readonly APNS_P8?: string;
  readonly APNS_TEAM_ID?: string;
}
