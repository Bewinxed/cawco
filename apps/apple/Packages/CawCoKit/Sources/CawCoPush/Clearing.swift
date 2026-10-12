import Foundation
import os
import UserNotifications
import Valet

// A notification cleared on one device is cleared on the others: the hub
// names what was cleared (a socket frame, `/api/notifications/cleared`,
// `cawco.cleared` on every push and a background push), and this device
// tells the hub what its person cleared (`/api/notifications/dismiss`).
// A delivered notification's identifier is its push's `apns-collapse-id`
// ("For remote notifications, it is set to the value of the apns-collapse-id
// key", UNNotificationRequest.identifier), so the hub's ids are identifiers.
//
// Apple calls back for a single swipe (`.customDismissAction`), never for
// "Clear All". So every notification this device shows is recorded here, in
// the Keychain group the app shares with its extension, and one that is no
// longer delivered, that this device didn't remove and the hub doesn't
// already list as cleared, was cleared by the person: `reconcile` says so.

/// The one way a notification is removed, the record of what showed, and
/// what this device tells the hub. Used by the app and its extension alike.
public enum NotificationClearing {
    /// How the person cleared a notification (`/api/notifications/dismiss` `via`).
    public enum Via: String, Sendable {
        /// Tapped, which opens its session.
        case open
        /// One of its actions ran (Approve, Deny, Reply…).
        case action
        /// Swiped away, or gone from Notification Centre without this device removing it.
        case dismiss
    }

    private static let log = Logger(subsystem: "dev.cawco.app", category: "Clearing")

    // MARK: The hub's address, for the extension

    private static let hubKey = "hub-address"

    /// The app keeps the hub's address where the extension reads it.
    public static func keepHub(_ address: URL?) {
        do {
            guard let address else {
                try SharedKeychain.valet.removeObject(forKey: hubKey)
                return
            }
            let data = Data(address.absoluteString.utf8)
            guard try SharedKeychain.data(hubKey) != data else { return }
            try SharedKeychain.valet.setObject(data, forKey: hubKey)
        } catch {
            log.error("hub address not kept for the extension: \(String(describing: error), privacy: .public)")
        }
    }

    static var hub: URL? {
        (try? SharedKeychain.data(hubKey)).flatMap { URL(string: String(decoding: $0, as: UTF8.self)) }
    }

    // MARK: Reading a push

    /// `cawco.cleared`: the ids the hub says are cleared, on a visible push and a background one.
    public static func cleared(_ userInfo: [AnyHashable: Any]) -> [String] {
        ((userInfo["cawco"] as? [String: Any])?["cleared"] as? [String]) ?? []
    }

    // MARK: Removing

    /// Removes the delivered notifications among `ids`, and waits for the
    /// centre to show them gone: `removeDeliveredNotifications` returns
    /// before the removal lands, so the delivered list is read again every
    /// 100 ms for up to 2 s. Each is marked removed by this device first, so
    /// `reconcile` never reports it as the person's. Ids not on show are
    /// skipped, so calling it again changes nothing. True once none shows.
    /// `queue` is the caller's serial queue for the centre's calls.
    @discardableResult @concurrent
    public static func remove(_ ids: [String], because layer: String, on queue: DispatchQueue) async -> Bool {
        let wanted = Set(ids)
        guard !wanted.isEmpty else { return true }
        let present = await delivered(on: queue).map(\.id).filter(wanted.contains)
        guard !present.isEmpty else {
            log.notice("\(layer, privacy: .public): none of \(wanted.sorted().joined(separator: ","), privacy: .public) on show")
            return true
        }
        Record.update { $0.removed(present) }
        queue.async { UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: present) }
        let deadline = ContinuousClock.now + .seconds(2)
        var left = Set(present)
        while true {
            left.formIntersection(await delivered(on: queue).map(\.id))
            if left.isEmpty {
                log.notice("\(layer, privacy: .public): removed \(present.sorted().joined(separator: ","), privacy: .public), confirmed gone")
                return true
            }
            guard ContinuousClock.now < deadline else {
                log.error("\(layer, privacy: .public): \(left.sorted().joined(separator: ","), privacy: .public) still on show 2 s after removal")
                return false
            }
            try? await Task.sleep(for: .milliseconds(100))
        }
    }

    /// The extension's work on a visible push before it is handed back: the
    /// ids its `cawco.cleared` names are removed and confirmed gone, the
    /// record is reconciled, then the push is recorded as delivered. Its own
    /// id is never removed or reported: it replaces whatever showed under it.
    @concurrent
    public static func arriving(_ id: String, cleared: [String], on queue: DispatchQueue) async {
        log.notice("push \(id, privacy: .public) arriving, cawco.cleared [\(cleared.joined(separator: ","), privacy: .public)]")
        await remove(cleared.filter { $0 != id }, because: "extension", on: queue)
        await reconcile(hubCleared: Set(cleared), arriving: id, on: queue)
        recordDelivered(id)
    }

    // MARK: The record

    /// The extension delivers `id` now: recorded, and no longer marked removed.
    public static func recordDelivered(_ id: String) {
        Record.update { $0.delivered([id: Record.ms(.now)]) }
    }

    /// Compares the record with what Notification Centre shows. A recorded
    /// id no longer shown, that this device didn't remove, that the hub
    /// doesn't list in `hubCleared` and that isn't `arriving` (the push the
    /// extension is about to show under that id), was cleared by the person:
    /// the hub hears it as a dismissal and the record drops it once the hub
    /// took it (a refusal leaves it for the next reconcile). Hub pushes on
    /// show that the record lacks (delivered before the extension recorded
    /// them) are recorded with their delivery time. Returns the ids reported.
    @discardableResult @concurrent
    public static func reconcile(hubCleared: Set<String>, arriving: String?, on queue: DispatchQueue) async -> [String] {
        let shown = await delivered(on: queue)
        let showing = Set(shown.map(\.id))
        let gone = Record.update { record -> [String] in
            let gone = record.gone(showing: showing, except: hubCleared.union(arriving.map { [$0] } ?? []))
            // The hub already knows these: nothing to report.
            record.forget(hubCleared.subtracting(showing))
            record.delivered(Dictionary(shown.filter(\.fromHub).filter { record.lacks($0.id) }.map { ($0.id, $0.ms) }) { first, _ in first })
            return gone
        }
        guard !gone.isEmpty else { return [] }
        log.notice("reconcile: \(gone.joined(separator: ","), privacy: .public) cleared here without this device removing them")
        guard await tellHub(gone, via: .dismiss) else { return [] }
        Record.update { $0.forget(Set(gone)) }
        return gone
    }

    // MARK: Telling the hub

    /// The person cleared `ids` through `via` (a tap, an action, a swipe):
    /// the hub hears it, and the record drops them first, so a reconcile
    /// meanwhile doesn't report them again. A refusal puts them back, for
    /// the next reconcile to report.
    @discardableResult @concurrent
    public static func report(_ ids: [String], via: Via) async -> Bool {
        guard !ids.isEmpty else { return true }
        let held = Record.update { $0.take(ids) }
        guard await tellHub(ids, via: via) else {
            Record.update { $0.delivered(held) }
            return false
        }
        return true
    }

    /// `POST /api/notifications/dismiss`; true when the hub took it.
    private static func tellHub(_ ids: [String], via: Via) async -> Bool {
        guard let hub else {
            log.error("dismiss \(ids.joined(separator: ","), privacy: .public) via \(via.rawValue, privacy: .public): no hub kept")
            return false
        }
        struct Dismissal: Encodable {
            let collapseIds: [String]
            let via: String
        }
        var request = URLRequest(url: hub.appending(path: "api/notifications/dismiss"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 8
        request.httpBody = try? JSONEncoder().encode(Dismissal(collapseIds: ids, via: via.rawValue))
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let ok = (200 ..< 300).contains(status)
            log.notice("dismiss \(ids.joined(separator: ","), privacy: .public) via \(via.rawValue, privacy: .public): hub answered \(status)")
            return ok
        } catch {
            log.error("dismiss \(ids.joined(separator: ","), privacy: .public) via \(via.rawValue, privacy: .public): \(String(describing: error), privacy: .public)")
            return false
        }
    }

    // MARK: The centre

    /// A delivered notification, as plain values.
    struct Shown: Sendable {
        let id: String
        let ms: Double
        /// A hub push (or the app's notice in a push's place): it carries the
        /// `cawco` object. The app's own reminder is not the hub's to clear.
        let fromHub: Bool
    }

    private static func delivered(on queue: DispatchQueue) async -> [Shown] {
        await withCheckedContinuation { done in
            queue.async {
                UNUserNotificationCenter.current().getDeliveredNotifications { notes in
                    done.resume(returning: notes.map { note in
                        let cawco = note.request.content.userInfo["cawco"] as? [String: Any]
                        return Shown(id: note.request.identifier, ms: Record.ms(note.date),
                                     fromHub: cawco != nil && cawco?["kind"] as? String != "trial-ending")
                    })
                }
            }
        }
    }
}

/// What this device showed and what it removed itself, by notification id,
/// each with its time in ms epoch: one Keychain item in the group the app
/// shares with its extension. Ids are collapse ids, which the hub reuses: a
/// new delivery of an id lifts its "removed" mark. Bounded to the 200 newest
/// of each, none older than 3 days (iOS keeps about 100 per app).
struct Record: Codable {
    private var shown: [String: Double] = [:]
    private var removedHere: [String: Double] = [:]

    private static let key = "notification-record"
    private static let limit = 200
    private static let keepMs: Double = 3 * 24 * 60 * 60 * 1000
    /// One read-change-write at a time in this process.
    private static let lock = OSAllocatedUnfairLock()
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Clearing")

    static func ms(_ date: Date) -> Double { (date.timeIntervalSince1970 * 1000).rounded() }

    /// Reads the record, changes it, and writes it back if it changed.
    static func update<T>(_ change: (inout Record) -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        var record = (try? SharedKeychain.data(key)).flatMap { try? JSONDecoder().decode(Record.self, from: $0) } ?? Record()
        let before = record
        let result = change(&record)
        record.prune()
        if record.shown != before.shown || record.removedHere != before.removedHere {
            do {
                try SharedKeychain.valet.setObject(JSONEncoder().encode(record), forKey: key)
            } catch {
                log.error("notification record not written: \(String(describing: error), privacy: .public)")
            }
        }
        return result
    }

    func lacks(_ id: String) -> Bool { shown[id] == nil }

    mutating func delivered(_ ids: [String: Double]) {
        for (id, at) in ids {
            shown[id] = at
            removedHere[id] = nil
        }
    }

    mutating func removed(_ ids: [String]) {
        let now = Self.ms(.now)
        for id in ids {
            removedHere[id] = now
            shown[id] = nil
        }
    }

    mutating func forget(_ ids: Set<String>) {
        for id in ids { shown[id] = nil }
    }

    /// Drops `ids` and returns what they were, to put back.
    mutating func take(_ ids: [String]) -> [String: Double] {
        var held: [String: Double] = [:]
        for id in ids { held[id] = shown.removeValue(forKey: id) }
        return held
    }

    /// Recorded, no longer showing, not removed here since it was delivered, not in `except`.
    func gone(showing: Set<String>, except: Set<String>) -> [String] {
        shown.filter { id, at in
            !showing.contains(id) && !except.contains(id) && (removedHere[id].map { $0 < at } ?? true)
        }.keys.sorted()
    }

    private mutating func prune() {
        let oldest = Self.ms(.now) - Self.keepMs
        shown = Self.bounded(shown.filter { $0.value >= oldest })
        removedHere = Self.bounded(removedHere.filter { $0.value >= oldest })
    }

    private static func bounded(_ entries: [String: Double]) -> [String: Double] {
        guard entries.count > limit else { return entries }
        return Dictionary(uniqueKeysWithValues: entries.sorted { $0.value > $1.value }.prefix(limit).map { ($0.key, $0.value) })
    }
}
