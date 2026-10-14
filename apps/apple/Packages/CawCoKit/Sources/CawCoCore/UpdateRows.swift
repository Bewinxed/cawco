import CawCoAPI
import Foundation

/// One machine's Update cell in Configure › Updates (updates/model.ts
/// `Cell`): the words, how they are drawn, and the buttons that go with them.
public struct UpdateCell: Equatable, Sendable {
    public enum Button: Sendable { case retry, error, cancel, install }
    public enum Icon: Sendable { case clock, download, spinner }

    /// Which row of the spec's table matched.
    public let row: Int
    public var text = ""
    /// Plain muted words with no badge (`Runs from source`).
    public var plain = false
    /// A failure: the destructive badge with the error dot.
    public var fail = false
    public var icon: Icon?
    /// A second line under the words.
    public var meta: String?
    public var buttons: [Button] = []
}

/// One section of a release's notes: `### New`, `### Improved`, `### Fixed`, or none.
public struct ReleaseNoteSection: Equatable, Sendable {
    public let heading: String?
    public let items: [String]
}

/// What the update screens say, as pure functions of what the hub reports
/// (updates/model.ts): the Update cell of a machine, the Running cell, the
/// rail's count, and a release's notes.
public enum UpdateRows {
    nonisolated struct Keeper: Decodable {
        let version: String
        let sessions: Int
    }

    nonisolated struct Landing: Decodable {
        let at: Double
        let outcome: String
    }

    nonisolated struct State: Decodable {
        let phase: String
        let installedVersion: String
        let availableVersion: String?
        let failedVersion: String?
        let heldChildren: Int?
        let waitingOn: [Notice.Hold]?
        let retiringKeepers: [Keeper]?
        let error: String?
        let landed: Landing?
    }

    static func state(_ machine: MachineRow) -> State? {
        guard let update = machine.binaryUpdate else { return nil }
        return try? Wire.transcode(update, as: State.self)
    }

    static func isOnline(_ machine: MachineRow) -> Bool { machine.status == "online" }

    /// A version as people read it: no build suffix, and a nightly as `nightly 412`.
    public static func displayVersion(_ version: String) -> String { Notice.displayVersion(version) }

    private static func words(_ parts: String...) -> String { parts.filter { !$0.isEmpty }.joined(separator: " ") }

    private static func channelName(_ channel: Components.Schemas.BinaryUpdatePolicyChannel) -> String {
        channel == .nightly ? "Nightly" : "Stable"
    }

    /// A keeper handover still under way, in words; empty when none is.
    private static func handingOver(_ state: State) -> String {
        (state.retiringKeepers ?? []).map {
            "Session keeper handing over: \(Notice.plural($0.sessions, "session")) left on \(displayVersion($0.version))"
        }.joined(separator: " · ")
    }

    /// What a ready build waits for: the work in flight its restart would cut.
    private static func waitsOn(_ state: State) -> [String] {
        state.phase == "ready" ? (state.waitingOn ?? []).map(Notice.holdWords) : []
    }

    /// The cell a machine's Update column shows. First match wins.
    public static func cell(_ machine: MachineRow, policy: Components.Schemas.BinaryUpdatePolicy) -> UpdateCell {
        guard isOnline(machine) else { return UpdateCell(row: 1) }
        guard let state = state(machine) else { return UpdateCell(row: 2, text: "Runs from source", plain: true) }
        let v = state.availableVersion.map(displayVersion) ?? ""
        let current = displayVersion(state.installedVersion)
        switch state.phase {
        case "failed-rolled-back":
            return UpdateCell(row: 3, text: "\(state.failedVersion.map(displayVersion) ?? "The update") did not start. Rolled back to \(current), which is running.",
                              fail: true, buttons: [.retry, .error])
        case "failed":
            return UpdateCell(row: 4, text: v.isEmpty ? "The update did not install. It retries by itself." : "\(v) did not install. It retries by itself.",
                              fail: true, buttons: [.error])
        case "installing":
            return UpdateCell(row: 5, text: words("Installing", v), icon: .spinner)
        case "downloading":
            return UpdateCell(row: 6, text: words("Downloading", v), icon: .spinner)
        case "ready":
            let waiting = waitsOn(state)
            return UpdateCell(row: 7, text: words(v, waiting.isEmpty ? "installs within a minute" : "installs when its work in flight ends"),
                              icon: .clock, meta: waiting.isEmpty ? nil : waiting.joined(separator: " · "),
                              buttons: policy.autoUpdate ? [] : [.cancel])
        case "waiting-sessions":
            if state.installedVersion == state.availableVersion { return newest(8, state) }
            let held = state.heldChildren ?? 0
            return UpdateCell(row: 9, text: words(v, "installs when \(held) \(held == 1 ? "session ends" : "sessions end")"), icon: .clock)
        case "waiting-for-channel":
            return UpdateCell(row: 10, text: "Stays on \(current) until \(channelName(policy.channel)) has a newer build", icon: .clock)
        case "available":
            return UpdateCell(row: 11, text: words(v, "available"), icon: .download, buttons: [.install])
        default:
            return newest(12, state)
        }
    }

    /// Rows 8 and 12, the build is the newest there is: blank, or the keeper handover still under way.
    private static func newest(_ row: Int, _ state: State) -> UpdateCell {
        let text = handingOver(state)
        return UpdateCell(row: row, text: text, plain: !text.isEmpty)
    }

    /// The build is the newest there is: rows 8 and 12 of the table.
    public static func isCurrent(_ machine: MachineRow) -> Bool {
        guard isOnline(machine), machine.binaryUpdate != nil else { return false }
        let row = cell(machine, policy: .init(autoUpdate: true, channel: .stable)).row
        return row == 8 || row == 12
    }

    /// What the Running cell says: the version, or the commit of a source checkout, or a dash.
    public static func running(_ machine: MachineRow) -> String {
        guard isOnline(machine) else { return "—" }
        if let state = state(machine) { return displayVersion(state.installedVersion) }
        return machine.build?.commit.map { String($0.prefix(7)) } ?? "—"
    }

    /// The machine's whole update error, for "Read the error".
    public static func error(_ machine: MachineRow) -> String? { state(machine)?.error }

    /// The phases an update is under way or failed in (MachinesList.svelte `MOVING`).
    private static let moving: Set = ["ready", "downloading", "installing", "waiting-sessions", "failed", "failed-rolled-back"]

    /// What a machine's row says of its update (MachinesList.svelte
    /// `updateOf`): the Update cell's words while one is under way or failed,
    /// on the machine's word; nil otherwise, or before the policy is read.
    public static func underWay(_ machine: MachineRow, policy: Components.Schemas.BinaryUpdatePolicy?) -> UpdateCell? {
        guard let policy, isOnline(machine), let phase = state(machine)?.phase, moving.contains(phase) else { return nil }
        return cell(machine, policy: policy)
    }

    /// A build waits for the person to install it (MachineMenu.svelte's "Install update now").
    public static func installableNow(_ machine: MachineRow) -> Bool {
        isOnline(machine) && state(machine)?.phase == "available"
    }

    /// Machines waiting on the operator: a failed update, or (auto-update off) one to install. Updates' rail badge.
    public static func attention(_ machines: [MachineRow], policy: Components.Schemas.BinaryUpdatePolicy) -> Int {
        machines.filter { machine in
            let row = cell(machine, policy: policy).row
            return row == 3 || row == 4 || (row == 11 && !policy.autoUpdate)
        }.count
    }

    /// The machines with an update to install now (row 11).
    public static func installable(_ machines: [MachineRow], policy: Components.Schemas.BinaryUpdatePolicy) -> [MachineRow] {
        machines.filter { cell($0, policy: policy).row == 11 }
    }

    /// The landings the machines carry, as the hub's notice ids: a person on Updates has seen them.
    public static func landingIds(_ machines: [MachineRow]) -> [String] {
        machines.compactMap { machine in state(machine)?.landed.map { Notice.landingId(machine.machineId, at: $0.at) } }
    }

    /// The machines as Updates lists them: by hostname (rail.svelte.ts
    /// `orderMachines`, which this app keeps no arrangement for).
    public static func ordered(_ machines: [MachineRow]) -> [MachineRow] {
        machines.sorted { $0.hostname.localizedStandardCompare($1.hostname) == .orderedAscending }
    }

    /// Splits a release's notes at their headings (docs/releases/README.md):
    /// each heading opens a section, each other line is one bullet of it.
    public static func notes(_ text: String?) -> [ReleaseNoteSection] {
        var sections: [(heading: String?, items: [String])] = []
        for raw in (text ?? "").split(separator: "\n", omittingEmptySubsequences: false) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { continue }
            if let heading = line.firstMatch(of: /^#{1,6}\s+(.+?)\s*#*$/) {
                sections.append((String(heading.1), []))
                continue
            }
            if sections.isEmpty { sections.append((nil, [])) }
            sections[sections.count - 1].items.append(line.replacing(/^(?:[-*+]|\d+\.)\s+/, with: ""))
        }
        return sections.filter { !$0.items.isEmpty }.map { ReleaseNoteSection(heading: $0.heading, items: $0.items) }
    }
}
