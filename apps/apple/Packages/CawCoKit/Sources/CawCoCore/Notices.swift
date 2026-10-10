import CawCoAPI
import Foundation

/// One row under Caw's panel's Notices (CawPanel.svelte, NoticeRow.svelte):
/// the update notice (updates/model.ts `noticeFor`), the logins moved into
/// CawCo (MovedLogins.svelte), or what an account that came set moving
/// (RebalanceNotices.svelte). Each kind is one row, its entries in it, and its
/// ✕ acknowledges every entry it shows on every device (notices.svelte.ts).
public struct Notice: Identifiable, Equatable, Sendable {
    public enum Kind: Sendable {
        /// The update notice; `landedAll` is "CawCo X is running on N machines", which also forgets this device's installs.
        case update(landedAll: Bool)
        case movedLogins
        case rebalances
    }

    /// The update notice's one act.
    public enum Action: Equatable, Sendable {
        case retry, installAll

        public var label: String {
            switch self {
            case .retry: "Retry"
            case .installAll: "Install now"
            }
        }
    }

    /// One entry of the row: what it says first, then a line each.
    public struct Entry: Equatable, Sendable {
        public let title: String
        public let lines: [String]
    }

    public let id: String
    public let kind: Kind
    /// What VoiceOver calls the row, and its ✕.
    public let label: String
    public let dismissLabel: String
    /// The title says a failure: the fail glyph stands before it.
    public let failed: Bool
    public let entries: [Entry]
    /// A last line in the muted ink, after the entries.
    public let closing: String?
    public let action: Action?
    /// The machines it stands for, by id.
    public let machineIds: [String]
    /// The notice ids its ✕ acknowledges.
    public let acks: [String]

    public static func == (a: Notice, b: Notice) -> Bool {
        a.id == b.id && a.entries == b.entries && a.closing == b.closing && a.action == b.action && a.failed == b.failed
    }

    /// Every row under Notices, in the panel's order: the update, the moved logins, the rebalances.
    static func unseen(machines: [MachineRow], accounts: Components.Schemas.GetApiAccounts200?, policy: Policy?,
                       commanded: Set<String>, seen: Set<String>) -> [Notice] {
        var out: [Notice] = []
        let fleet = machines.compactMap(UpdateMachine.init)
        if let policy, let update = noticeFor(fleet, policy: policy, commanded: commanded, seen: seen) {
            out.append(update)
        }
        // Only the parts a notice reads: the view also carries every model catalog.
        guard let accounts,
              let people = try? Wire.transcode(accounts.accounts, as: [Account].self),
              let signins = try? Wire.transcode(accounts.signins, as: [Signin].self) else { return out }
        if let moved = movedLogins(people, signins: signins, machines: machines, seen: seen) { out.append(moved) }
        let rebalances = (try? Wire.transcode(accounts.rebalances, as: [Rebalance].self)) ?? []
        if let rebalanced = rebalanced(rebalances.filter { !seen.contains($0.id) }) { out.append(rebalanced) }
        return out
    }

    // MARK: The update notice (updates/model.ts)

    /// The fleet's update policy (`/api/binary-updates/settings`).
    public struct Policy: Equatable, Sendable {
        public let autoUpdate: Bool
    }

    private nonisolated struct Hold: Decodable {
        let reason: String
        let ids: [String]
    }

    private nonisolated struct Landing: Decodable {
        let at: Double
        let outcome: String
        let version: String
        let notes: String?
    }

    private nonisolated struct KeeperRestart: Decodable {
        let at: Double
        let children: Int
        let diagnostics: String
        let dials: Int
        let silentForMs: Double
        let retiring: Bool?
    }

    private nonisolated struct State: Decodable {
        let phase: String
        let installedVersion: String
        let availableVersion: String?
        let hostsHub: Bool
        let waitingOn: [Hold]?
        let notes: String?
        var landed: Landing?
        let keeperRestart: KeeperRestart?
    }

    /// A machine that reports an update, as the notices read it.
    private struct UpdateMachine {
        let id: String
        let name: String
        let online: Bool
        var state: State

        init?(_ row: MachineRow) {
            guard let update = row.binaryUpdate, let state = try? Wire.transcode(update, as: State.self) else { return nil }
            id = row.machineId
            name = Naming.machineLabel(row.hostname)
            online = row.status == "online"
            self.state = state
        }
    }

    /// The hub's id for a landing (updates/model.ts `landingId`).
    static func landingId(_ machineId: String, at: Double) -> String { "landed:\(machineId):\(Int64(at))" }

    private static func keeperRestartId(_ machineId: String, at: Double) -> String { "keeper:\(machineId):\(Int64(at))" }

    /// "0.9.2", "nightly 41" (updates/model.ts `displayVersion`).
    static func displayVersion(_ version: String?) -> String {
        let whole = version ?? ""
        let bare = whole.split(separator: "+", maxSplits: 1).first.map(String.init) ?? whole
        if let match = bare.firstMatch(of: /-nightly\.(\d+)$/) {
            return "nightly \(match.1)"
        }
        return bare
    }

    private static func plural(_ n: Int, _ noun: String) -> String { "\(n) \(noun)\(n == 1 ? "" : "s")" }

    private static func counted(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }

    /// core `holdPhrases`: `2 tool calls`, `1 image generation`.
    private static func holdWords(_ hold: Hold) -> String {
        let n = hold.ids.count
        switch hold.reason {
        case "custody": return "the takeover of this machine's sessions"
        case "starting": return counted(n, "session starting", "sessions starting")
        case "image": return counted(n, "image generation", "image generations")
        case "workspace": return counted(n, "workspace being set up or archived", "workspaces being set up or archived")
        case "command": return counted(n, "command running", "commands running")
        case "tool-call": return counted(n, "tool call", "tool calls")
        case "hub-tool-call": return counted(n, "tool call at the hub", "tool calls at the hub")
        case "write": return counted(n, "message being handed over", "messages being handed over")
        case "opencode": return counted(n, "OpenCode operation", "OpenCode operations")
        case "opencode-send": return counted(n, "session with messages not yet handed to OpenCode", "sessions with messages not yet handed to OpenCode")
        default: return counted(n, "piece of work", "pieces of work")
        }
    }

    /// What a ready build waits for: the work in flight its restart would cut.
    private static func waitsOn(_ state: State) -> [String] {
        state.phase == "ready" ? (state.waitingOn ?? []).map(holdWords) : []
    }

    private static func doneOn(_ state: State) -> Bool {
        state.availableVersion != nil && state.installedVersion == state.availableVersion
    }

    /// core `UPDATE_WAIT_CAP_MS`, in minutes.
    private static let waitCapMinutes = 30

    /// The release notes as lines: a section's name, then its items.
    private static func noteLines(_ notes: String?) -> [String] {
        (notes ?? "").split(separator: "\n").compactMap { raw -> String? in
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { return nil }
            if line.hasPrefix("#") { return line.drop { $0 == "#" }.trimmingCharacters(in: .whitespaces) }
            if let match = line.firstMatch(of: /^(?:[-*+]|\d+\.)\s+(.*)$/) { return "• \(match.1)" }
            return line
        }
    }

    private static func update(_ id: String, title: String, failed: Bool = false, lines: [String] = [], closing: String? = nil,
                               action: Action? = nil, machines: [UpdateMachine], acks: [String], landedAll: Bool = false) -> Notice {
        Notice(id: id, kind: .update(landedAll: landedAll), label: title, dismissLabel: "Dismiss the update notice", failed: failed,
               entries: [Entry(title: title, lines: lines)], closing: closing, action: action,
               machineIds: machines.map(\.id), acks: acks)
    }

    /// The one update notice, or none: first match wins (updates/model.ts
    /// `noticeFor`). This app is never a tab older than the dashboard, so the
    /// reload notices do not apply; installs it asked for are `commanded`.
    private static func noticeFor(_ all: [UpdateMachine], policy: Policy, commanded: Set<String>, seen: Set<String>) -> Notice? {
        // The machines, with every landing someone has acknowledged taken off.
        let machines = all.map { machine -> UpdateMachine in
            var unseen = machine
            if let landed = machine.state.landed, seen.contains(landingId(machine.id, at: landed.at)) { unseen.state.landed = nil }
            return unseen
        }
        let live = machines.filter(\.online).sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        let landingIds = { (list: [UpdateMachine]) -> [String] in
            list.compactMap { m -> String? in m.state.landed.map { landingId(m.id, at: $0.at) } }
        }
        let unlessSeen = { (notice: Notice?) -> Notice? in
            guard let notice, !notice.acks.allSatisfy({ seen.contains($0) }) else { return nil }
            return notice
        }

        // 1. A rollback nobody has seen.
        if let machine = live.first(where: { $0.state.landed?.outcome == "rolled-back" }) {
            let v = displayVersion(machine.state.landed?.version)
            let cur = displayVersion(machine.state.installedVersion)
            return update(landingIds([machine])[0], title: "CawCo \(v) did not install on \(machine.name)", failed: true,
                          lines: ["It did not start, so \(machine.name) went back to \(cur) and is running. It will not try \(v) again by itself."],
                          action: .retry, machines: [machine], acks: landingIds([machine]))
        }
        // 8. A machine's session keeper was restarted, or an earlier one removed.
        if let machine = live.first(where: { m in m.state.keeperRestart.map { !seen.contains(keeperRestartId(m.id, at: $0.at)) } ?? false }),
           let restart = machine.state.keeperRestart {
            let id = keeperRestartId(machine.id, at: restart.at)
            let silent = "It stopped answering for \(plural(max(1, Int((restart.silentForMs / 60000).rounded())), "minute")) (\(plural(restart.dials, "call")), no reply)"
            let retiring = restart.retiring == true
            return update(id, title: retiring ? "An earlier session keeper on \(machine.name) was removed" : "The session keeper on \(machine.name) was restarted",
                          failed: true, lines: [
                              retiring
                                  ? "\(silent). It was the keeper of an earlier build, still holding sessions after an update; new sessions were already starting on the current keeper, and still do."
                                  : "\(silent), so no session could start there. It was restarted and sessions start there again.",
                              "\(restart.children == 1 ? "The 1 process" : "The \(restart.children) processes") it held ended with it: the sessions running there stopped.",
                              "What it was doing is saved on \(machine.name) in \(restart.diagnostics).",
                          ], machines: [machine], acks: [id])
        }
        // 2. An install this device asked for, or the hub restarting under it.
        let inSet = live.filter { commanded.contains($0.id) || ($0.state.hostsHub && $0.state.phase == "installing") }
        let running = inSet.contains { m in
            (commanded.contains(m.id) && ["available", "downloading", "ready", "installing"].contains(m.state.phase))
                || (m.state.hostsHub && m.state.phase == "installing")
        }
        if running {
            let v = displayVersion(inSet.compactMap(\.state.availableVersion).first)
            let id = "installing:\(v):\(inSet.map(\.id).joined(separator: ","))"
            if !seen.contains(id) {
                var lines: [String] = []
                if inSet.count > 1 { lines.append("\(inSet.filter { doneOn($0.state) }.count) of \(inSet.count) machines done") }
                if inSet.count <= 3 {
                    lines += inSet.map { m -> String in
                        if doneOn(m.state) { return "✓ \(m.name)" }
                        if m.state.phase == "installing" { return "\(m.name) · restarting" }
                        if m.state.phase == "downloading" { return "\(m.name) · downloading" }
                        let waiting = waitsOn(m.state)
                        return waiting.isEmpty ? "· \(m.name) · waiting" : "· \(m.name) · waiting for \(waiting.joined(separator: ", "))"
                    }
                }
                let hub = inSet.first { $0.state.hostsHub && !doneOn($0.state) }
                return update(id, title: "Installing CawCo \(v)", lines: lines,
                              closing: hub.map { "The hub restarts with \($0.name). The app reconnects by itself." },
                              machines: inSet, acks: [id])
            }
        }
        // 3. Everything this device asked for has landed.
        let asked = live.filter { commanded.contains($0.id) }
        if !asked.isEmpty, asked.allSatisfy({ doneOn($0.state) }) {
            let v = displayVersion(asked[0].state.availableVersion)
            let acks = landingIds(asked)
            return update(acks.first ?? "landed-all:\(v)", title: "CawCo \(v) is running on \(plural(asked.count, "machine"))",
                          machines: asked, acks: acks, landedAll: true)
        }
        // 4. Auto-update is off and a build waits for a person.
        let waiting = live.filter { $0.state.phase == "available" }
        if !policy.autoUpdate, let lead = waiting.first {
            let v = displayVersion(lead.state.availableVersion)
            let id = "ready:\(waiting.count):\(v)"
            if let notice = unlessSeen(update(id, title: "CawCo \(v) is ready", lines: noteLines(lead.state.notes),
                                              closing: "Auto-update is off. It waits until you install it.",
                                              action: .installAll, machines: waiting, acks: [id])) {
                return notice
            }
        }
        // 5. Auto-update is on and work in flight holds machines back.
        let held = live.filter { !waitsOn($0.state).isEmpty }
        if policy.autoUpdate, let lead = held.first {
            let v = displayVersion(lead.state.availableVersion)
            let id = "ready:\(held.count):\(v)"
            let closing = "Each machine installs it once its work in flight ends, within \(waitCapMinutes) minutes. Turns keep running through it. \(held.count) \(held.count == 1 ? "is" : "are") waiting now."
            if let notice = unlessSeen(update(id, title: "CawCo \(v) is ready", lines: noteLines(lead.state.notes), closing: closing,
                                              machines: held, acks: [id])) {
                return notice
            }
        }
        // 6. A build landed that nobody has acknowledged.
        let landed = live.filter { $0.state.landed?.outcome == "installed" }
        if let landing = landed.first?.state.landed {
            let acks = landingIds(landed)
            return update(acks[0], title: "CawCo updated to \(displayVersion(landing.version))", lines: noteLines(landing.notes),
                          machines: landed, acks: acks)
        }
        return nil
    }

    // MARK: Moved logins (MovedLogins.svelte)

    private nonisolated struct Account: Decodable {
        let id: String
        let kind: String?
        let label: String?
        let email: String?
    }

    private nonisolated struct Signin: Decodable {
        let accountId: String
        let machineId: String
        let movedAt: Double?
        let movedFrom: String?
    }

    /// An account as the operator knows it (accounts/model.svelte.ts `nameOf`).
    private static func name(_ account: Account) -> String {
        if account.kind == "api_key", account.label == nil, let email = account.email {
            return "••••" + String(email.replacingOccurrences(of: "…", with: "").suffix(4))
        }
        return account.label ?? account.email ?? "an account not signed in yet"
    }

    private static let storeWords = ["claude": "Claude Code", "pi": "pi", "opencode": "OpenCode"]

    /// Every login moved in from a machine's own store nobody has acknowledged, newest first, as one row.
    private static func movedLogins(_ accounts: [Account], signins: [Signin], machines: [MachineRow], seen: Set<String>) -> Notice? {
        let moved = signins.compactMap { signin -> (id: String, at: Double, entry: Entry)? in
            guard let movedAt = signin.movedAt,
                  let account = accounts.first(where: { $0.id == signin.accountId }),
                  let from = machines.first(where: { $0.machineId == signin.machineId }) else { return nil }
            let id = "moved-login:\(account.id):\(signin.machineId):\(Int64(movedAt))"
            guard !seen.contains(id) else { return nil }
            let store = storeWords[signin.movedFrom ?? "claude"] ?? "Claude Code"
            return (id, movedAt, Entry(title: name(account), lines: ["from \(store) on \(Naming.machineLabel(from.hostname))"]))
        }.sorted { $0.at > $1.at }
        guard let first = moved.first else { return nil }
        return Notice(id: first.id, kind: .movedLogins, label: "Logins moved into CawCo", dismissLabel: "Dismiss moved logins",
                      failed: false, entries: moved.map(\.entry), closing: nil, action: nil, machineIds: [], acks: moved.map(\.id))
    }

    // MARK: Rebalances (RebalanceNotices.svelte, core `rebalanceWords`)

    private nonisolated struct Named: Decodable {
        let name: String
    }

    private nonisolated struct Came: Decodable {
        let account: Named
        let how: String
    }

    private nonisolated struct Running: Decodable {
        let from: Named
        let organization: String?
        let runsOutAt: Double
        let to: Named
        let cacheKept: Bool
        let moved: Int
        let left: Int
    }

    private nonisolated struct Cost: Decodable {
        let pct: Double
        let window: String
    }

    private nonisolated struct HeldMove: Decodable {
        let to: Named
        let tokens: Double?
        let cacheKept: Bool
        let cost: Cost?
    }

    private nonisolated struct Held: Decodable {
        let from: Named
        let moved: [HeldMove]
        let continued: Int
        let waiting: [Double?]
    }

    private nonisolated struct Rebalance: Decodable {
        let id: String
        let at: Double
        let machine: String
        let came: [Came]
        let running: [Running]
        let held: [Held]
    }

    /// Every pass nobody has acknowledged, newest first, as one row.
    private static func rebalanced(_ passes: [Rebalance]) -> Notice? {
        let sorted = passes.sorted { $0.at > $1.at }
        guard let first = sorted.first else { return nil }
        let entries = sorted.map { pass in
            Entry(title: "\(cameWords(pass.came)) on \(pass.machine)", lines: pass.running.map(runningLine) + pass.held.map(heldLine))
        }
        return Notice(id: first.id, kind: .rebalances, label: "Sessions rebalanced", dismissLabel: "Dismiss rebalance notices",
                      failed: false, entries: entries, closing: nil, action: nil, machineIds: [], acks: sorted.map(\.id))
    }

    private static func cameWords(_ came: [Came]) -> String {
        let added = came.filter { $0.how == "added" }.map(\.account.name)
        let back = came.filter { $0.how == "back" }.map(\.account.name)
        var parts: [String] = []
        if !added.isEmpty { parts.append("\(sentence(added)) added") }
        if !back.isEmpty { parts.append("\(sentence(back)) back from \(back.count == 1 ? "its" : "their") bench") }
        return parts.joined(separator: ", ")
    }

    private static func thousands(_ tokens: Double?) -> String {
        tokens.map { "\(Int(($0 / 1000).rounded()))k" } ?? "its whole context"
    }

    /// core `clockWords`: "20:10", 24-hour, local time.
    private static func clockWords(_ at: Double) -> String {
        Date(timeIntervalSince1970: at / 1000).formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).locale(Locale(identifier: "en_GB")))
    }

    private static func runningLine(_ group: Running) -> String {
        let on = group.organization.map { "\(group.from.name) (\($0))" } ?? group.from.name
        let why = group.cacheKept ? "cache shared" : "re-read on the move"
        let left = group.left > 0 ? "; \(group.left) not yet (mid-turn)" : ""
        return "\(counted(group.moved + group.left, "session", "sessions")) on \(on) forecast to run out at \(clockWords(group.runsOutAt)); \(group.moved) moved to \(group.to.name) between turns (\(why))\(left)"
    }

    private static func heldMoveWords(_ one: HeldMove) -> String {
        if one.cacheKept { return "\(thousands(one.tokens)) to \(one.to.name), cache kept" }
        if let cost = one.cost {
            return "\(thousands(one.tokens)) re-read ≈ \(max(1, Int(cost.pct.rounded())))% of \(one.to.name)'s \(cost.window) window"
        }
        return "\(thousands(one.tokens)) re-read on \(one.to.name)"
    }

    private static func heldLine(_ group: Held) -> String {
        let total = group.moved.count + group.continued + group.waiting.count
        var parts: [String] = []
        if !group.moved.isEmpty { parts.append("\(group.moved.count) moved (\(group.moved.map(heldMoveWords).joined(separator: "; ")))") }
        if group.continued > 0 { parts.append("\(group.continued) continued from a summary") }
        if !group.waiting.isEmpty {
            parts.append("\(group.waiting.count) kept waiting (\(group.waiting.map(thousands).joined(separator: ", ")); shrink at the limit)")
        }
        return "\(total) held \(total == 1 ? "session" : "sessions") on \(group.from.name) re-decided: \(parts.joined(separator: ", "))"
    }

    /// "a", "a and b", "a, b and c".
    private static func sentence(_ names: [String]) -> String {
        guard names.count > 1, let last = names.last else { return names.first ?? "" }
        return "\(names.dropLast().joined(separator: ", ")) and \(last)"
    }
}
