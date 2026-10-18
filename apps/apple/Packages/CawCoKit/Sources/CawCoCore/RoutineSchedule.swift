public import Foundation

/// A routine's schedule and its runs' times, in words (routines/schedule.ts,
/// rules.ts `since`), from core's words (`Words.Routines`):
///
/// - `schedule`: its cron as a person says it ("Daily at 13:30", "Weekdays at
///   09:00") on the reader's clock, one clock with the Next run; its own
///   zone's words ("Daily at 06:30 New York time") when that zone is not the
///   reader's.
/// - `when`: a time in the reader's zone, near now said near ("Today 09:00",
///   "Yesterday 23:30", "Mon 09:00"), further off with its date.
/// - `exact`: the same time whole ("Thu 15 Oct 2026, 13:30").
/// - `since`: how long ago ("just now", "4m ago", "3h ago", "2d ago").
public enum RoutineSchedule {
    /// A schedule as said: on the reader's clock, and in its own zone when that is not the reader's.
    public struct Said: Equatable, Sendable {
        /// The schedule on the reader's clock; the cron itself when it says something not read here.
        public let words: String
        /// The schedule in the routine's own zone; nil when its zone is the reader's.
        public let local: String?
    }

    private static func formatter(_ template: String) -> DateFormatter {
        let made = DateFormatter()
        made.locale = .current
        made.setLocalizedDateFormatFromTemplate(template)
        return made
    }

    /// `hour: 2-digit, minute: 2-digit, hourCycle: h23`.
    private static let time = formatter("HHmm")
    private static let weekday = formatter("EEE")
    private static let date = formatter("dMMM")
    private static let whole = formatter("EEEdMMMyyyyHHmm")

    private static func two(_ n: Int) -> String { n < 10 ? "0\(n)" : "\(n)" }

    /// An IANA zone's place, as a person names it: "America/New_York" → "New York".
    public static func place(_ zone: String) -> String {
        (zone.split(separator: "/").last.map(String.init) ?? zone).replacing("_", with: " ")
    }

    /// The days a cron's day-of-week field names (0 Sunday … 6 Saturday); nil for a form not read here.
    private static func days(_ field: String) -> Set<Int>? {
        if field == "*" { return Set(0 ... 6) }
        var days = Set<Int>()
        for part in field.split(separator: ",") {
            let ends = part.split(separator: "-", maxSplits: 1).map(String.init)
            guard let from = ends.first.flatMap(Int.init), let to = ends.count > 1 ? Int(ends[1]) : from, from <= to, to <= 7 else { return nil }
            for day in from ... to { days.insert(day % 7) }
        }
        return days
    }

    /// A set of days as words: "Daily", "Weekdays", "Weekends", "Mondays", "Mondays and Thursdays".
    private static func daysWords(_ days: Set<Int>) -> String {
        let sorted = days.sorted()
        if sorted.count == 7 { return Words.Routines.daily }
        if sorted == [1, 2, 3, 4, 5] { return Words.Routines.weekdays }
        if sorted == [0, 6] { return Words.Routines.weekends }
        return Words.andList(sorted.map { Words.Routines.dayNames[$0] })
    }

    /// The calendar day of `at` in `zone`, as a day count, to compare two zones' days.
    private static func day(_ zone: TimeZone, _ at: Date) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let parts = calendar.dateComponents([.year, .month, .day], from: at)
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = .gmt
        let start = utc.date(from: DateComponents(year: parts.year, month: parts.month, day: parts.day)) ?? at
        return Int((start.timeIntervalSince1970 / 86_400).rounded())
    }

    /// A cron in its zone, as words on the reader's clock. Five fields: a
    /// minute and an hour on some days of the week, or a minute every hour.
    /// `next` (ms) is its next run: the reader's time of day is read off it,
    /// and the days move with it when the two zones' dates differ then
    /// (Weekdays 22:00 in New York is Tuesdays to Saturdays 05:00 in Doha).
    public static func schedule(_ cron: String, zone: String, next: Double) -> Said {
        let away = zone != TimeZone.current.identifier
        let fields = cron.trimmingCharacters(in: .whitespaces).split(whereSeparator: \.isWhitespace).map(String.init)
        let at = Date(timeIntervalSince1970: next / 1000)
        if fields.count == 5, fields[2] == "*", fields[3] == "*", let minute = Int(fields[0]) {
            if let hour = Int(fields[1]), let days = days(fields[4]) {
                let theirs = TimeZone(identifier: zone) ?? .current
                let shift = day(.current, at) - day(theirs, at)
                let readers = Set(days.map { (($0 + shift) % 7 + 7) % 7 })
                let local = Words.Routines.daysAt(days: daysWords(days), time: "\(two(hour)):\(two(minute))")
                return Said(words: Words.Routines.daysAt(days: daysWords(readers), time: time.string(from: at)),
                            local: away ? Words.Routines.zoneTime(words: local, place: place(zone)) : nil)
            }
            if fields[1] == "*", fields[4] == "*" {
                // Every hour: the same minute on every clock but a half-hour zone's.
                let readersMinute = Calendar.current.component(.minute, from: at)
                return Said(words: Words.Routines.hourlyAt(minute: two(readersMinute)),
                            local: away ? Words.Routines.zoneTime(words: Words.Routines.hourlyAt(minute: two(minute)), place: place(zone)) : nil)
            }
        }
        return Said(words: cron, local: away ? Words.Routines.placeTime(place: place(zone)) : nil)
    }

    /// "Today 09:00", "Tomorrow 09:00", "Yesterday 23:30", "Mon 09:00", "3 Oct 09:00", in the reader's zone.
    public static func when(_ ms: Double, now: Date = .now) -> String {
        let at = Date(timeIntervalSince1970: ms / 1000)
        let calendar = Calendar.current
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: at)).day ?? 0
        let clock = time.string(from: at)
        switch days {
        case 0: return Words.Routines.today(time: clock)
        case 1: return Words.Routines.tomorrow(time: clock)
        case -1: return Words.Routines.yesterday(time: clock)
        case -6 ... 6: return "\(weekday.string(from: at)) \(clock)"
        default: return "\(date.string(from: at)) \(clock)"
        }
    }

    /// A time whole, in the reader's zone.
    public static func exact(_ ms: Double) -> String {
        whole.string(from: Date(timeIntervalSince1970: ms / 1000))
    }

    /// How long ago (rules.ts `since`): under a minute, then minutes, hours, days.
    public static func since(_ ms: Double?, now: Date = .now) -> String {
        guard let ms else { return Words.Routines.neverAt }
        let seconds = Int((now.timeIntervalSince1970 - ms / 1000).rounded())
        if seconds < 60 { return Words.Routines.justNow }
        let minutes = Int((Double(seconds) / 60).rounded())
        if minutes < 60 { return Words.Routines.ago(span: "\(minutes)m") }
        let hours = Int((Double(minutes) / 60).rounded())
        if hours < 24 { return Words.Routines.ago(span: "\(hours)h") }
        return Words.Routines.ago(span: "\(Int((Double(hours) / 24).rounded()))d")
    }

    /// How often a poll reads, in words.
    public static func every(_ seconds: Double?) -> String {
        guard let seconds else { return Words.Routines.readByHub }
        let minutes = Int((seconds / 60).rounded())
        if minutes < 60 { return minutes <= 1 ? Words.Routines.everyMinute : Words.Routines.everyMinutes(minutes: minutes) }
        let hours = Int((Double(minutes) / 60).rounded())
        return hours == 1 ? Words.Routines.hourly : Words.Routines.everyHours(hours: hours)
    }

    /// How long a run ran: "<1m", "4m", "1h 5m"; nothing while it goes.
    public static func took(_ run: RoutineRun) -> String {
        guard let ended = run.endedAt else { return "" }
        let minutes = Int(((ended - run.startedAt) / 60_000).rounded())
        if minutes < 1 { return Words.Routines.tookUnder }
        return minutes < 60 ? Words.Routines.tookMinutes(minutes: minutes) : Words.Routines.tookHours(hours: minutes / 60, minutes: minutes % 60)
    }
}
