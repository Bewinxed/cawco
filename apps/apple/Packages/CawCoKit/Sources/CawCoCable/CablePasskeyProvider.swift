import Foundation

/// A passkey assertion as the caBLE bridge returns it to the CTAP2 layer.
public struct CablePasskeyAssertion: Sendable {
    /// The credential ID that was used.
    public let credentialId: Data
    /// The authenticator data (RP ID hash + flags + counter).
    public let authenticatorData: Data
    /// The ECDSA signature over authenticator data + client data hash.
    public let signature: Data
    /// The user handle (user.id from the credential), if present.
    public let userHandle: Data?

    public init(credentialId: Data, authenticatorData: Data, signature: Data, userHandle: Data?) {
        self.credentialId = credentialId
        self.authenticatorData = authenticatorData
        self.signature = signature
        self.userHandle = userHandle
    }
}

/// The bridge between the caBLE session and the platform's passkey store.
/// CawCoCable defines this protocol; the app target provides the
/// implementation using `ASAuthorizationController`, which needs UIKit
/// for its presentation anchor.
///
/// If `ASAuthorizationController` cannot assert for an RP the app has no
/// associated domain for, the implementation should throw
/// `CablePasskeyError.noAssociatedDomain` so the session can report it.
public protocol CablePasskeyProvider: Sendable {
    /// Performs a passkey assertion for the given RP using the platform
    /// authenticator (Face ID / Touch ID).
    ///
    /// - Parameters:
    ///   - rpId: The relying party identifier (e.g. "github.com").
    ///   - challenge: The 32-byte client data hash from the CTAP2 request.
    ///   - allowedCredentials: Credential IDs the server will accept (empty = discoverable).
    func assertPasskey(
        rpId: String,
        challenge: Data,
        allowedCredentials: [Data]
    ) async throws -> CablePasskeyAssertion
}

public enum CablePasskeyError: Error, Sendable {
    /// The app has no associated domain for this RP, so
    /// `ASAuthorizationController` cannot assert. A credential provider
    /// extension would be needed.
    case noAssociatedDomain(rpId: String)
    /// The user cancelled Face ID / Touch ID.
    case cancelled
    /// The platform found no matching credential.
    case noCredential(rpId: String)
    /// An underlying framework error.
    case platform(String)
}
