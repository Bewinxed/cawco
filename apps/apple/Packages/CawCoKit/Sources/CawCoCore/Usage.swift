public import CawCoAPI
public import Foundation

/// The usage limits as the web reads them (apps/dashboard/src/lib/cawco/usage.ts
/// and UsageMeter.svelte): each provider's windows against the clock, and the
/// one that stops you first.
public enum Usage {
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
        public let state: State
    }

    /// A share's colour step by how full it is: spark from 70%, crimson from 90%, reached at 100%.
    static func fill(_ used: Double) -> State {
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
        var lasts = false
        if used < 100, let elapsed, !early, let span, let reset {
            let perMs = used / (elapsed * span)
            let left = perMs > 0 ? (100 - used) / perMs : .infinity
            if now + left >= reset {
                lasts = true
            } else {
                runsOutIn = left
            }
        }
        var state = fill(used)
        if stale {
            state = .stale
        } else if state == .calm, let runsOutIn, runsOutIn < hour {
            state = .near
        }
        return Meter(window: window, used: used, elapsed: elapsed, early: early, lasts: lasts, runsOutIn: runsOutIn, state: state)
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
        return Date(timeIntervalSince1970: at).formatted(.dateTime.weekday(.abbreviated).hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
            .replacingOccurrences(of: ",", with: "")
    }

    /// "read 2h ago": how old a stale reading is.
    public static func readAgo(_ fetchedAt: Double, now: Double) -> String {
        now - fetchedAt < minute ? "read just now" : "read \(duration(now - fetchedAt)) ago"
    }

    /// The strip's face: the window that stops you first, or why there is no bar.
    public struct Strip: Sendable {
        public let lead: Row?
        /// The lead's name: the provider said only when it is not Claude ("Go Month").
        public let name: String
        /// The one fact that matters now: when it runs out, or when it resets.
        public let detail: String
        /// Why there is no bar: a normal state, never a fake 0%.
        public let reason: String
        /// Every window, grouped by provider, for the sheet.
        public let groups: [(name: String, rows: [Row])]
    }

    /// The reading that speaks for a provider: the first good one, else one served stale with windows.
    static func speaking<Reading>(_ readings: [String: Reading], error: (Reading) -> String?, stale: (Reading) -> Bool, windows: (Reading) -> [Window]) -> Reading? {
        let sorted = readings.sorted { $0.key < $1.key }.map(\.value)
        return sorted.first { error($0) == nil } ?? sorted.first { stale($0) && !windows($0).isEmpty }
    }

    public static func strip(claude: [String: Components.Schemas.ClaudeLimits], go: [String: Components.Schemas.OpenCodeGoLimits], now: Double) -> Strip {
        let claudeReading = speaking(claude, error: \.error, stale: { $0.stale ?? false }, windows: \.windows)
        let goReading = speaking(go, error: \.error, stale: { $0.stale ?? false }, windows: \.windows)
        let groups = [
            ("Claude", claudeReading.map { rows(provider: "Claude", windows: $0.windows, stale: $0.stale ?? false, now: now) } ?? []),
            ("opencode", goReading.map { rows(provider: "opencode", windows: $0.windows, stale: $0.stale ?? false, now: now) } ?? []),
        ].filter { !$0.1.isEmpty }
        let lead = firstToStop(groups.flatMap(\.1))
        var detail = ""
        if let lead {
            let meter = lead.meter
            if meter.state == .stale, let claudeReading {
                detail = readAgo(claudeReading.fetchedAt, now: now)
            } else if meter.used < 100, let runsOutIn = meter.runsOutIn {
                detail = "out in \(about(runsOutIn))"
            } else if let reset = meter.window.resetsAt {
                detail = "resets \(resetShort(reset, now: now))"
            }
        }
        let error = claude.sorted { $0.key < $1.key }.first?.value.error ?? claudeReading?.error
        let reason = switch error {
        case "not signed in": "No Claude reading · not signed in"
        case "token expired": "No Claude reading · login expired"
        case let error?: "No Claude reading · \(error)"
        case nil: "No Claude reading yet"
        }
        return Strip(
            lead: lead,
            name: lead.map { $0.provider == "Claude" ? $0.label : "Go \($0.label)" } ?? "",
            detail: detail,
            reason: reason,
            groups: groups.map { (name: $0.0, rows: $0.1) }
        )
    }
}
