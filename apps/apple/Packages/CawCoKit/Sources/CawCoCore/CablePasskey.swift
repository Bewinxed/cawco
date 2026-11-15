import AuthenticationServices
import CawCoCable
import Foundation
import OSLog
import UIKit

/// The `CablePasskeyProvider` backed by CawCo's credential store with a
/// fallback to `ASAuthorizationController`.
///
/// When CawCo's `PasskeyStore` holds a credential for the RP, the assertion
/// is signed directly with the Secure Enclave key and the browser's
/// `clientDataHash` — the signature the browser will verify. When no
/// CawCo-managed credential exists, the provider falls through to
/// `ASAuthorizationController`, which creates its own `clientDataJSON` and
/// signs with its hash (a known limitation for system-managed passkeys).
///
/// `@unchecked Sendable` because `UIWindow` is not `Sendable`, but the window
/// is only accessed on the main actor.
public final class PlatformPasskeyProvider: NSObject, CablePasskeyProvider, @unchecked Sendable {
    private let anchor: UIWindow
    private let store = PasskeyStore()
    private let log = Logger(subsystem: "dev.cawco.app", category: "caBLE.passkey")

    @MainActor
    public init(anchor: UIWindow) {
        self.anchor = anchor
    }

    public func assertPasskey(
        rpId: String,
        challenge: Data,
        allowedCredentials: [Data]
    ) async throws -> CablePasskeyAssertion {
        // Try CawCo's credential store first: it signs with the browser's
        // clientDataHash directly, which ASAuthorizationController cannot.
        do {
            let assertion = try assertFromStore(
                rpId: rpId,
                clientDataHash: challenge,
                allowedCredentials: allowedCredentials)
            log.info("asserted from credential store for \(rpId, privacy: .public)")
            return assertion
        } catch {
            log.debug("no stored credential for \(rpId, privacy: .public); falling through to ASAuthorizationController")
        }

        // Fall back to ASAuthorizationController for system-managed passkeys.
        return try await assertWithController(
            rpId: rpId, challenge: challenge, allowedCredentials: allowedCredentials)
    }

    /// Asserts from CawCo's own credential store, signing with the correct
    /// `clientDataHash`. Works for any RP without associated domains.
    private func assertFromStore(
        rpId: String,
        clientDataHash: Data,
        allowedCredentials: [Data]
    ) throws -> CablePasskeyAssertion {
        let candidates: [PasskeyStore.Credential]
        if allowedCredentials.isEmpty {
            candidates = store.credentials(for: rpId)
        } else {
            candidates = allowedCredentials.compactMap { store.credential(for: $0) }
        }
        guard let credential = candidates.first else {
            throw CablePasskeyError.noCredential(rpId: rpId)
        }
        let (authData, signature) = try store.assert(
            credential: credential,
            clientDataHash: clientDataHash)
        return CablePasskeyAssertion(
            credentialId: credential.credentialId,
            authenticatorData: authData,
            signature: signature,
            userHandle: credential.userHandle)
    }

    /// Asserts via `ASAuthorizationController`. Creates its own
    /// `clientDataJSON` whose hash won't match the browser's — a known
    /// limitation for system-managed passkeys until they're migrated to
    /// the credential provider store.
    private func assertWithController(
        rpId: String,
        challenge: Data,
        allowedCredentials: [Data]
    ) async throws -> CablePasskeyAssertion {
        // ASAuthorizationController must run on the main actor.
        try await withCheckedThrowingContinuation { [anchor] continuation in
            Task { @MainActor in
                let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
                    relyingPartyIdentifier: rpId)
                let request = provider.createCredentialAssertionRequest(
                    challenge: challenge)

                if !allowedCredentials.isEmpty {
                    request.allowedCredentials = allowedCredentials.map {
                        ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0)
                    }
                }

                let controller = ASAuthorizationController(authorizationRequests: [request])
                let delegate = AssertionDelegate(continuation: continuation)
                controller.delegate = delegate
                controller.presentationContextProvider = WindowAnchor(anchor)
                // Keep the delegate alive until the continuation fires.
                objc_setAssociatedObject(
                    controller, &AssertionDelegate.key, delegate,
                    .OBJC_ASSOCIATION_RETAIN)
                controller.performRequests()
            }
        }
    }
}

/// Bridges `ASAuthorizationControllerDelegate` to a `CheckedContinuation`.
private final class AssertionDelegate: NSObject, ASAuthorizationControllerDelegate, @unchecked Sendable {
    static var key: UInt8 = 0
    private var continuation: CheckedContinuation<CablePasskeyAssertion, any Error>?
    private let log = Logger(subsystem: "dev.cawco.app", category: "caBLE.passkey")

    init(continuation: CheckedContinuation<CablePasskeyAssertion, any Error>) {
        self.continuation = continuation
    }

    func authorizationController(
        controller _: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential
            as? ASAuthorizationPlatformPublicKeyCredentialAssertion
        else {
            log.error("unexpected credential type: \(type(of: authorization.credential))")
            continuation?.resume(throwing: CablePasskeyError.platform("unexpected credential type"))
            continuation = nil
            return
        }
        let assertion = CablePasskeyAssertion(
            credentialId: credential.credentialID,
            authenticatorData: credential.rawAuthenticatorData,
            signature: credential.signature,
            userHandle: credential.userID.isEmpty ? nil : credential.userID)
        continuation?.resume(returning: assertion)
        continuation = nil
    }

    func authorizationController(
        controller _: ASAuthorizationController,
        didCompleteWithError error: any Error
    ) {
        let asError = error as? ASAuthorizationError
        switch asError?.code {
        case .canceled:
            continuation?.resume(throwing: CablePasskeyError.cancelled)
        case .notHandled, .notInteractive:
            log.warning("passkey assertion not handled: \(error.localizedDescription, privacy: .public)")
            continuation?.resume(throwing: CablePasskeyError.noAssociatedDomain(rpId: ""))
        default:
            log.error("passkey assertion failed: \(error.localizedDescription, privacy: .public)")
            continuation?.resume(throwing: CablePasskeyError.platform(error.localizedDescription))
        }
        continuation = nil
    }
}

/// Provides the window anchor for `ASAuthorizationController`.
private final class WindowAnchor: NSObject, ASAuthorizationControllerPresentationContextProviding, @unchecked Sendable {
    private let window: UIWindow

    init(_ window: UIWindow) {
        self.window = window
    }

    func presentationAnchor(for _: ASAuthorizationController) -> ASPresentationAnchor {
        window
    }
}
