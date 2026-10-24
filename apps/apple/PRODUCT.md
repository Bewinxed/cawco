# Product

<!-- impeccable:product-schema 1 -->

The Caw&Co app for iPhone, iPad and Mac. It holds only the app's facts. Users, purpose, positioning, terminology, brand, principles and accessibility are the root `PRODUCT.md`'s and apply here unchanged.

## Platform

ios

## Users

The same single operator, away from a desk or beside one: on a phone at the journey's peak (a permission or a question on the lock screen), on an iPad with a pencil, or on a Mac.

## Product Purpose

The same board as the dashboard, on the operator's own devices, and the only channel through which the hub reaches the phone. Success means a needs-you item reaches the phone with the app closed and can be answered responsibly from there.

## Operating Context

- The app talks to the operator's own hub over the tailnet or LAN, found over Bonjour. A push carries no tool input, path or prompt; the app reads them from the hub.
- Pushes are content-free alerts from the hub, sealed for each device and delivered through CawCo's push relay (`apps/cawrier`, on Cloudflare) to APNs; the app's notification service extension opens them.
- From the lock screen: Approve, Deny or "Other…" on a permission for a tool that is not a shell, a plan, a subagent or an MCP tool; those open in the app to be read first. A question with one to three options answers by its option; a turn, a task or an attempt answers with Reply; a pairing answers with Approve or Deny.
- A push about a session that arrives with the app in front shows as a banner; the badge stays 0, since the needs-you count belongs to the app's own queue.
- The app's coming to a chat is input for presence; what needs the person goes to the phone once they are away from every desk.
- Caw's threads, decision pages, custom views and browser take-over are in the app; a decision page and a custom view run in a web view on the dashboard's renderer.
- On an iPad, a pencil's swipe up from the composer opens a canvas; a finger's swipe stays the recall wheel.

## Capabilities and Constraints

- One UIKit codebase for iOS and Mac Catalyst; no SwiftUI. Deployment target iOS 18.0 (`project.yml`). Bundle id `dev.cawco.app`.
- Tokens are generated from the same DTCG source as the dashboard (`design/tokens/cawco.resolver.json`); DESIGN.md decides every pixel.
- Signing, device builds and TestFlight run only from the owner's shell, never from an agent's workspace.

## Evidence on Hand

In TestFlight, not yet on the App Store. Price on cawco.dev: $29.99 once, every device on one Apple Account, 7 days free, no subscription. The push relay stores the device's push token, a random pairing id and a hash of a random secret, the push environment and the App Store transaction, and deletes a pairing 30 days after its last use, when its trial ends, when the device is removed or when Apple reports a refund (`site/privacy.html`).
