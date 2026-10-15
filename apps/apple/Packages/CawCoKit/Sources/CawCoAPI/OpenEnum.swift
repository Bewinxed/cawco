public import Foundation
import os
import Synchronization

/// A string enum the hub sends, open (OpenEnums.swift, written by
/// `bun run openapi`): a value this app does not know reads as
/// `unrecognized(raw)` instead of failing the whole message. The hub ships
/// nightly and the app through TestFlight later, so a hub newer than its app
/// is the normal case, and its board keeps reading.
public protocol OpenEnum: RawRepresentable, Codable, Hashable, Sendable, CaseIterable
    where RawValue == String, AllCases == [Self] {
    /// Every string is a value: an unknown one is `unrecognized`.
    init(rawValue: String)
    /// A value this app does not know.
    var isUnrecognized: Bool { get }
}

extension OpenEnum {
    /// Reads the raw string, and says once that the hub sent one this app does not know.
    public static func decodeOpen(from decoder: any Decoder) throws -> Self {
        let raw = try decoder.singleValueContainer().decode(String.self)
        let value: Self = Self(rawValue: raw)
        if value.isUnrecognized {
            HubNewer.saw(Self.self, at: decoder.codingPath, raw: raw)
        }
        return value
    }

    public func encodeOpen(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

/// The hub sent a value this app does not know, or something its types cannot
/// read: it is newer than the app. Each enum, field and value, and each
/// skipped place and reason, is logged once; the first of a launch posts
/// `noticed`, which the app turns into its one update notice.
public enum HubNewer {
    /// Posted (on the decoding thread) the first time in a launch the hub sends an unknown value.
    public static let noticed = Notification.Name("dev.cawco.hubNewer")

    private static let seen = Mutex<Set<String>>([])
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Hub")

    /// Whether this launch has met an unknown value.
    public static var met: Bool { seen.withLock { !$0.isEmpty } }

    static func saw(_ type: Any.Type, at path: [any CodingKey], raw: String) {
        let name = String(describing: type)
        let field = path.last { $0.intValue == nil }?.stringValue ?? "(top)"
        guard met("\(name)\u{1F}\(field)\u{1F}\(raw)") else { return }
        let where_ = path.map { $0.intValue.map { "[\($0)]" } ?? ".\($0.stringValue)" }.joined()
        log.notice("hub sent a value this app does not know: enum \(name, privacy: .public) field \(field, privacy: .public) value \(raw, privacy: .public) at \(where_, privacy: .public)")
    }

    /// The hub sent something this app's types cannot read, and the message
    /// was read without it (CawCoCore's `Wire.lossy`): `count` places at
    /// `place` (array indices as `[*]`) in a `message`, and why.
    public static func skipped(_ count: Int, of message: String, at place: String, because reason: String) {
        guard met("skipped\u{1F}\(message)\u{1F}\(place)\u{1F}\(reason)") else { return }
        log.notice("hub sent what this app cannot read, read without it: \(count) at \(place, privacy: .public) in \(message, privacy: .public): \(reason, privacy: .public)")
    }

    /// Whether `key` is new this launch; the first of a launch posts `noticed`.
    private static func met(_ key: String) -> Bool {
        let (first, new) = seen.withLock { seen in
            let first = seen.isEmpty
            return (first, seen.insert(key).inserted)
        }
        if first {
            NotificationCenter.default.post(name: noticed, object: nil)
        }
        return new
    }
}
