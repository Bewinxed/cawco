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

    /// The reading that speaks for a provider: the first good one, else one served stale with windows.
    public static func speaking<Reading>(_ readings: [String: Reading], error: (Reading) -> String?, stale: (Reading) -> Bool, windows: (Reading) -> [Window]) -> Reading? {
        let sorted = readings.sorted { $0.key < $1.key }.map(\.value)
        return sorted.first { error($0) == nil } ?? sorted.first { stale($0) && !windows($0).isEmpty }
    }
}
