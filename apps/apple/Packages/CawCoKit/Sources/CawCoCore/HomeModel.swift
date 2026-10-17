import CawCoAPI
import Foundation
import Observation
import OSLog

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
    /// Parents whose delegates are open under them, in each tab on its own:
    /// a parent opened under Finished stays folded under Working.
    public private(set) var openTrees: [Tab: Set<String>]
    /// Machines a tab shows in full, past its first `moreAt`.
    public private(set) var shownWhole: [Tab: Set<String>]
    /// The Recent disclosure is open.
    public var recentOpen: Bool {
        didSet { UserDefaults.standard.set(recentOpen, forKey: Keys.recentOpen) }
    }

    private enum Keys {
        static let tab = "cawco-home-tab"
        static let delegates = "cawco-delegates"
        static func openTrees(_ tab: Tab) -> String { "cawco-open-trees:home-\(tab.rawValue)" }
        static let whole = "cawco-home-tab-all"
        static let recentOpen = "cawco-home-recent-open"
    }

    public init(hub: HubConnection) {
        self.hub = hub
        let defaults = UserDefaults.standard
        tab = Tab(rawValue: defaults.string(forKey: Keys.tab) ?? "") ?? .working
        delegates = defaults.bool(forKey: Keys.delegates)
        openTrees = Dictionary(uniqueKeysWithValues: Tab.allCases.map {
            ($0, Set(defaults.stringArray(forKey: Keys.openTrees($0)) ?? []))
        })
        recentOpen = defaults.bool(forKey: Keys.recentOpen)
        let whole = defaults.dictionary(forKey: Keys.whole) as? [String: [String]] ?? [:]
        shownWhole = [.working: Set(whole["working"] ?? []), .finished: Set(whole["finished"] ?? [])]
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                self?.now = Date.now.timeIntervalSince1970 * 1000
            }
        }
        // Watches this device's marks for the hub's echo from here on.
        settleSeen()
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

    /// What Caw says with nothing to count (NeedsCaw.svelte `quiet`): "All
    /// caught up" only once the fleet is read over a live hub, since an empty
    /// answer is only given when it is known (PRODUCT.md); before that, what
    /// he is waiting on.
    public var quiet: String {
        switch hub.state {
        case .connected:
            fleet.fleetRead && fleet.liveRead && fleet.runsRead && fleet.catalogsRead ? "All caught up" : "Reading the fleet"
        case .connecting:
            "Connecting…"
        case .unreachable:
            "Hub unreachable"
        }
    }

    /// Every notice standing, as Caw's panel lists them under Needs you:
    /// first the hub being newer than this app (until closed this launch),
    /// then what the hub keeps until acknowledged, once its record of what
    /// was seen has arrived.
    public var notices: [Notice] {
        var local = hub.showsHubNewer ? [Notice.hubNewer] : []
        // The hub's notices record is damaged: notices are off, and this row
        // says so with Reset (CawPanel.svelte's damaged row).
        if let words = fleet.noticesDamaged, !hub.noticesDamagedClosed {
            local.append(.noticesDamaged(words, problem: fleet.noticesResetProblem))
        }
        guard fleet.noticesKnown else { return local }
        return local + Notice.unseen(machines: fleet.machines, accounts: fleet.accounts, providers: fleet.accountProviders ?? [],
                                     policy: fleet.updatePolicy, commanded: fleet.commanded, seen: fleet.noticesSeen)
    }

    /// The notices' sources are all read (the seen record, the accounts and
    /// the update policy): a notice that appears after this is new, and Caw beats for it.
    public var noticesRead: Bool {
        (fleet.noticesKnown || fleet.noticesDamaged != nil) && fleet.accounts != nil
            && (fleet.updatePolicy != nil || fleet.updatePolicyDamaged)
    }

    /// A notice's ✕: acknowledged everywhere (update-notice.svelte.ts
    /// `dismissUpdate`); the hub being newer is closed for this launch.
    /// One entry of a group acknowledged alone (MovedLogin's, a pass's ✕).
    public func acknowledge(_ ids: [String]) {
        hub.acknowledge(notices: ids)
    }

    public func dismiss(_ notice: Notice) {
        switch notice.kind {
        case .hubNewer:
            hub.dismissHubNewer()
        case .noticesDamaged:
            hub.closeNoticesDamaged()
        case .update(landedAll: true):
            hub.acknowledge(notices: notice.acks)
            hub.forgetCommanded()
        default:
            hub.acknowledge(notices: notice.acks)
        }
    }

    /// The notice's act (update-notice.svelte.ts `actOnUpdate`): Retry
    /// installs again where it rolled back and acknowledges the rollback;
    /// Install now installs on every machine that has the build to install;
    /// Open TestFlight (which the screen opens) closes the hub-newer notice.
    public func act(_ notice: Notice) {
        switch notice.action {
        case .retry:
            guard let machineId = notice.machineIds.first else { return }
            hub.installUpdate(machineId: machineId)
            hub.acknowledge(notices: notice.acks)
        case .installAll:
            for machineId in notice.machineIds { hub.installUpdate(machineId: machineId) }
        case .openTestFlight:
            hub.dismissHubNewer()
        case .resetNotices:
            hub.resetNotices()
        case nil:
            break
        }
    }

    /// The panel lists a notice: the hub-newer one is logged the first time in a launch.
    public func noticesShown(_ shown: [Notice]) {
        if shown.contains(where: { if case .hubNewer = $0.kind { true } else { false } }) { hub.hubNewerShown() }
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
        // A thread is what its status says (client.svelte.ts `THREAD_DOING`).
        if let thread = fleet.thread(id) {
            switch thread.status {
            case .working: return .working
            case .needsYou: return .blocked
            case .ready, .unrecognized: return .idle
            }
        }
        if needsStore.blocked(id) || fleet.activityPulse(id)?.activity == .blocked {
            return .blocked
        }
        // Its project is moving for it: working from the move's start (a yes
        // the move waits on is its parked ask, above).
        if fleet.byId[id]?.status == .moving {
            return .working
        }
        if let count = fleet.byId[id]?.runningDelegates, count > 0 {
            return .working
        }
        switch fleet.activityPulse(id)?.activity {
        case .working: return .working
        case .blocked: return .blocked
        case .idle, .unrecognized, nil: return .idle
        }
    }

    // MARK: Groups

    /// One thing parked on the operator: a session's permission or question,
    /// a workflow run's question, which is answered in its run, or fleet
    /// watch telling you about a session (home-state.svelte.ts `WatchItem`),
    /// which opens the session and leaves once you write to it or it moves on.
    public struct NeedsItem: Identifiable {
        public enum Kind {
            case ask(ParkedAsk)
            case run(BoardRun)
            case watch(Components.Schemas.FleetWatchNotice)
            /// An onboarding choice nobody answered: the fleet's upstream
            /// choice, its three answers on the row (NeedsCard.svelte `choice`).
            case choice
        }

        public let id: String
        public let kind: Kind
        public let machineId: String
        public let title: String
        /// machine · project (a run: its machine)
        public let place: String
        /// When the hub parked it, ms epoch.
        public let raisedAt: Double?
        /// Its session's machine is offline (the row reads `unknown`): the ask
        /// still stands, and answering it waits for the machine.
        public var stale = false
        /// Where its session runs, for its mark's hue (NeedsCard.svelte
        /// `item.cwd || item.machineId`); empty for a run.
        public var cwd = ""

        /// The session whose ask or notice it is, for a session's.
        public var instanceId: String? {
            switch kind {
            case let .ask(ask): ask.instanceId
            case let .watch(notice): notice.instanceId
            case .run, .choice: nil
            }
        }
    }

    /// Who asked, as the hub named them parking it; nil when it named nobody.
    public static func asker(_ ask: ParkedAsk) -> String? {
        let asker = ask.presentation.asker.trimmingCharacters(in: .whitespacesAndNewlines)
        return asker.isEmpty ? nil : asker
    }

    /// Every ask parked on the operator, longest wait first; one the hub has not stamped sorts last.
    public var needs: [NeedsItem] {
        var items: [NeedsItem] = []
        for (instanceId, asks) in needsStore.parked {
            let row = fleet.byId[instanceId]
            // A session the hub says has ended has nothing left to answer to.
            // One whose machine it cannot reach (`unknown`) may still be
            // waiting: its asks stay, marked stale, so Needs you is never a
            // false negative (PRODUCT.md).
            let ended = row.map { !($0.isLive || $0.isStale) } ?? false
            // A post to another person's repository held for you outlives its
            // session (hub upstream-asks.ts): the hub makes it once you approve.
            for ask in asks where ask.routedTo != "parent" && (!ended || ask.toolName == Self.upstreamPostTool) {
                // An ask no session row stands behind (a memory proposal) is
                // on the machine its envelope named, titled by who asked
                // (home-state.svelte.ts).
                let machineId = row?.machineId ?? ask.machineId
                // An ask a project's Caw made is his thread's: titled by it, and it opens the thread.
                let thread = ask.threadId.flatMap { fleet.thread(ThreadTabs.tabId($0)) }
                var item = NeedsItem(
                    id: "\(ask.instanceId):\(ask.requestId)",
                    kind: .ask(ask),
                    machineId: machineId,
                    title: thread?.title ?? row.map(fleet.title) ?? Self.asker(ask) ?? fleet.machineName(machineId),
                    place: Naming.unbroken(fleet.placeOf(machineId, row?.cwd)),
                    raisedAt: ask.raisedAt
                )
                item.stale = row?.isStale == true
                item.cwd = row?.cwd ?? ""
                items.append(item)
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
        // Fleet watch's notices, each on its session (home-state.svelte.ts `watched`).
        for notice in fleet.watchNotices {
            let row = fleet.byId[notice.instanceId]
            var item = NeedsItem(
                id: "watch:\(notice.instanceId)",
                kind: .watch(notice),
                machineId: notice.machineId,
                title: row.map(fleet.title) ?? notice.title,
                place: Naming.unbroken(fleet.placeOf(notice.machineId, row?.cwd)),
                raisedAt: notice.at
            )
            item.cwd = row?.cwd ?? ""
            items.append(item)
        }
        // Asked until it is answered; unread, it waits for the read (home-state.svelte.ts `unanswered`).
        if fleet.upstream == .unanswered {
            items.append(NeedsItem(
                id: "choice:upstream",
                kind: .choice,
                machineId: "",
                title: Words.Upstream.title,
                place: "Onboarding",
                raisedAt: nil
            ))
        }
        return items.sorted { ($0.raisedAt ?? .infinity, $0.id) < ($1.raisedAt ?? .infinity, $1.id) }
    }

    /// The tool a post held for the person is parked under (core upstream-post.ts `UPSTREAM_POST_TOOL`).
    static let upstreamPostTool = "mcp__cawco__upstream_post"

    /// How long a run that has ended stays on the board: the hub's own window
    /// for a session that stopped moving (workflow-runs.ts `BOARD_MS`).
    static let boardWindow = 24.0 * 60 * 60 * 1000

    /// The runs the board lists: still going, or ended within the window (`onBoard`).
    private var boardRuns: [InstanceRow] {
        fleet.runRows.filter { $0.status == .running || now - $0.updatedMs < Self.boardWindow }
    }

    /// Every session and run mid-turn, ordered by when it joined Working, newest first.
    public var working: [InstanceRow] {
        // A thread Caw is working on is working too (home-state.svelte.ts `runningRows`).
        let rows = (fleet.rows + boardRuns + fleet.threadRows).filter { $0.isLive && activity($0.id) == .working }
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

    /// When a session (or run) last ended, on the hub's clock as `seenMs` is,
    /// whatever it does since: a session's latest turn end as the hub took it
    /// (`turnEndedMs`), with its delegates still running or its next turn
    /// begun, or for a failed one the hub's last change to its row. A pulse's
    /// time is its machine's clock, so it is never read here. A run: its own
    /// last move, which the hub stamps, once it has stopped.
    private func lastEnded(_ row: InstanceRow) -> Double? {
        if fleet.run(row.id) != nil {
            if row.isFailed {
                return fleet.lastAt(row)
            }
            return activity(row.id) == .idle ? fleet.pulseAt(row.id) : nil
        }
        if row.isFailed {
            return row.updatedMs
        }
        return row.turnEndedMs > 0 ? row.turnEndedMs : nil
    }

    /// When a session (or run) ended, as Finished counts it
    /// (home-state.svelte.ts `endedAt`): its last end, nil while it works or
    /// waits, delegates running under it included.
    private func endedAt(_ row: InstanceRow) -> Double? {
        if fleet.run(row.id) == nil, !row.isFailed, activity(row.id) != .idle {
            return nil
        }
        return lastEnded(row)
    }

    /// It ended after the owner last saw it, on any device, and is not at
    /// work again: what Finished lists. Both times the hub's.
    private func endedUnseen(_ row: InstanceRow) -> Bool {
        unseen(row, since: endedAt(row))
    }

    /// A turn of it ended after the owner last saw it, on any device: what a
    /// look marks when he has it in front. Its row alone says so (its
    /// `turnEndedAt` against its `seenAt`), so the look goes the moment the
    /// hub's end reaches this device, whatever its pulse says by then: its
    /// delegates still running, or its next turn already begun.
    public func turnEndedUnseen(_ row: InstanceRow) -> Bool {
        unseen(row, since: lastEnded(row))
    }

    private func unseen(_ row: InstanceRow, since ended: Double?) -> Bool {
        guard let ended else {
            return false
        }
        return ended > max(row.seenMs, seenHere[row.id]?.through ?? 0)
    }

    // MARK: Archive

    /// One mark this device made that the hub has not yet echoed back.
    private struct SeenMark {
        /// Tells this mark from a later one on the same row.
        let mark: Int
        /// The end it marked seen, on the hub's clock (`lastEnded`).
        let through: Double
        /// The hub's stamp of the mark, once its answer is in: the `seenAt` its echo carries.
        var at: Double?
    }

    /// What this device marked seen and the hub has not yet echoed back: the
    /// row leaves Finished in the gesture that archived it. Each goes once the
    /// row's `seenAt` reaches the hub's stamp of it (`settleSeen`), so a later
    /// change on the hub is never masked (home-state.svelte.ts `seenHere`).
    private var seenHere: [String: SeenMark] = [:]
    @ObservationIgnored private var seenMarks = 0

    /// Drops each mark the hub has echoed: its row's `seenAt` has reached the
    /// hub's stamp of it, or the row is gone. Watches what it read, so the
    /// echo, or the hub's answer, runs it again (home-state.svelte.ts `settleSeen`).
    private func settleSeen() {
        let echoed = withObservationTracking {
            seenHere.compactMap { id, mark -> String? in
                guard let at = mark.at else { return nil }
                guard let row = fleet.byId[id] ?? fleet.runRows.first(where: { $0.id == id }) else { return id }
                return row.seenMs >= at ? id : nil
            }
        } onChange: { [weak self] in
            Task { @MainActor in self?.settleSeen() }
        }
        for id in echoed {
            seenHere[id] = nil
        }
    }

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

    /// Takes rows off Finished without opening them (one request, light and
    /// reversible): each row says "Archiving…" until the hub answers, then
    /// leaves. The hub refuses the whole ask for any row still doing
    /// something, naming each: those keep their place with its reason, and
    /// the rest are asked again on their own.
    public func archive(_ ids: [String]) {
        let ids = ids.filter { !hub.acts.inFlight($0) }
        guard !ids.isEmpty else {
            return
        }
        hub.acts.begin(.archive, ids)
        Task { [weak self] in
            guard let self else {
                return
            }
            var asking = ids
            while !asking.isEmpty {
                do {
                    let at = try await hub.markSeen(asking, kind: .archive)
                    seenMarks += 1
                    for id in asking {
                        let row = fleet.byId[id] ?? fleet.runRows.first { $0.id == id }
                        seenHere[id] = SeenMark(mark: seenMarks, through: row.flatMap { endedAt($0) } ?? 0, at: at)
                    }
                    hub.acts.settle(asking)
                    asking = []
                } catch let refusal as HubConnection.ArchiveRefusal where !refusal.reasons.isEmpty {
                    for (id, why) in refusal.reasons {
                        hub.acts.refuse(id, why, status: fleet.byId[id]?.status.rawValue)
                    }
                    asking.removeAll { refusal.reasons[$0] != nil }
                } catch {
                    for id in asking {
                        hub.acts.refuse(id, error.localizedDescription, status: fleet.byId[id]?.status.rawValue)
                    }
                    asking = []
                }
            }
        }
    }

    /// The owner has these in front where they see them, ended
    /// (home-state.svelte.ts `markOpened`): seen, here at once and on the hub,
    /// which then sends no push for the turn that just ended.
    public func look(_ ids: [String]) {
        mark(ids, kind: .look)
    }

    /// Marks rows seen here at once and on the hub (home-state.svelte.ts
    /// `markSeen`); a refusal or a failure takes this device's mark back.
    /// Here a row is seen through the end it shows now, on the hub's clock;
    /// a turn that ends while the mark is on its way is news again.
    private func mark(_ ids: [String], kind: Operations.PostApiSeen.Input.Body.JsonPayload.KindPayload) {
        guard !ids.isEmpty else {
            return
        }
        seenMarks += 1
        let mark = seenMarks
        for id in ids {
            let row = fleet.byId[id] ?? fleet.runRows.first { $0.id == id }
            seenHere[id] = SeenMark(mark: mark, through: row.flatMap { lastEnded($0) } ?? 0)
        }
        let said = "\(kind.rawValue) \(ids.joined(separator: ","))"
        Task { [weak self] in
            guard let self else {
                return
            }
            let log = Logger(subsystem: "dev.cawco.app", category: "Seen")
            do {
                let at = try await hub.markSeen(ids, kind: kind)
                log.notice("seen \(said, privacy: .public): marked")
                // The echo may be in already; `settleSeen` hears this change either way.
                for id in ids where seenHere[id]?.mark == mark {
                    seenHere[id]?.at = at
                }
            } catch {
                log.error("seen \(said, privacy: .public): not marked: \(String(describing: error), privacy: .public)")
                for id in ids where seenHere[id]?.mark == mark {
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

    /// Recent as last worked out, and the rows it left out (Working, Finished, Needs you): it is
    /// worked out again only when those change or `recentChanged` drops it. Thousands of stored
    /// transcripts go into it, and Home redraws on every pulse and every tick of `now`, which
    /// Recent never reads.
    @ObservationIgnored private var recentMemo: (shown: Set<String>, items: [RecentItem])?
    /// Moves when anything Recent was worked out from changes: the board reads it, so a list
    /// handed the remembered Recent still redraws when Recent would come out differently.
    private var recentRevision = 0

    /// Everything else that can be opened: idle and sleeping sessions, and the stored transcripts.
    private func recent(working: [InstanceRow], finished: [InstanceRow]) -> [RecentItem] {
        _ = recentRevision
        var shown = Set(working.map(\.id))
        shown.formUnion(finished.map(\.id))
        shown.formUnion(needs.compactMap(\.instanceId))
        if let memo = recentMemo, memo.shown == shown {
            return memo.items
        }
        // Every observed value it reads is heard: the first change drops what it worked out.
        let items = withObservationTracking {
            workOutRecent(leaving: shown)
        } onChange: { [weak self] in
            Task { @MainActor in self?.recentChanged() }
        }
        recentMemo = (shown, items)
        return items
    }

    private func recentChanged() {
        recentMemo = nil
        recentRevision &+= 1
    }

    private func workOutRecent(leaving shown: Set<String>) -> [RecentItem] {
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

    /// Claude's accounts as Rings and opencode's plan (forecast.svelte.ts
    /// `usage`): what the strip, its sheet and the Usage page all read.
    public var usage: UsageRings {
        UsageRings.read(fleet: fleet, now: now)
    }

    /// The forecast the wall last ranked by: a new one reorders the cells,
    /// the minute moving on never does (UsageMeter.svelte `rankedAt`).
    public var usageForecast: Components.Schemas.ProviderForecast? { fleet.forecast }

    /// The hub's limits have been read once (`usageLimitsRead`).
    public var usageLimitsRead: Bool { fleet.limitsRead }

    /// No limit can be shown once everything is read: why, in one line and
    /// whole, and the sign-in that fixes it (UsageMeter.svelte `gap`).
    public func usageGap(_ view: UsageRings) -> Usage.Gap? {
        view.claude == nil && view.openCode == nil && fleet.limitsRead && view.read
            ? Usage.claudeGap(fleet.claudeLimits, machines: fleet.machines) : nil
    }

    /// Why there is nothing to draw: a normal state, never a fake 0% (`empty`).
    public func usageEmpty(_ view: UsageRings) -> String {
        fleet.limitsRead && view.read ? "Sign in to see limits" : "Reading limits…"
    }

    /// A provider with nothing to draw: why, and what to do about it (`notes`).
    public func usageNotes(_ view: UsageRings, gap: Usage.Gap?) -> [(id: String, text: String)] {
        let byMachine = { (errors: [String: String?]) in errors.sorted { $0.key < $1.key }.map(\.value) }
        return [
            gap == nil ? Usage.noteOf("Claude", has: view.claude != nil, errors: byMachine(fleet.claudeLimits.mapValues(\.error)),
                                      read: fleet.limitsRead).map { ("Claude", $0) } : nil,
            Usage.noteOf("opencode Go", has: view.openCode != nil, errors: byMachine(fleet.openCodeGoLimits.mapValues(\.error)),
                         read: fleet.limitsRead).map { ("opencode", $0) },
        ].compactMap(\.self)
    }

    /// Where a session runs, as its row names it (home-state `projectOfRow`).
    public func usagePlace(_ row: InstanceRow) -> String {
        fleet.placeOf(row.machineId, row.cwd)
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

    /// Work another session started: its parent is a row the fleet holds
    /// (tree.ts `hasParent`). What the tabs' counts leave out.
    public func isDelegate(_ row: InstanceRow) -> Bool {
        row.parentInstanceId.map { fleet.byId[$0] != nil } ?? false
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
        /// Each tab's count: its top-level sessions, never their delegates,
        /// whatever the switch shows; and whether one of Finished's failed.
        public let counts: (working: Int, finished: Int, finishedFailed: Bool)
        /// The chosen tab's lines by machine, each session followed by its delegates.
        public let groups: [MachineGroup]
        public let recent: [RecentItem]
    }

    public func board(for tab: Tab) -> Board {
        let working = working
        let finished = finished
        let workingRows = rows(of: working)
        let finishedRows = rows(of: finished)
        let finishedTops = finished.filter { !isDelegate($0) }
        return Board(
            working: workingRows,
            finished: finishedRows,
            counts: (working.filter { !isDelegate($0) }.count, finishedTops.count, finishedTops.contains(where: \.isFailed)),
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
        let open = openTrees[tab] ?? []
        let visible = collapse(lines) { open.contains($0) }
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
                        open: open.contains(line.row.id)
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

    public func isTreeOpen(_ id: String, in tab: Tab) -> Bool {
        openTrees[tab]?.contains(id) ?? false
    }

    public func toggleTree(_ id: String, in tab: Tab) {
        var set = openTrees[tab] ?? []
        if set.contains(id) {
            set.remove(id)
        } else {
            set.insert(id)
        }
        openTrees[tab] = set
        UserDefaults.standard.set(Array(set), forKey: Keys.openTrees(tab))
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
