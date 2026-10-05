public import CawCoAPI
public import Foundation

// The Usage page as the web reads it (routes/usage/+page.svelte and
// lib/cawco/usage/): the Limits block's content, the range each harness is
// read over, where the spend goes and its history. The home's strip reads
// the same readings through `Usage.strip`; both stand on `Usage.rows` and
// `Usage.firstToStop`.

// MARK: Words and figures (usage.ts)

extension Usage {
    private static let minuteMs = 60_000.0
    private static let hourMs = 60 * minuteMs
    private static let dayMs = 24 * hourMs

    /// A cap as it is set (`capMoney`): "$330" when it is whole dollars, else to the cent.
    public static func capMoney(_ n: Double) -> String {
        guard n == n.rounded() else { return money(n) }
        return "$\(n.formatted(.number.grouping(.automatic).precision(.fractionLength(0)).locale(Locale(identifier: "en_US"))))"
    }

    /// 13.1M, 581M, 1.5k (`compactNumber`).
    public static func compactNumber(_ n: Double) -> String {
        func short(_ v: Double) -> String { v >= 100 ? String(Int(v.rounded())) : String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), v) }
        if n >= 1_000_000 { return "\(short(n / 1_000_000))M" }
        if n >= 1000 { return "\(short(n / 1000))k" }
        return String(Int(n))
    }

    /// "default_claude_max_20x" → "Max 20x" (`planName`).
    public static func planName(_ tier: String?) -> String? {
        guard let tier, !tier.isEmpty else { return nil }
        let bare = tier.hasPrefix("default_claude_") ? String(tier.dropFirst("default_claude_".count)) : tier
        return bare.split(separator: "_", omittingEmptySubsequences: false)
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }

    /// When the window started, from its reset and its span (`windowStart`).
    public static func windowStart(_ window: Window) -> Double? {
        guard let span = span(window), let reset = resetMs(window) else { return nil }
        return reset - span
    }

    /// The quarter hour a moment falls in (core `bucketStart`): usage is recorded by the quarter hour.
    public static func bucketStart(_ ms: Double) -> Double {
        let quarter = 15 * minuteMs
        return floor(ms / quarter) * quarter
    }

    /// The midnight `days` before the hub's today, in the hub's zone
    /// (`hubMidnight`): a daylight saving change in between moves midnight by
    /// an hour, which the zone's own clock corrects.
    public static func hubMidnight(todayStart: Double, timeZone: String, days: Int) -> Double {
        let guess = todayStart - Double(days) * dayMs
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone) ?? .current
        let hour = calendar.component(.hour, from: Date(timeIntervalSince1970: guess / 1000))
        if hour == 23 { return guess + hourMs }
        if hour == 1 { return guess - hourMs }
        return guess
    }

    /// The reader's language and order on a 24-hour clock (`hourCycle: "h23"`).
    static var clock: Locale {
        var parts = Locale.Components(locale: .current)
        parts.hourCycle = .zeroToTwentyThree
        return Locale(components: parts)
    }

    /// A reset on the page (`resetLabel`): "in 4h 38m" under a day away,
    /// "Thu 09:00" inside the next seven days, and "Oct 17 08:49" past them.
    public static func resetLabel(_ resetsAt: String, now: Double) -> String {
        guard let at = Wire.parseDate(resetsAt) else { return "" }
        let left = at.timeIntervalSince1970 * 1000 - now
        if left <= 0 { return "now" }
        if left < dayMs { return "in \(duration(left))" }
        let time = at.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).locale(clock))
        if left < 7 * dayMs {
            return "\(at.formatted(.dateTime.weekday(.abbreviated).locale(clock))) \(time)"
        }
        return "\(at.formatted(.dateTime.day().month(.abbreviated).locale(clock))) \(time)"
    }

    /// The projection, as one sentence: what the Limits block leads with (`projectionSentence`).
    public static func projectionSentence(_ meter: Meter, now: Double) -> String {
        if meter.used >= 100 {
            return meter.window.resetsAt.map { "Limit reached. It resets \(resetLabel($0, now: now))." } ?? "Limit reached."
        }
        if meter.early { return "Too early in the window to project." }
        if let runsOutIn = meter.runsOutIn, let margin = meter.margin {
            return "At this pace it runs out in about \(about(runsOutIn)), \(about(margin)) before the reset."
        }
        return meter.lasts ? "At this pace it lasts to the reset." : ""
    }

    /// A bar's own line under it: its projection, short (`projectionNote`).
    public static func projectionNote(_ meter: Meter) -> String {
        if meter.early { return "too early to project" }
        if let runsOutIn = meter.runsOutIn { return "runs out in about \(about(runsOutIn))" }
        return meter.lasts ? "lasts to the reset" : ""
    }
}

// MARK: Limits block (LimitsBlock.svelte)

/// What the Limits block says: the window that stops you first, then every
/// window by provider.
public struct UsageLimits: Sendable {
    /// Claude's extra usage: real money past the plan against a monthly cap.
    public struct Extra: Sendable {
        public let used: Double
        public let state: Usage.State
        /// "$12.40 of $330".
        public let amount: String
        public let resetsAt: String?
    }

    /// Why there is no Claude bar, and what to do about it.
    public struct Unknown: Sendable {
        public let machineId: String?
        public let reason: String
        public let signIn: Bool
    }

    /// The hub's limits have been read once; before that the block is a skeleton.
    public let read: Bool
    public let lead: Usage.Row?
    /// What the headline percent is of: "the 5-hour window", "Claude's Fable week".
    public let leadName: String
    public let sentence: String
    public let claudeRows: [Usage.Row]
    public let claudePlan: String?
    public let claudeAge: String?
    public let claudeUnknown: Unknown?
    public let extra: Extra?
    /// The opencode group shows: it has windows, or there is spend to say.
    public let showGo: Bool
    public let goRows: [Usage.Row]
    public let goAge: String?
    /// "$0.09 today · $1.20 this week · $40.10 all time"; nil when not shown.
    public let spend: String?

    /// A row's line after its percent: "runs out in about 2h · resets in 4h 38m".
    public func resets(_ row: Usage.Row, now: Double) -> String {
        let meter = row.meter
        let note = row.key == lead?.key ? "" : Usage.projectionNote(meter)
        let before = meter.runsOutIn != nil && !note.isEmpty ? "\(note) · " : ""
        guard let reset = meter.window.resetsAt else { return before }
        let when = Usage.resetLabel(reset, now: now)
        return before + (meter.used >= 100 ? "Limit reached · resets \(when)" : "resets \(when)")
    }

    @MainActor
    public static func read(fleet: FleetStore, now: Double) -> UsageLimits {
        let claude = Usage.speaking(fleet.claudeLimits, error: \.error, stale: { $0.stale ?? false }, windows: \.windows)
        let go = Usage.speaking(fleet.openCodeGoLimits, error: \.error, stale: { $0.stale ?? false }, windows: \.windows)
        let claudeRows = claude.map { Usage.rows(provider: "Claude", windows: $0.windows, stale: $0.stale ?? false, now: now) } ?? []
        let goRows = go.map { Usage.rows(provider: "opencode", windows: $0.windows, stale: $0.stale ?? false, now: now) } ?? []

        var extra: Extra?
        if let claude, let limit = claude.spendLimit, limit > 0, let spent = claude.spendUsed {
            let used = spent / limit * 100
            extra = Extra(used: used, state: claude.stale == true ? .stale : Usage.fill(used),
                          amount: "\(Usage.money(spent)) of \(Usage.capMoney(limit))", resetsAt: claude.spendResetsAt)
        }

        var unknown: Unknown?
        if claude == nil {
            if let first = fleet.claudeLimits.sorted(by: { $0.key < $1.key }).first {
                let host = fleet.machines.first { $0.machineId == first.key }?.hostname ?? "a removed machine"
                let known = fleet.machines.contains { $0.machineId == first.key } ? first.key : nil
                switch first.value.error {
                case "not signed in":
                    unknown = Unknown(machineId: known, reason: "Not signed in to Claude on \(host).", signIn: true)
                case "token expired":
                    unknown = Unknown(machineId: known, reason: "The Claude login on \(host) has expired.", signIn: true)
                default:
                    unknown = Unknown(machineId: known, reason: "Anthropic did not answer the limit read (\(first.value.error ?? "null")). The next read is automatic.", signIn: false)
                }
            } else {
                unknown = Unknown(machineId: nil, reason: "No machine has reported a Claude reading yet.", signIn: false)
            }
        }

        let providers = [!claudeRows.isEmpty, !goRows.isEmpty].filter(\.self).count
        let lead = Usage.firstToStop(claudeRows + goRows)
        var leadName = ""
        if let lead {
            let window = lead.meter.window
            let base = ["session": "5-hour window", "weekly": "week", "monthly": "month"][window.group] ?? lead.label
            let scoped = window.scopeLabel.map { "\($0) \(base)" } ?? base
            leadName = providers > 1 ? "\(lead.provider)'s \(scoped)" : "the \(scoped)"
        }

        let spend = fleet.spend
        let showSpend = spend.map { $0.all > 0 || !goRows.isEmpty } ?? false
        return UsageLimits(
            read: fleet.limitsRead,
            lead: lead,
            leadName: leadName,
            sentence: lead.map { Usage.projectionSentence($0.meter, now: now) } ?? "",
            claudeRows: claudeRows,
            claudePlan: claude.flatMap { Usage.planName($0.planTier) },
            claudeAge: claude.flatMap { $0.stale == true ? Usage.readAgo($0.fetchedAt, now: now) : nil },
            claudeUnknown: unknown,
            extra: extra,
            showGo: !goRows.isEmpty || showSpend,
            goRows: goRows,
            goAge: go.flatMap { $0.stale == true ? Usage.readAgo($0.fetchedAt, now: now) : nil },
            spend: showSpend ? spend.map { "\(Usage.money($0.today)) today · \(Usage.money($0.week)) this week · \(Usage.money($0.all)) all time" } : nil
        )
    }
}

// MARK: Range (+page.svelte `since`)

public enum UsageHarness: String, CaseIterable, Sendable {
    case claude, opencode

    public var name: String { self == .claude ? "Claude" : "opencode" }
}

public enum UsageRange: String, CaseIterable, Sendable {
    case window, today, week = "7d", month = "30d"

    public var label: String {
        switch self {
        case .window: "This window"
        case .today: "Today"
        case .week: "7 days"
        case .month: "30 days"
        }
    }

    /// Hours (a window, a day) rather than days (a week, a month).
    public var hourly: Bool { self == .window || self == .today }
}

/// Where the range starts for one harness.
public enum UsageSince: Sendable, Equatable {
    /// The readings that say so are still being read.
    case pending
    /// The harness has no such window.
    case none
    case at(Double)

    public var start: Double? {
        if case let .at(start) = self { return start }
        return nil
    }
}

extension UsageRange {
    /// Where this range starts for each harness: a 5-hour window's first
    /// quarter hour, or the hub's own midnight a number of days back.
    @MainActor
    public func since(fleet: FleetStore) -> [UsageHarness: UsageSince] {
        if self == .window {
            guard fleet.limitsRead else { return [.claude: .pending, .opencode: .pending] }
            let claude = Usage.speaking(fleet.claudeLimits, error: \.error, stale: { $0.stale ?? false }, windows: \.windows)
            let go = Usage.speaking(fleet.openCodeGoLimits, error: \.error, stale: { $0.stale ?? false }, windows: \.windows)
            func fiveHour(_ windows: [Usage.Window]?) -> UsageSince {
                guard let window = windows?.first(where: { $0.group == "session" }), let start = Usage.windowStart(window) else { return .none }
                return .at(Usage.bucketStart(start))
            }
            return [.claude: fiveHour(claude?.windows), .opencode: fiveHour(go?.windows)]
        }
        guard let spend = fleet.spend else { return [.claude: .pending, .opencode: .pending] }
        let back = [UsageRange.today: 0, .week: 6, .month: 29][self] ?? 0
        let start = Usage.hubMidnight(todayStart: spend.todayStart, timeZone: spend.timeZone, days: back)
        return [.claude: .at(start), .opencode: .at(start)]
    }
}

// MARK: Summary (`/api/usage/summary`)

/// What `/api/usage/summary` returns, and one of its groups.
public typealias UsageSummary = Components.Schemas.UsageSummary
public typealias UsageSummaryRow = Components.Schemas.UsageSummaryRow

extension Components.Schemas.UsageSummaryRow {
    /// The group's identity as text: a session id, a machine id or a model's
    /// name as sent, and a bucket's start (a number of milliseconds, when
    /// grouped by start) written as the web's `String(row.key)` writes it.
    public var id: String {
        key.value1 ?? key.value2.map { String(Int($0)) } ?? ""
    }

    /// When the group began, for a summary grouped by start.
    public var start: Double? {
        key.value2 ?? key.value1.flatMap(Double.init)
    }

    /// `totalTokensOf`.
    public var tokens: Double { input + output + cacheCreation + cacheRead + reasoning }
}

/// What a summary is grouped by, as the route's query names it.
public typealias UsageGroupBy = Operations.GetApiUsageSummary.Input.Query.GroupByPayload

public enum UsageGrouping: String, CaseIterable, Sendable {
    case session, model, machine

    public var groupBy: UsageGroupBy {
        switch self {
        case .session: .session
        case .model: .model
        case .machine: .machine
        }
    }

    public var label: String {
        switch self {
        case .session: "Sessions"
        case .model: "Models"
        case .machine: "Machines"
        }
    }
}

extension HubConnection {
    /// One summary read: a harness's spend from `since`, grouped. Throws
    /// "The hub answered 500." as the web's read does.
    public func usageSummary(harness: UsageHarness, groupBy: UsageGroupBy, since: Double) async throws -> UsageSummary {
        let answer = try await api.usage.summary(.init(query: .init(since: .init(value1: since), harness: harness.rawValue, groupBy: groupBy)))
        switch answer {
        case let .ok(ok): return try ok.body.json
        case .unprocessableContent: throw ControlError(message: "The hub answered 422.")
        case let .undocumented(status, _): throw ControlError(message: "The hub answered \(status).")
        }
    }

    /// Reads the hub's spend again (the page's Retry on a failed read).
    public func readSpend() async {
        do {
            fleet.adopt(spend: try await api.usage.spend().ok.body.json)
        } catch {
            fleet.spend = nil
            fleet.spendFailed = true
        }
    }
}

/// The page's summary reads, kept by what they were read for, as the web
/// keeps them for the life of the page.
@MainActor
public final class UsageReads {
    private let hub: HubConnection
    private var cache: [String: UsageSummary] = [:]

    public init(hub: HubConnection) {
        self.hub = hub
    }

    public func summary(_ harness: UsageHarness, groupBy: UsageGroupBy, since: Double) async throws -> UsageSummary {
        let key = "\(harness.rawValue):\(groupBy.rawValue):\(Int(since))"
        if let known = cache[key] { return known }
        let summary = try await hub.usageSummary(harness: harness, groupBy: groupBy, since: since)
        cache[key] = summary
        return summary
    }
}

// MARK: Where it goes (WhereItGoes.svelte)

public enum UsageWhere {
    /// Rows a list shows before "Show N more".
    public static let top = 8
    /// The one group of a list that has no machine headers.
    public static let flat = "all"

    public struct Item: Sendable, Equatable {
        public let id: String
        public let machineId: String
        public let label: String
        /// The session a Sessions row opens: its instance, else its own key.
        public let session: String?
        /// A Machines row's OS, for its mark.
        public let os: String?
        public let share: Double
        /// "~$12.10".
        public let value: String
        /// "42% of the total · 13.1M tokens · 1,204 messages".
        public let tip: String
    }

    public struct Group: Sendable, Equatable {
        public let machineId: String
        public let name: String
        public let os: String
        public var rows: [Item]
    }

    public static func ranked(_ summary: UsageSummary) -> [UsageSummaryRow] {
        summary.rows.enumerated().sorted { $0.element.costUsd != $1.element.costUsd ? $0.element.costUsd > $1.element.costUsd : $0.offset < $1.offset }.map(\.element)
    }

    static func item(_ row: UsageSummaryRow, summary: UsageSummary, harness: UsageHarness, grouping: UsageGrouping) -> Item {
        let total = summary.totals.costUsd
        let share = total > 0 ? row.costUsd / total : 0
        let messages = Int(row.messages).formatted(.number.grouping(.automatic))
        return Item(
            id: "\(grouping.rawValue):\(row.id)",
            machineId: grouping == .session ? row.machine?.id ?? "" : flat,
            label: row.label,
            session: grouping == .session ? row.instanceId ?? row.id : nil,
            os: grouping == .machine ? row.machine?.os : nil,
            share: share,
            value: "\(harness == .claude ? "~" : "")\(Usage.money(row.costUsd))",
            tip: "\(Int((share * 100).rounded()))% of the total · \(Usage.compactNumber(row.tokens)) tokens · \(messages) messages"
        )
    }

    /// A view's groups: sessions under their machine in the fleet's own
    /// order, else one flat list. `every`: all the rows, not the top eight.
    public static func groups(_ summary: UsageSummary, harness: UsageHarness, grouping: UsageGrouping, every: Bool, machines: [String]) -> [Group] {
        let ranked = ranked(summary)
        var order: [String] = []
        var groups: [String: Group] = [:]
        for row in every ? ranked : Array(ranked.prefix(top)) {
            let item = item(row, summary: summary, harness: harness, grouping: grouping)
            if groups[item.machineId] == nil {
                order.append(item.machineId)
                groups[item.machineId] = Group(machineId: item.machineId, name: row.machine?.hostname ?? "", os: row.machine?.os ?? "", rows: [])
            }
            groups[item.machineId]?.rows.append(item)
        }
        func place(_ id: String) -> Int {
            if id == flat { return -1 }
            return machines.firstIndex(of: id) ?? Int.max
        }
        return order.enumerated().sorted { place($0.element) != place($1.element) ? place($0.element) < place($1.element) : $0.offset < $1.offset }
            .compactMap { groups[$0.element] }
    }

    /// The words on the line under the list: "Show N more", or none.
    public static func more(_ summary: UsageSummary, every: Bool) -> String? {
        !every && summary.rows.count > top ? "Show \(summary.rows.count - top) more" : nil
    }

    /// Models and Machines as a file: the rows of the harness and range on screen.
    public static func csv(_ summary: UsageSummary, harness: UsageHarness, grouping: UsageGrouping) -> (name: String, body: String) {
        func cell(_ value: String) -> String { "\"\(value.replacingOccurrences(of: "\"", with: "\"\""))\"" }
        func whole(_ n: Double) -> String { String(Int(n)) }
        let head = [grouping == .model ? "Model" : "Machine", harness == .claude ? "API price (USD)" : "Spend (USD)",
                    "Input", "Output", "Cache write", "Cache read", "Messages"]
        let lines = ranked(summary).map { row in
            [row.label, String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), row.costUsd), whole(row.input), whole(row.output),
             whole(row.cacheCreation), whole(row.cacheRead), whole(row.messages)].map(cell).joined(separator: ",")
        }
        return ("usage-\(harness.rawValue)-\(grouping.rawValue).csv", ([head.map(cell).joined(separator: ",")] + lines).joined(separator: "\n"))
    }
}

// MARK: Sessions export (session-export.ts)

public enum UsageSessionsExport {
    /// A session's spend in the range, by the harness session id the hub keys it by.
    public typealias Spend = [String: (harness: UsageHarness, row: UsageSummaryRow)]

    private static let harnessName = ["claude": "Claude Code", "opencode": "OpenCode", "pi": "pi"]

    /// The spend columns: Claude's under API price, opencode's under Spend.
    private static func spendCells(_ spend: (harness: UsageHarness, row: UsageSummaryRow)?) -> [String] {
        guard let spend else { return ["", "", "", "", "", "", ""] }
        let cost = String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), spend.row.costUsd)
        func whole(_ n: Double) -> String { String(Int(n)) }
        return [spend.harness == .claude ? cost : "", spend.harness == .claude ? "" : cost,
                whole(spend.row.input), whole(spend.row.output), whole(spend.row.cacheCreation), whole(spend.row.cacheRead), whole(spend.row.messages)]
    }

    private static func iso(_ ms: Double) -> String {
        Date(timeIntervalSince1970: ms / 1000)
            .formatted(.iso8601.year().month().day().timeZone(separator: .omitted).time(includingFractionalSeconds: true).timeSeparator(.colon))
    }

    /// Every session in the fleet as CSV rows: the live ones with what this
    /// app knows of their turns, context and state, then the transcripts
    /// stored on the machines that are not running, then any that spent in
    /// the range but are in neither list. `stats`: a session's turns and
    /// context percent, where its transcript has been opened here.
    @MainActor
    public static func csv(fleet: FleetStore, home: HomeModel, entries: [(key: String, harness: UsageHarness, row: UsageSummaryRow)],
                           stats: (String) -> (turns: Int?, contextPct: Double?)) -> String {
        // As the web's Map: a key keeps the place it first took and the value it last got.
        var spend: Spend = [:]
        var order: [String] = []
        for entry in entries {
            if spend[entry.key] == nil { order.append(entry.key) }
            spend[entry.key] = (entry.harness, entry.row)
        }
        func cell(_ value: String) -> String { "\"\(value.replacingOccurrences(of: "\"", with: "\"\""))\"" }
        func machineName(_ id: String) -> String {
            fleet.machines.first { $0.machineId == id }.map { Naming.machineLabel($0.hostname) } ?? id
        }
        let head = ["Session", "Machine", "Harness", "Turns", "Context", "Last activity", "State",
                    "API price (USD)", "Spend (USD)", "Input", "Output", "Cache write", "Cache read", "Messages"]
        var seen = Set<String>()
        var lines: [[String]] = [head]
        for row in fleet.rows where row.isLive {
            let read = stats(row.id)
            let at = fleet.lastAt(row)
            let harness = row.harness ?? "claude"
            if let key = row.sessionId { seen.insert(key) }
            let state: String = if row.isFailed { "Failed" } else {
                switch home.activity(row.id) {
                case .blocked: "Needs you"
                case .working: "Working"
                case .idle: "Idle"
                }
            }
            lines.append([
                fleet.title(row), machineName(row.machineId), harnessName[harness] ?? harness,
                read.turns.map(String.init) ?? "", read.contextPct.map { "\(Int($0.rounded()))%" } ?? "",
                at > 0 ? iso(at) : "", state,
            ] + spendCells(row.sessionId.flatMap { spend[$0] }))
        }
        for machine in fleet.machines {
            for info in fleet.catalog(machine.machineId) where !seen.contains(info.sessionId) {
                seen.insert(info.sessionId)
                lines.append([
                    fleet.storedTitle(info, machineId: machine.machineId), Naming.machineLabel(machine.hostname),
                    harnessName[info.harness.rawValue] ?? info.harness.rawValue, "", "", iso(info.lastModified), "Idle",
                ] + spendCells(spend[info.sessionId]))
            }
        }
        for key in order where !seen.contains(key) {
            guard let entry = spend[key] else { continue }
            lines.append([
                entry.row.label, entry.row.machine.map { Naming.machineLabel($0.hostname) } ?? "", harnessName[entry.harness.rawValue] ?? entry.harness.rawValue,
                "", "", "", "",
            ] + spendCells(entry))
        }
        return lines.map { $0.map(cell).joined(separator: ",") }.joined(separator: "\n")
    }
}

// MARK: History (History.svelte)

public enum UsageHistory {
    public struct Point: Sendable, Equatable {
        public let at: Double
        public let cost: Double
    }

    public struct Chart: Sendable {
        public let harness: UsageHarness
        /// "Claude, at API prices", "opencode, real spend".
        public let title: String
        /// "~" before Claude's figures.
        public let approx: String
        public let points: [Point]
        public let total: Double
        public let peak: Double
        /// The harness has no 5-hour window to chart.
        public let missing: Bool
    }

    /// Every hour from the range's start to now, counted from that start.
    static func hours(from start: Double, now: Double) -> [Double] {
        Array(stride(from: start, through: now, by: 3_600_000))
    }

    /// The hub's midnights from the range's start to today, oldest first.
    static func hubDays(from start: Double, todayStart: Double, timeZone: String) -> [Double] {
        var out: [Double] = []
        var back = 0
        while true {
            let at = Usage.hubMidnight(todayStart: todayStart, timeZone: timeZone, days: back)
            if at < start { return out }
            out.insert(at, at: 0)
            back += 1
        }
    }

    /// Every period from the range's start to now, empty ones at zero.
    static func points(_ summary: UsageSummary, periods: [Double]) -> [Point] {
        var costs = Array(repeating: 0.0, count: periods.count)
        for row in summary.rows {
            guard let at = row.start, let index = periods.lastIndex(where: { $0 <= at }) else { continue }
            costs[index] += row.costUsd
        }
        return zip(periods, costs).map { Point(at: $0, cost: $1) }
    }

    /// One harness's chart. `summary` nil with a start is a read not shown yet.
    public static func chart(_ harness: UsageHarness, summary: UsageSummary?, since: UsageSince, hourly: Bool,
                             spend: Components.Schemas.UsageSpend?, now: Double) -> Chart {
        var points: [Point] = []
        if let summary, let start = since.start {
            let periods = hourly ? hours(from: start, now: now)
                : spend.map { hubDays(from: start, todayStart: $0.todayStart, timeZone: $0.timeZone) } ?? []
            points = self.points(summary, periods: periods)
        }
        return Chart(
            harness: harness,
            title: harness == .claude ? "Claude, at API prices" : "opencode, real spend",
            approx: harness == .claude ? "~" : "",
            points: points,
            total: points.reduce(0) { $0 + $1.cost },
            peak: points.map(\.cost).max() ?? 0,
            missing: since == .none
        )
    }

    /// A period's label on the hub's clock: "09:00" for an hour, "Mon, Oct 5" for a day.
    public static func label(_ at: Double, hourly: Bool, timeZone: String?) -> String {
        let date = Date(timeIntervalSince1970: at / 1000)
        let zone = timeZone.flatMap(TimeZone.init(identifier:)) ?? .current
        var hour = Date.FormatStyle.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).locale(Usage.clock)
        hour.timeZone = zone
        var day = Date.FormatStyle.dateTime.weekday(.abbreviated).day().month(.abbreviated).locale(Usage.clock)
        day.timeZone = zone
        return date.formatted(hourly ? hour : day)
    }
}
