import CawCoCable
import CryptoKit
import Foundation
import Observation
import OSLog
import UIKit

/// Manages caBLE bridge sessions: receives `passkey_qr` data from the hub,
/// shows an approval prompt, runs the bridge session, and sends the BLE advert
/// back to the hub for VHCI injection.
///
/// The hub sends a `passkey_qr` message when a daemon reads a FIDO:/ QR code
/// from an agent's browser. The app shows "Sign in to {rpId}?"; on approve it
/// starts `CableBridgeSession`, which connects to the tunnel, returns the
/// advert, drives the Noise handshake and the CTAP2 exchange, and uses Face ID
/// for the passkey assertion.
@MainActor
@Observable
public final class CableBridgeManager {
    /// What the UI shows while a session is active.
    public enum State: Sendable, Equatable {
        case idle
        /// Waiting for the user to approve.
        case pending(rpId: String)
        /// The tunnel is being set up and the handshake is running.
        case connecting(rpId: String)
        /// Face ID is showing.
        case authenticating(rpId: String)
        /// The assertion was sent; the browser is authenticated.
        case done(rpId: String)
        /// Something went wrong.
        case failed(String)
    }

    public private(set) var state: State = .idle
    @ObservationIgnored private var session: Task<Void, Never>?
    @ObservationIgnored private var pendingQr: CableQrData?
    private let log = Logger(subsystem: "dev.cawco.app", category: "caBLE.bridge")

    /// Called by the manager when the 20-byte advert is ready to send to the
    /// hub. The hub connection sets this at init.
    @ObservationIgnored public var sendAdvert: (@Sendable (Data) async -> Void)?

    public init() {}

    /// Handles a `passkey_qr` message from the hub (WebSocket or push).
    /// `cborPayload` is the raw CBOR bytes of the QR data.
    public func received(cborPayload: Data) {
        do {
            let qr = try CableQrData(cbor: cborPayload)
            pendingQr = qr
            // The RP ID isn't in the QR itself (it's in the CTAP2 request later),
            // so the prompt names the operation.
            let hint: String
            switch qr.operationHint {
            case .getAssertion: hint = "sign in"
            case .makeCredential: hint = "register"
            case .discoverableCredentialPreference, .discoverableCredentialInfo: hint = "use a passkey"
            }
            state = .pending(rpId: hint)
            log.info("passkey QR received; operation: \(hint, privacy: .public)")
        } catch {
            log.error("failed to parse passkey QR: \(String(describing: error), privacy: .public)")
            state = .failed("Could not read the passkey request.")
        }
    }

    /// Handles a `passkey_qr` message with pre-parsed fields from the hub.
    public func received(
        publicKey: Data,
        qrSecret: Data,
        knownTunnelDomains: UInt16 = 1,
        operationHint: UInt64 = 0
    ) {
        do {
            let pk: P256.KeyAgreement.PublicKey
            if publicKey.count == 33 {
                pk = try P256.KeyAgreement.PublicKey(compressedRepresentation: publicKey)
            } else {
                pk = try P256.KeyAgreement.PublicKey(x963Representation: publicKey)
            }
            let hint = CableQrData.OperationHint(rawValue: operationHint) ?? .getAssertion
            let qr = CableQrData(
                publicKey: pk,
                qrSecret: qrSecret,
                knownTunnelDomains: knownTunnelDomains,
                operationHint: hint)
            pendingQr = qr
            state = .pending(rpId: hint == .getAssertion ? "sign in" : "use a passkey")
        } catch {
            log.error("invalid passkey QR fields: \(String(describing: error), privacy: .public)")
            state = .failed("Could not read the passkey request.")
        }
    }

    /// The user approved the passkey request. Starts the bridge session.
    /// `anchor` is the window to show Face ID in.
    public func approve(anchor: UIWindow) {
        guard let qr = pendingQr else { return }
        pendingQr = nil
        state = .connecting(rpId: "")
        let provider = PlatformPasskeyProvider(anchor: anchor)
        let sendAdvert = sendAdvert

        session = Task { [weak self] in
            let bridge = CableBridgeSession(passkeyProvider: provider)
            let result = await bridge.start(qr: qr) { advert in
                await sendAdvert?(advert)
            }

            await MainActor.run { [weak self] in
                guard let self else { return }
                switch result {
                case let .authenticated(rpId):
                    self.state = .done(rpId: rpId)
                    self.log.info("caBLE bridge: authenticated for \(rpId, privacy: .public)")
                    // Clear after a moment so the UI can show the success.
                    Task { @MainActor [weak self] in
                        try? await Task.sleep(for: .seconds(3))
                        if case .done = self?.state { self?.state = .idle }
                    }
                case .cancelled:
                    self.state = .idle
                case let .failed(error):
                    self.state = .failed(String(describing: error))
                    self.log.error("caBLE bridge failed: \(String(describing: error), privacy: .public)")
                }
            }
        }
    }

    /// The user declined the passkey request.
    public func decline() {
        pendingQr = nil
        state = .idle
    }

    /// Cancels an in-progress session.
    public func cancel() {
        session?.cancel()
        session = nil
        pendingQr = nil
        state = .idle
    }
}
