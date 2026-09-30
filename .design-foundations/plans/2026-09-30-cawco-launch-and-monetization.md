# Caw&Co: launch, monetization and compliance plan

Date: 2026-09-30. Owner decisions in this plan are quoted from the owner. Defaults marked
**default** are the orchestrator's recommendation; the owner overrides any of them with one line.

## 0. Decisions already made by the owner

| Decision | Owner's words |
|---|---|
| Product drives the user's own agents; never sells or resells model usage | "this is supposed to drive people's own claude/opencode/etc, we're not an api provider" |
| Win on UX and features, not hosting | "i want to win on ux and some helpful features" |
| Hosted connection service comes later | "hosted connection service can come later" |
| Native iOS app with full parity ships with the public release | "i'm also planning to build an ios app that has all the features too, this will come with the public release" |
| Payments: in-app purchase **and** web checkout (path B) | "i'd go with B" |
| Web merchant of record: Polar (already signed up) | "i'm signed up with polar already" |
| Name: **Caw&Co**, display name **CawCo**, domain **cawco.dev** | "rename it to Caw&Co (display name CawCo)", "i got the domain cawco.dev" |
| Main competitor: herdr | "main competition is herdr" |

## 1. Market position (sources)

- herdr: Apache-2.0, "41,460 github stars", "1,155,121 installs to date"; "$6M seed led by Bessemer
  Venture Partners" (Sept 8, 2026); paid tier is Herdr Cloud: "You bring the machines. We connect
  them." — https://herdr.dev, https://herdr.dev/blog/herdr-raised-a-seed/, https://herdr.dev/cloud/
- herdr reads Claude Code state from the screen ("Claude Code | screen manifest") and "falls back to
  `idle`" when no rule matches — https://herdr.dev/docs/agents/. Caw&Co reads it from the harness
  protocol. The "needs you" signal never being a false negative is the product's core promise.
- herdr on phones: "Reattach over SSH" — https://nimbalyst.com/blog/open-source-agent-workspace-alternatives-2026/.
  A native iOS app with push is the clearest UX gap to win.
- Bring-your-own-agent tools charge for crossing a boundary, not for the local core. Superset:
  free = 1 user, local, desktop; Pro "$20 per user/month … $15 … billed yearly" = remote access,
  automations, mobile, Linear/Slack — https://superset.sh/pricing.

## 2. Free vs Pro (default)

- **Free, every platform (web dashboard + iOS app):** the fleet board, live transcripts, approvals,
  spawn / steer / stop, every harness, every machine, push notifications for "needs you".
- **Pro, ~$15–20/month or yearly (default price, own call anchored on Superset):** standing rules and
  supervisor rules, workflows, delegation and work items with hub-run acceptance checks, fleet
  config sync (MCP, skills, plugins, hooks, memory), usage and spend tracking.
- **Later:** team plan (multi-operator, SSO, audit export); hosted connection service.
- Apple requires a subscription to be "available across all of the user's devices" (App Review
  Guideline 3.1.2(a)), so Pro unlocks web and iOS together.

## 3. Payments architecture (path B, Polar)

```
iOS app ──StoreKit 2 (appAccountToken = account id)──> App Store ──Server Notifications V2──┐
Web checkout on cawco.dev ──Polar (merchant of record)──> customer.state_changed webhook ───┤
                                                                                              v
                                        api.cawco.dev (Caw&Co service) ── account ↔ entitlements
                                               │  signs "pro until <date>" (Ed25519)
                                               v
                          user's hub pulls its token (outbound only) and verifies offline
```

- **Account:** email sign-in link on cawco.dev (**default**). Apple 4.8 only triggers for third-party
  or social login ("must also offer as an equivalent option another login service"), so no Sign in
  with Apple is needed while login is email-only. Apple 5.1.1(v): "If your app supports account
  creation, you must also offer account deletion within the app."
- **Polar (web):** Polar customer `external_id` = Caw&Co account id. Entitlement read via
  `GET /v1/customers/external/{external_id}/state`; push updates via the `customer.state_changed`
  webhook ("Customer is created, updated or deleted. A subscription is created or updated. A benefit
  is granted or revoked.") — https://polar.sh/docs/integrate/customer-state. Polar fees: 5% + 50¢
  for organisations created on or after 27 May 2026, 4% + 40¢ grandfathered before —
  https://agent.mue.app/articles/best-merchant-of-record-paddle-lemon-squeezy-polar-stripe.
  RevenueCat does not integrate Polar (its web billing engines are RevenueCat Billing, Stripe and
  Paddle — https://www.revenuecat.com/docs/web/overview), so the Caw&Co service is the merge point.
- **App Store (iOS):** StoreKit 2 purchase with `appAccountToken` = account id; the service verifies
  with Apple's official `@apple/app-store-server-library` (`SignedDataVerifier`,
  `verifyAndDecodeNotification`, `verifyAndDecodeTransaction`) —
  https://github.com/apple/app-store-server-library-node.
- **US storefront link-out:** the iOS app may also link to the web checkout; today "U.S. developers
  can still point users to external checkout with no Apple commission attached", but Apple has
  reportedly proposed up to 15% (5% small business) —
  https://macdailynews.substack.com/p/apple-asks-u-s-supreme-court-to-vacate-app-store-contempt-finding-arguing-it-never-violated-the-orders-text,
  https://www.macobserver.com/news/apple-epic-link-out-commission-proposal-15-percent/.
  Guideline 3.1.3(b): features bought on the web may be used in the app "provided those items are
  also available as in-app purchases within the app".
- **Hub token:** Ed25519-signed `{accountId, entitlements:["pro"], exp}`; public key built into the
  release; hub renews daily over outbound HTTPS; a hub is linked to an account once by approving a
  short code shown in the dashboard. The hub stays account-free and never publicly bound
  (ARCHITECTURE.md trust boundary unchanged). **Default** token lifetime: end of the paid period
  plus 3 days, so a service outage never switches Pro off mid-period.
- **Push relay (same service):** APNs needs the developer's key; a self-hosted server cannot send
  iOS pushes itself ("Apple only accepts pushes signed with the ntfy app's APNs certificate, which
  only ntfy.sh holds" — ntfy precedent). The hub sends only an event id; the phone fetches content
  from the hub over the user's network (ntfy: "message contents aren't sent to the upstream server,
  just the message id" — https://github.com/binwiederhier/ntfy/issues/1377).
- **App Review access:** "provide either an active demo account or fully-featured demo mode" and
  "Enable backend services so that they're live and accessible during review" — the iOS app ships a
  demo mode that replays a recorded fleet; it doubles as App Store screenshots and try-before-install.

## 4. Compliance fixes (dispatched 2026-09-30)

### 4a. Dashboard Claude login → Claude Code's own sign-in

Today `packages/agent/src/login.ts` + `packages/auth` run OAuth with Claude Code's client id
(`9d1c250a-…`) against `claude.ai/oauth/authorize`, exchange the code and write
`~/.claude/.credentials.json`. Anthropic: "developers may not collect, store, or intermediate
Claude.ai credentials or session tokens — sign-in to a Claude account must complete through
Anthropic's own flow" — https://code.claude.com/docs/en/legal-and-compliance.

Replacement: the daemon runs the unmodified `claude auth login` ("Sign in to your Anthropic
account") on the machine and relays its URL and "Paste code here" prompt to the dashboard; Claude
Code does the exchange and storage itself. `claude auth status` ("Show authentication status as
JSON … Exits with code 0 if logged in, 1 if not") confirms the result —
https://code.claude.com/docs/en/cli-reference. The protection the old flow existed for (log in a Mac
whose keychain is locked, without a terminal) is kept: "When the Keychain rejects the write, such as
when it's locked in an SSH session, Claude Code stores your login in `~/.claude/.credentials.json`" —
https://code.claude.com/docs/en/authentication.

### 4b. Image generation → the official Codex CLI

Today `packages/agent/src/image-generation.ts` reads OpenCode's stored ChatGPT token
(`~/.local/share/opencode/auth.json`) and calls `https://chatgpt.com/backend-api/codex/responses`
with `originator: "opencode"`. OpenAI's documented plan-usage route says "do not point it at
ChatGPT's `backend-api` endpoints" and lists image generation as unsupported there —
https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.md,
https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations.md.

Replacement: run the official Codex CLI with the machine's own Codex ChatGPT login. "Built-in image
generation uses `gpt-image-2` and counts toward your general Codex usage limits"; "include
`$imagegen` to invoke the image generation skill explicitly. Attach an existing image with `-i` or
`--image`" — https://developers.openai.com/codex/image-generation.md. Stays on the subscription, as
the owner's tool contract requires.

### 4c. Agent SDK billing risk (monitor, no code change now)

Anthropic paused (June 15) moving Agent SDK usage to a separate API-rate credit ($20 Pro / $100 Max
5x / $200 Max 20x) and is "working to update the plan" —
https://meet.one/anthropic-pauses-claude-agent-credit-change/. If it returns, Caw&Co's SDK-driven
Claude sessions draw from that pool while terminal-based tools do not.

## 5. Sequence

1. 4a and 4b (separate workspaces, in flight).
2. Rename to Caw&Co after 4a/4b land (touches the same files). User-facing name first (dashboard
   wordmark, titles, Telegram copy, README, App Store); internal identifiers (`@whiffle/*`, CLI
   binary, MCP server name `whiffle`, `WHIFFLE_*` env, `.whiffle-deploy`, `whiffle.db`) in one
   cutover with a fleet restart, because renaming the MCP server renames every session's tools.
   Brand board: Ink `#171715`, Ivory `#F4F0E6`, Vermilion `#E65D46`, Butter `#F2D36B`; status
   crows for Working / Needs you / Idle / Done.
3. Caw&Co service (`api.cawco.dev`): account, Polar webhook, App Store notifications, token signing,
   push relay. Needs from the owner: Polar product + webhook secret, Apple Developer app record +
   auto-renewable subscription product, APNs key, a host for the service.
4. Hub token check and Pro gating (only after the owner's own hub holds a real token, so the fleet
   never loses its own features).
5. iOS app (with demo mode) against the finished service.

## 6. License

`release/package.json` declares MIT; the repo has no LICENSE file. Under MIT anyone may strip the
Pro token check. Precedents: Superset uses the Elastic License 2.0 ("source-available rather than
OSI open source"); Nimbalyst is "MIT licensed for individual-use features" —
https://nimbalyst.com/blog/open-source-agent-workspace-alternatives-2026/. **Default:** Elastic
License 2.0 for the repo. Owner to confirm before the public release.
