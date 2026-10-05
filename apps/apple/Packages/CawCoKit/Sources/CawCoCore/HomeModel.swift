import Foundation
import Observation

/// What the home says, as the web's home model says it
/// (apps/dashboard/src/lib/cawco/home/home-state.svelte.ts and WorkTabs.svelte):
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

    public func stop() { ticker?.cancel(); ticker = nil }

    // MARK: State

    /// The hub is live: only then can an empty group be believed.
    public var live: Bool { hub.state == .connected }

    /// The first full read is in (machines, sessions, runs, every online
    /// machine's stored sessions and the socket's own snapshot), or the hub is
    /// known to be unreachable.
    public var ready: Bool {
        hub.state == .unreachable || (fleet.fleetRead && fleet.liveRead && fleet.runsRead && fleet.catalogsRead)
    }

    /// Machines that have not answered yet; until none, an empty list proves nothing.
    public var waitingOn: [MachineRow] {
        fleet.machines.filter { machine in
            machine.status != "online" || !fleet.catalogsTried.contains(machine.machineId)
                || fleet.rows.contains { $0.machineId == machine.machineId && $0.isListed && $0.isStale }
        }
    }

    /// What a session needs from the operator: a run's own word, a parked
    /// ask before anything else, then the daemon's pulse.
    public func activity(_ id: String) -> Activity {
        if let run = fleet.run(id) {
            return run.activity
        }
        if needsStore.blocked(id) || fleet.activityPulse(id)?.activity == .blocked {
            return .blocked
        }
        if let count = fleet.byId[id]?.runningDelegates, count > 0 {
            return .working
        }
        switch fleet.activityPulse(id)?.activity {
        case .working: return .working
        case .blocked: return .blocked
        case .idle, nil: return .idle
        }
    }

    // MARK: Groups

    /// One thing parked on the operator: a session's permission or question,
    /// or a workflow run's question, which is answered in its run.
    public struct NeedsItem: Identifiable {
        public enum Kind {
            case ask(ParkedAsk)
            case run(BoardRun)
        }

        public let id: String
        public let kind: Kind
        public let machineId: String
        public let title: String
        /// machine · project (a run: its machine)
        public let place: String
        /// When the hub parked it, ms epoch.
        public let raisedAt: Double?

        /// The session whose ask it is, for a session's.
        public var instanceId: String? {
            if case let .ask(ask) = kind {
                return ask.instanceId
            }
            return nil
        }
    }

    /// Every ask parked on the operator, longest wait first; one the hub has not stamped sorts last.
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
                    id: "\(ask.instanceId):\(ask.requestId)",
                    kind: .ask(ask),
                    machineId: machineId,
                    title: row.map(fleet.title) ?? fleet.machineName(machineId),
                    place: fleet.placeOf(machineId, row?.cwd),
                    raisedAt: ask.raisedAt
                ))
            }
        }
        for run in fleet.runs.values where run.status == .waiting {
            items.append(NeedsItem(
                id: run.rowId,
                kind: .run(run),
                machineId: run.machineId,
                title: fleet.workflowNames[run.workflowId] ?? "Workflow",
                place: fleet.machineName(run.machineId),
                raisedAt: fleet.runAskRaisedAt[run.id]
            ))
        }
        return items.sorted { ($0.raisedAt ?? .infinity, $0.id) < ($1.raisedAt ?? .infinity, $1.id) }
    }

    /// How long a run that has ended stays on the board: the hub's own window
    /// for a session that stopped moving (workflow-runs.ts `BOARD_MS`).
    static let boardWindow = 24.0 * 60 * 60 * 1000

    /// The runs the board lists: still going, or ended within the window (`onBoard`).
    private var boardRuns: [InstanceRow] {
        fleet.runRows.filter { $0.status == .running || now - $0.updatedMs < Self.boardWindow }
    }

    /// Every session and run mid-turn, ordered by when it joined Working, newest first.
    public var working: [InstanceRow] {
        let rows = (fleet.rows + boardRuns).filter { $0.isLive && activity($0.id) == .working }
        let present = Set(rows.map(\.id))
        for id in enteredWorking.keys where !present.contains(id) {
            enteredWorking[id] = nil
        }
        for row in rows where enteredWorking[row.id] == nil {
            enteredWorking[row.id] = fleet.turn(row.id) ?? now
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
        return activity(row.id) == .idle ? fleet.pulseAt(row.id) : nil
    }

    /// It ended after the owner last saw it, on any device.
    public func endedUnseen(_ row: InstanceRow) -> Bool {
        guard let ended = endedAt(row) else {
            return false
        }
        return ended > max(row.seenMs, seenHere[row.id] ?? 0)
    }

    // MARK: Archive

    /// What this device marked seen and the hub has not yet echoed back: the
    /// row leaves Finished in the gesture that archived it.
    private var seenHere: [String: Double] = [:]

    /// What hangs directly under each session and run.
    private var children: [String: [String]] {
        var out: [String: [String]] = [:]
        for row in fleet.byId.values {
            if let parent = row.parentInstanceId {
                out[parent, default: []].append(row.id)
            }
        }
        return out
    }

    /// Whether a row may be archived: neither it nor anything under it is
    /// still doing something (core `archiveRefusal`, the rule `/api/seen` holds too).
    public func archivable(_ row: InstanceRow) -> Bool {
        let children = children
        var seen = Set<String>()
        func idle(_ id: String) -> Bool {
            guard seen.insert(id).inserted else {
                return true
            }
            // A session still starting is working, as the hub counts it.
            if fleet.byId[id]?.status == .starting || activity(id) != .idle {
                return false
            }
            return (children[id] ?? []).allSatisfy(idle)
        }
        return idle(row.id)
    }

    /// A row and everything under it: what archiving a parent takes off Finished.
    public func treeOf(_ id: String) -> [String] {
        let children = children
        var out: [String] = []
        func walk(_ at: String) {
            guard !out.contains(at) else {
                return
            }
            out.append(at)
            (children[at] ?? []).forEach(walk)
        }
        walk(id)
        return out
    }

    /// Every finished row a machine lists, folded or not, that may be archived: its "Archive all".
    public func finishedOn(_ machineId: String) -> [String] {
        var ids: [String] = []
        var top = ""
        for line in lines(.finished) {
            if line.depth == 0 {
                top = line.row.machineId
            }
            if top == machineId, !line.context, archivable(line.row) {
                ids.append(line.row.id)
            }
        }
        return ids
    }

    /// Takes rows off Finished without opening them; a refusal puts them back.
    public func archive(_ ids: [String]) {
        guard !ids.isEmpty else {
            return
        }
        let at = Date.now.timeIntervalSince1970 * 1000
        for id in ids {
            seenHere[id] = at
        }
        Task { [weak self] in
            guard let self else {
                return
            }
            do {
                try await hub.markSeen(ids, kind: .archive)
            } catch {
                for id in ids where seenHere[id] == at {
                    seenHere[id] = nil
                }
            }
        }
    }

    /// The lists' orders, held still while they settle or are touched.
    private let held = HeldOrder()

    /// The operator's finger is on the lists: their order stays until they let go.
    public var holding: Bool {
        get { held.holding }
        set { held.holding = newValue }
    }

    /// Every session and run that ended since it was last opened, the latest
    /// to end first; two that ended together by id, as on the web.
    public var finished: [InstanceRow] {
        let rows = (fleet.rows.filter(\.isListed) + boardRuns).filter(endedUnseen).sorted {
            let a = fleet.lastAt($0)
            let b = fleet.lastAt($1)
            return a != b ? a > b : $0.id < $1.id
        }
        return held.order("home:finished", rows, id: \.id)
    }

    public struct RecentItem: Identifiable {
        public let id: String
        public let instance: InstanceRow?
        /// The session its mark's sprite is keyed by, and where it runs, for its hue.
        public let markPlace: String
        public let machineId: String
        public let title: String
        public let place: String
        public let at: Double
    }

    /// Everything else that can be opened: idle and sleeping sessions, and the stored transcripts.
    private func recent(working: [InstanceRow], finished: [InstanceRow]) -> [RecentItem] {
        var shown = Set(working.map(\.id))
        shown.formUnion(finished.map(\.id))
        shown.formUnion(needs.compactMap(\.instanceId))
        // Thousands of transcripts stand in a handful of folders: each
        // folder's place is worked out once.
        var places: [String: String] = [:]
        func place(_ machineId: String, _ cwd: String?) -> String {
            let key = "\(machineId)\n\(cwd ?? "")"
            if let known = places[key] {
                return known
            }
            let named = fleet.placeOf(machineId, cwd)
            places[key] = named
            return named
        }
        let live = fleet.rows.filter { row in
            (delegates || row.parentInstanceId == nil) && row.isListed && !shown.contains(row.id)
                && (activity(row.id) == .idle || row.isResumable || row.isStale || row.isFailed)
        }.map { row in
            RecentItem(
                id: row.id, instance: row, markPlace: row.cwd.isEmpty ? row.machineId : row.cwd,
                machineId: row.machineId, title: fleet.title(row), place: place(row.machineId, row.cwd), at: fleet.lastAt(row)
            )
        }
        let running = Set(fleet.rows.filter(\.isListed).compactMap(\.sessionId))
        let stored = fleet.machines.flatMap { machine in
            fleet.catalog(machine.machineId).filter { !running.contains($0.sessionId) }.map { info in
                RecentItem(
                    id: fleet.conversationId(sessionKey: info.sessionId, machineId: machine.machineId, cwd: info.cwd),
                    instance: nil,
                    markPlace: info.cwd ?? machine.machineId,
                    machineId: machine.machineId,
                    title: fleet.storedTitle(info, machineId: machine.machineId),
                    place: place(machine.machineId, info.cwd),
                    at: info.lastModified
                )
            }
        }
        var unique = Set<String>()
        let items = (live + stored).sorted { $0.at != $1.at ? $0.at > $1.at : $0.id < $1.id }.filter { unique.insert($0.id).inserted }
        return held.order("home:recent", items, id: \.id)
    }

    /// The usage strip: the window that stops you first, from the readings the hub keeps current.
    public var usage: Usage.Strip {
        Usage.strip(claude: fleet.claudeLimits, go: fleet.openCodeGoLimits, read: fleet.limitsRead, now: now)
    }

    public func fleetTitle(_ row: InstanceRow) -> String {
        fleet.title(row)
    }

    /// A machine's place in the fleet's one order, which every list keeps.
    public func machineOrder(_ machineId: String) -> Int {
        fleet.machineOrder(machineId)
    }

    // MARK: A tab's tree

    private func all(_ tab: Tab) -> [InstanceRow] {
        tab == .working ? working : finished
    }

    /// A tab's own rows: delegates under a listed parent fold into its count;
    /// one whose parent the tab does not list only with the switch on, or when it failed.
    public func rows(_ tab: Tab) -> [InstanceRow] {
        rows(of: all(tab))
    }

    private func rows(of rows: [InstanceRow]) -> [InstanceRow] {
        if delegates {
            return rows
        }
        let kept = Set(rooted(rows).map(\.id))
        return rows.filter { kept.contains($0.id) || $0.isFailed }
    }

    public func lines(_ tab: Tab) -> [TreeLine<InstanceRow>] {
        lines(tab, rows: rows(tab))
    }

    private func lines(_ tab: Tab, rows: [InstanceRow]) -> [TreeLine<InstanceRow>] {
        tree(rows, anchor: tab == .working ? .last : .first, context: { self.fleet.byId[$0] })
    }

    /// What Home lists, read together: each tab is sorted once, and the
    /// groups and Recent are drawn from those same rows. Home redraws on
    /// every pulse, so its lists are not each worked out from the fleet.
    public struct Board {
        /// Each tab's own rows (`rows(_:)`).
        public let working: [InstanceRow]
        public let finished: [InstanceRow]
        /// The chosen tab's lines by machine, each session followed by its delegates.
        public let groups: [MachineGroup]
        public let recent: [RecentItem]
    }

    public var board: Board {
        let working = working
        let finished = finished
        let workingRows = rows(of: working)
        let finishedRows = rows(of: finished)
        return Board(
            working: workingRows,
            finished: finishedRows,
            groups: groups(tab, lines: lines(tab, rows: tab == .working ? workingRows : finishedRows)),
            recent: recent(working: working, finished: finished)
        )
    }

    public struct Line: Identifiable {
        public var id: String { line.row.id }
        public let line: TreeLine<InstanceRow>
        /// The rows folded under it, when it is a parent.
        public let fold: Fold?
    }

    public struct Fold: Hashable, Sendable {
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
    private func groups(_ tab: Tab, lines: [TreeLine<InstanceRow>]) -> [MachineGroup] {
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
            if let tool = fleet.pulse(row.id)?.currentTool {
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
            fleet.turn(row.id).map { Naming.span(ms: now - $0) } ?? ""
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
}
