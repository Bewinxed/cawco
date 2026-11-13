import CryptoKit
import Foundation
import Security

/// Manages CawCo's passkey credentials in the Keychain, shared between the
/// app and its credential provider extension through a Keychain access group.
///
/// Each credential is a P-256 key pair: the private key sits in the Secure
/// Enclave (or the software Keychain on the simulator), and its metadata
/// (RP ID, user handle, display name) is a generic-password item alongside it.
/// The shared `keychain-access-groups` entitlement lets both the app and the
/// credential provider extension read and sign with the same keys.
public final class PasskeyStore: Sendable {
    /// The Keychain access group both the app and the extension share.
    /// Matches the `keychain-access-groups` entitlement on every target.
    public static let accessGroup = "FN5LJSPX2R.dev.cawco.app.shared"

    /// The Keychain service that holds passkey credential metadata.
    private static let metadataService = "dev.cawco.passkeys"

    public init() {}

    // MARK: - Credential metadata

    /// A passkey credential's metadata, stored in the shared Keychain as a
    /// generic-password item alongside the Secure Enclave private key.
    public struct Credential: Codable, Sendable {
        public let rpId: String
        public let credentialId: Data
        public let userHandle: Data
        public let userName: String?
        /// The `kSecAttrApplicationTag` that identifies the private key.
        public let keyTag: String
        /// The signature counter, incremented with each assertion.
        public var counter: UInt32
    }

    // MARK: - Lookup

    /// All credentials for the given relying party.
    public func credentials(for rpId: String) -> [Credential] {
        allCredentials().filter { $0.rpId == rpId }
    }

    /// The credential matching a specific credential ID, if stored.
    public func credential(for credentialId: Data) -> Credential? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.metadataService,
            kSecAttrAccount as String: credentialId.base64EncodedString(),
            kSecAttrAccessGroup as String: Self.accessGroup,
            kSecReturnData as String: true,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return try? JSONDecoder().decode(Credential.self, from: data)
    }

    /// Every credential in the store, across all relying parties.
    public func allCredentials() -> [Credential] {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.metadataService,
            kSecAttrAccessGroup as String: Self.accessGroup,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let items = result as? [Data]
        else { return [] }
        let decoder = JSONDecoder()
        return items.compactMap { try? decoder.decode(Credential.self, from: $0) }
    }

    // MARK: - Creation

    /// Creates a new passkey credential: a P-256 key in the Secure Enclave
    /// (or a software key on the simulator) plus its metadata in the shared
    /// Keychain. Returns the credential and its public key in X9.63 format.
    public func create(
        rpId: String,
        userHandle: Data,
        userName: String?
    ) throws -> (credential: Credential, publicKey: Data) {
        var credentialId = Data(count: 32)
        let status = credentialId.withUnsafeMutableBytes {
            SecRandomCopyBytes(kSecRandomDefault, 32, $0.baseAddress!)
        }
        guard status == errSecSuccess else {
            throw PasskeyStoreError.keyCreationFailed("SecRandomCopyBytes failed")
        }
        let keyTag = "dev.cawco.passkey.\(credentialId.base64EncodedString())"
        let tagData = Data(keyTag.utf8)

        let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            .privateKeyUsage,
            nil)!

        let privateKeyAttrs: [String: Any] = [
            kSecAttrIsPermanent as String: true,
            kSecAttrApplicationTag as String: tagData,
            kSecAttrAccessControl as String: access,
            kSecAttrAccessGroup as String: Self.accessGroup,
        ]

        // Try the Secure Enclave first; fall back to a software key on the
        // simulator or machines without an enclave.
        let privateKey: SecKey = try {
            var attrs: [String: Any] = [
                kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
                kSecAttrKeySizeInBits as String: 256,
                kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
                kSecPrivateKeyAttrs as String: privateKeyAttrs,
            ]
            var error: Unmanaged<CFError>?
            if let key = SecKeyCreateRandomKey(attrs as CFDictionary, &error) {
                return key
            }
            // Software fallback.
            attrs.removeValue(forKey: kSecAttrTokenID as String)
            error = nil
            guard let key = SecKeyCreateRandomKey(attrs as CFDictionary, &error) else {
                throw PasskeyStoreError.keyCreationFailed(
                    error?.takeRetainedValue().localizedDescription ?? "unknown")
            }
            return key
        }()

        guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
            throw PasskeyStoreError.keyCreationFailed("could not derive public key")
        }
        var exportError: Unmanaged<CFError>?
        guard let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, &exportError) as Data? else {
            throw PasskeyStoreError.keyCreationFailed("could not export public key")
        }

        let credential = Credential(
            rpId: rpId,
            credentialId: credentialId,
            userHandle: userHandle,
            userName: userName,
            keyTag: keyTag,
            counter: 0)
        try storeMetadata(credential)

        return (credential, publicKeyData)
    }

    // MARK: - Assertion

    /// Signs an assertion for the credential using its Secure Enclave private
    /// key. Returns the authenticator data and the ECDSA signature over
    /// `authenticatorData ‖ clientDataHash`.
    public func assert(
        credential: Credential,
        clientDataHash: Data
    ) throws -> (authenticatorData: Data, signature: Data) {
        precondition(clientDataHash.count == 32)

        // Look up the private key by its tag.
        let keyQuery: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: Data(credential.keyTag.utf8),
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrAccessGroup as String: Self.accessGroup,
            kSecReturnRef as String: true,
        ]
        var keyResult: AnyObject?
        guard SecItemCopyMatching(keyQuery as CFDictionary, &keyResult) == errSecSuccess else {
            throw PasskeyStoreError.keyNotFound(credential.keyTag)
        }
        // SecItemCopyMatching returns a CFTypeRef; it is always a SecKey here.
        let privateKey = keyResult as! SecKey // swiftlint:disable:this force_cast

        // Increment the counter and store it back.
        var updated = credential
        updated.counter &+= 1
        try storeMetadata(updated)

        // Authenticator data: rpIdHash(32) ‖ flags(1) ‖ counter(4).
        let rpIdHash = SHA256.hash(data: Data(credential.rpId.utf8))
        var authData = Data(rpIdHash)
        let flags: UInt8 = 0x05 // UP (0x01) | UV (0x04)
        authData.append(flags)
        withUnsafeBytes(of: updated.counter.bigEndian) { authData.append(contentsOf: $0) }

        // Sign authenticatorData ‖ clientDataHash with ES256
        // (.ecdsaSignatureMessageX962SHA256 hashes the input with SHA-256).
        var signedData = authData
        signedData.append(clientDataHash)
        var signError: Unmanaged<CFError>?
        guard let sig = SecKeyCreateSignature(
            privateKey,
            .ecdsaSignatureMessageX962SHA256,
            signedData as CFData,
            &signError
        ) as Data? else {
            throw PasskeyStoreError.signingFailed(
                signError?.takeRetainedValue().localizedDescription ?? "unknown")
        }

        return (authData, sig)
    }

    // MARK: - Deletion

    /// Deletes a credential: its private key and its metadata.
    public func delete(credentialId: Data) {
        if let credential = credential(for: credentialId) {
            let keyQuery: [String: Any] = [
                kSecClass as String: kSecClassKey,
                kSecAttrApplicationTag as String: Data(credential.keyTag.utf8),
                kSecAttrAccessGroup as String: Self.accessGroup,
            ]
            SecItemDelete(keyQuery as CFDictionary)
        }
        let metaQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.metadataService,
            kSecAttrAccount as String: credentialId.base64EncodedString(),
            kSecAttrAccessGroup as String: Self.accessGroup,
        ]
        SecItemDelete(metaQuery as CFDictionary)
    }

    // MARK: - Private

    private func storeMetadata(_ credential: Credential) throws {
        let data = try JSONEncoder().encode(credential)
        let account = credential.credentialId.base64EncodedString()

        let existing: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.metadataService,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: Self.accessGroup,
        ]
        // Try an update first.
        let update: [String: Any] = [kSecValueData as String: data]
        if SecItemUpdate(existing as CFDictionary, update as CFDictionary) == errSecSuccess {
            return
        }
        // Not found; add a new item.
        var add = existing
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(add as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw PasskeyStoreError.storageFailed("SecItemAdd status \(addStatus)")
        }
    }
}

public enum PasskeyStoreError: Error, Sendable {
    case keyCreationFailed(String)
    case keyNotFound(String)
    case signingFailed(String)
    case storageFailed(String)
}
