public import CryptoKit
import Foundation
import Security
public import Valet

// What the app and its Notification Service Extension share in the Keychain:
// this device's pairing and the key its pushes are sealed with. Both live in
// one Valet over the access group `dev.cawco.app.shared` (the
// keychain-access-groups entitlement of both targets; Valet uses the data
// protection keychain on every platform), readable after the first unlock so
// the extension can open a push on a locked device, and never restored onto
// another device from a backup.
enum SharedKeychain {
    static let valet = Valet.sharedGroupValet(
        with: SharedGroupIdentifier(appIDPrefix: "FN5LJSPX2R", nonEmptyGroup: "dev.cawco.app.shared")!,
        accessibility: .afterFirstUnlockThisDeviceOnly
    )

    /// The data under `key`; nil when there is none.
    static func data(_ key: String) throws(KeychainError) -> Data? {
        do {
            return try valet.object(forKey: key)
        } catch .itemNotFound {
            return nil
        } catch {
            throw error
        }
    }
}

/// This device's pairing: a lowercase v4 uuid and 32 random bytes in
/// base64url, made once and kept in the shared Keychain group. The extension
/// reads its id to find the push key.
public struct Pairing: Codable, Sendable {
    public let id: String
    public let secret: String

    private static let key = "pairing"

    public struct Missing: Error {}

    /// The kept pairing; made and kept now when there is none, unless `existing`.
    public static func kept(existing: Bool = false) throws -> Pairing {
        try moveIntoSharedGroup()
        if let pairing = try stored() { return pairing }
        guard !existing else { throw Missing() }
        let secret = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        let pairing = Pairing(id: UUID().uuidString.lowercased(), secret: secret)
        try SharedKeychain.valet.setObject(JSONEncoder().encode(pairing), forKey: key)
        return pairing
    }

    /// The pairing in the shared group, as the extension reads it; nil when there is none.
    public static func stored() throws(KeychainError) -> Pairing? {
        try SharedKeychain.data(key).flatMap { try? JSONDecoder().decode(Pairing.self, from: $0) }
    }

    /// Deletes the kept pairing and its push key (H7); the next `kept()` makes a new one.
    public static func forget() throws(KeychainError) {
        if let pairing = try stored() {
            try PushKey.forget(pairingId: pairing.id)
        }
        try SharedKeychain.valet.removeObject(forKey: key)
    }

    /// A pairing made before the shared group sits in the app's own group
    /// (service `dev.cawco.app.cawrier`), where the extension can't read it;
    /// Cawrier and the hub already hold it, so it moves into the shared group
    /// rather than being made again.
    private static func moveIntoSharedGroup() throws {
        guard try SharedKeychain.data(key) == nil else { return }
        do {
            try SharedKeychain.valet.migrateObjects(matching: [
                kSecClass as String: kSecClassGenericPassword as String,
                kSecAttrService as String: "dev.cawco.app.cawrier",
            ], removeOnCompletion: true)
        } catch KeychainError.itemNotFound {
            return
        }
    }
}

/// The AES-256-GCM key a pairing's pushes are sealed with (key
/// `push-key.<pairing id>`). The app makes it at registration and sends it
/// to the hub; every unregister deletes it.
public enum PushKey {
    private static func key(_ pairingId: String) -> String { "push-key.\(pairingId)" }

    /// The pairing's key, read; nil when it has none.
    public static func read(pairingId: String) throws(KeychainError) -> SymmetricKey? {
        try SharedKeychain.data(key(pairingId)).map { SymmetricKey(data: $0) }
    }

    /// The pairing's key: the kept one, else a new one, kept now.
    public static func kept(pairingId: String) throws(KeychainError) -> SymmetricKey {
        if let kept = try read(pairingId: pairingId) { return kept }
        let made = SymmetricKey(size: .bits256)
        try SharedKeychain.valet.setObject(made.withUnsafeBytes { Data($0) }, forKey: key(pairingId))
        return made
    }

    public static func forget(pairingId: String) throws(KeychainError) {
        try SharedKeychain.valet.removeObject(forKey: key(pairingId))
    }
}

extension SymmetricKey {
    /// The raw bytes in standard, padded base64: `key` in `/api/push/register`.
    public var base64: String {
        withUnsafeBytes { Data($0) }.base64EncodedString()
    }
}
