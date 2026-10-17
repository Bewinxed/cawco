public import CawCoAPI
import CawCoPush
public import Foundation
import OpenAPIRuntime
import OSLog
import UIKit

// This app and a hub that requires paired devices (hub hub-auth.ts), both
// ways, as the web does it (apps/dashboard hub-auth.svelte.ts):
//
// - It pairs itself in RFC 8628's shape. Whenever its socket goes, the hub
//   is asked what this app is to it (`GET /api/auth`, open to anyone): one
//   that must pair asks for a code (§3.1), shows it, and polls (§3.4) until
//   the person approves it on a paired device; the token the answer carries
//   is its pass (CawCoPush `HubPass`), kept in the Keychain for that hub,
//   and every request carries it from then on. A pass the hub no longer
//   takes (its device removed) is forgotten, and the app pairs again.
// - It answers other devices' pairings: the fleet model holds the ones
//   waiting (`GET /api/pair/requests` on connect, the `hub_auth` frame
//   after), and the person approves or denies one by its code.
//
// The socket's close code is not read for it: URLSessionWebSocketTask
// reports only the protocol's own codes, never an application's 4401
// ("does not expose custom closure codes ... the CloseCode enum only defines
// the standard protocol closure codes", pusher.com/blog/channels-ios-swift-
// v9-0-0), and an unpaired socket is refused at its upgrade before it opens.

extension HubConnection {
    /// Where this app's own pairing stands, as the web's pairing screen has
    /// it (hub-auth.svelte.ts `PairingStage`); `pairing` is nil while it has
    /// no pairing to do.
    public enum DevicePairing: Sendable, Equatable {
        /// Asking the hub for a code.
        case asking
        /// The code to approve on a paired device, until the hub forgets the ask.
        case waiting(userCode: String, expiresAt: Date)
        /// The person denied it.
        case denied
        /// The hub no longer holds the ask: it waited past its time, or newer asks pushed it out.
        case expired
        /// The ask did not start, in the hub's words or the network's.
        case failed(String)
    }

    /// The person's answer to another device's pairing, by its code, while
    /// it is on its way and after the hub refused it (NeedsCard.svelte
    /// `admitting`, `refusal`).
    public enum PairingAnswer: Sendable, Equatable {
        case sending(approve: Bool)
        /// The hub's words: "The hub refused that answer".
        case refused(String)
    }

    /// Asks the hub for a code, and waits for the person's answer: from a
    /// refused connection, and from the screen's ask again after `denied`,
    /// `expired` or `failed`.
    public func pair() {
        guard let address else { return }
        pairingRun?.cancel()
        pairingRun = Task { [weak self] in
            await self?.pairing(at: address)
        }
    }

    /// The socket went: whether the hub says this app must pair before it
    /// connects. One that must starts pairing, and the caller's loop ends
    /// (nothing reconnects until the pass comes). A pass the hub refused is
    /// forgotten first.
    func mustPair(_ address: URL) async -> Bool {
        guard pairing == nil else { return true }
        guard let state = try? await HubAPI(client: Client(hub: address)).pairings.auth().ok.body.json else { return false }
        guard state.mode == .pairing, state.caller != .owner else { return false }
        let origin = HubPass.origin(address) ?? address.absoluteString
        if HubPass.token(for: address) != nil {
            pairingLog.notice("pass refused by \(origin, privacy: .public): forgotten, pairing again")
            do {
                try HubPass.forget(address)
            } catch {
                pairingLog.error("pass for \(origin, privacy: .public) not forgotten: \(String(describing: error), privacy: .public)")
            }
        }
        pairingLog.notice("pairing needed: \(origin, privacy: .public) requires paired devices and this app is \(state.caller.rawValue, privacy: .public)")
        pair()
        return true
    }

    /// The pairing's run: the ask, then a poll every interval the hub gives
    /// (five seconds more each time it says to slow down), until an answer.
    private func pairing(at address: URL) async {
        stage(.asking)
        let api = HubAPI(client: Client(hub: address))
        let started: Components.Schemas.PairingStart
        do {
            switch try await api.pairings.start(.init(body: .json(.init(kind: .app, name: UIDevice.current.name)))) {
            case let .ok(ok):
                started = try ok.body.json
            case .conflict:
                // The hub trusts its network again: there is nothing to pair.
                pairingLog.notice("pairing over: \(address.absoluteString, privacy: .public) no longer requires paired devices")
                pairing = nil
                reconnect()
                return
            case let .unprocessableContent(refused):
                let said = (try? refused.body.applicationProblemJson).flatMap { Wire.words(problem: $0) }
                stage(.failed(said ?? "The hub answered 422."))
                return
            case let .undocumented(statusCode, payload):
                stage(.failed(await Wire.words(payload.body) ?? "The hub answered \(statusCode)."))
                return
            }
        } catch {
            guard !Task.isCancelled else { return }
            stage(.failed(error.localizedDescription))
            return
        }
        guard !Task.isCancelled else { return }
        stage(.waiting(userCode: started.userCode, expiresAt: .now.addingTimeInterval(started.expiresIn)))
        var interval = Duration.seconds(started.interval)
        while !Task.isCancelled {
            try? await Task.sleep(for: interval)
            guard !Task.isCancelled else { return }
            let answer: Components.Schemas.PostApiPairPoll200
            do {
                answer = try await api.pairings.poll(.init(body: .json(.init(deviceCode: started.deviceCode)))).ok.body.json
            } catch {
                // A poll that did not reach the hub: the next one asks again.
                continue
            }
            guard !Task.isCancelled else { return }
            if let approved = answer.value3 {
                adopt(pass: approved.token, device: approved.device.name, for: address)
                return
            }
            switch answer.value2?.status {
            case .accessDenied?:
                stage(.denied)
                return
            case .expiredToken?:
                stage(.expired)
                return
            case nil:
                break
            }
            if answer.value1?.status == .slowDown { interval += .seconds(5) }
        }
    }

    /// The person approved this app: the pass kept, and the hub connected to on it.
    private func adopt(pass token: String?, device: String, for address: URL) {
        let origin = HubPass.origin(address) ?? address.absoluteString
        guard let token else {
            stage(.failed("The hub approved this app but sent no pass. Update the hub, then pair again."))
            return
        }
        do {
            try HubPass.keep(token, for: address)
        } catch {
            pairingLog.error("pass for \(origin, privacy: .public) not kept: \(String(describing: error), privacy: .public)")
            stage(.failed("This device couldn't keep its pass to the hub."))
            return
        }
        pairingLog.notice("pairing approved as \(device, privacy: .public): pass kept for \(origin, privacy: .public)")
        pairing = nil
        reconnect()
    }

    private func stage(_ next: DevicePairing) {
        pairing = next
        switch next {
        case .asking: pairingLog.notice("pairing stage asking")
        case let .waiting(code, expiresAt):
            pairingLog.notice("pairing stage waiting \(code, privacy: .public) for \(Int(expiresAt.timeIntervalSinceNow.rounded())) s")
        case .denied: pairingLog.notice("pairing stage denied")
        case .expired: pairingLog.notice("pairing stage expired")
        case let .failed(message): pairingLog.notice("pairing stage failed: \(message, privacy: .public)")
        }
    }

    /// The owner cookie a web view sets before it loads `page` (the
    /// dashboard's origin): this device's pass to the hub, as a paired
    /// browser's cookie carries it. Nil without a pass.
    public func passCookie(on page: URL) -> HTTPCookie? {
        address.flatMap { HubPass.cookie(for: $0, on: page) }
    }

    // MARK: Other devices' pairings

    /// The pairings waiting on the person, as the hub said them: its read on
    /// connect, or its `hub_auth` frame. An answer to one no longer waiting
    /// is dropped with it.
    func adopt(pairingRequests next: [Components.Schemas.PairingRequest]) {
        fleet.pairingRequests = next
        let waiting = Set(next.map(\.userCode))
        pairingAnswers = pairingAnswers.filter { waiting.contains($0.key) }
        pairingLog.notice("pairing requests: \(next.count) waiting [\(next.map(\.userCode).joined(separator: ","), privacy: .public)]")
    }

    /// The person's answer to the pairing showing `userCode`: true once the
    /// hub took it. Refused, the hub's words stand in `pairingAnswers` until
    /// the next answer, as the web's card keeps them.
    @discardableResult
    public func answerPairing(_ userCode: String, approve: Bool) async -> Bool {
        let verb = approve ? "approve" : "deny"
        pairingAnswers[userCode] = .sending(approve: approve)
        let refusal: String?
        do {
            let api = try self.api
            if approve {
                switch try await api.pairings.approve(.init(path: .init(userCode: userCode))) {
                case .ok: refusal = nil
                case let .notFound(refused): refusal = await Wire.words(try? refused.body.plainText) ?? "The hub answered 404."
                case let .undocumented(statusCode, payload): refusal = await Wire.words(payload.body) ?? "The hub answered \(statusCode)."
                }
            } else {
                switch try await api.pairings.deny(.init(path: .init(userCode: userCode))) {
                case .ok: refusal = nil
                case let .notFound(refused): refusal = await Wire.words(try? refused.body.plainText) ?? "The hub answered 404."
                case let .undocumented(statusCode, payload): refusal = await Wire.words(payload.body) ?? "The hub answered \(statusCode)."
                }
            }
        } catch {
            refusal = error.localizedDescription
        }
        if let refusal {
            pairingAnswers[userCode] = .refused(refusal)
            pairingLog.notice("pairing answer \(userCode, privacy: .public) \(verb, privacy: .public): refused: \(refusal, privacy: .public)")
            return false
        }
        pairingAnswers[userCode] = nil
        pairingLog.notice("pairing answer \(userCode, privacy: .public) \(verb, privacy: .public): answered")
        return true
    }
}
