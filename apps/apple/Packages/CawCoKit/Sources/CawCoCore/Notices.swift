import Foundation

/// Something the fleet tells the operator once, kept by the hub until a person
/// acknowledges it on any device (notices.svelte.ts): an update that landed
/// (updates/model.ts `updatedNotice`), a login moved into CawCo
/// (accounts/model.svelte.ts `movedLogins`), or what adding an account set
/// moving (`rebalancesUnseen`, core `rebalanceWords`). Caw's panel lists them
/// under Needs you, each with its ✕.
public struct Notice: Identifiable, Equatable, Sendable {
    public enum Kind: String, Sendable {
        case update, movedLogin, rebalance
    }

    public let id: String
    public let kind: Kind
    public let title: String
    /// What it says under its title, a line each.
    public let lines: [String]
    /// The notice ids its ✕ acknowledges.
    public let acks: [String]
    /// When it happened, ms epoch.
    public let at: Double

    /// Every notice nobody has acknowledged: the update first, then moved
    /// logins and rebalances, newest first.
    static func unseen(machines: [MachineRow], accounts: Components.Schemas.GetApiAccounts200?, seen: Set<String>) -> [Notice] {
        var out: [Notice] = []
        if let update = updated(machines, seen: seen) { out.append(update) }
        // Only the parts a notice reads: the view also carries every model catalog.
        guard let accounts,
              let people = try? Wire.transcode(accounts.accounts, as: [Account].self),
              let signins = try? Wire.transcode(accounts.signins, as: [Signin].self) else { return out }
        let view = AccountsRead(accounts: people, signins: signins,
                                rebalances: (try? Wire.transcode(accounts.rebalances, as: [Rebalance]?.self)) ?? nil)
        out += movedLogins(view, machines: machines, seen: seen)
        out += (view.rebalances ?? []).filter { !seen.contains($0.id) }.sorted { $0.at > $1.at }.map(rebalance)
        return out
    }

    // MARK: The update

    private nonisolated struct Landing: Decodable {
        let at: Double
        let outcome: String
        let version: String
    }

    private nonisolated struct UpdateState: Decodable {
        let landed: Landing?
    }

    /// The hub's id for a landing (updates/model.ts `landingId`).
    static func landingId(_ machineId: String, at: Double) -> String {
        "landed:\(machineId):\(Int64(at))"
    }

    /// The build every online machine installed and nobody has acknowledged:
    /// "CawCo updated to 0.9.2", on which machines.
    private static func updated(_ machines: [MachineRow], seen: Set<String>) -> Notice? {
        let landed: [(MachineRow, Landing)] = machines.compactMap { machine -> (MachineRow, Landing)? in
            guard machine.status == "online", let state = machine.binaryUpdate,
                  let landing = (try? Wire.transcode(state, as: UpdateState.self))?.landed,
                  landing.outcome == "installed", !seen.contains(landingId(machine.machineId, at: landing.at)) else { return nil }
            return (machine, landing)
        }.sorted { $0.0.hostname.localizedStandardCompare($1.0.hostname) == .orderedAscending }
        guard let lead = landed.first?.1 else { return nil }
        let names = landed.map { Naming.machineLabel($0.0.hostname) }
        let acks = landed.map { landingId($0.0.machineId, at: $0.1.at) }
        return Notice(id: acks[0], kind: .update, title: "CawCo updated to \(displayVersion(lead.version))",
                      lines: ["On \(sentence(names))"], acks: acks, at: lead.at)
    }

    /// "0.9.2", "nightly 41" (updates/model.ts `displayVersion`).
    static func displayVersion(_ version: String) -> String {
        let bare = version.split(separator: "+", maxSplits: 1).first.map(String.init) ?? version
        if let match = bare.firstMatch(of: /-nightly\.(\d+)$/) {
            return "nightly \(match.1)"
        }
        return bare
    }

    // MARK: Accounts

    private nonisolated struct AccountsRead {
        let accounts: [Account]
        let signins: [Signin]
        let rebalances: [Rebalance]?
    }

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

    /// Each login moved in from a machine's own store, newest first.
    private static func movedLogins(_ view: AccountsRead, machines: [MachineRow], seen: Set<String>) -> [Notice] {
        view.signins.compactMap { signin -> Notice? in
            guard let movedAt = signin.movedAt,
                  let account = view.accounts.first(where: { $0.id == signin.accountId }),
                  let from = machines.first(where: { $0.machineId == signin.machineId }) else { return nil }
            let id = "moved-login:\(account.id):\(signin.machineId):\(Int64(movedAt))"
            guard !seen.contains(id) else { return nil }
            let store = storeWords[signin.movedFrom ?? "claude"] ?? "Claude Code"
            return Notice(id: id, kind: .movedLogin, title: "\(name(account)) moved into CawCo",
                          lines: ["From \(store) on \(Naming.machineLabel(from.hostname))"], acks: [id], at: movedAt)
        }.sorted { $0.at > $1.at }
    }

    // MARK: Rebalances

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

    /// core `rebalanceWords`: "design@ added on obelisk", then a line per thing it did.
    private static func rebalance(_ notice: Rebalance) -> Notice {
        let lines = notice.running.map(runningLine) + notice.held.map(heldLine)
        return Notice(id: notice.id, kind: .rebalance, title: "\(cameWords(notice.came)) on \(notice.machine)",
                      lines: lines, acks: [notice.id], at: notice.at)
    }

    private static func cameWords(_ came: [Came]) -> String {
        let added = came.filter { $0.how == "added" }.map(\.account.name)
        let back = came.filter { $0.how == "back" }.map(\.account.name)
        var parts: [String] = []
        if !added.isEmpty { parts.append("\(sentence(added)) added") }
        if !back.isEmpty { parts.append("\(sentence(back)) back from \(back.count == 1 ? "its" : "their") bench") }
        return parts.joined(separator: ", ")
    }

    private static func sessionsWords(_ n: Int) -> String { "\(n) session\(n == 1 ? "" : "s")" }

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
        return "\(sessionsWords(group.moved + group.left)) on \(on) forecast to run out at \(clockWords(group.runsOutAt)); \(group.moved) moved to \(group.to.name) between turns (\(why))\(left)"
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
