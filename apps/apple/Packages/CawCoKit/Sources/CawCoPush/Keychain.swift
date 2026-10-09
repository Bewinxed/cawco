import CryptoKit
public import Foundation
import Security

// What the app and its Notification Service Extension share in the Keychain:
// this device's pairing and the key its pushes are sealed with. Both live in
// the access group `dev.cawco.app.shared` (the keychain-access-groups
// entitlement of both targets), in the data protection keychain, readable
// after the first unlock so the extension can open a push on a locked device.

enum SharedKeychain {
    /// The entitlement's `$(AppIdentifierPrefix)dev.cawco.app.shared`, the team prefix written out.
    static let group = "FN5LJSPX2R.dev.cawco.app.shared"

    /// The item's primary key: generic password, service, account, the shared group.
    static func item(service: String, account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: group,
            kSecUseDataProtectionKeychain as String: true,
        ]
    }

    /// The item's data; nil when there is none.
    static func read(service: String, account: String) throws(KeychainFailure) -> Data? {
        var query = item(service: service, account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var found: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &found)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = found as? Data else { throw .keychain(status) }
        return data
    }

    static func add(service: String, account: String, data: Data) throws(KeychainFailure) {
        var add = item(service: service, account: account)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        add[kSecValueData as String] = data
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else { throw .keychain(status) }
    }

    static func delete(service: String, account: String) throws(KeychainFailure) {
        let status = SecItemDelete(item(service: service, account: account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw .keychain(status) }
    }
}

public enum KeychainFailure: Error {
    case missing
    case random(OSStatus)
    case keychain(OSStatus)
}

/// This device's pairing: a lowercase v4 uuid and 32 random bytes in
/// base64url, made once and kept in the shared Keychain group (service
/// `dev.cawco.app.cawrier`). The extension reads its id to find the push key.
public struct Pairing: Codable, Sendable {
    public let id: String
    public let secret: String

    private static let service = "dev.cawco.app.cawrier"
    private static let account = "pairing"

    /// The kept pairing; made and kept now when there is none, unless `existing`.
    public static func kept(existing: Bool = false) throws(KeychainFailure) -> Pairing {
        try moveIntoSharedGroup()
        if let pairing = try stored() { return pairing }
        guard !existing else { throw .missing }
        var bytes = [UInt8](repeating: 0, count: 32)
        let drawn = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard drawn == errSecSuccess else { throw .random(drawn) }
        let secret = Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        let pairing = Pairing(id: UUID().uuidString.lowercased(), secret: secret)
        guard let data = try? JSONEncoder().encode(pairing) else { throw .missing }
        try SharedKeychain.add(service: service, account: account, data: data)
        return pairing
    }

    /// The pairing in the shared group, as the extension reads it; nil when there is none.
    public static func stored() throws(KeychainFailure) -> Pairing? {
        try SharedKeychain.read(service: service, account: account).flatMap { try? JSONDecoder().decode(Pairing.self, from: $0) }
    }

    /// Deletes the kept pairing and its push key (H7); the next `kept()` makes a new one.
    public static func forget() throws(KeychainFailure) {
        if let pairing = try stored() {
            try PushKey.forget(pairingId: pairing.id)
        }
        try SharedKeychain.delete(service: service, account: account)
    }

    /// A pairing made before the shared group sits in the app's own group,
    /// where the extension can't read it; Cawrier and the hub already hold it,
    /// so it moves into the shared group rather than being made again.
    private static func moveIntoSharedGroup() throws(KeychainFailure) {
        let own: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: "FN5LJSPX2R.dev.cawco.app",
            kSecUseDataProtectionKeychain as String: true,
        ]
        let moved = SecItemUpdate(own as CFDictionary, [kSecAttrAccessGroup as String: SharedKeychain.group] as CFDictionary)
        guard moved == errSecSuccess || moved == errSecItemNotFound else { throw .keychain(moved) }
    }
}

/// The AES-256-GCM key a pairing's pushes are sealed with (service
/// `dev.cawco.app.push-key`, account the pairing id). The app makes it at
/// registration and sends it to the hub; every unregister deletes it.
public enum PushKey {
    private static let service = "dev.cawco.app.push-key"

    /// The pairing's key, read; nil when it has none.
    public static func read(pairingId: String) throws(KeychainFailure) -> SymmetricKey? {
        try SharedKeychain.read(service: service, account: pairingId).map { SymmetricKey(data: $0) }
    }

    /// The pairing's key: the kept one, else a new one, kept now.
    public static func kept(pairingId: String) throws(KeychainFailure) -> SymmetricKey {
        if let key = try read(pairingId: pairingId) { return key }
        let key = SymmetricKey(size: .bits256)
        try SharedKeychain.add(service: service, account: pairingId, data: key.withUnsafeBytes { Data($0) })
        return key
    }

    public static func forget(pairingId: String) throws(KeychainFailure) {
        try SharedKeychain.delete(service: service, account: pairingId)
    }
}

extension SymmetricKey {
    /// The raw bytes in standard, padded base64: `key` in `/api/push/register`.
    public var base64: String {
        withUnsafeBytes { Data($0) }.base64EncodedString()
    }
}
