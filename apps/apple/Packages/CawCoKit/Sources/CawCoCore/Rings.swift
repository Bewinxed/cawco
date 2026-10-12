public import CawCoAPI
public import Foundation

/// Usage as Rings (apps/dashboard/src/lib/cawco/usage/rings.ts), function by
/// function under the web's names, so the app's numbers match the web's on
/// the same forecast: every account as one concentric mark, an inner disc for
/// its 5-hour window and an outer rim for its week, each filled with what is
/// LEFT, and the carry answer: who carries your new sessions, until when, and
/// when an account is back.
///
/// Pure: a function of the hub's accounts (`/api/accounts`), its forecast
/// (`/api/accounts/forecast`), the sessions on each account and the clock.
/// The words are typed parts (`Part`), so each surface typesets them.
public enum Rings {
    static let minuteMs = 60_000.0
    static let hourMs = 60 * minuteMs
    /// How far the carry answer looks ahead: one 5-hour window (`HORIZON_MS`).
    public static let horizonMs = 5 * hourMs
    /// An account with no session on it past this is out of date (`STALE_MS`).
    static let staleMs = hourMs

    /// core `ACCOUNT_HUES`, in their order.
    public static let accountHues = ["amber", "blue", "cyan", "green", "orange", "rose", "violet"]

    /// A word in a sentence (`Part`): plain, emphasised, a measured figure
    /// (set in the mono figure face), or an account's name led by its dot.
    public enum Part: Sendable, Hashable {
        case text(String)
        case strong(String)
        case figure(String)
        case account(String, hue: String)
    }

    /// One window as a ring draws it (`RingWindow`): the share left, and its clock.
    public struct Window: Sendable, Hashable {
        /// Percent left, 0–100.
        public let left: Double
        public let resetsAt: Double?
        /// When it runs out at its pace, before its reset; nil: it lasts.
        public let runsOutAt: Double?
    }

    public enum State: Sendable, Hashable { case ok, limit, reserve, stale }

    /// A window that limits an account: `"5h" | "week"`.
    public enum Limit: Sendable, Hashable { case fiveHour, week }

    /// One account (or opencode's plan) as every Rings surface draws it (`RingAccount`).
    public struct Account: Sendable, Identifiable {
        /// When its limit lifts; nil unless at its limit.
        public var backAt: Double?
        /// The window that limits it: the 5-hour, else the week.
        public var bind: Limit
        /// "5-hour", "week", "Opus week".
        public var bindName: String
        /// When the binding window runs out at its pace; nil: it lasts.
        public var bindOut: Double?
        public var carryFrom: Double?
        public var carryUntil: Double?
        public var email: String?
        /// The hue it is drawn in where it is shown with others (`shownHues`).
        public var hue: String
        public var id: String
        /// Which window is spent, when it is at its limit.
        public var limitOn: Limit?
        /// Opencode's month; none on a Claude account.
        public var month: Window?
        public var name: String
        public var neverBackup: Bool
        public var nick: String?
        /// The Claude organization it bills, by name; nil on any other provider.
        public var org: String?
        /// Percent left where its reserve sits, once the reserve is reached.
        public var reserveLeft: Double?
        public var seenAt: Double?
        public var sessions: [InstanceRow]
        public var state: State
        public var w5: Window?
        public var week: Window?
    }

    /// A provider's accounts in carrying order, and the carry answer (`ClaudeRings`).
    public struct Claude: Sendable {
        public var accounts: [Account]
        /// The forecast's moment: the hub walks its spans from it (its first
        /// span's `from`), so a stop worked out here walks from it too and
        /// counts down with the bands between readings.
        public var at: Double
        /// The account that is back first after nothing can carry you.
        public var back: Account?
        public var backAt: Double?
        /// The fleet's burn: the summed 5-hour pace, percent an hour.
        public var burn: Double
        /// The fleet's weekly burn: the summed weekly pace, percent an hour.
        public var burnWeek: Double
        /// Who carries your new sessions now; nil: nothing can.
        public var carry: Account?
        /// Where the next delegate goes, and why in a few words.
        public var delegate: Account?
        public var delegateWhy: String
        public var next: Account?
        public var nextAt: Double?
        /// An account in the carry chain whose reading is out of date.
        public var stale: Account?
        /// When nothing can carry you any more; nil: past the 5-hour horizon.
        public var stopAt: Double?
    }

    // MARK: Hues

    /// `shownHues`: each keeps its stored hue unless one before it (or one
    /// in `worn`) wears it; those that can't take the first of the seven
    /// nobody wears; past seven they repeat, in that order.
    public static func shownHues(_ own: [String], worn: [String] = []) -> [String] {
        var used = Set(worn)
        let kept: [String?] = own.map { hue in
            if used.contains(hue) { return nil }
            used.insert(hue)
            return hue
        }
        var spare = 0
        return kept.map { hue in
            if let hue { return hue }
            if let free = accountHues.first(where: { !used.contains($0) }) {
                used.insert(free)
                return free
            }
            let repeated = accountHues[spare % accountHues.count]
            spare += 1
            return repeated
        }
    }

    // MARK: Words and figures

    /// A number as JavaScript writes it in a template: "62", "29.5".
    public static func number(_ value: Double) -> String {
        value == value.rounded() && abs(value) < 1e15 ? String(Int(value)) : String(value)
    }

    /// "50m", "3h 10m", "2d 4h": a span to the minute (`fmt`).
    public static func fmt(_ ms: Double) -> String {
        let m = max(0, Int((ms / minuteMs).rounded(.toNearestOrAwayFromZero)))
        if m < 60 { return "\(m)m" }
        if m < 1440 {
            let minutes = m % 60
            return "\(m / 60)h \(minutes < 10 ? "0" : "")\(minutes)m"
        }
        return "\(m / 1440)d \((m % 1440) / 60)h"
    }

    /// A week's reset as a day and a time ("Tue 09:00"), the date past a week (`dayTime`).
    public static func dayTime(_ at: Double, now: Double) -> String {
        let date = Date(timeIntervalSince1970: at / 1000)
        let style: Date.FormatStyle = at - now < 7 * 24 * hourMs
            ? .dateTime.weekday(.abbreviated).hour(.twoDigits(amPM: .omitted)).minute(.twoDigits)
            : .dateTime.day().month(.abbreviated).hour(.twoDigits(amPM: .omitted)).minute(.twoDigits)
        return date.formatted(style.locale(Usage.clock)).replacingOccurrences(of: ",", with: "")
    }

    /// A count of sessions in words, its figure set as one (`sessionsSaid`).
    static func sessionsSaid(_ n: Int) -> [Part] {
        [.figure(String(n)), .text(n == 1 ? " session" : " sessions")]
    }

    static func until(_ at: Double?, _ now: Double) -> String {
        at.map { fmt($0 - now) } ?? ""
    }

    static func ms(_ iso: String?) -> Double? {
        iso.flatMap(Wire.parseDate).map { $0.timeIntervalSince1970 * 1000 }
    }

    /// `ringWindow`.
    static func ringWindow(_ w: Components.Schemas.WindowForecast?) -> Window? {
        guard let w else { return nil }
        return Window(left: min(100, max(0, 100 - w.utilization)), resetsAt: ms(w.resetsAt), runsOutAt: w.runsOutAt)
    }

    /// A live session holds its account's reading current (`isLive`).
    static func isLive(_ row: InstanceRow) -> Bool {
        row.status == .running || row.status == .starting
    }

    // MARK: An account

    /// Which window is spent: one at 100%, else the one its bench runs to (`limitOf`).
    static func limitOf(_ five: Components.Schemas.WindowForecast?, _ week: Components.Schemas.WindowForecast?,
                        _ benched: Components.Schemas.AccountBench?) -> Limit? {
        if let five, five.utilization >= 100 { return .fiveHour }
        if let week, week.utilization >= 100 { return .week }
        guard let benched else { return nil }
        let reset = ms(five?.resetsAt)
        return reset.map { benched.until <= $0 + minuteMs } == true ? .fiveHour : .week
    }

    /// The window that limits it, and what it is called (`bindOf`).
    static func bindOf(_ bound: Components.Schemas.WindowForecast?, _ limitOn: Limit?) -> (Limit, String) {
        let bind = limitOn ?? (bound?.kind == "session" ? .fiveHour : .week)
        if bind == .fiveHour { return (bind, "5-hour") }
        if limitOn == nil, bound?.kind == "weekly_scoped", let scope = bound?.scopeLabel, !scope.isEmpty {
            return (bind, "\(scope) week")
        }
        return (bind, "week")
    }

    /// At its limit, out of date, past its reserve, or fine, in that order (`stateOf`).
    static func stateOf(_ limitOn: Limit?, stale: Bool, reserved: Bool) -> State {
        if limitOn != nil { return .limit }
        if stale { return .stale }
        return reserved ? .reserve : .ok
    }

    /// core `accountName`: its nickname, else its email.
    public static func accountName(label: String?, email: String?) -> String {
        label ?? email ?? "an account not signed in yet"
    }

    /// An account as its rings draw it, before the carry answer is known (`accountRing`).
    static func accountRing(_ account: Components.Schemas.Account, _ forecast: Components.Schemas.AccountForecast?,
                            bench: [Components.Schemas.AccountBench], rows: [InstanceRow], now: Double) -> Account {
        let windows = forecast?.windows ?? []
        let five = windows.first { $0.kind == "session" }
        let weekAll = windows.first { $0.kind == "weekly_all" }
        let w5 = ringWindow(five)
        let week = ringWindow(weekAll)
        let bound = forecast?.bindingWindow.flatMap { ref in
            windows.first { $0.kind == ref.kind && $0.scopeLabel == ref.scopeLabel }
        }
        let live = rows.filter { $0.accountId == account.id && isLive($0) }
        let benched = bench.first { $0.accountId == account.id && $0.scope == nil && $0.until > now }
        let limitOn = limitOf(five, weekAll, benched)
        let limitWindow = limitOn == .fiveHour ? w5 : week
        let backAt = limitOn == nil ? nil : (benched?.until ?? limitWindow?.resetsAt)
        let (bind, bindName) = bindOf(bound, limitOn)
        let reserved = account.reservePct.map { pct in weekAll.map { $0.utilization >= pct } ?? false } ?? false
        let seenAt = forecast?.lastSeenAt
        let stale = live.isEmpty && seenAt.map { now - $0 >= staleMs } == true
        let state = stateOf(limitOn, stale: stale, reserved: reserved)
        let organization = account.identity?.organization
        return Account(
            backAt: backAt, bind: bind, bindName: bindName, bindOut: bound?.runsOutAt,
            carryFrom: nil, carryUntil: nil, email: account.email, hue: account.hue.rawValue, id: account.id,
            limitOn: limitOn, month: nil, name: accountName(label: account.label, email: account.email),
            neverBackup: account.neverBackup, nick: account.label,
            org: account.provider == "anthropic" && organization?.isEmpty == false ? organization : nil,
            reserveLeft: state == .reserve ? account.reservePct.map { 100 - $0 } : nil,
            seenAt: seenAt, sessions: live, state: state, w5: w5, week: week
        )
    }

    /// The delegates' reason, in the routing's own words (`delegateReason`).
    static func delegateReason(_ routing: Components.Schemas.ProviderRouting?, to: Account?, byId: [String: Account]) -> String {
        guard let choice = routing?.delegates, let to else { return "" }
        switch choice.strategy {
        case .pinned:
            guard let pinned = choice.pinnedAccountId.flatMap({ byId[$0] }), pinned.id != to.id else { return "pinned" }
            if pinned.state == .limit { return "\(pinned.name) is at its limit" }
            return pinned.state == .reserve ? "\(pinned.name) reached its reserve" : "\(pinned.name) can't take it"
        case .fillFirst: return "first in your order"
        case .spread: return "most room left"
        case .soonestReset: return "resets soonest"
        case .unrecognized: return ""
        }
    }

    /// The summed pace of one kind of window across a forecast's accounts (`paceSum`).
    static func paceSum(_ forecast: Components.Schemas.ProviderForecast, _ kind: String) -> Double {
        forecast.accounts.reduce(0) { sum, one in sum + (one.windows.first { $0.kind == kind }?.pace ?? 0) }
    }

    /// A provider's accounts in carrying order, and the carry answer (`claudeRings`).
    public static func claudeRings(accounts: [Components.Schemas.Account], bench: [Components.Schemas.AccountBench],
                                   forecast: Components.Schemas.ProviderForecast, instances: [InstanceRow], now: Double,
                                   routing: Components.Schemas.ProviderRouting?) -> Claude {
        let own = accounts.filter { $0.provider == forecast.provider }.enumerated()
            .sorted { $0.element.order != $1.element.order ? $0.element.order < $1.element.order : $0.offset < $1.offset }
            .map(\.element)
        var rings = own.map { account in
            accountRing(account, forecast.accounts.first { $0.accountId == account.id }, bench: bench, rows: instances, now: now)
        }
        // In the account order, not the carrying order: no account changes colour when the relay moves.
        for (i, hue) in shownHues(rings.map(\.hue)).enumerated() {
            rings[i].hue = hue
        }
        let spans = forecast.yours
        // A span's account, as it carries: the first span it carries in.
        for span in spans {
            guard let id = span.accountId, let i = rings.firstIndex(where: { $0.id == id }), rings[i].carryUntil == nil else { continue }
            rings[i].carryFrom = span.from
            rings[i].carryUntil = span.to
        }
        let byId = Dictionary(rings.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        func of(_ span: Components.Schemas.CarrySpan?) -> Account? {
            span?.accountId.flatMap { byId[$0] }
        }
        let carry = of(spans.first)
        let second = spans.count > 1 ? of(spans[1]) : nil
        let next = carry != nil && second != nil && second?.id != carry?.id ? second : nil
        let stopIndex = spans.firstIndex { $0.accountId == nil }
        let stopAt = stopIndex.map { spans[$0].from }
        let backSpan = stopIndex.flatMap { index in spans[index...].first { $0.accountId != nil } }
        var chain: [String] = []
        for id in spans.compactMap(\.accountId) where !chain.contains(id) {
            chain.append(id)
        }
        let order = chain + rings.map(\.id).filter { !chain.contains($0) }
        let delegate = of(forecast.delegates.first)
        return Claude(
            accounts: order.compactMap { byId[$0] },
            at: spans.first?.from ?? now,
            back: of(backSpan), backAt: backSpan?.from,
            burn: paceSum(forecast, "session"), burnWeek: paceSum(forecast, "weekly_all"),
            carry: carry,
            delegate: delegate, delegateWhy: delegateReason(routing, to: delegate, byId: byId),
            next: next, nextAt: next != nil && spans.count > 1 ? spans[1].from : nil,
            stale: chain.compactMap { byId[$0] }.first { $0.state == .stale },
            stopAt: stopAt
        )
    }

    /// Opencode's plan as one ring (`openCodeRing`): amber unless a Claude
    /// account shown beside it (`worn`) wears it.
    public static func openCodeRing(fetchedAt: Double, stale: Bool, windows: [Components.Schemas.LimitWindow],
                                    live: [InstanceRow], now: Double, worn: [String]) -> Account {
        let hue = shownHues(["amber"], worn: worn).first ?? "amber"
        func win(_ group: String) -> Window? {
            guard let w = windows.first(where: { $0.group == group }) else { return nil }
            let meter = Usage.meter(w, now: now, stale: false)
            return Window(left: min(100, max(0, 100 - w.percent)), resetsAt: ms(w.resetsAt), runsOutAt: meter.runsOutIn.map { now + $0 })
        }
        let w5 = win("session")
        let week = win("weekly")
        let month = win("monthly")
        let spent = [(Limit.fiveHour, w5, "5h"), (.week, week, "week"), (.week, month, "month")].first { $0.1.map { $0.left <= 0 } == true }
        let outs = [w5, week, month].compactMap { $0?.runsOutAt }
        let state = stateOf(spent == nil ? nil : .fiveHour, stale: stale, reserved: false)
        let limitOn: Limit? = spent.map { $0.2 == "5h" ? .fiveHour : .week }
        return Account(
            backAt: spent?.1?.resetsAt, bind: limitOn ?? .fiveHour, bindName: limitOn == .week ? "week" : "5-hour",
            bindOut: outs.min(), carryFrom: nil, carryUntil: nil, email: nil, hue: hue, id: "opencode",
            limitOn: limitOn, month: month, name: "Go plan", neverBackup: false,
            // The plan has no email; it goes by its name.
            nick: "Go plan", org: nil, reserveLeft: nil, seenAt: fetchedAt, sessions: live, state: state,
            w5: w5, week: week
        )
    }

    // MARK: Words

    /// The parts as plain text (`plain`).
    public static func plain(_ parts: [Part]) -> String {
        parts.map { part in
            switch part {
            case let .text(text), let .strong(text), let .figure(text): text
            case let .account(name, _): name
            }
        }.joined()
    }

    /// A time from an out-of-date reading is a guess: "~3h 40m" (`guess`).
    static func guess(_ stale: Bool, _ time: String) -> String {
        stale ? "~\(time)" : time
    }

    /// The strip's and the page's figure: how long until nothing can carry you (`stopText`).
    public static func stopText(_ c: Claude, now: Double) -> String {
        guard let stopAt = c.stopAt, stopAt - now < horizonMs else { return "5h+" }
        return guess(c.stale != nil, fmt(stopAt - now))
    }

    /// The strip's caption: who is next, else when you're back (`caption`).
    public static func caption(_ c: Claude, now: Double, nameOf: (Account) -> String) -> [Part] {
        if let next = c.next { return [.text("then "), .account(nameOf(next), hue: next.hue)] }
        if c.stopAt != nil, let backAt = c.backAt { return [.text("back in "), .figure(fmt(backAt - now))] }
        if let carry = c.carry, let w5 = carry.w5 {
            return [.account(nameOf(carry), hue: carry.hue), .text(" "), .figure("\(number(w5.left))%"), .text(" left")]
        }
        return []
    }

    /// When an account stops, and the limit it stops on ("5-hour", "week") (`Stop`).
    public struct Stop: Sendable, Hashable {
        public let at: Double
        public let limit: String
    }

    /// An account's forecast stop (`stopFor`): the carrier and an idle
    /// account at the fleet's pace from the forecast's moment (`takeover`),
    /// any other running account (and the Go plan, no `c`) at its own; nil
    /// past the 5-hour horizon. The carrier's band ends at its stop, or
    /// sooner when the walk hands over first: the band says how long it
    /// carries you, the cell when it runs out (`bandTip`, `dialTip`).
    public static func stopFor(_ r: Account, _ c: Claude?, now: Double) -> Stop? {
        let own = c == nil || (!r.sessions.isEmpty && r.id != c?.carry?.id)
        var stop: Stop?
        if !own, let c {
            stop = takeover(r, c, now: now)
        } else if let out = r.bindOut {
            stop = Stop(at: out, limit: r.bindName)
        }
        guard let stop, stop.at - now < horizonMs else { return nil }
        return stop
    }

    /// When an account stops (`stopOf`).
    public static func stopOf(_ r: Account, _ c: Claude?, now: Double) -> Double? {
        stopFor(r, c, now: now)?.at
    }

    /// A dial-wall cell's time, a figure alone (`CellTime`).
    public enum CellTime: Sendable, Hashable {
        case stop(figure: String, guess: Bool)
        /// At its limit: when it's back; nil when that isn't known.
        case back(figure: String?)

        public var figure: String? {
            switch self {
            case let .stop(figure, _): figure
            case let .back(figure): figure
            }
        }
    }

    /// `cellTime`.
    public static func cellTime(_ r: Account, _ c: Claude?, now: Double) -> CellTime {
        if r.state == .limit {
            return .back(figure: r.backAt.map { _ in until(r.backAt, now) })
        }
        let out = stopOf(r, c, now: now)
        return .stop(figure: out.map { fmt($0 - now) } ?? "5h+", guess: r.state == .stale)
    }

    /// A dial's tooltip under its account's name, a short line per limit
    /// (`dialTip`): on the limit it stops on, when it runs out ("runs out in
    /// 32m", an idle account "if it takes over now"), or "lasts past the next
    /// 5 hours"; how long it carries you is its band's to say.
    public static func dialTip(_ r: Account, _ c: Claude?, now: Double) -> String {
        let time = cellTime(r, c, now: now)
        // At the fleet's pace as if it took over now (`stopFor`'s idle).
        let idle = c != nil && r.sessions.isEmpty && r.id != c?.carry?.id
        var pace = ""
        if case let .stop(figure, _) = time {
            pace = figure == "5h+" ? " · lasts past the next 5 hours" : " · runs out in \(figure)\(idle ? " if it takes over now" : "")"
        }
        let stopsOnWeek = (stopFor(r, c, now: now)?.limit ?? r.bindName) != "5-hour"
        let spent = r.backAt == nil ? "used up" : "used up · back in \(until(r.backAt, now))"
        func line(_ label: String, _ limited: Bool, _ left: Double?, _ binds: Bool) -> String? {
            if limited { return "\(label): \(spent)" }
            return left.map { "\(label): \(number($0))% left\(binds ? pace : "")" }
        }
        return [
            line("5-hour", r.limitOn == .fiveHour, r.w5?.left, !stopsOnWeek),
            line("Week", r.limitOn == .week, r.week?.left, stopsOnWeek),
            r.state == .stale ? estimateOf(r, now: now) : nil,
        ].compactMap(\.self).joined(separator: "\n")
    }

    /// A cell's week: what is left of it, 0 at its limit, none unread (`weekLeft`).
    public static func weekLeft(_ r: Account) -> Double? {
        r.limitOn == .week ? 0 : r.week?.left
    }

    /// An account's first name: its nickname, else its email's local part (`localOf`).
    static func localOf(_ r: Account) -> String {
        guard r.nick == nil || r.nick?.isEmpty == true, let email = r.email, let at = email.lastIndex(of: "@") else { return r.name }
        return String(email[..<at])
    }

    /// A name as the usage popover and strip show it (`ShownName`).
    public struct ShownName: Sendable, Hashable {
        /// The domain's stem ("@gmail"), or "" when the first part says enough.
        public let domain: String
        public let local: String

        public init(domain: String, local: String) {
            self.domain = domain
            self.local = local
        }

        public var whole: String { local + domain }
    }

    /// `shownNames`: the first part, then the domain's stem only where an
    /// ungrouped account shares that first part with another shown with it.
    public static func shownNames(_ accounts: [Account], extra: Account?) -> [String: ShownName] {
        let all = accounts + (extra.map { [$0] } ?? [])
        var count: [String: Int] = [:]
        for r in all { count[localOf(r), default: 0] += 1 }
        var grouped = Set(orgGroups(accounts).filter { $0.org != nil }.flatMap { $0.accounts.map(\.id) })
        if let extra { grouped.insert(extra.id) }
        var out: [String: ShownName] = [:]
        for r in all {
            let local = localOf(r)
            var domain = ""
            if !grouped.contains(r.id), (count[local] ?? 0) > 1, let email = r.email, let at = email.lastIndex(of: "@") {
                var host = String(email[email.index(after: at)...])
                if let dot = host.lastIndex(of: ".") { host = String(host[..<dot]) }
                domain = "@\(host)"
            }
            out[r.id] = ShownName(domain: domain, local: local)
        }
        return out
    }

    /// When an account runs out carrying you, as the relay's walk spends a
    /// carrier, from the forecast's moment (`c.at`), so it counts down
    /// between readings as the bands do (`takeover`).
    public static func takeover(_ r: Account, _ c: Claude, now: Double) -> Stop? {
        let from = c.at
        let horizon = now + horizonMs
        var five: Double?
        if c.burn > 0, let w5 = r.w5 {
            var use = 100 - w5.left
            var reset: Double? = w5.resetsAt.flatMap { $0 > from ? $0 : nil }
            var t = from
            while t < horizon {
                let out = t + ((100 - use) / c.burn) * hourMs
                guard let at = reset, out > at else {
                    five = out
                    break
                }
                use = 0
                t = at
                reset = at + horizonMs
            }
        }
        var week: Double?
        if c.burnWeek > 0, let w = r.week {
            let out = from + (w.left / c.burnWeek) * hourMs
            week = w.resetsAt.map { out < $0 } ?? true ? out : nil
        }
        if let five, week.map({ five <= $0 }) ?? true {
            return Stop(at: five, limit: "5-hour")
        }
        return week.map { Stop(at: $0, limit: "week") }
    }

    /// One group of the accounts: an organization's, or (nil) the rest (`OrgGroup`).
    public struct OrgGroup: Sendable {
        public let accounts: [Account]
        public let org: String?
    }

    /// `orgGroups`: each organization with more than two accounts is a group,
    /// in the order its first account carries; the rest follow ungrouped.
    public static func orgGroups(_ accounts: [Account]) -> [OrgGroup] {
        var size: [String: Int] = [:]
        for ring in accounts { if let org = ring.org { size[org, default: 0] += 1 } }
        var order: [String] = []
        var groups: [String: [Account]] = [:]
        var rest: [Account] = []
        for ring in accounts {
            if let org = ring.org, (size[org] ?? 0) > 2 {
                if groups[org] == nil { order.append(org) }
                groups[org, default: []].append(ring)
            } else {
                rest.append(ring)
            }
        }
        return order.map { OrgGroup(accounts: groups[$0] ?? [], org: $0) } + (rest.isEmpty ? [] : [OrgGroup(accounts: rest, org: nil)])
    }

    /// An out-of-date reading's line in its dial's tooltip (`estimateOf`).
    static func estimateOf(_ r: Account, now: Double) -> String {
        r.seenAt.map { "Estimate: last reading \(fmt(now - $0)) ago" } ?? "Estimate: no reading yet"
    }

    /// The routing's reason as placement applies it (`DELEGATE_WHY`).
    static let delegateWhyText = [
        "first in your order": "it’s the first in your order with room.",
        "resets soonest": "its 5-hour limit resets soonest.",
        "pinned": "delegates are pinned to it.",
    ]

    /// What placement's spread compares: the share left on its lower limit (`lowerLeft`).
    static func lowerLeft(_ r: Account) -> Double {
        min(r.limitOn == .fiveHour ? 0 : (r.w5?.left ?? 100), r.limitOn == .week ? 0 : (r.week?.left ?? 100))
    }

    /// The tooltip on the delegates' mark (`delegateTip`).
    public static func delegateTip(_ c: Claude, to: Account) -> String {
        guard c.delegateWhy == "most room left" else {
            return delegateWhyText[c.delegateWhy].map { "New delegates start here: \($0)" } ?? "New delegates start here."
        }
        let left = lowerLeft(to)
        let passed = c.accounts.filter { $0.id != to.id && lowerLeft($0) > left }
        let lead = "New delegates start here: its lower limit has \(number(left))% left,"
        if passed.isEmpty { return "\(lead) more than any other account’s." }
        return passed.allSatisfy { $0.state == .reserve }
            ? "\(lead) more than any account’s outside your reserve."
            : "\(lead) more than any other account’s delegates can use."
    }

    /// A tile's sentence: the same status, said whole (`tileSentence`). An
    /// account running sessions says so ("Carrying 2 sessions" on the
    /// carrier, "Running 1 session." on any other); only one running none is "Idle.".
    public static func tileSentence(_ r: Account, _ c: Claude, now: Double) -> [Part] {
        let n = r.sessions.count
        let running: [Part] = n > 0 ? [.text("Running ")] + sessionsSaid(n) + [.text(".")] : []
        // The running sentence, then `rest` after a space (`after`).
        func after(_ rest: [Part]) -> [Part] {
            running.isEmpty ? rest : running + [.text(" ")] + rest
        }
        if r.state == .limit { return [.text("At its limit. Back in "), .figure(until(r.backAt, now)), .text(".")] }
        if r.state == .stale, let seenAt = r.seenAt {
            return [.text("Hasn’t reported for "), .figure(fmt(now - seenAt)), .text(", so this may be out of date.")]
        }
        if r.state == .reserve {
            return n > 0
                ? [.text("Reserve reached. It keeps its ")] + sessionsSaid(n) + [.text("; new work goes elsewhere.")]
                : [.text("Reserve reached. New work goes elsewhere.")]
        }
        if r.id == c.carry?.id {
            return (n > 0 ? [.text("Carrying ")] + sessionsSaid(n) : [.text("Carries your next session")])
                + (c.next.map { [.text(", then "), .account($0.name, hue: $0.hue)] } ?? []) + [.text(".")]
        }
        if r.neverBackup { return after([.text("Never a backup: only a pick or a pin uses it.")]) }
        if r.id == c.next?.id, let carry = c.carry, let nextAt = c.nextAt {
            return after([.text("Takes over from "), .account(carry.name, hue: carry.hue), .text(" in "), .figure(fmt(nextAt - now)), .text(".")])
        }
        return running.isEmpty ? [.text("Idle.")] : running
    }

    /// A tile's figure, beside its mark, and what it is (`TileFigure`).
    public struct TileFigure: Sendable, Hashable {
        public let back: Bool
        public let figure: String
        public let label: String
    }

    /// `tileFigure`.
    public static func tileFigure(_ r: Account, _ c: Claude, now: Double) -> TileFigure {
        if r.state == .limit {
            return TileFigure(back: true, figure: until(r.backAt, now), label: "until it’s back · \(r.bindName) at its limit")
        }
        if r.neverBackup, r.id != c.carry?.id {
            return TileFigure(back: false, figure: "5h+", label: "never a backup")
        }
        let stop = stopFor(r, c, now: now)
        let label = stop.map { "until its \($0.limit) limit runs out" } ?? "lasts past the next 5 hours"
        return TileFigure(back: false, figure: stop.map { fmt($0.at - now) } ?? "5h+",
                          label: r.state == .stale ? "last known · \(label)" : label)
    }

    /// Opencode's figure beside its mark (`openCodeFigure`).
    public static func openCodeFigure(_ o: Account, now: Double) -> TileFigure {
        let time = cellTime(o, nil, now: now)
        if case let .back(figure) = time {
            return TileFigure(back: true, figure: figure ?? "", label: "until it’s back · \(o.bindName) at its limit")
        }
        let stop = stopFor(o, nil, now: now)
        let shown = if case let .stop(figure, guess) = time { guess ? "~\(figure)" : figure } else { "" }
        return TileFigure(back: false, figure: shown,
                          label: stop.map { "until its \($0.limit) limit runs out" } ?? "lasts past the next 5 hours")
    }

    /// The page's lead sentence (`leadSentence`).
    public static func leadSentence(_ c: Claude, now: Double) -> [Part] {
        var back: [Part] = []
        if let b = c.back, let at = c.backAt {
            back = [.text(" You’re back on "), .strong(b.name), .text(" in "), .figure(fmt(at - now)), .text(".")]
        }
        guard let carry = c.carry else {
            if let b = c.back, let at = c.backAt {
                return [.text("Nothing can carry you now. "), .strong(b.name), .text(" is back in "), .figure(fmt(at - now)), .text(".")]
            }
            return [.text("Nothing can carry you now.")]
        }
        let parts: [Part]
        if let end = carry.carryUntil, end - now < horizonMs {
            parts = [.strong(carry.name), .text(" carries you for "), .figure(fmt(end - now))]
                + (c.next.map { [.text(", then "), .strong($0.name), .text(".")] } ?? [.text(".")])
        } else {
            parts = [.strong(carry.name), .text(" carries you past the next 5 hours.")]
        }
        if let stale = c.stale, let seenAt = stale.seenAt {
            return parts + [.text(" "), .strong(stale.name), .text(" last reported "), .figure(fmt(now - seenAt)),
                            .text(" ago, so the time after that is a guess.")]
        }
        guard c.stopAt != nil else { return parts }
        let others = c.accounts.filter { $0.id != carry.id }
        if c.next == nil, let limited = others.first(where: { $0.state == .limit }), let at = limited.backAt {
            return parts + [.text(" "), .strong(limited.name), .text(" is at its limit and back in "), .figure(fmt(at - now)),
                            .text(", so nothing carries you in between.")] + (c.back.map { $0.id != limited.id } == true ? back : [])
        }
        if let reserved = others.first(where: { $0.state == .reserve }) {
            return parts + [.text(" "), .strong(reserved.name), .text(" reached its weekly reserve: it keeps its ")]
                + sessionsSaid(reserved.sessions.count) + [.text(", and new work goes elsewhere.")] + back
        }
        return parts + back
    }

    /// `openCodeSentence`.
    public static func openCodeSentence(_ o: Account, now: Double) -> [Part] {
        if o.state == .limit { return [.text("At its limit. Back in "), .figure(until(o.backAt, now)), .text(".")] }
        if o.state == .stale, let seenAt = o.seenAt {
            return [.text("Hasn’t reported for "), .figure(fmt(now - seenAt)), .text(", so this may be out of date.")]
        }
        if let out = o.bindOut, out - now < horizonMs { return [.text("Runs out in "), .figure(fmt(out - now)), .text(".")] }
        return [.text("Nothing stops you in the next 5 hours.")]
    }

    /// One line of the key: glyph | label | value | reset (`KeyRow`).
    public struct KeyRow: Sendable {
        public enum Glyph: Sendable { case disc, rim }
        public let glyph: Glyph?
        public let id: String
        public let label: String
        public let limit: Bool
        public let reset: [Part]
        public let value: [Part]
    }

    /// An account's key: the 5-hour, then the week, then the month (`keyRows`).
    public static func keyRows(_ r: Account, now: Double) -> [KeyRow] {
        func left(_ share: Double, _ limited: Bool) -> [Part] {
            limited ? [.text("at its limit")] : [.figure("\(number(share))%"), .text(" left")]
        }
        var rows: [KeyRow] = []
        if let w5 = r.w5 {
            let lim = r.limitOn == .fiveHour
            rows.append(KeyRow(glyph: .disc, id: "5h", label: "5-hour", limit: lim, reset: lim
                    ? [.text("back in "), .figure(until(r.backAt, now))]
                    : [.text("resets in "), .figure(until(w5.resetsAt, now))],
                value: left(w5.left, lim)))
        }
        if let week = r.week {
            let lim = r.limitOn == .week
            rows.append(KeyRow(glyph: .rim, id: "week", label: "Week", limit: lim,
                               reset: week.resetsAt.map { [.text("resets ")] + clockSaid($0, now: now) } ?? [],
                               value: left(week.left, lim)))
        }
        if let month = r.month {
            rows.append(KeyRow(glyph: nil, id: "month", label: "Month", limit: month.left <= 0,
                               reset: month.resetsAt.map { [.text("resets in "), .figure(fmt($0 - now))] } ?? [],
                               value: left(month.left, month.left <= 0)))
        }
        return rows
    }

    /// A day and time ("Tue 14:00"): the day in words, the clock a figure (`clockSaid`).
    static func clockSaid(_ at: Double, now: Double) -> [Part] {
        let said = dayTime(at, now: now)
        guard let space = said.lastIndex(of: " ") else { return [.figure(said)] }
        return [.text(String(said[...space])), .figure(String(said[said.index(after: space)...]))]
    }
}

// MARK: The dial wall (UsageMeter.svelte)

extension Rings {
    /// An organization's cells under its name, or the ungrouped ones (`WallBlock`).
    public struct WallBlock: Sendable {
        public let cells: [Account]
        /// Its head: the organization's name, "Other" under groups, or none.
        public let head: String?
        public let org: String?
    }

    /// What is left of the window that binds an account: the tie-break (`roomOf`).
    static func roomOf(_ ring: Account) -> Double {
        (ring.bind == .week ? ring.week?.left : ring.w5?.left) ?? 0
    }

    /// The cells by the time each says first (`ranked`): the latest stop first,
    /// ties to the most room; accounts at their limit last, back soonest first;
    /// then the carrying order. `at` is the last reading's moment.
    public static func ranked(_ accounts: [Account], _ c: Claude, at: Double) -> [Account] {
        let keyed = accounts.enumerated().map { (offset: $0.offset, ring: $0.element, stop: stopOf($0.element, c, now: at) ?? .infinity) }
        return keyed.sorted { a, b in
            let limitA = a.ring.state == .limit
            let limitB = b.ring.state == .limit
            if limitA != limitB { return limitB }
            if limitA {
                let backA = a.ring.backAt ?? .infinity
                let backB = b.ring.backAt ?? .infinity
                return backA != backB ? backA < backB : a.offset < b.offset
            }
            if a.stop != b.stop { return a.stop > b.stop }
            let roomA = roomOf(a.ring)
            let roomB = roomOf(b.ring)
            return roomA != roomB ? roomA > roomB : a.offset < b.offset
        }.map(\.ring)
    }

    /// Claude's accounts as blocks, each ranked and starting its own row (`wall`).
    public static func wall(_ c: Claude, rankedAt: Double) -> [WallBlock] {
        orgGroups(c.accounts).enumerated().map { i, group in
            WallBlock(cells: ranked(group.accounts, c, at: rankedAt), head: group.org ?? (i > 0 ? "Other" : nil), org: group.org)
        }
    }

    /// A cell read out whole (`cellLabel`): "design · 5h+ left · week 62% left ·
    /// 2 sessions · new sessions start here".
    public static func cellLabel(_ ring: Account, _ c: Claude?, name: String, now: Double) -> String {
        let said: String = switch cellTime(ring, c, now: now) {
        case let .back(figure): figure.map { "at its limit, back in \($0)" } ?? "at its limit"
        case let .stop(figure, guess): "\(guess ? "about " : "")\(figure) left"
        }
        let sessions = ring.sessions.count
        return [
            name, said,
            weekLeft(ring).map { "week \(number($0))% left" },
            sessions > 0 ? "\(sessions) \(sessions == 1 ? "session" : "sessions")" : nil,
            c.flatMap { $0.delegate?.id == ring.id ? "delegates start here" : nil },
            c.flatMap { $0.carry?.id == ring.id ? "new sessions start here" : nil },
        ].compactMap(\.self).joined(separator: " · ")
    }

    /// The week's mark's share: at least an eighth for any share above
    /// nothing (WeekMark.svelte `MIN_SHOWN`).
    public static func weekMarkShown(_ ring: Account) -> Double {
        let left = ring.limitOn == .week ? 0 : (ring.week?.left ?? 0)
        return left > 0 ? max(left, 12) : 0
    }
}

// MARK: The relay bar (Relay.svelte)

extension Rings {
    /// A stretch of the bar: an account's band, or a span nobody carries.
    public struct Segment: Sendable, Identifiable {
        public let id: String
        /// The account that carries it; nil: nobody can.
        public let ring: Account?
        public let ms: Double
        /// Where it starts, from now.
        public let start: Double
    }

    /// The bar's segments from now to the horizon (`segments`).
    public static func segments(_ spans: [Components.Schemas.CarrySpan], accounts: [Account], now: Double) -> [Segment] {
        let byId = Dictionary(accounts.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let end = now + horizonMs
        var out: [(key: String, ring: Account?, ms: Double)] = []
        var seen: [String: Int] = [:]
        var at = now
        for span in spans.sorted(by: { $0.from < $1.from }) {
            let from = max(span.from, at)
            let to = min(span.to, end)
            if to <= from { continue }
            if from > at { out.append(("blank@\(out.count)", nil, from - at)) }
            let ring = span.accountId.flatMap { byId[$0] }
            // An account at its limit carries from the moment it's back, if that is inside the horizon.
            let start = ring?.state == .limit ? max(from, ring?.backAt ?? end) : from
            if let ring, start < to {
                if start > from { out.append(("blank@\(out.count)", nil, start - from)) }
                let n = seen[ring.id] ?? 0
                seen[ring.id] = n + 1
                out.append(("\(ring.id)#\(n)", ring, to - start))
            } else {
                out.append(("blank@\(out.count)", nil, to - from))
            }
            at = to
        }
        if at < end { out.append(("blank@\(out.count)", nil, end - at)) }
        var sum = 0.0
        return out.map { seg in
            defer { sum += seg.ms }
            return Segment(id: seg.key, ring: seg.ring, ms: seg.ms, start: sum)
        }
    }

    /// A moment on the bar: "now" where `fmt` would say "0m", else how far
    /// ahead ("+1h 40m"), rounded as the cells round their times (`ahead`).
    static func ahead(_ ms: Double) -> String {
        fmt(ms) == "0m" ? "now" : "+\(fmt(ms))"
    }

    /// A band's tooltip: how long its account carries your new sessions,
    /// "design carries you from now to +32m"; it ends where the relay hands
    /// over, which can come before the account runs out (`bandTip`).
    public static func bandTip(_ seg: Segment, name: String) -> String {
        "\(name) carries you from \(ahead(seg.start)) to \(ahead(seg.start + seg.ms))"
    }

    /// Where nobody can carry you first: the stop, inside the five hours (`stopKey`).
    public static func stopKey(_ segments: [Segment], stopAt: Double?, now: Double) -> String? {
        guard let stopAt, stopAt - now < horizonMs else { return nil }
        return segments.first { $0.ring == nil }?.id
    }

    /// The bar read out (`label`).
    public static func relayLabel(_ segments: [Segment]) -> String {
        "Next 5 hours: " + segments.map { seg in
            seg.ring.map { "\($0.name) for \(fmt(seg.ms))" } ?? "nothing for \(fmt(seg.ms))"
        }.joined(separator: ", then ")
    }

    /// An hour tick under the bar: its label, and where it falls as a share
    /// of the bar's width less its gaps plus whole gaps before it (`ticks`).
    public struct Tick: Sendable {
        public let hour: Int
        public let text: String
        /// Its share of the bar's width less every gap.
        public let share: Double
        /// The gaps before it.
        public let gaps: Int
    }

    /// `ticks`: each hour where it falls on the bar, by the bar's own mapping.
    public static func ticks(_ segments: [Segment]) -> [Tick] {
        let total = segments.reduce(0) { $0 + $1.ms }
        let allGaps = max(0, segments.count - 1)
        return (0 ... 5).map { hour in
            let text = hour == 0 ? "now" : "+\(hour)h"
            if hour == 0 || hour == 5 || total == 0 {
                return Tick(hour: hour, text: text, share: hour == 5 ? 1 : 0, gaps: hour == 5 ? allGaps : 0)
            }
            let t = Double(hour) / 5 * total
            var before = 0.0
            var k = 0
            for seg in segments {
                if t <= before + seg.ms { break }
                before += seg.ms
                k += 1
            }
            return Tick(hour: hour, text: text, share: t / total, gaps: k)
        }
    }
}

// MARK: The view every surface reads (forecast.svelte.ts)

/// Claude's accounts as Rings and opencode's plan, from the hub's readings:
/// the one view the strip, the sheet and the Usage page read, so they never disagree.
public struct UsageRings: Sendable {
    public let claude: Rings.Claude?
    public let openCode: Rings.Account?
    public let spans: [Components.Schemas.CarrySpan]
    /// The forecast has been read once (`usage.read`).
    public let read: Bool
    public let now: Double

    /// Every account by the one name the strip and the popover show it by (`nameOf`).
    public var names: [String: Rings.ShownName] {
        Rings.shownNames(claude?.accounts ?? [], extra: openCode)
    }

    public func nameOf(_ ring: Rings.Account) -> String {
        names[ring.id]?.whole ?? ring.name
    }

    @MainActor
    public static func read(fleet: FleetStore, now: Double) -> UsageRings {
        var claude: Rings.Claude?
        if let view = fleet.accounts, let forecast = fleet.forecast {
            var rings = Rings.claudeRings(accounts: view.accounts.filter { $0.provider == forecast.provider }, bench: view.bench,
                                          forecast: forecast, instances: fleet.rows, now: now,
                                          routing: view.routing.first { $0.provider == forecast.provider })
            // An account nothing has reported on yet has no rings to draw.
            rings.accounts = rings.accounts.filter { $0.w5 != nil || $0.week != nil }
            claude = rings.accounts.isEmpty ? nil : rings
        }
        var openCode: Rings.Account?
        if let reading = Usage.speaking(fleet.openCodeGoLimits, error: \.error, stale: { $0.stale ?? false }, windows: \.windows),
           !reading.windows.isEmpty
        {
            openCode = Rings.openCodeRing(
                fetchedAt: reading.fetchedAt, stale: reading.stale ?? false, windows: reading.windows,
                live: fleet.rows.filter { $0.harness == "opencode" && ($0.status == .running || $0.status == .starting) },
                now: now,
                // Shown beside Claude's accounts: never in a hue one of them wears.
                worn: claude?.accounts.map(\.hue) ?? []
            )
        }
        return UsageRings(claude: claude, openCode: openCode, spans: fleet.forecast?.yours ?? [], read: fleet.forecast != nil, now: now)
    }
}

// MARK: No limit to show (usage.ts `claudeGap`, UsageMeter.svelte `noteOf`)

extension Usage {
    /// Why there is no Claude limit to show, and the one action that fixes it (`LimitsGap`).
    public struct Gap: Sendable {
        public let machineId: String?
        public let reason: String
        public let short: String
        public let signIn: Bool
    }

    /// `claudeGap`.
    public static func claudeGap(_ readings: [String: Components.Schemas.ClaudeLimits], machines: [MachineRow]) -> Gap {
        guard let first = readings.sorted(by: { $0.key < $1.key }).first else {
            return Gap(machineId: nil, reason: "No machine has reported a Claude reading yet.", short: "No limits yet", signIn: false)
        }
        let machine = machines.first { $0.machineId == first.key }
        let host = machine?.hostname ?? "a removed machine"
        if let machine, machine.status != "online" {
            return Gap(machineId: machine.machineId, reason: "\(host) is offline. Its Claude limits are read again once it's back.",
                       short: "Machine offline", signIn: false)
        }
        if first.value.error == "not signed in" {
            return Gap(machineId: machine?.machineId, reason: "No Claude account is signed in on \(host).", short: "Sign in to see limits", signIn: true)
        }
        return Gap(machineId: machine?.machineId,
                   reason: "Claude Code hasn't reported the limits of \(host)'s account yet; they appear once a session runs there.",
                   short: "No limits yet", signIn: false)
    }

    /// What the list says of a provider with nothing to draw (`noteOf`).
    public static func noteOf(_ name: String, has: Bool, errors: [String?], read: Bool) -> String? {
        guard read, !has else { return nil }
        let error = errors.isEmpty ? "not signed in" : errors.compactMap(\.self).first
        guard let error else { return nil }
        if error == "not signed in" { return "Sign in to \(name) on a machine to see its limits." }
        if error == "no reading yet" { return "\(name)'s limits appear once a session runs." }
        return error.hasPrefix("HTTP 401") || error.hasPrefix("HTTP 403")
            ? "\(name) turned the key away. Sign in again on a machine."
            : "\(name)'s limits could not be read: \(error)"
    }
}
