public import CryptoKit
import Foundation

/// What a push says on the lock screen, as the hub sealed it: the push's
/// top-level `"e"` is base64 of `IV(12) ‖ ciphertext ‖ tag(16)`, AES-256-GCM
/// with no additional data, over UTF-8 JSON `{"v":1,"title","subtitle"?,"body","options"?}`.
/// Cawrier and APNs carry only that and the alert's safe title and body.
public struct SealedAlert: Decodable, Sendable {
    /// One option of a question the push answers inline (push.ts `PushOption`):
    /// `id` is its index among the question's options.
    public struct Option: Decodable, Sendable, Equatable {
        public let id: String
        public let label: String
    }

    public let v: Int
    public let title: String
    public let subtitle: String?
    public let body: String
    /// Set on a question of one part with one to three options (push.ts `inlineOptions`).
    public let options: [Option]?

    public enum Failure: Error {
        case notBase64
        case version(Int)
    }

    /// Opens `sealed` (the push's `"e"`) with `key`.
    public static func open(_ sealed: String, key: SymmetricKey) throws -> SealedAlert {
        guard let combined = Data(base64Encoded: sealed) else { throw Failure.notBase64 }
        let plain = try AES.GCM.open(AES.GCM.SealedBox(combined: combined), using: key)
        let alert = try JSONDecoder().decode(SealedAlert.self, from: plain)
        guard alert.v == 1 else { throw Failure.version(alert.v) }
        return alert
    }
}
