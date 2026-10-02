import Foundation
import Observation

/// What the home says, as the web's home model says it
/// (apps/dashboard/src/lib/cawco/home/home.svelte.ts and WorkTabs.svelte):
/// Needs you (longest wait first), Working, Finished, Recent, and the rows of
/// each tab grouped by machine with delegates nested under their parent.
@MainActor
@Observable
public final class HomeModel {
    public enum Tab: String, CaseIterable, Sendable {
        case working, finished

        public var label: String {
            switch self {
            case .working: "Working"
            case .finished: "Finished"
            }
        }
    }

    /// Rows a machine lists before "Show N more".
    public static let moreAt = 8

    private let hub: HubConnection
    private var fleet: FleetStore { hub.fleet }
    private var needsStore: NeedsYouStore { hub.needs }

    /// The minute-grained now every age reads, ticking every 15 s.
    public private(set) var now = Date.now.timeIntervalSince1970 * 1000
    @ObservationIgnored private var ticker: Task<Void, Never>?
    /// When each working session joined Working this stint.
    @ObservationIgnored private var enteredWorking: [String: Double] = [:]

    public var tab: Tab {
        didSet { UserDefaults.standard.set(tab.rawValue, forKey: Keys.tab) }
    }
    /// Work other sessions started is listed on its own only on request.
    public var delegates: Bool {
        didSet { UserDefaults.standard.set(delegates, forKey: Keys.delegates) }
    }
    /// Parents whose delegates are open under them.
    public private(set) var openTrees: Set<String>
    /// Machines a tab shows in full, past its first `moreAt`.
    public private(set) var shownWhole: [Tab: Set<String>]
    /// The Recent disclosure is open.
    public var recentOpen: Bool {
        didSet { UserDefaults.standard.set(recentOpen, forKey: Keys.recentOpen) }
    }

    private enum Keys {
        static let tab = "cawco-home-tab"
        static let delegates = "cawco-delegates"
        static let openTrees = "cawco-open-trees"
        static let whole = "cawco-home-tab-all"
        static let recentOpen = "cawco-home-recent-open"
    }

    public init(hub: HubConnection) {
        self.hub = hub
        let defaults = UserDefaults.standard
        tab = Tab(rawValue: defaults.string(forKey: Keys.tab) ?? "") ?? .working
        delegates = defaults.bool(forKey: Keys.delegates)
        openTrees = Set(defaults.stringArray(forKey: Keys.openTrees) ?? [])
        recentOpen = defaults.bool(forKey: Keys.recentOpen)
        let whole = defaults.dictionary(forKey: Keys.whole) as? [String: [String]] ?? [:]
        shownWhole = [.working: Set(whole["working"] ?? []), .finished: Set(whole["finished"] ?? [])]
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                self?.now = Date.now.timeIntervalSince1970 * 1000
            }
        }
    }

    // MARK: State

    /// The hub is live: only then can an empty group be believed.
    public var live: Bool { hub.state == .connected }

    /// The first full read is in, or the hub is known to be unreachable.
    public var ready: Bool {
        hub.state == .unreachable || (fleet.fleetRead && fleet.liveRead && fleet.catalogsRead)
    }

    /// Machines that have not answered yet; until none, an empty list proves nothing.
    public var waitingOn: [MachineRow] {
        fleet.machines.filter { machine in
            machine.status != "online" || !fleet.catalogsTried.contains(machine.machineId)
                || fleet.rows.contains { $0.machineId == machine.machineId && $0.isListed && $0.isStale }
        }
    }

    public func activity(_ id: String) -> Activity {
        if needsStore.blocked(id) {
            return .blocked
        }
        switch fleet.pulses[id]?.activity {
        case .working: return .working
        case .blocked: return .blocked
        case .idle, nil: return .idle
        }
    }

    // MARK: Groups

    public struct NeedsItem: Identifiable {
        public var id: String { "\(ask.instanceId):\(ask.requestId)" }
        public let ask: ParkedAsk
        public let machineId: String
        public let title: String
        /// machine · project
        public let place: String
    }

    /// Every ask parked on the operator, longest wait first.
    public var needs: [NeedsItem] {
        var items: [NeedsItem] = []
        for (instanceId, asks) in needsStore.parked {
            let row = fleet.byId[instanceId]
            // A session the hub holds as not live has nothing left to answer to.
            if let row, !row.isLive {
                continue
            }
            for ask in asks where ask.routedTo != "parent" {
                let machineId = row?.machineId ?? ""
                items.append(NeedsItem(
                    ask: ask,
                    machineId: machineId,
                    title: row.map(fleet.title) ?? fleet.machineName(machineId),
                    place: fleet.placeOf(machineId, row?.cwd)
                ))
            }
        }
        return items.sorted { ($0.ask.raisedAt ?? .infinity, $0.id) < ($1.ask.raisedAt ?? .infinity, $1.id) }
    }

    /// Every session mid-turn, ordered by when it joined Working, newest first.
    public var working: [InstanceRow] {
        let rows = fleet.rows.filter { $0.isLive && activity($0.id) == .working }
        let present = Set(rows.map(\.id))
        for id in enteredWorking.keys where !present.contains(id) {
            enteredWorking[id] = nil
        }
        for row in rows where enteredWorking[row.id] == nil {
            enteredWorking[row.id] = fleet.turnSince[row.id] ?? now
        }
        return rows.sorted {
            let a = enteredWorking[$0.id] ?? now
            let b = enteredWorking[$1.id] ?? now
            return a != b ? a > b : $0.id < $1.id
        }
    }

    /// When a session last ended: its failure, else the end of its turn; nil while it works or waits.
    private func endedAt(_ row: InstanceRow) -> Double? {
        if row.isFailed {
            return fleet.lastAt(row)
        }
        return activity(row.id) == .idle ? fleet.pulses[row.id]?.at : nil
    }

    /// It ended after the owner last saw it, on any device.
    public func endedUnseen(_ row: InstanceRow) -> Bool {
        guard let ended = endedAt(row) else {
            return false
        }
        return ended > row.seenMs
    }

    /// Every session that ended since it was last opened, the latest to end first.
    public var finished: [InstanceRow] {
        fleet.rows.filter { $0.isListed && endedUnseen($0) }.sorted { fleet.lastAt($0) > fleet.lastAt($1) }
    }

    public struct RecentItem: Identifiable {
        public let id: String
        public let instance: InstanceRow?
        /// The session its mark's sprite is keyed by, and where it runs, for its hue.
        public let markId: String
        public let markPlace: String
        public let machineId: String
        public let title: String
        public let place: String
        public let at: Double
    }

    /// Everything else that can be opened: idle and sleeping sessions, and the stored transcripts.
    public var recent: [RecentItem] {
        var shown = Set(working.map(\.id))
        shown.formUnion(finished.map(\.id))
        shown.formUnion(needs.map(\.ask.instanceId))
        let live = fleet.rows.filter { row in
            (delegates || row.parentInstanceId == nil) && row.isListed && !shown.contains(row.id)
                && (activity(row.id) == .idle || row.isResumable || row.isStale || row.isFailed)
        }.map { row in
            RecentItem(
                id: row.id, instance: row, markId: row.id, markPlace: row.cwd.isEmpty ? row.machineId : row.cwd,
                machineId: row.machineId, title: fleet.title(row), place: fleet.placeOf(row.machineId, row.cwd), at: fleet.lastAt(row)
            )
        }
        let running = Set(fleet.rows.filter(\.isListed).compactMap(\.sessionId))
        let stored = fleet.machines.flatMap { machine in
            fleet.catalog(machine.machineId).filter { !running.contains($0.sessionId) }.map { info in
                RecentItem(
                    id: "\(machine.machineId):\(info.sessionId)",
                    instance: nil,
                    markId: info.sessionId,
                    markPlace: info.cwd ?? machine.machineId,
                    machineId: machine.machineId,
                    title: storedTitle(info, machineId: machine.machineId),
                    place: fleet.placeOf(machine.machineId, info.cwd),
                    at: info.lastModified
                )
            }
        }
        return (live + stored).sorted { $0.at > $1.at }
    }

    private func storedTitle(_ info: StoredSession, machineId: String) -> String {
        let row = fleet.rows
            .filter { $0.sessionId == info.sessionId && $0.machineId == machineId && $0.cwd == info.cwd }
            .max { $0.updatedMs < $1.updatedMs }
        let named = (row?.titleSource != nil ? row?.title : nil) ?? info.customTitle ?? info.summary
        return Naming.sessionTitle(title: named, firstMessage: info.firstPrompt, cwd: info.cwd, id: info.sessionId)
    }

    public func fleetTitle(_ row: InstanceRow) -> String {
        fleet.title(row)
    }

    // MARK: A tab's tree

    private func all(_ tab: Tab) -> [InstanceRow] {
        tab == .working ? working : finished
    }

    /// A tab's own rows: delegates under a listed parent fold into its count;
    /// one whose parent the tab does not list only with the switch on, or when it failed.
    public func rows(_ tab: Tab) -> [InstanceRow] {
        let rows = all(tab)
        if delegates {
            return rows
        }
        let kept = Set(rooted(rows).map(\.id))
        return rows.filter { kept.contains($0.id) || $0.isFailed }
    }

    public func lines(_ tab: Tab) -> [TreeLine<InstanceRow>] {
        tree(rows(tab), anchor: tab == .working ? .last : .first, context: { self.fleet.byId[$0] })
    }

    public struct Line: Identifiable {
        public var id: String { line.row.id }
        public let line: TreeLine<InstanceRow>
        /// The rows folded under it, when it is a parent.
        public let fold: Fold?
    }

    public struct Fold {
        public let count: Int
        public let failed: Int
        public let open: Bool
    }

    public struct MachineGroup: Identifiable {
        public var id: String { machineId }
        public let machineId: String
        public let name: String
        public let os: String
        public let lines: [Line]
        /// "Show N more", with the failures in the trees it keeps folded away; or "Show fewer".
        public let more: (words: String, failed: Int)?
    }

    /// A tab's lines by machine, each session followed by its delegates under
    /// the machine its top-level session runs on, capped at `moreAt` trees.
    public func groups(_ tab: Tab) -> [MachineGroup] {
        let lines = lines(tab)
        let visible = collapse(lines) { self.openTrees.contains($0) }
        var order: [String] = []
        var byMachine: [String: [TreeLine<InstanceRow>]] = [:]
        var top = ""
        for line in visible {
            if line.depth == 0 {
                top = line.row.machineId
                if byMachine[top] == nil {
                    order.append(top)
                }
            }
            byMachine[top, default: []].append(line)
        }
        let whole = shownWhole[tab] ?? []
        return order.sorted { fleet.machineOrder($0) < fleet.machineOrder($1) }.map { machineId in
            let all = byMachine[machineId] ?? []
            let tops = all.filter { $0.depth == 0 }
            var shown = all
            if !whole.contains(machineId) {
                var room = Self.moreAt
                shown = []
                for line in all {
                    if line.depth == 0 {
                        if room == 0 {
                            break
                        }
                        room -= 1
                    }
                    shown.append(line)
                }
            }
            let hidden = tops.dropFirst(Self.moreAt)
            var more: (String, Int)?
            if !hidden.isEmpty {
                let topIds = Set(hidden.map(\.row.id))
                let failed = lines.filter { line in topIds.contains(line.row.id) }
                    .flatMap { $0.context ? $0.descendants : [$0.row] + $0.descendants }
                    .filter(\.isFailed).count
                more = whole.contains(machineId) ? ("Show fewer", 0) : ("Show \(hidden.count) more", failed)
            }
            let machine = fleet.machines.first { $0.machineId == machineId }
            return MachineGroup(
                machineId: machineId,
                name: fleet.machineName(machineId),
                os: machine?.os ?? "",
                lines: shown.map { line in
                    Line(line: line, fold: line.descendants.isEmpty ? nil : Fold(
                        count: line.descendants.count,
                        failed: line.descendants.filter(\.isFailed).count,
                        open: openTrees.contains(line.row.id)
                    ))
                },
                more: more
            )
        }
    }

    /// The row's meta line: its project, then what it is doing, or why it failed.
    public func meta(_ row: InstanceRow, tab: Tab, group: String) -> String {
        var said = [fleet.projectOf(row.machineId, row.cwd)]
        switch tab {
        case .working:
            if let tool = fleet.pulses[row.id]?.currentTool {
                said.append("\(tool.name) \(tool.glance)".trimmingCharacters(in: .whitespaces))
            }
        case .finished:
            if row.isFailed {
                said.append(row.lastError.map { "failed: \($0)" } ?? "failed")
            }
        }
        let line = said.filter { !$0.isEmpty }.joined(separator: " · ")
        return row.machineId == group ? line : "\(fleet.machineName(row.machineId)) · \(line)"
    }

    /// The row's age: how long its turn has run, or how long ago it ended.
    public func age(_ row: InstanceRow, tab: Tab) -> String {
        switch tab {
        case .working:
            fleet.turnSince[row.id].map { Naming.span(ms: now - $0) } ?? ""
        case .finished:
            Naming.span(ms: now - fleet.lastAt(row))
        }
    }

    public func toggleTree(_ id: String) {
        if openTrees.contains(id) {
            openTrees.remove(id)
        } else {
            openTrees.insert(id)
        }
        UserDefaults.standard.set(Array(openTrees), forKey: Keys.openTrees)
    }

    public func toggleWhole(_ machineId: String, in tab: Tab) {
        var set = shownWhole[tab] ?? []
        if set.contains(machineId) {
            set.remove(machineId)
        } else {
            set.insert(machineId)
        }
        shownWhole[tab] = set
        UserDefaults.standard.set(
            ["working": Array(shownWhole[.working] ?? []), "finished": Array(shownWhole[.finished] ?? [])],
            forKey: Keys.whole
        )
    }

    /// What the status line says while live: today's spend across the
    /// sessions this device has cost readings for (none, until a session is
    /// opened here, as on the web).
    public var spend: Double { 0 }
}
