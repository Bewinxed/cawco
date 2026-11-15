import CryptoKit
import Foundation
import OSLog

/// The caBLE authenticator bridge session: connects to the tunnel server,
/// constructs the BLE advert for the hub to inject, runs the Noise handshake,
/// and drives the CTAP2 getAssertion exchange using the device's passkey.
///
/// One session handles one QR code (one sign-in attempt). The caller creates
/// it, calls `start`, and awaits the result; the session is not reusable.
public actor CableBridgeSession {
    private let passkeyProvider: any CablePasskeyProvider
    private let log = Logger(subsystem: "dev.cawco.app", category: "caBLE")

    public init(passkeyProvider: any CablePasskeyProvider) {
        self.passkeyProvider = passkeyProvider
    }

    /// The outcome of a caBLE bridge session.
    public enum Result: Sendable {
        /// The assertion was sent through the tunnel; the browser is authenticated.
        case authenticated(rpId: String)
        /// The user cancelled (Face ID dismissed, notification declined).
        case cancelled
        /// The session failed.
        case failed(CableBridgeError)
    }

    public enum CableBridgeError: Error, Sendable {
        case tunnelConnectionFailed(String)
        case handshakeFailed(String)
        case ctapParseFailed(String)
        case passkeyFailed(String)
        case protocolError(String)
    }

    /// Runs the full caBLE bridge flow:
    ///
    /// 1. Derive keys from the QR secret.
    /// 2. Connect to the tunnel server, get the routing ID.
    /// 3. Build the encrypted BLE advert; call `onAdvertReady` with it.
    /// 4. Wait for the client (Chromium) to connect through the tunnel.
    /// 5. Complete the Noise KNpsk0 handshake.
    /// 6. Send the post-handshake getInfo message.
    /// 7. Receive and parse the CTAP2 getAssertion request.
    /// 8. Perform the local passkey assertion (Face ID / Touch ID).
    /// 9. Send the CTAP2 response back through the encrypted tunnel.
    ///
    /// - Parameters:
    ///   - qr: The parsed caBLE QR data.
    ///   - onAdvertReady: Called with the 20-byte encrypted advert; the caller
    ///     sends it to the hub as a `passkey_advert` frame.
    /// - Returns: The session result.
    public func start(
        qr: CableQrData,
        onAdvertReady: @Sendable (Data) async -> Void
    ) async -> Result {
        do {
            return try await run(qr: qr, onAdvertReady: onAdvertReady)
        } catch is CancellationError {
            return .cancelled
        } catch let error as CableBridgeError {
            return .failed(error)
        } catch let error as CablePasskeyError {
            switch error {
            case .cancelled: return .cancelled
            default: return .failed(.passkeyFailed(String(describing: error)))
            }
        } catch {
            return .failed(.protocolError(String(describing: error)))
        }
    }

    private func run(
        qr: CableQrData,
        onAdvertReady: @Sendable (Data) async -> Void
    ) async throws -> Result {
        log.info("caBLE session starting for tunnel domain \(qr.tunnelDomain, privacy: .public)")

        // 1. Derive keys.
        let eidKey = CableKeys.eidKey(qrSecret: qr.qrSecret)
        let tunnelId = CableKeys.tunnelId(qrSecret: qr.qrSecret)
        log.debug("keys derived; tunnel ID \(tunnelId.base64URLEncoded(), privacy: .public)")

        // 2. Connect to the tunnel server.
        let tunnel = CableTunnel(domain: qr.tunnelDomain, tunnelId: tunnelId)
        let routingId: Data
        do {
            routingId = try await tunnel.connect()
        } catch {
            throw CableBridgeError.tunnelConnectionFailed(String(describing: error))
        }
        log.info("tunnel connected; routing ID \(routingId.hexString, privacy: .public)")

        // 3. Build the encrypted BLE advert.
        let (advert, advertPlaintext) = CableKeys.buildAdvert(
            eidKey: eidKey,
            routingId: routingId,
            tunnelServerId: qr.tunnelServerId)
        log.info("advert built (\(advert.count) bytes); sending to hub")

        // Deliver the advert to the caller (hub) for VHCI injection.
        await onAdvertReady(advert)

        // 4. Wait for the client to connect and send its first handshake message.
        let clientMessage1: Data
        do {
            clientMessage1 = try await tunnel.receive()
        } catch {
            throw CableBridgeError.tunnelConnectionFailed("waiting for client: \(error)")
        }
        log.info("received client handshake message 1 (\(clientMessage1.count) bytes)")

        // 5. Noise KNpsk0 handshake.
        let psk = CableKeys.psk(qrSecret: qr.qrSecret, decryptedAdvert: advertPlaintext)
        var noise = CableNoiseResponder(
            initiatorStaticPublicKey: qr.publicKey,
            psk: psk)

        let _ = try noise.readMessage1(clientMessage1)
        let (response, sendCipher, receiveCipher) = try noise.writeMessage2()
        try await tunnel.send(response)
        var send = sendCipher
        var recv = receiveCipher
        log.info("noise handshake complete")

        // 6. Send post-handshake message (getInfo).
        let postHandshake = CablePostHandshake.build()
        let encryptedPost = try send.encrypt(plaintext: CablePadding.pad(postHandshake))
        try await tunnel.send(encryptedPost)
        log.debug("post-handshake getInfo sent")

        // 7. Receive and parse the CTAP2 getAssertion request.
        let encryptedCtap = try await tunnel.receive()
        let ctapPadded = try recv.decrypt(ciphertext: encryptedCtap)
        let ctapBytes = CablePadding.unpad(ctapPadded)

        // The first byte is the caBLE message type (0x01 = CTAP).
        guard ctapBytes.count >= 2 else {
            throw CableBridgeError.ctapParseFailed("CTAP message too short")
        }
        let messageType = ctapBytes[ctapBytes.startIndex]
        guard messageType == 0x01 else {
            if messageType == 0x00 {
                log.info("client sent shutdown")
                await tunnel.close()
                return .cancelled
            }
            throw CableBridgeError.ctapParseFailed("unexpected message type: \(messageType)")
        }

        let ctapPayload = ctapBytes.suffix(from: ctapBytes.startIndex + 1)
        let request: CtapGetAssertionRequest
        do {
            request = try CtapGetAssertionRequest(ctapBytes: ctapPayload)
        } catch {
            throw CableBridgeError.ctapParseFailed(String(describing: error))
        }
        log.info("CTAP2 getAssertion for \(request.rpId, privacy: .public)")

        // 8. Perform the local passkey assertion.
        let assertion: CablePasskeyAssertion
        do {
            assertion = try await passkeyProvider.assertPasskey(
                rpId: request.rpId,
                challenge: request.clientDataHash,
                allowedCredentials: request.allowList)
        } catch {
            // Send a CTAP error response so the browser knows.
            // 0x01 = caBLE message type (CTAP), 0x27 = CTAP2_ERR_OPERATION_DENIED
            let errorResponse = Data([0x01, 0x27])
            let encrypted = try send.encrypt(plaintext: CablePadding.pad(errorResponse))
            try await tunnel.send(encrypted)
            throw error
        }
        log.info("passkey assertion obtained")

        // 9. Send the CTAP2 response back.
        let ctapResponse = CtapGetAssertionResponse(
            credentialId: assertion.credentialId,
            authenticatorData: assertion.authenticatorData,
            signature: assertion.signature,
            userHandle: assertion.userHandle)
        let responseBytes = Data([0x01]) + ctapResponse.encode() // 0x01 = CTAP message type
        let encryptedResponse = try send.encrypt(plaintext: CablePadding.pad(responseBytes))
        try await tunnel.send(encryptedResponse)
        log.info("assertion sent; caBLE session complete for \(request.rpId, privacy: .public)")

        await tunnel.close()
        return .authenticated(rpId: request.rpId)
    }
}

// MARK: - Hex helper

extension Data {
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
