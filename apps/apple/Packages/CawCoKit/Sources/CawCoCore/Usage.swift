public import CawCoAPI
public import Foundation

/// The usage limits as the web reads them (apps/dashboard/src/lib/cawco/usage.ts
/// and UsageMeter.svelte): each provider's windows against the clock, and the
/// one that stops you first.
public enum Usage {
    /// Dollars as a person reads them (usage.ts `money`): "$12.10", and
    /// "$3,488" from a thousand up.
    public static func money(_ n: Double) -> String {
        let posix = Locale(identifier: "en_US_POSIX")
        if n >= 1000 {
            return "$\(n.formatted(.number.grouping(.automatic).precision(.fractionLength(0)).locale(Locale(identifier: "en_US"))))"
        }
        return "$\(n.formatted(.number.grouping(.never).precision(.fractionLength(2)).locale(posix)))"
    }

    public typealias Window = Components.Schemas.LimitWindow

    private static let minute = 60_000.0
    private static let hour = 60 * minute
    private static let day = 24 * hour

    /// "5-hour", "Week", "Week · Fable", "Month".
    public static func label(_ window: Window) -> String {
        let base = ["session": "5-hour", "weekly": "Week", "monthly": "Month"][window.group] ?? window.kind
        return window.scopeLabel.map { "\(base) · \($0)" } ?? base
    }

    /// How long a window runs: 5 hours, 7 days, or the calendar month that ends at its reset.
    static func span(_ window: Window) -> Double? {
        switch window.group {
        case "session":
            return 5 * hour
        case "weekly":
            return 7 * day
        case "monthly":
            guard let reset = resetMs(window) else {
                return nil
            }
            let end = Date(timeIntervalSince1970: reset / 1000)
            var utc = Calendar(identifier: .gregorian)
            utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
            guard let start = utc.date(byAdding: .month, value: -1, to: end) else {
                return nil
            }
            return (end.timeIntervalSince1970 - start.timeIntervalSince1970) * 1000
        default:
            return nil
        }
    }

    static func resetMs(_ window: Window) -> Double? {
        window.resetsAt.flatMap(Wire.parseDate).map { $0.timeIntervalSince1970 * 1000 }
    }

    /// How a window reads: its colour step.
    public enum State: Sendable {
        case calm, near, over, reached, stale
    }

    public struct Meter: Sendable {
        public let window: Window
        public let used: Double
        /// The share of the window's time gone, 0–1; nil without a span or reset.
        public let elapsed: Double?
        public let early: Bool
        public let lasts: Bool
        /// How long until it runs out at this pace; nil when it lasts or cannot be told.
        public let runsOutIn: Double?
        /// How far ahead of the reset it runs out; nil when it lasts or cannot be told.
        public let margin: Double?
        public let state: State
    }

    /// A share's colour step by how full it is: spark from 70%, crimson from 90%, reached at 100%.
    public static func fill(_ used: Double) -> State {
        used >= 100 ? .reached : used >= 90 ? .over : used >= 70 ? .near : .calm
    }

    /// One window against the clock: its pace carried forward says whether it
    /// lasts to its reset or when it runs out (`readMeter`).
    public static func meter(_ window: Window, now: Double, stale: Bool) -> Meter {
        let used = window.percent
        let span = span(window)
        let reset = resetMs(window)
        var elapsed: Double?
        if let span, let reset {
            elapsed = min(1, max(0, 1 - (reset - now) / span))
        }
        let early = elapsed.map { $0 < 0.03 } ?? false
        var runsOutIn: Double?
        var margin: Double?
        var lasts = false
        if used < 100, let elapsed, !early, let span, let reset {
            let perMs = used / (elapsed * span)
            let left = perMs > 0 ? (100 - used) / perMs : .infinity
            if now + left >= reset {
                lasts = true
            } else {
                runsOutIn = left
                margin = reset - (now + left)
            }
        }
        var state = fill(used)
        if stale {
            state = .stale
        } else if state == .calm, let runsOutIn, runsOutIn < hour {
            state = .near
        }
        return Meter(window: window, used: used, elapsed: elapsed, early: early, lasts: lasts, runsOutIn: runsOutIn, margin: margin, state: state)
    }

    public struct Row: Sendable {
        public let key: String
        public let label: String
        public let meter: Meter
        public let provider: String
    }

    private static let groupOrder = ["session": 0, "weekly": 1, "monthly": 2]

    /// A provider's windows as rows: session first, the weeks fullest first, then the month.
    public static func rows(provider: String, windows: [Window], stale: Bool, now: Double) -> [Row] {
        windows.sorted {
            let a = groupOrder[$0.group] ?? 3
            let b = groupOrder[$1.group] ?? 3
            return a != b ? a < b : $0.percent > $1.percent
        }.map { window in
            Row(key: "\(provider):\(window.kind):\(window.scopeLabel ?? "")", label: label(window), meter: meter(window, now: now, stale: stale), provider: provider)
        }
    }

    /// Of several windows, the one that stops you first: one reached, else the
    /// soonest projected run-out, else the fullest.
    public static func firstToStop(_ rows: [Row]) -> Row? {
        if let reached = rows.first(where: { $0.meter.used >= 100 }) {
            return reached
        }
        if let running = rows.filter({ $0.meter.runsOutIn != nil }).min(by: { ($0.meter.runsOutIn ?? 0) < ($1.meter.runsOutIn ?? 0) }) {
            return running
        }
        return rows.max { $0.meter.used < $1.meter.used }
    }

    /// "4h 38m", "50m", "3d 4h", "<1m": a span of time, to the minute.
    static func duration(_ ms: Double) -> String {
        let total = max(0, Int(floor(ms / minute)))
        let d = total / (24 * 60)
        let h = (total % (24 * 60)) / 60
        let m = total % 60
        if d > 0 {
            return h > 0 ? "\(d)d \(h)h" : "\(d)d"
        }
        if h > 0 {
            return m > 0 ? "\(h)h \(m)m" : "\(h)h"
        }
        return m > 0 ? "\(m)m" : "<1m"
    }

    /// About this long: a projection is never to the minute.
    public static func about(_ ms: Double) -> String {
        let minutes = ms / minute
        let fives = max(5, (minutes / 5).rounded() * 5)
        if fives < 60 {
            return "\(Int(fives))m"
        }
        let hours = minutes / 60
        if hours < 10 {
            let half = (hours * 2).rounded() / 2
            let whole = floor(half)
            return half == whole ? "\(Int(whole))h" : "\(Int(whole))h 30m"
        }
        if hours < 48 {
            return "\(Int(hours.rounded()))h"
        }
        return "\(Int((hours / 24).rounded()))d"
    }

    /// A reset as the strip says it after "resets": "4h 38m", "Thu 09:00", and past a week only the day.
    public static func resetShort(_ resetsAt: String, now: Double) -> String {
        guard let at = Wire.parseDate(resetsAt)?.timeIntervalSince1970 else {
            return ""
        }
        let atMs = at * 1000
        let left = atMs - now
        if left >= 7 * day {
            return Date(timeIntervalSince1970: at).formatted(.dateTime.day().month(.abbreviated))
        }
        if left <= 0 {
            return "now"
        }
        if left < day {
            return duration(left)
        }
        // The reader's own language and order, on a 24-hour clock whatever
        // the device keeps (`hourCycle: "h23"`): "Fri 23:00", never "Fri 11:00".
        var clock = Locale.Components(locale: .current)
        clock.hourCycle = .zeroToTwentyThree
        return Date(timeIntervalSince1970: at)
            .formatted(.dateTime.weekday(.abbreviated).hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).locale(Locale(components: clock)))
            .replacingOccurrences(of: ",", with: "")
    }

    /// "read 2h ago": how old a stale reading is.
    public static func readAgo(_ fetchedAt: Double, now: Double) -> String {
        now - fetchedAt < minute ? "read just now" : "read \(duration(now - fetchedAt)) ago"
    }

    /// What a cell says in place of its numbers, and the ink it says it in.
    public struct Phrase: Sendable, Hashable {
        public enum Tone: Sendable { case near, over, stale }

        public let text: String
        public let tone: Tone
    }

    /// One provider on the strip and in the list (UsageMeter.svelte `Cell`).
    public struct Cell: Sendable {
        /// "Claude" or "opencode".
        public let id: String
        /// "Claude", "opencode Go".
        public let name: String
        public let rows: [Row]
        /// Its session window.
        public let short: Row
        /// The window after the short one: its week, or the long one in trouble.
        public let long: Row?
        public let phrase: Phrase?
        /// Under the first row in the list when the reading is stale.
        public let staleAge: String?
    }

    /// A provider with no windows to show: why, and what to do about it.
    public struct Note: Sendable {
        public let id: String
        public let text: String
    }

    /// The strip's face and the list it opens: a cell for each provider that
    /// is set up (Claude, then opencode), or why there is none.
    public struct Strip: Sendable {
        public let cells: [Cell]
        /// Why there are no cells: a normal state, never a fake 0%.
        public let empty: String
        public let notes: [Note]
    }

    /// The reading that speaks for a provider: the first good one, else one served stale with windows.
    static func speaking<Reading>(_ readings: [String: Reading], error: (Reading) -> String?, stale: (Reading) -> Bool, windows: (Reading) -> [Window]) -> Reading? {
        let sorted = readings.sorted { $0.key < $1.key }.map(\.value)
        return sorted.first { error($0) == nil } ?? sorted.first { stale($0) && !windows($0).isEmpty }
    }

    /// The row a cell's phrase is about, and the phrase (`trouble`): a limit
    /// reached, or the window that runs out soonest among those near their
    /// limit that will not last to their reset. Nothing else is worth the
    /// numbers' place.
    private static func trouble(_ rows: [Row], now: Double) -> (row: Row, phrase: Phrase)? {
        if let reached = rows.first(where: { $0.meter.used >= 100 }) {
            let text = reached.meter.window.resetsAt.map { "limit · \(resetShort($0, now: now))" } ?? "limit"
            return (reached, Phrase(text: text, tone: .over))
        }
        let soon = rows
            .filter { ($0.meter.state == .near || $0.meter.state == .over) && $0.meter.runsOutIn != nil && ($0.meter.margin ?? 0) > 0 }
            .min { ($0.meter.runsOutIn ?? 0) < ($1.meter.runsOutIn ?? 0) }
        guard let soon, let runsOutIn = soon.meter.runsOutIn else { return nil }
        return (soon, Phrase(text: "out in \(about(runsOutIn))", tone: soon.meter.state == .over ? .over : .near))
    }

    private static func cell(_ id: String, _ name: String, windows: [Window]?, stale: Bool, fetchedAt: Double, now: Double) -> Cell? {
        guard let windows else { return nil }
        let rows = rows(provider: id, windows: windows, stale: stale, now: now)
        guard let first = rows.first else { return nil }
        let short = rows.first { $0.meter.window.group == "session" } ?? first
        let weeks = rows.filter { $0.meter.window.group == "weekly" }
        // The week every model shares, before a week one model has to itself.
        let week = weeks.first { $0.meter.window.scopeLabel == nil } ?? weeks.first
        let staleAge = stale ? readAgo(fetchedAt, now: now) : nil
        let worst = staleAge == nil ? trouble(rows, now: now) : nil
        let longInTrouble = worst.flatMap { $0.row.key != short.key ? $0.row : nil }
        return Cell(
            id: id, name: name, rows: rows, short: short,
            long: longInTrouble ?? week ?? rows.first { $0.key != short.key },
            phrase: staleAge.map { Phrase(text: $0, tone: .stale) } ?? worst?.phrase,
            staleAge: staleAge
        )
    }

    /// What the list says of a provider with no windows to show (`noteOf`):
    /// no machine is signed in to it, or every read failed before any
    /// succeeded. Nothing before the first read, and nothing while a reading speaks.
    private static func note(_ name: String, has: Bool, errors: [String?], read: Bool) -> String? {
        guard read, !has else { return nil }
        if errors.isEmpty { return "\(name) · sign in on a machine to see its limits" }
        guard let error = errors.compactMap(\.self).first else { return nil }
        if error == "not signed in" { return "\(name) · sign in on a machine to see its limits" }
        if error == "no reading yet" { return "\(name) · limits appear once a session runs" }
        return error.hasPrefix("HTTP 401") || error.hasPrefix("HTTP 403")
            ? "\(name) · key not accepted, sign in again on a machine"
            : "\(name) · could not read limits: \(error)"
    }

    /// `read`: the hub's limits have been read once; before that nothing is claimed absent.
    public static func strip(claude: [String: Components.Schemas.ClaudeLimits], go: [String: Components.Schemas.OpenCodeGoLimits],
                             read: Bool, now: Double) -> Strip {
        let claudeReading = speaking(claude, error: \.error, stale: \.stale, windows: \.windows)
        let goReading = speaking(go, error: \.error, stale: { $0.stale ?? false }, windows: \.windows)
        let cells = [
            cell("Claude", "Claude", windows: claudeReading?.windows, stale: claudeReading?.stale ?? false, fetchedAt: claudeReading?.fetchedAt ?? 0, now: now),
            cell("opencode", "opencode Go", windows: goReading?.windows, stale: goReading?.stale ?? false, fetchedAt: goReading?.fetchedAt ?? 0, now: now),
        ].compactMap(\.self)
        let byMachine = { (readings: [String: String?]) in readings.sorted { $0.key < $1.key }.map(\.value) }
        let notes = [
            note("Claude", has: claudeReading != nil, errors: byMachine(claude.mapValues(\.error)), read: read).map { Note(id: "Claude", text: $0) },
            note("opencode Go", has: goReading != nil, errors: byMachine(go.mapValues(\.error)), read: read).map { Note(id: "opencode", text: $0) },
        ].compactMap(\.self)
        return Strip(cells: cells, empty: read ? "Sign in to see limits" : "Reading limits…", notes: notes)
    }
}
