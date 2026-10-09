import Foundation

/// The parked questions the reader has minimized on this device
/// (minimized-asks.svelte.ts): the card folded to its one-line bar so the
/// transcript can be read behind it. Minimizing settles nothing; the ask
/// stays parked on the hub, and the bar brings the card back.
///
/// Kept in this device's defaults, by request id, so a minimized question
/// comes back minimized after the session is left, the app is relaunched or
/// iOS ends it in the background, as the web's survives a reload. It is never
/// told to another device, whose reader has not put the question down. Only
/// the newest `kept` ids stay, far more than are ever parked at once: an id
/// stays useless once its ask is settled, and nothing here needs the hub's
/// word on which ones are.
@MainActor
public enum MinimizedAsks {
    private static let key = "cawco.minimizedAsks"
    private static let kept = 64
    /// Oldest first.
    private static var ids = UserDefaults.standard.stringArray(forKey: key) ?? []

    public static func contains(_ requestId: String) -> Bool {
        ids.contains(requestId)
    }

    public static func set(_ requestId: String, _ on: Bool) {
        ids.removeAll { $0 == requestId }
        if on { ids.append(requestId) }
        ids = Array(ids.suffix(kept))
        UserDefaults.standard.set(ids, forKey: key)
    }
}
