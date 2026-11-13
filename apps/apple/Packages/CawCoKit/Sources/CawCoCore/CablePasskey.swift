import AuthenticationServices
import CawCoCable
import Foundation
import OSLog
import UIKit

/// The `CablePasskeyProvider` backed by `ASAuthorizationController`: asks the
/// device's passkey store for an assertion via Face ID / Touch ID, for any RP
/// the device holds a credential for.
///
/// **Limitation:** `ASAuthorizationController` creates its own
/// `clientDataJSON` and signs with `SHA256(its clientDataJSON)`, not with
/// the `clientDataHash` the browser passed in the CTAP2 request. This means
/// the resulting signature won't verify against the browser's clientDataJSON.
/// For production caBLE use, an `ASCredentialProviderViewController` extension
/// with its own credential storage and signing is needed: the extension
/// receives `clientDataHash` directly and can construct the correct signature.
/// This implementation serves as the integration point and will work when
/// the credential provider extension is in place.
///
/// `@unchecked Sendable` because `UIWindow` is not `Sendable`, but the window
/// is only accessed on the main actor.
public final class PlatformPasskeyProvider: NSObject, CablePasskeyProvider, @unchecked Sendable {
    private let anchor: UIWindow

    @MainActor
    public init(anchor: UIWindow) {
        self.anchor = anchor
    }

    public func assertPasskey(
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
